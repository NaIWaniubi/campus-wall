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
export const ServerMsg = z.discriminatedUnion('type', [
  ServerError, MessageAck, MessageIncoming, Pong,
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
