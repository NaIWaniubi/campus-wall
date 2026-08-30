/**
 * 通知去重工具：生成通知前检查同一 (user_id, type, related_id) 近期是否已存在，
 * 存在则更新原记录（刷新内容、置为未读、更新时间），避免重复刷屏。
 * 写入成功后向 WS notifications 主题广播 notification:push（仅在线订阅者收到，离线走 REST 拉取）。
 */
import { db } from '../db.js';
import { broadcastTopic } from '../ws/hub.js';
import { NotificationPush } from '../ws/protocol.js';
import { isPushEnabled, sendPushToUser } from './push.js';
import { isWxPushEnabled, sendWxSubscribeMessage } from './wx-push.js';

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
  let notificationId = 0;

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
    notificationId = existing.id;
  } else {
    const r = db.prepare(`
      INSERT INTO messages (user_id, type, content, related_id)
      VALUES (?, ?, ?, ?)
    `).run(user_id, type, content, related_id ?? null);
    notificationId = Number(r.lastInsertRowid);
  }

  // WS 实时广播：失败不影响通知落库（离线用户由 REST 拉取兜底）
  try {
    broadcastTopic('notifications', NotificationPush.parse({
      type: 'notification:push',
      notificationId,
      kind: type,
      content,
      relatedId: related_id ?? null,
      createdAt: new Date().toISOString(),
    }));
  } catch { /* 推送失败静默 */ }

  // 离线推送双通道（spec-C T9 预埋）：VAPID / 微信订阅消息未配置时各自内部静默跳过
  if (isPushEnabled()) {
    void sendPushToUser(user_id, {
      title: '校园墙',
      body: content.slice(0, 80),
      url: type === 'chat' ? '/message?tab=chat' : '/message',
    });
  }
  if (isWxPushEnabled() && (type === 'chat' || type === 'system')) {
    void sendWxSubscribeMessage(user_id, type, content, related_id ?? null);
  }
}
