/**
 * 私信双路分发核心：REST 与 WS 共用一套「落库 + 会话摘要 + 未读 + WS 推送 + 站内通知」
 * - REST POST /:id/messages 与 WS message:send 收敛到这里，保证两条路径行为一致
 *   （旧 WS 直发路径漏了未读自增与 chat 通知，此收敛顺带补齐）
 * - WS 推送尽力而为：失败不影响落库，离线由 REST ?afterId= 增量补拉
 */
import { db } from '../../db.js';
import { sendTo, sendToConv } from '../hub.js';
import { MessageAck, MessageIncoming } from '../protocol.js';
import { upsertNotification } from '../../utils/notification.js';

export interface DispatchMeta {
  /** WS 发送的回执关联 id（REST 路径无此 id，跳过 ack） */
  requestId?: string;
  /** 客户端幂等去重 id（预留，当前以 messageId 去重） */
  clientMsgId?: string;
}

export interface DispatchResult {
  messageId: number;
  convId: number;
  peerId: number;
  createdAt: string;
}

type ConvRow = { id: number; user_a_id: number; user_b_id: number };

/**
 * 核心：在已校验参与方的会话内发一条消息
 * @param conv   会话行（须含 user_a_id / user_b_id）
 * @param senderId 发送者（必须是会话参与方）
 * @param content  已trim、未超限的消息文本
 */
export function dispatchChatMessage(conv: ConvRow, senderId: number, content: string, meta: DispatchMeta = {}): DispatchResult {
  const senderIsA = conv.user_a_id === senderId;
  const peerId = senderIsA ? conv.user_b_id : conv.user_a_id;
  let messageId = 0;
  let createdAt = '';

  db.transaction(() => {
    // 与 REST 原路径同款：created_at/is_read 走表默认值
    const r = db
      .prepare('INSERT INTO chat_messages (conversation_id, sender_id, content) VALUES (?, ?, ?)')
      .run(conv.id, senderId, content);
    messageId = Number(r.lastInsertRowid);
    const row = db.prepare('SELECT created_at FROM chat_messages WHERE id = ?').get(messageId) as any;
    createdAt = row?.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString();
    db.prepare(
      `UPDATE conversations SET last_message = ?, last_at = CURRENT_TIMESTAMP,
       ${senderIsA ? 'unread_b' : 'unread_a'} = ${senderIsA ? 'unread_b' : 'unread_a'} + 1 WHERE id = ?`
    ).run(content.slice(0, 50), conv.id);
  })();

  // WS 双推：ack 回发送方所有端；incoming 发会话订阅者 + 接收方所有端（用户级推送，无须订阅会话房间）
  const incoming = MessageIncoming.parse({
    type: 'message:incoming',
    messageId,
    from: senderId,
    convId: conv.id,
    body: content,
    createdAt,
  });
  if (meta.requestId) {
    sendTo(senderId, MessageAck.parse({
      type: 'message:ack',
      requestId: meta.requestId,
      messageId,
      clientMsgId: meta.clientMsgId ?? '',
      createdAt,
    }));
  }
  sendToConv(conv.id, incoming);
  sendTo(peerId, incoming);

  // 给对方一条 type:'chat' 的站内通知（7 天窗口去重），失败不影响主流程
  try {
    const sender = db.prepare('SELECT nickname FROM users WHERE id = ?').get(senderId) as any;
    upsertNotification(peerId, 'chat', `${sender?.nickname ?? ''}：${content}`, conv.id);
  } catch (err: any) {
    console.error('私信通知失败:', err?.message);
  }

  return { messageId, convId: conv.id, peerId, createdAt };
}

/** WS 入口：按对端 userId 找/建会话后分发（约定小 id 存 a 方，命中 UNIQUE(user_a_id, user_b_id)） */
export function dispatchByPeer(senderId: number, toUserId: number, content: string, meta: DispatchMeta = {}): DispatchResult {
  if (!Number.isInteger(toUserId) || toUserId <= 0) throw new Error('对端用户不合法');
  if (toUserId === senderId) throw new Error('不能给自己发私信');
  const a = Math.min(senderId, toUserId);
  const b = Math.max(senderId, toUserId);
  let conv = db.prepare('SELECT * FROM conversations WHERE user_a_id = ? AND user_b_id = ?').get(a, b) as ConvRow | undefined;
  if (!conv) {
    db.prepare('INSERT INTO conversations (user_a_id, user_b_id) VALUES (?, ?)').run(a, b);
    conv = db.prepare('SELECT * FROM conversations WHERE user_a_id = ? AND user_b_id = ?').get(a, b) as ConvRow;
  }
  return dispatchChatMessage(conv, senderId, content, meta);
}
