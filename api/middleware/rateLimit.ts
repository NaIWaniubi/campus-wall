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
