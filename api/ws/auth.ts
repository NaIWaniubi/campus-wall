/**
 * WS 鉴权：首条 hello 消息带 JWT
 * - 验证通过返回 userId（与 utils/jwt 的 payload 保持一致）
 * - 失败抛错由 server.ts 捕获并发送 error
 */
import { verifyToken } from '../utils/jwt.js';

export function authJwt(token: string): { id: number; studentId: string; role: string } {
  const payload = verifyToken(token);
  if (!payload) throw new Error('invalid token');
  return payload;
}
