/**
 * WS message:send 处理器
 * - 落库/摘要/未读/推送/通知全部收敛到 dispatcher 双路分发（与 REST 同一套）
 */
import type { Conn } from '../hub.js';
import { dispatchByPeer } from './dispatcher.js';
import type { TClientMsg } from '../protocol.js';

export async function handleMessage(conn: Conn, userId: number, parsed: Extract<TClientMsg, { type: 'message:send' }>): Promise<void> {
  dispatchByPeer(userId, parsed.to, parsed.body, {
    requestId: parsed.requestId,
    clientMsgId: parsed.clientMsgId,
  });
  // 静默 unused 警告
  void conn;
}
