/**
 * refresh token 单次消费（jti 重用检测）
 *
 * 背景：refresh 是 7 天有效期的长凭证。只做"换发新串"而不登记旧串，
 * 等于轮换只发生在客户端——旧串仍可反复使用；若它已泄漏，攻击者与用户
 * 都能一直续命。这里用一张小表记录已消费的 jti，实现：
 * - 每个 refresh 只能换发一次（单次使用）；
 * - 同一 jti 二次出现视为重放/泄漏信号，直接拒绝（401，由前端引导重新登录）。
 *
 * 兼容：升级前签发的旧 refresh 没有 jti，放行（最多 7 天后自然失效）。
 * 清理：每次消费顺手删除过期记录，表大小与 7 天内活跃会话数同阶。
 */
import { db } from '../db.js';

/**
 * 消费一个 refresh jti。
 * @returns true = 首次使用（放行）；false = 已被消费过（重用，拒绝）
 */
export function consumeRefreshJti(jti: string, userId: number, expSeconds?: number): boolean {
  const now = Date.now();
  // 顺手清理过期记录（幂等，走 expires_at 索引）
  db.prepare('DELETE FROM used_refresh_jti WHERE expires_at < ?').run(now);

  // exp 缺失（异常签发）按 7 天兜底，避免记录永不过期
  const expiresAt = expSeconds ? expSeconds * 1000 : now + 7 * 24 * 3600 * 1000;
  const res = db
    .prepare('INSERT OR IGNORE INTO used_refresh_jti (jti, user_id, expires_at) VALUES (?, ?, ?)')
    .run(jti, userId, expiresAt);
  return res.changes === 1;
}