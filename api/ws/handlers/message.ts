/**
 * WS message:send 处理器
 * - 落库/摘要/未读/推送/通知全部收敛到 dispatcher 双路分发（与 REST 同一套）
 * - WS 必须独立限流：REST 的 chatLimiter 只挂在 conversations 路由上，
 *   长连接发消息完全不经过 Express 中间件，否则等于提供一条无限速通道
 */
import type { Conn } from '../hub.js';
import { dispatchByPeer } from './dispatcher.js';
import type { TClientMsg } from '../protocol.js';
import { ServerError } from '../protocol.js';

/** 与 REST chatLimiter 对齐：1 分钟 30 条 */
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 30;

/** 每个连接独立的滑动窗口（连接断开即随之释放，无需额外清理） */
const sendLog = new WeakMap<Conn, number[]>();

function isRateLimited(conn: Conn): boolean {
  const now = Date.now();
  const windowStart = now - WINDOW_MS;
  const arr = (sendLog.get(conn) || []).filter((t) => t > windowStart);
  if (arr.length >= MAX_PER_WINDOW) {
    sendLog.set(conn, arr);
    return true;
  }
  arr.push(now);
  sendLog.set(conn, arr);
  return false;
}

export async function handleMessage(conn: Conn, userId: number, parsed: Extract<TClientMsg, { type: 'message:send' }>): Promise<void> {
  if (isRateLimited(conn)) {
    conn.ws.send(JSON.stringify(ServerError.parse({
      type: 'error',
      code: 'RATE_LIMIT',
      message: '发送过于频繁，请稍后再试',
      requestId: parsed.requestId,
    })));
    return;
  }

  dispatchByPeer(userId, parsed.to, parsed.body, {
    requestId: parsed.requestId,
    clientMsgId: parsed.clientMsgId,
  });
}
