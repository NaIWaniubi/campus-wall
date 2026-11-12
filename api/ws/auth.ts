/**
 * WS 鉴权：首条 hello 消息带 JWT
 * - 验证签名后回查数据库，确认用户仍存在且未被封禁。只验签会让"封禁后旧 token 仍可用"
 *   贯穿整个长连接，WS 于是成为绕过 REST 封禁与限流的通道。
 * - 失败抛错由 server.ts 捕获并发送 error
 */
import { db } from '../db.js';
import { verifyToken } from '../utils/jwt.js';
import { liftExpiredBan } from '../middleware/auth.js';

export function authJwt(token: string): { id: number; studentId: string; role: string } {
  const payload = verifyToken(token);
  if (!payload) throw new Error('invalid token');

  const user = db
    .prepare('SELECT id, student_id, role, status, ban_reason, ban_until, token_version FROM users WHERE id = ?')
    .get(payload.id) as
    | { id: number; student_id: string; role: string; status: string; ban_reason: string | null; ban_until: string | null }
    | undefined;
  if (!user) throw new Error('user not found');

  // token 吊销：改密/封禁会递增 token_version，旧 token 的 ver 不再匹配
  if (Number((user as any).token_version ?? 0) !== payload.ver) throw new Error('token revoked');

  // 到期封禁自动解除（与 REST 侧 liftExpiredBan 同一口径）
  if (user.status === 'banned' && liftExpiredBan(user as any)) user.status = 'active';
  if (user.status !== 'active') throw new Error('user banned');

  // 以库中角色为准：token 里的 role 可能是降权前的旧值
  return { id: user.id, studentId: user.student_id, role: user.role };
}
