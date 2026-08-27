/**
 * WS message:send 处理器
 * - 写 messages 表 + 推 message:ack 给发送方 + 推 message:incoming 给接收方订阅者
 * - 注：双写期 SQL 仍走 better-sqlite3（db.ts 现有实例），保持不动；WS 层只做推送
 */
import { db } from '../../db.js';
import type { Conn } from '../hub.js';
import { sendTo, sendToConv } from '../hub.js';
import { MessageAck, MessageIncoming, type TClientMsg } from '../protocol.js';

export async function handleMessage(conn: Conn, userId: number, parsed: Extract<TClientMsg, { type: 'message:send' }>): Promise<void> {
  // 1) 找/建会话（约定 user_a < user_b）
  const a = Math.min(userId, parsed.to);
  const b = Math.max(userId, parsed.to);
  let conv = db.prepare('SELECT * FROM conversations WHERE user_a_id = ? AND user_b_id = ?').get(a, b) as { id: number } | undefined;
  if (!conv) {
    const r = db.prepare('INSERT INTO conversations (user_a_id, user_b_id, last_message, last_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)').run(a, b, '');
    conv = { id: Number(r.lastInsertRowid) };
  }

  // 2) 写 chat_messages（现有表名，非 kysely 18 表 — 双写期保留 REST 同款 schema）
  const created = new Date().toISOString();
  const r = db.prepare('INSERT INTO chat_messages (conversation_id, sender_id, content, is_read, created_at) VALUES (?, ?, ?, 0, ?)')
    .run(conv.id, userId, parsed.body, created);
  const msgId = Number(r.lastInsertRowid);

  // 更新会话最后一条
  db.prepare('UPDATE conversations SET last_message = ?, last_at = ? WHERE id = ?').run(parsed.body, created, conv.id);

  // 3) 推 ack 给发送方
  sendTo(userId, MessageAck.parse({
    type: 'message:ack',
    requestId: parsed.requestId,
    messageId: msgId,
    clientMsgId: parsed.clientMsgId,
    createdAt: created,
  }));

  // 4) 推 incoming 给会话订阅者（含接收方在线连接）
  sendToConv(conv.id, MessageIncoming.parse({
    type: 'message:incoming',
    messageId: msgId,
    from: userId,
    convId: conv.id,
    body: parsed.body,
    createdAt: created,
  }));

  // 5) 推一条小提示给接收方（即使没订阅会话也走 user 推送）
  sendTo(parsed.to, MessageIncoming.parse({
    type: 'message:incoming',
    messageId: msgId,
    from: userId,
    convId: conv.id,
    body: parsed.body,
    createdAt: created,
  }));

  // 静默 unused 警告
  void conn;
}
