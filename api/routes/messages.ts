/**
 * 消息路由：列表、标记已读、全部已读
 */
import { Router } from 'express';
import { db } from '../db.js';
import { authRequired } from '../middleware/auth.js';
import { success, fail } from '../utils/response.js';

const router = Router();

// 消息列表
router.get('/', authRequired, (req, res) => {
  const type = req.query.type as string;
  let where = `WHERE user_id = ?`;
  const params: any[] = [req.currentUser!.id];
  if (type && type !== 'all') {
    where += ` AND type = ?`;
    params.push(type);
  }

  const rows = db.prepare(`
    SELECT * FROM messages ${where}
    ORDER BY is_read ASC, created_at DESC
    LIMIT 100
  `).all(...params) as any[];

  const messages = rows.map((m) => ({
    id: m.id,
    userId: m.user_id,
    type: m.type,
    content: m.content,
    postId: m.related_id,
    isRead: !!m.is_read,
    createdAt: m.created_at ? new Date(m.created_at).toISOString() : m.created_at,
  }));

  const unreadCount = db.prepare('SELECT COUNT(*) as count FROM messages WHERE user_id = ? AND is_read = 0').get(req.currentUser!.id) as any;

  success(res, { list: messages, unreadCount: unreadCount.count });
});

// 标记单条已读
router.put('/read/:id', authRequired, (req, res) => {
  const id = parseInt(req.params.id);
  db.prepare('UPDATE messages SET is_read = 1 WHERE id = ? AND user_id = ?').run(id, req.currentUser!.id);
  success(res, null, '已标记已读');
});

// 全部已读
router.put('/read-all', authRequired, (req, res) => {
  db.prepare('UPDATE messages SET is_read = 1 WHERE user_id = ? AND is_read = 0').run(req.currentUser!.id);
  success(res, null, '已全部标记已读');
});

export default router;
