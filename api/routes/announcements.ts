/**
 * 官方公告路由：管理员发布/列表/删除公告，前端拉取最新未确认公告
 */
import { Router } from 'express';
import { db } from '../db.js';
import { authRequired, authOptional, superAdminRequired } from '../middleware/auth.js';
import { success, fail } from '../utils/response.js';

const router = Router();

// 获取当前用户最新未确认的公告
router.get('/active', authOptional, (req, res) => {
  const userId = req.currentUser?.id || 0;
  const announcements = db.prepare(`
    SELECT a.* FROM announcements a
    WHERE a.is_active = 1
    AND (a.expires_at IS NULL OR datetime(a.expires_at) > datetime('now'))
    AND (
      a.target_user_id IS NULL OR a.target_user_id = ?
    )
    AND a.id NOT IN (
      SELECT announcement_id FROM announcement_acks WHERE user_id = ?
    )
    ORDER BY a.created_at DESC
    LIMIT 1
  `).all(userId, userId) as any[];

  if (announcements.length === 0) {
    return success(res, null);
  }

  const a = announcements[0];
  success(res, {
    id: a.id,
    title: a.title,
    content: a.content,
    createdAt: a.created_at ? new Date(a.created_at).toISOString() : a.created_at,
  });
});

// 确认公告（不再向该用户展示）
router.post('/:id/ack', authRequired, (req, res) => {
  const id = Number(req.params.id);
  // 记录确认（仅对登录用户有效）
  db.prepare(`
    INSERT OR IGNORE INTO announcement_acks (announcement_id, user_id) VALUES (?, ?)
  `).run(id, req.currentUser!.id);
  success(res, null, '已确认');
});

// ============ 管理员管理公告 ============
router.use(authRequired, superAdminRequired);

// 公告列表
router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT * FROM announcements ORDER BY created_at DESC LIMIT 50
  `).all() as any[];
  const list = rows.map((a) => ({
    ...a,
    createdAt: a.created_at ? new Date(a.created_at).toISOString() : a.created_at,
  }));
  success(res, list);
});

// 发布公告
router.post('/', (req, res) => {
  const { title, content, expiresAt } = req.body;
  if (!title || !content) return fail(res, '标题和内容不能为空');
  const result = db.prepare(`
    INSERT INTO announcements (title, content, expires_at, is_active, created_by)
    VALUES (?, ?, ?, 1, ?)
  `).run(title.trim(), content.trim(), expiresAt || null, req.currentUser!.id);
  success(res, { id: result.lastInsertRowid }, '公告已发布');
});

// 停用公告
router.put('/:id/deactivate', (req, res) => {
  const id = Number(req.params.id);
  db.prepare('UPDATE announcements SET is_active = 0 WHERE id = ?').run(id);
  success(res, null, '公告已停用');
});

export default router;

