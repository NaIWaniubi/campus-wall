/**
 * 每日板块摘要任务：
 * 遍历所有订阅者，统计其每个订阅板块过去 24h 的已发布新帖数与最热一帖，
 * 有内容才发一条 type='digest' 的站内通知（复用 notification 去重工具）。
 * 由 server.ts 的 setInterval 定时调用（零新依赖）。
 */
import { db } from '../db.js';
import { upsertNotification } from '../utils/notification.js';

/**
 * 执行一次每日摘要生成。
 * @returns 发出摘要通知的订阅者数量
 */
export function runDailyDigest(): number {
  const subscribers = db
    .prepare('SELECT DISTINCT user_id FROM subscriptions')
    .all() as { user_id: number }[];

  let notified = 0;
  for (const { user_id } of subscribers) {
    const sections = db
      .prepare(
        `SELECT s.id, s.name FROM subscriptions sub
         JOIN sections s ON sub.section_id = s.id AND s.is_active = 1
         WHERE sub.user_id = ?
         ORDER BY s.sort ASC`
      )
      .all(user_id) as { id: number; name: string }[];

    const parts: string[] = [];
    for (const sec of sections) {
      const stats = db
        .prepare(
          `SELECT COUNT(*) AS newCount, MAX(like_count) AS maxLikes
           FROM posts
           WHERE section_id = ? AND status = 'published'
             AND created_at >= datetime('now', '-1 day')`
        )
        .get(sec.id) as { newCount: number; maxLikes: number | null };

      if (!stats.newCount) continue;

      let hotText = '';
      const hot = db
        .prepare(
          `SELECT title, like_count FROM posts
           WHERE section_id = ? AND status = 'published'
             AND created_at >= datetime('now', '-1 day')
           ORDER BY like_count DESC, id DESC LIMIT 1`
        )
        .get(sec.id) as { title: string; like_count: number } | undefined;
      if (hot) {
        hotText = `，最热《${hot.title}》(${hot.like_count} 赞)`;
      }
      parts.push(`「${sec.name}」新帖 ${stats.newCount} 条${hotText}`);
    }

    // 该用户任一订阅板块当日均无新帖则不发
    if (!parts.length) continue;

    upsertNotification(user_id, 'digest', `【每日摘要】${parts.join('；')}`, null);
    notified++;
  }
  return notified;
}
