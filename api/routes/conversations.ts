/**
 * 私信会话路由：会话列表、创建会话、消息分页、发送消息、未读汇总
 */
import { Router } from 'express';
import { db } from '../db.js';
import { authRequired } from '../middleware/auth.js';
import { success, fail, toInt } from '../utils/response.js';
import { dispatchChatMessage } from '../ws/handlers/dispatcher.js';
import { chatLimiter } from '../middleware/rateLimit.js';

const router = Router();

// 写端点限流（创建会话、发送消息等高频写操作）：仅作用于写方法，GET 列表/分页不受影响
const writeLimiter = chatLimiter;

// 统一的时间序列化（与全站一致：SQLite DATETIME → ISO）
function toIso(v: string | null): string | null {
  return v ? new Date(v).toISOString() : v;
}

// 取会话并校验当前用户为参与方；返回会话与"我是否为 a 方"
function getConvForUser(convId: number, uid: number) {
  const conv = db
    .prepare('SELECT * FROM conversations WHERE id = ? AND (user_a_id = ? OR user_b_id = ?)')
    .get(convId, uid, uid) as any;
  if (!conv) return null;
  return { conv, isA: conv.user_a_id === uid };
}

// 我的会话列表（含对方信息、最后一条消息、我的未读数），按最近活跃倒序
router.get('/', authRequired, (req, res) => {
  const me = req.currentUser!.id;
  const rows = db
    .prepare(
      `
      SELECT c.*,
             ua.id AS a_id, ua.nickname AS a_nickname, ua.avatar AS a_avatar,
             ub.id AS b_id, ub.nickname AS b_nickname, ub.avatar AS b_avatar
      FROM conversations c
      INNER JOIN users ua ON ua.id = c.user_a_id
      INNER JOIN users ub ON ub.id = c.user_b_id
      WHERE c.user_a_id = ? OR c.user_b_id = ?
      ORDER BY c.last_at DESC
    `
    )
    .all(me, me) as any[];

  const list = rows.map((c) => {
    const isA = c.user_a_id === me;
    return {
      id: c.id,
      // 我在 a 方时对端是 b，反之亦然
      peer: isA
        ? { id: c.b_id, nickname: c.b_nickname, avatar: c.b_avatar }
        : { id: c.a_id, nickname: c.a_nickname, avatar: c.a_avatar },
      lastMessage: c.last_message,
      lastAt: toIso(c.last_at),
      unread: isA ? c.unread_a : c.unread_b,
    };
  });

  success(res, list);
});

// 创建（或复用）与某用户的会话，幂等返回 {id}
router.post('/', authRequired, writeLimiter, (req, res) => {
  const peerId = Number(req.body?.peerId);
  const me = req.currentUser!.id;

  if (!peerId || peerId <= 0) return fail(res, 'peerId 为必填项');
  if (peerId === me) return fail(res, '不能与自己建立会话');

  const peer = db.prepare("SELECT id FROM users WHERE id = ? AND status != 'banned'").get(peerId);
  if (!peer) return fail(res, '用户不存在', 404, 404);

  // 约定小 id 存 a 方，命中 UNIQUE(user_a_id, user_b_id)
  const [a, b] = me < peerId ? [me, peerId] : [peerId, me];
  db.prepare('INSERT OR IGNORE INTO conversations (user_a_id, user_b_id) VALUES (?, ?)').run(a, b);

  const conv = db.prepare('SELECT id FROM conversations WHERE user_a_id = ? AND user_b_id = ?').get(a, b) as any;
  success(res, { id: conv.id });
});

// 会话消息分页（升序），进入时把我侧未读清零
// 支持增量模式：?afterId=N 只返回 id > N 的消息（升序，最多 50 条），供客户端轻量轮询
router.get('/:id/messages', authRequired, (req, res) => {
  const convId = Number(req.params.id);
  const found = getConvForUser(convId, req.currentUser!.id);
  if (!found) return fail(res, '会话不存在', 404, 404);

  const afterId = toInt(req.query.afterId, 0, 0);
  const page = toInt(req.query.page, 1, 1);
  const pageSize = toInt(req.query.pageSize, 20, 1, 100);
  const total = (db.prepare('SELECT COUNT(*) as total FROM chat_messages WHERE conversation_id = ?').get(convId) as any).total;

  let rows: any[];
  let hasMore: boolean;
  if (afterId > 0) {
    // 增量模式固定单次上限 50 条，超出由客户端用新 afterId 续拉
    rows = db
      .prepare('SELECT * FROM chat_messages WHERE conversation_id = ? AND id > ? ORDER BY id ASC LIMIT 50')
      .all(convId, afterId) as any[];
    hasMore = rows.length === 50;
  } else {
    const offset = (page - 1) * pageSize;
    rows = db
      .prepare('SELECT * FROM chat_messages WHERE conversation_id = ? ORDER BY id ASC LIMIT ? OFFSET ?')
      .all(convId, pageSize, offset) as any[];
    hasMore = (page - 1) * pageSize + pageSize < total;
  }

  // 进入会话即视为已读：清零我侧 unread 并把该会话内我收到的消息标记已读
  db.prepare(`UPDATE conversations SET ${found.isA ? 'unread_a' : 'unread_b'} = 0 WHERE id = ?`).run(convId);
  db.prepare('UPDATE chat_messages SET is_read = 1 WHERE conversation_id = ? AND sender_id != ?').run(convId, req.currentUser!.id);

  const list = rows.map((m) => ({
    id: m.id,
    conversationId: m.conversation_id,
    senderId: m.sender_id,
    content: m.content,
    isMine: m.sender_id === req.currentUser!.id,
    createdAt: toIso(m.created_at),
  }));

  success(res, { list, total, page, pageSize, hasMore });
});

// 发送消息（≤500字）：写消息 + 更新会话摘要 + 对方未读+1 + 站内通知
router.post('/:id/messages', authRequired, writeLimiter, (req, res) => {
  const convId = Number(req.params.id);
  const found = getConvForUser(convId, req.currentUser!.id);
  if (!found) return fail(res, '会话不存在', 404, 404);

  const content = typeof req.body?.content === 'string' ? req.body.content.trim() : '';
  if (!content) return fail(res, '消息内容不能为空');
  if (content.length > 500) return fail(res, '消息最多500字');

  const { conv } = found;

  // 双路分发：落库 + 摘要/未读 + WS 推送 + 站内通知（与 WS message:send 同一套）
  const result = dispatchChatMessage(conv, req.currentUser!.id, content);

  success(res, { id: result.messageId }, '发送成功');
});

// 我全部会话的未读总和
router.get('/unread-count', authRequired, (req, res) => {
  const me = req.currentUser!.id;
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(CASE WHEN user_a_id = ? THEN unread_a ELSE unread_b END), 0) as count
       FROM conversations WHERE user_a_id = ? OR user_b_id = ?`
    )
    .get(me, me, me) as any;
  success(res, { count: row.count });
});

export default router;
