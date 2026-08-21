/**
 * 通知去重工具：生成通知前检查同一 (user_id, type, related_id) 近期是否已存在，
 * 存在则更新原记录（刷新内容、置为未读、更新时间），避免重复刷屏。
 */
import { db } from '../db.js';

const DEDUP_WINDOW_DAYS = 7;

/**
 * 写入一条通知（带去重）。
 * 同一 (user_id, type, related_id) 在 DEDUP_WINDOW_DAYS 天内已存在时，
 * 更新原记录而非新增；否则插入新记录。
 */
export function upsertNotification(
  user_id: number,
  type: string,
  content: string,
  related_id?: number | null
): void {
  const existing = db.prepare(`
    SELECT id FROM messages
    WHERE user_id = ? AND type = ? AND related_id IS ?
      AND created_at >= datetime('now', '-' || ? || ' days')
    ORDER BY created_at DESC LIMIT 1
  `).get(user_id, type, related_id ?? null, DEDUP_WINDOW_DAYS) as any;

  if (existing) {
    db.prepare(`
      UPDATE messages
      SET content = ?, is_read = 0, created_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(content, existing.id);
  } else {
    db.prepare(`
      INSERT INTO messages (user_id, type, content, related_id)
      VALUES (?, ?, ?, ?)
    `).run(user_id, type, content, related_id ?? null);
  }
}
