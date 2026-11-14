/**
 * 登录/注册失败限流（内存桶，零依赖）：同 IP 15 分钟窗口内累计 10 次失败则锁定至窗口重置（审计 P0-3）
 * 仅对 /api/auth/login 与 /api/auth/register 生效
 */
import type { Request, Response, NextFunction } from 'express';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;
// 同一学号跨 IP 的失败上限：低于 IP 维度阈值，专门拦「撞库单账号」（换 IP 也绕不过）
const MAX_FAILURES_PER_ACCOUNT = 5;

const buckets = new Map<string, { count: number; resetAt: number }>();
const accountBuckets = new Map<string, { count: number; resetAt: number }>();

function clientIp(req: Request): string {
  // trust proxy 默认关闭，req.ip 即对端 socket 地址（XFF 不可伪造）
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function accountKey(req: Request): string {
  const sid = typeof req.body?.studentId === 'string' ? req.body.studentId.trim().slice(0, 32) : '';
  return sid;
}

/** 只读探针，供测试与观测使用 */
export function authFailureState(req: Request): { ip: number; account: number } {
  const now = Date.now();
  const b = buckets.get(clientIp(req));
  const a = accountBuckets.get(accountKey(req));
  return {
    ip: b && b.resetAt > now ? b.count : 0,
    account: a && a.resetAt > now ? a.count : 0,
  };
}

/** 限流闸：窗口内失败次数达上限则直接 429（IP 维度 + 学号维度取严） */
export function authRateLimit(req: Request, res: Response, next: NextFunction) {
  const now = Date.now();
  const key = clientIp(req);
  const acc = accountKey(req);

  const hit = (m: Map<string, { count: number; resetAt: number }>, k: string, max: number): number => {
    const b = m.get(k);
    if (b && b.resetAt > now && b.count >= max) {
      return Math.ceil((b.resetAt - now) / 60000);
    }
    return 0;
  };

  const ipWait = hit(buckets, key, MAX_FAILURES);
  const accWait = acc ? hit(accountBuckets, acc, MAX_FAILURES_PER_ACCOUNT) : 0;
  const wait = Math.max(ipWait, accWait);
  if (wait > 0) {
    return res.status(429).json({ code: 429, message: `尝试次数过多，请 ${wait} 分钟后再试`, data: null });
  }
  next();
}

/** 记录一次失败；顺带清理过期桶防膨胀 */
export function recordAuthFailure(req: Request): void {
  const ip = clientIp(req);
  const acc = accountKey(req);
  const now = Date.now();
  if (buckets.size > 1000) {
    for (const [k, b] of buckets) {
      if (b.resetAt <= now) buckets.delete(k);
    }
  }
  if (accountBuckets.size > 1000) {
    for (const [k, b] of accountBuckets) {
      if (b.resetAt <= now) accountBuckets.delete(k);
    }
  }

  const bump = (m: Map<string, { count: number; resetAt: number }>, k: string) => {
    if (!k) return;
    const b = m.get(k);
    if (!b || b.resetAt <= now) m.set(k, { count: 1, resetAt: now + WINDOW_MS });
    else b.count++;
  };

  bump(buckets, ip);
  bump(accountBuckets, acc);
}

/** 认证成功后清除该 IP 与学号计数 */
export function clearAuthFailures(req: Request): void {
  buckets.delete(clientIp(req));
  accountBuckets.delete(accountKey(req));
}

/* ==========================================================================
 * 通用滑动窗口限流（零依赖）：对高频写端点做维度区分限流（IP/学号/UA 组合 key）
 * - 滑动窗口：桶内保存时间戳数组，每次滚动剔除窗口外样本，无边界突刺
 * - 维度 key：IP + body.studentId（登录注册类请求）+ UA 前缀，同维度共享额度
 * ========================================================================== */

export interface RateLimiterOptions {
  /** 窗口时长（毫秒） */
  windowMs: number;
  /** 窗口内最大请求数 */
  max: number;
  /** 限流器名（隔离不同端点的桶） */
  name: string;
}

/**
 * 维度 key：IP + 学号（body 里带时参与）。
 * 刻意不含 UA：UA 由客户端任意伪造，拼进 key 等于提供"轮换 UA 即重置额度"的绕过开关
 * （实测轮换 UA 340/340 全放行）。细分维度只允许攻击者无法自由重写的输入。
 */
function limitKey(req: Request): string {
  const ip = clientIp(req);
  const studentId = typeof req.body?.studentId === 'string' ? req.body.studentId.slice(0, 20) : '';
  return `${ip}|${studentId}`;
}

/**
 * IP 兜底 key：同一 IP 的总配额。细分 key 允许"换学号"分散计数，
 * 这一层保证换了学号也仍受单 IP 总量约束（如批量注册、拼车刷帖）。
 */
function ipKey(req: Request): string {
  return `ip:${clientIp(req)}`;
}

/** 创建一个滑动窗口限流中间件（每端点独立实例，桶互不共享） */
export function createRateLimiter(opts: RateLimiterOptions) {
  const hits = new Map<string, number[]>();

  return function rateLimit(req: Request, res: Response, next: NextFunction) {
    // 压测/基准专用开关：RATE_LIMIT_ENABLED=0 时直通。
    // 只应在 scripts/bench.mjs 这类离线基准里设置，正常部署不要打开。
    if (process.env.RATE_LIMIT_ENABLED === '0') return next();

    const key = `${opts.name}:${limitKey(req)}`;
    const fallbackKey = `${opts.name}:${ipKey(req)}`;
    const now = Date.now();
    const windowStart = now - opts.windowMs;

    // 防膨胀：桶数超限时全量清扫过期桶
    if (hits.size > 2000) {
      for (const [k, arr] of hits) {
        const fresh = arr.filter((t) => t > windowStart);
        if (fresh.length) hits.set(k, fresh);
        else hits.delete(k);
      }
    }

    const overLimit = (k: string, max: number): number => {
      const arr = (hits.get(k) || []).filter((t) => t > windowStart);
      hits.set(k, arr);
      if (arr.length < max) return 0;
      const firstHit = arr[0];
      if (!firstHit) return 0;
      return Math.ceil((firstHit + opts.windowMs - now) / 1000);
    };

    // 两级桶：细分维度（IP+学号）按 opts.max；同 IP 总量放宽到 3 倍，
    // 防止「换学号」把单 IP 配额横向摊薄成无限
    const retry1 = overLimit(key, opts.max);
    const retry2 = overLimit(fallbackKey, opts.max * 3);
    const retrySec = Math.max(retry1, retry2);
    if (retrySec > 0) {
      const retryText = retrySec > 60 ? `${Math.ceil(retrySec / 60)} 分钟` : `${retrySec} 秒`;
      return res.status(429).json({ code: 429, message: `操作过于频繁，请 ${retryText} 后再试`, data: null });
    }

    hits.get(key)!.push(now);
    hits.get(fallbackKey)!.push(now);
    next();
  };
}

/* 高频写端点预设（阈值按"正常用户到不了、脚本必然触发"校准） */
/** 发帖：1 分钟 10 次 */
export const postLimiter = createRateLimiter({ windowMs: 60_000, max: 10, name: 'post' });
/** 评论/回复：1 分钟 30 次 */
export const commentLimiter = createRateLimiter({ windowMs: 60_000, max: 30, name: 'comment' });
/** 图片上传：1 分钟 20 次 */
export const uploadLimiter = createRateLimiter({ windowMs: 60_000, max: 20, name: 'upload' });
/** AI 对话（含流式）：1 分钟 10 次 */
export const aiLimiter = createRateLimiter({ windowMs: 60_000, max: 10, name: 'ai' });
/** 会话/消息写端点：1 分钟 30 次 */
export const chatLimiter = createRateLimiter({ windowMs: 60_000, max: 30, name: 'chat' });
/** 关注写端点：1 分钟 60 次 */
export const followLimiter = createRateLimiter({ windowMs: 60_000, max: 60, name: 'follow' });
/** 公告 ack：1 分钟 30 次 */
export const ackLimiter = createRateLimiter({ windowMs: 60_000, max: 30, name: 'ack' });
/** 草稿写端点：1 分钟 30 次 */
export const draftLimiter = createRateLimiter({ windowMs: 60_000, max: 30, name: 'draft' });
/** 读端点（列表类 GET）：1 分钟 300 次，防爬虫 */
export const readLimiter = createRateLimiter({ windowMs: 60_000, max: 300, name: 'read' });
/** 互动类轻写（评论点赞/收藏/公告 ack 等）：1 分钟 120 次——防连点脚本刷计数，正常用户无感 */
export const engageLimiter = createRateLimiter({ windowMs: 60_000, max: 120, name: 'engage' });
