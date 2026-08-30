/**
 * WS 协议：客户端/服务端统一 JSON schema（zod）
 * - 客户端 → 服务端：hello / subscribe / unsubscribe / message:send / ping
 * - 服务端 → 客户端：error / message:ack / message:incoming / pong
 */
import { z } from 'zod';

export const ClientHello = z.object({
  type: z.literal('hello'),
  token: z.string(),                        // JWT
});
export const Subscribe = z.object({
  type: z.literal('subscribe'),
  topics: z.array(z.enum(['messages', 'notifications', 'announcements', 'presence'])),
});
export const Unsubscribe = z.object({
  type: z.literal('unsubscribe'),
  topics: z.array(z.enum(['messages', 'notifications', 'announcements', 'presence'])),
});
export const SendMessage = z.object({
  type: z.literal('message:send'),
  requestId: z.string().uuid(),
  to: z.number().int().positive(),
  body: z.string().min(1).max(2000),
  clientMsgId: z.string().uuid(),            // 客户端去重
});
export const Ping = z.object({ type: z.literal('ping'), ts: z.number() });
export const ClientMsg = z.discriminatedUnion('type', [
  ClientHello, Subscribe, Unsubscribe, SendMessage, Ping,
]);

export const ServerError = z.object({
  type: z.literal('error'),
  code: z.enum(['UNAUTHORIZED', 'BAD_REQUEST', 'RATE_LIMIT', 'INTERNAL']),
  message: z.string(),
  requestId: z.string().optional(),
});
export const MessageAck = z.object({
  type: z.literal('message:ack'),
  requestId: z.string(),
  messageId: z.number().int(),
  clientMsgId: z.string(),
  createdAt: z.string(),
});
export const MessageIncoming = z.object({
  type: z.literal('message:incoming'),
  messageId: z.number().int(),
  from: z.number().int(),
  convId: z.number().int(),
  body: z.string(),
  createdAt: z.string(),
});
export const Pong = z.object({ type: z.literal('pong'), ts: z.number() });
/** 通知实时推送（订阅 notifications 主题后收到；字段对齐 messages 表的通知行） */
export const NotificationPush = z.object({
  type: z.literal('notification:push'),
  notificationId: z.number().int(),
  kind: z.string(),                        // 通知类型：comment/like/match/digest/chat/system
  content: z.string(),
  relatedId: z.number().int().nullable(),
  createdAt: z.string(),
});
export const ServerMsg = z.discriminatedUnion('type', [
  ServerError, MessageAck, MessageIncoming, Pong, NotificationPush,
]);

export type TClientMsg = z.infer<typeof ClientMsg>;
export type TServerMsg = z.infer<typeof ServerMsg>;

/**
 * 频道前缀：conversation:<id> 推送 message:incoming
 * 也支持 broadcast 主题（notifications / announcements）
 */
export function channelForConv(convId: number): string {
  return `conversation:${convId}`;
}
