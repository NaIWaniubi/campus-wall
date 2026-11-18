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
import { attach, detach, subscribeTopic, unsubscribeTopic, closeUser, sessionVers } from './hub.js';
import { handleMessage } from './handlers/message.js';
import { db } from '../db.js';

const HELLO_TIMEOUT_MS = 10_000;
/** 单帧上限：业务消息最长 2000 字，64KB 足够且能挡住大帧压内存（ws 默认 100MB） */
const MAX_PAYLOAD_BYTES = 64 * 1024;
/** 连接数上限：防止未认证连接耗尽内存；校园规模 2000 并发绰绰有余 */
const MAX_CONNECTIONS = 2000;
/** 心跳间隔：清理半开连接（手机端切网/锁屏后常见） */
const HEARTBEAT_MS = 30_000;

export function attachWebSocket(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD_BYTES });

  // 心跳：给每个连接打标记，下个周期仍未收到 pong 的判定为死连接并断开
  const alive = new WeakMap<object, boolean>();
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (alive.get(ws) === false) {
        try { ws.terminate(); } catch { /* noop */ }
        continue;
      }
      alive.set(ws, false);
      try { ws.ping(); } catch { /* noop */ }
    }
  }, HEARTBEAT_MS);
  heartbeat.unref?.();
  wss.on('close', () => { clearInterval(heartbeat); clearInterval(sweep); });

  // 会话吊销复核：封禁 / 改密递增 token_version 后，存量长连接不会被 hello 重验，
  // 若不主动复核，被封用户可持续 message:send 绕过 REST 封禁（WS 成为旁路）。
  // 60s 一轮：单条索引查询/在线用户；封禁的即时踢由 admin 端点直接调 closeUser。
  const sweep = setInterval(() => {
    const vers = sessionVers();
    if (vers.size === 0) return;
    const stmt = db.prepare('SELECT token_version, status FROM users WHERE id = ?');
    for (const [id, ver] of vers) {
      const row = stmt.get(id) as { token_version: number | null; status: string } | undefined;
      if (!row) continue;
      const revoked = Number(row.token_version ?? 0) !== ver;
      const banned = row.status === 'banned';
      if (revoked || banned) closeUser(id, 4003, revoked ? 'session revoked' : 'user banned');
    }
  }, 60_000);
  sweep.unref?.();

  server.on('upgrade', (req, socket, head) => {
    if (wss.clients.size >= MAX_CONNECTIONS) {
      // 超限直接拒绝握手，避免继续分配连接对象
      socket.write('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    if (!req.url?.startsWith('/ws')) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  wss.on('connection', (ws) => {
    alive.set(ws, true);
    ws.on('pong', () => alive.set(ws, true));

    let userId: number | null = null;
    let conn: ReturnType<typeof attach> | null = null;
    // hello 之前的帧数上限：未认证连接只能试探有限次，防止刷帧耗 CPU
    let preHelloFrames = 0;
    const helloTimer = setTimeout(() => {
      try { ws.close(4001, 'hello timeout'); } catch { /* noop */ }
    }, HELLO_TIMEOUT_MS);

    ws.on('message', async (raw) => {
      if (userId === null) {
        preHelloFrames++;
        if (preHelloFrames > 5) {
          try { ws.close(4008, 'too many frames before hello'); } catch { /* noop */ }
          return;
        }
      }

      let parsed: TClientMsg;
      try {
        parsed = ClientMsg.parse(JSON.parse(raw.toString()));
      } catch {
        ws.send(JSON.stringify({ type: 'error', code: 'BAD_REQUEST', message: 'invalid frame' }));
        return;
      }

      if (parsed.type === 'hello') {
        // 重复 hello 防护：认证后再次 hello 会再 attach 一个 Conn 且旧 Conn 永不 detach
        // （连接泄漏 + 同 socket 换 token 时把旧身份的推送串投给新身份）
        if (conn || userId !== null) {
          ws.send(JSON.stringify({ type: 'error', code: 'BAD_REQUEST', message: 'already authenticated' }));
          try { ws.close(4008, 'duplicate hello'); } catch { /* noop */ }
          return;
        }
        let helloVer = 0;
        try {
          const u = authJwt(parsed.token);
          userId = u.id;
          helloVer = u.ver;
        } catch {
          ws.send(JSON.stringify({ type: 'error', code: 'UNAUTHORIZED', message: 'bad token' }));
          try { ws.close(4001, 'unauthorized'); } catch { /* noop */ }
          return;
        }
        clearTimeout(helloTimer);
        conn = attach(ws, userId, helloVer);
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
