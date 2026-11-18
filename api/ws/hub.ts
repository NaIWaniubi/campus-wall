/**
 * WS Hub：连接管理 + 房间订阅
 * - conns: userId -> Set<Conn>（同一用户多端）
 * - convSubs: convId -> Set<Conn>（会话房间）
 * - topicSubs: topic -> Set<Conn>（广播主题）
 */
import type { WebSocket } from 'ws';
import type { TServerMsg } from './protocol.js';

export interface Conn {
  ws: WebSocket;
  userId: number;
  /** hello 时刻的 token_version：封禁/改密后周期复核据此踢连接 */
  ver: number;
  topics: Set<string>;              // 已订阅的广播主题
  subscribedConvs: Set<number>;     // 已订阅的会话
}

const conns = new Map<number, Set<Conn>>();       // userId -> connections
const convSubs = new Map<number, Set<Conn>>();    // convId  -> connections
const topicSubs = new Map<string, Set<Conn>>();   // topic   -> connections

export function attach(ws: WebSocket, userId: number, ver = 0): Conn {
  const c: Conn = { ws, userId, ver, topics: new Set(), subscribedConvs: new Set() };
  const set = conns.get(userId) ?? new Set();
  set.add(c);
  conns.set(userId, set);
  return c;
}

export function detach(c: Conn): void {
  const set = conns.get(c.userId);
  set?.delete(c);
  // 空集合一并清掉：否则离线用户的空 Set 常驻，stats().users 与遍历成本缓慢膨胀
  if (set && set.size === 0) conns.delete(c.userId);
  for (const conv of c.subscribedConvs) convSubs.get(conv)?.delete(c);
  for (const t of c.topics) topicSubs.get(t)?.delete(c);
}

function sendSafe(c: Conn, payload: string): boolean {
  if (c.ws.readyState === 1 /* OPEN */) {
    c.ws.send(payload);
    return true;
  }
  return false;
}

export function sendTo(userId: number, msg: TServerMsg): number {
  const set = conns.get(userId);
  if (!set || set.size === 0) return 0;
  const payload = JSON.stringify(msg);
  let n = 0;
  for (const c of set) if (sendSafe(c, payload)) n++;
  return n;
}

export function sendToConv(convId: number, msg: TServerMsg): number {
  const set = convSubs.get(convId);
  if (!set) return 0;
  const payload = JSON.stringify(msg);
  let n = 0;
  for (const c of set) if (sendSafe(c, payload)) n++;
  return n;
}

export function broadcastTopic(topic: string, msg: TServerMsg): number {
  const set = topicSubs.get(topic);
  if (!set) return 0;
  const payload = JSON.stringify(msg);
  let n = 0;
  for (const c of set) if (sendSafe(c, payload)) n++;
  return n;
}

export function subscribeConv(c: Conn, convId: number): void {
  c.subscribedConvs.add(convId);
  const set = convSubs.get(convId) ?? new Set();
  set.add(c);
  convSubs.set(convId, set);
}

export function subscribeTopic(c: Conn, topic: string): void {
  c.topics.add(topic);
  const set = topicSubs.get(topic) ?? new Set();
  set.add(c);
  topicSubs.set(topic, set);
}

export function unsubscribeTopic(c: Conn, topic: string): void {
  c.topics.delete(topic);
  topicSubs.get(topic)?.delete(c);
}

/** 吊销某用户全部 WS 连接（封禁 / 改密即时生效用）；返回关闭数量 */
export function closeUser(userId: number, code = 4003, reason = 'session revoked'): number {
  const set = conns.get(userId);
  if (!set || set.size === 0) return 0;
  const payload = JSON.stringify({ type: 'error', code: String(code), message: reason });
  let n = 0;
  for (const c of set) {
    // 先走 detach：否则 convSubs/topicSubs 会残留已关连接的房间订阅，缓慢膨胀
    try { sendSafe(c, payload); } catch { /* noop */ }
    try { c.ws.close(code, reason); } catch { /* noop */ }
    detach(c);
    n++;
  }
  return n;
}

/** 列出当前在线用户（复核与指标用） */
export function onlineUsers(): number[] {
  return Array.from(conns.keys());
}

/** 在线用户 → hello 时记录的 token_version（复核吊销用；多端同版本取其一） */
export function sessionVers(): Map<number, number> {
  const out = new Map<number, number>();
  for (const [uid, set] of conns) {
    for (const c of set) { out.set(uid, c.ver); break; }
  }
  return out;
}

export function stats() {
  return {
    users: conns.size,
    convs: convSubs.size,
    topics: topicSubs.size,
  };
}
