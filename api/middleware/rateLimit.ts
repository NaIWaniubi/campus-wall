/**
 * 登录/注册失败限流（内存桶，零依赖）：同 IP 15 分钟窗口内累计 10 次失败则锁定至窗口重置（审计 P0-3）
 * 仅对 /api/auth/login 与 /api/auth/register 生效
 */
import type { Request, Response, NextFunction } from 'express';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;

const buckets = new Map<string, { count: number; resetAt: number }>();

function clientIp(req: Request): string {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

/** 限流闸：窗口内失败次数达上限则直接 429 */
export function authRateLimit(req: Request, res: Response, next: NextFunction) {
  const bucket = buckets.get(clientIp(req));
  if (bucket && bucket.resetAt > Date.now() && bucket.count >= MAX_FAILURES) {
    const mins = Math.ceil((bucket.resetAt - Date.now()) / 60000);
    return res.status(429).json({ code: 429, message: `尝试次数过多，请 ${mins} 分钟后再试`, data: null });
  }
  next();
}

/** 记录一次失败；顺带清理过期桶防膨胀 */
export function recordAuthFailure(req: Request): void {
  const ip = clientIp(req);
  const now = Date.now();
  if (buckets.size > 1000) {
    for (const [k, b] of buckets) {
      if (b.resetAt <= now) buckets.delete(k);
    }
  }
  const bucket = buckets.get(ip);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(ip, { count: 1, resetAt: now + WINDOW_MS });
  } else {
    bucket.count++;
  }
}

/** 认证成功后清除该 IP 计数 */
export function clearAuthFailures(req: Request): void {
  buckets.delete(clientIp(req));
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

/** 维度 key：IP + 学号（body 里带时参与）+ UA 前缀 */
function limitKey(req: Request): string {
  const ip = clientIp(req);
  const ua = String(req.headers['user-agent'] || '').slice(0, 40);
  const studentId = typeof req.body?.studentId === 'string' ? req.body.studentId.slice(0, 20) : '';
  return `${ip}|${studentId}|${ua}`;
}

/** 创建一个滑动窗口限流中间件（每端点独立实例，桶互不共享） */
export function createRateLimiter(opts: RateLimiterOptions) {
  const hits = new Map<string, number[]>();

  return function rateLimit(req: Request, res: Response, next: NextFunction) {
    const key = `${opts.name}:${limitKey(req)}`;
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

    const arr = (hits.get(key) || []).filter((t) => t > windowStart);
    if (arr.length >= opts.max) {
      const firstHit = arr[0];
      if (!firstHit) return next(); // 防御性检查
      const retrySec = Math.ceil((firstHit + opts.windowMs - now) / 1000);
      const retryText = retrySec > 60 ? `${Math.ceil(retrySec / 60)} 分钟` : `${retrySec} 秒`;
      return res.status(429).json({ code: 429, message: `操作过于频繁，请 ${retryText} 后再试`, data: null });
    }
    arr.push(now);
    hits.set(key, arr);
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
