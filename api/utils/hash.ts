import { createHash } from 'node:crypto';

/**
 * SHA-256 十六进制摘要。
 *
 * 用途：不可逆派生标识（例如微信 openid → 占位学号 wx_<hash 前16位>）。
 * 不能用来存口令——口令用 bcrypt（api/routes/auth.ts）。
 */
export function sha256Hex(input: string): string {
  return createHash('sha256').update(String(input), 'utf8').digest('hex');
}

/**
 * 稳定短哈希（FNV-1a 32bit，8 位十六进制）：
 * 用于不需要密码学强度的分片键（如日志 trace id）。
 */
export function shortHash(input: string): string {
  let h = 0x811c9dc5;
  const s = String(input);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
