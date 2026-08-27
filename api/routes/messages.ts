/**
 * 消息路由：列表、标记已读、全部已读
 */
import { Router } from 'express';
import { db } from '../db.js';
import { authRequired } from '../middleware/auth.js';
import { success, fail } from '../utils/response.js';

const router = Router();

// 消息列表（分页）
router.get('/', authRequired, (req, res) => {
  const type = req.query.type as string;
  // 分页：page 从 1 起；pageSize 上限 100，默认 20。
  // 取 pageSize+1 用于判断 hasMore（多查一条，少一次 COUNT(*) 提速）
  const page = Math.max(1, parseInt((req.query.page as string) || '1'));
  const pageSize = Math.min(100, Math.max(1, parseInt((req.query.pageSize as string) || '20')));
  const offset = (page - 1) * pageSize;

  let where = `WHERE user_id = ?`;
  const params: any[] = [req.currentUser!.id];
  if (type && type !== 'all') {
    where += ` AND type = ?`;
    params.push(type);
  }

  const rows = db.prepare(`
    SELECT * FROM messages ${where}
    ORDER BY is_read ASC, created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, pageSize + 1, offset) as any[];

  const hasMore = rows.length > pageSize;
  const sliced = hasMore ? rows.slice(0, pageSize) : rows;
  const messages = sliced.map((m) => ({
    id: m.id,
    userId: m.user_id,
    type: m.type,
    content: m.content,
    postId: m.related_id,
    isRead: !!m.is_read,
    createdAt: m.created_at ? new Date(m.created_at).toISOString() : m.created_at,
  }));

  const unreadCount = db.prepare('SELECT COUNT(*) as count FROM messages WHERE user_id = ? AND is_read = 0').get(req.currentUser!.id) as any;

  success(res, { list: messages, unreadCount: unreadCount.count, hasMore, page, pageSize });
});

// 标记单条已读
router.put('/read/:id', authRequired, (req, res) => {
  const id = Number(req.params.id);
  db.prepare('UPDATE messages SET is_read = 1 WHERE id = ? AND user_id = ?').run(id, req.currentUser!.id);
  success(res, null, '已标记已读');
});

// 标记单条已读（PATCH 形式，需 authRequired 且只能标记自己的消息）
router.patch('/:id/read', authRequired, (req, res) => {
  const id = Number(req.params.id);
  const result = db.prepare('UPDATE messages SET is_read = 1 WHERE id = ? AND user_id = ?').run(id, req.currentUser!.id);
  if (result.changes === 0) return fail(res, '消息不存在或无权限', 404, 404);
  success(res, null, '已标记已读');
});

// 全部已读：仅标记当前已加载（前端传入 id 列表），避免"一键全读"吞掉未加载的较旧未读
router.put('/read-all', authRequired, (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter((x: any) => Number.isFinite(x)) : [];
  if (ids.length === 0) {
    // 没传 ids 视为"标当前已加载但前端没传"——零回退静默，提示前端补传
    return fail(res, '请传入要标记已读的消息 id 列表 ids: number[]', 400, 400);
  }
  const placeholders = ids.map(() => '?').join(',');
  const result = db.prepare(
    `UPDATE messages SET is_read = 1 WHERE user_id = ? AND is_read = 0 AND id IN (${placeholders})`
  ).run(req.currentUser!.id, ...ids);
  success(res, { updated: result.changes }, '已标记已读');
});

export default router;

