/**
 * WS 服务启动
 * - 挂到现有 http.Server 的 upgrade 事件
 * - URL: /ws
 * - 鉴权：连接后 10s 内必须发送 hello 带 JWT，否则断开
 * - 不动 REST 路由（REST 仍是兜底）
 */
import type { Server } from 'node:http';
import { WebSocketServer } from 'ws';
import { ClientMsg, type TClientMsg } from './protocol.js';
import { authJwt } from './auth.js';
import { attach, detach, subscribeTopic, unsubscribeTopic, subscribeConv } from './hub.js';
import { handleMessage } from './handlers/message.js';

const HELLO_TIMEOUT_MS = 10_000;

export function attachWebSocket(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    if (!req.url?.startsWith('/ws')) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  wss.on('connection', (ws) => {
    let userId: number | null = null;
    let conn: ReturnType<typeof attach> | null = null;
    const helloTimer = setTimeout(() => {
      try { ws.close(4001, 'hello timeout'); } catch { /* noop */ }
    }, HELLO_TIMEOUT_MS);

    ws.on('message', async (raw) => {
      let parsed: TClientMsg;
      try {
        parsed = ClientMsg.parse(JSON.parse(raw.toString()));
      } catch {
        ws.send(JSON.stringify({ type: 'error', code: 'BAD_REQUEST', message: 'invalid frame' }));
        return;
      }

      if (parsed.type === 'hello') {
        try {
          const u = authJwt(parsed.token);
          userId = u.id;
        } catch {
          ws.send(JSON.stringify({ type: 'error', code: 'UNAUTHORIZED', message: 'bad token' }));
          try { ws.close(4001, 'unauthorized'); } catch { /* noop */ }
          return;
        }
        clearTimeout(helloTimer);
        conn = attach(ws, userId);
        ws.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
        return;
      }

      if (!conn || userId === null) {
        ws.send(JSON.stringify({ type: 'error', code: 'UNAUTHORIZED', message: 'no hello' }));
        return;
      }

      if (parsed.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
        return;
      }

      if (parsed.type === 'subscribe') {
        for (const t of parsed.topics) subscribeTopic(conn, t);
        return;
      }

      if (parsed.type === 'unsubscribe') {
        for (const t of parsed.topics) unsubscribeTopic(conn, t);
        return;
      }

      if (parsed.type === 'message:send') {
        try {
          await handleMessage(conn, userId, parsed);
        } catch (e: any) {
          ws.send(JSON.stringify({
            type: 'error',
            code: 'INTERNAL',
            message: e?.message ?? 'send failed',
            requestId: parsed.requestId,
          }));
        }
        return;
      }
    });

    ws.on('close', () => {
      clearTimeout(helloTimer);
      if (conn) detach(conn);
    });
    ws.on('error', () => {
      clearTimeout(helloTimer);
      if (conn) detach(conn);
    });
  });

  return wss;
}
