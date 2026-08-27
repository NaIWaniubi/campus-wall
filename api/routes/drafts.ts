/**
 * 草稿箱路由：保存/恢复/删除草稿
 */
import { Router } from 'express';
import { db } from '../db.js';
import { authRequired } from '../middleware/auth.js';
import { success, fail } from '../utils/response.js';

const router = Router();

// 草稿列表（最近10条）
router.get('/', authRequired, (req, res) => {
  const drafts = db.prepare(`
    SELECT d.*, s.name as section_name, s.icon as section_icon
    FROM drafts d
    LEFT JOIN sections s ON d.section_id = s.id
    WHERE d.user_id = ?
    ORDER BY d.created_at DESC
    LIMIT 10
  `).all(req.currentUser!.id) as any[];

  const list = drafts.map((d) => ({
    id: d.id,
    sectionId: d.section_id,
    sectionName: d.section_name,
    sectionIcon: d.section_icon,
    title: d.title,
    content: d.content,
    images: JSON.parse(d.images || '[]'),
    isAnonymous: !!d.is_anonymous,
    extraFields: JSON.parse(d.extra_fields || '{}'),
    createdAt: d.created_at ? new Date(d.created_at).toISOString() : d.created_at,
  }));
  success(res, list);
});

// 保存草稿
router.post('/', authRequired, (req, res) => {
  const { sectionId, title, content, images, isAnonymous, extraFields } = req.body;

  // 限制草稿总数10条，超出删除最早的
  const count = db.prepare('SELECT COUNT(*) as count FROM drafts WHERE user_id = ?').get(req.currentUser!.id) as any;
  if (count.count >= 10) {
    db.prepare(`
      DELETE FROM drafts WHERE id = (
        SELECT id FROM drafts WHERE user_id = ? ORDER BY created_at ASC LIMIT 1
      )
    `).run(req.currentUser!.id);
  }

  const imgs = Array.isArray(images) ? images : [];
  const result = db.prepare(`
    INSERT INTO drafts (user_id, section_id, title, content, images, is_anonymous, extra_fields)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.currentUser!.id,
    sectionId || null,
    (title || '').trim(),
    content || '',
    JSON.stringify(imgs),
    isAnonymous ? 1 : 0,
    JSON.stringify(extraFields || {})
  );

  success(res, { id: result.lastInsertRowid }, '已保存至草稿箱');
});

// 更新草稿（编辑已有草稿走 PUT，不走 POST 重建——后者会撑爆 10 条上限并丢 created_at 顺序）
// 路径：PUT /api/drafts?id=123
router.put('/', authRequired, (req, res) => {
  const id = Number(req.query.id);
  if (!Number.isFinite(id) || id <= 0) return fail(res, '缺少有效 id（query ?id=）', 400, 400);
  const existing = db.prepare('SELECT id FROM drafts WHERE id = ? AND user_id = ?').get(id, req.currentUser!.id) as any;
  if (!existing) return fail(res, '草稿不存在或无权限', 404, 404);

  const { sectionId, title, content, images, isAnonymous, extraFields } = req.body;
  const imgs = Array.isArray(images) ? images : [];
  db.prepare(`
    UPDATE drafts
    SET section_id = ?, title = ?, content = ?, images = ?, is_anonymous = ?, extra_fields = ?
    WHERE id = ? AND user_id = ?
  `).run(
    sectionId || null,
    (title || '').trim(),
    content || '',
    JSON.stringify(imgs),
    isAnonymous ? 1 : 0,
    JSON.stringify(extraFields || {}),
    id,
    req.currentUser!.id
  );
  success(res, { id }, '草稿已更新');
});

// 删除草稿
router.delete('/:id', authRequired, (req, res) => {
  const id = Number(req.params.id);
  const draft = db.prepare('SELECT * FROM drafts WHERE id = ? AND user_id = ?').get(id, req.currentUser!.id) as any;
  if (!draft) return fail(res, '草稿不存在', 404, 404);
  db.prepare('DELETE FROM drafts WHERE id = ?').run(id);
  success(res, null, '草稿已删除');
});

// 清空草稿
router.delete('/', authRequired, (req, res) => {
  db.prepare('DELETE FROM drafts WHERE user_id = ?').run(req.currentUser!.id);
  success(res, null, '草稿已清空');
});

export default router;

