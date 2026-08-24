/**
 * 板块订阅路由：订阅/取消订阅（toggle）+ 我的订阅列表
 */
import { Router } from 'express';
import { db } from '../db.js';
import { authRequired } from '../middleware/auth.js';
import { success, fail } from '../utils/response.js';

const router = Router();

// 订阅/取消订阅 toggle
router.post('/:sectionId', authRequired, (req, res) => {
  const sectionId = Number(req.params.sectionId);
  const userId = req.currentUser!.id;

  if (!Number.isInteger(sectionId) || sectionId <= 0) {
    return fail(res, '无效的板块 ID');
  }
  const section = db.prepare('SELECT id FROM sections WHERE id = ?').get(sectionId) as any;
  if (!section) return fail(res, '板块不存在', 404, 404);

  const existing = db
    .prepare('SELECT id FROM subscriptions WHERE user_id = ? AND section_id = ?')
    .get(userId, sectionId) as any;

  if (existing) {
    db.prepare('DELETE FROM subscriptions WHERE id = ?').run(existing.id);
    return success(res, { subscribed: false }, '已取消订阅');
  }
  db.prepare('INSERT INTO subscriptions (user_id, section_id) VALUES (?, ?)').run(userId, sectionId);
  success(res, { subscribed: true }, '订阅成功');
});

// 我的订阅列表
router.get('/', authRequired, (req, res) => {
  const rows = db
    .prepare(
      `SELECT s.id AS sectionId, s.name AS sectionName, s.icon AS sectionIcon, sub.created_at AS createdAt
       FROM subscriptions sub
       JOIN sections s ON sub.section_id = s.id
       WHERE sub.user_id = ?
       ORDER BY sub.created_at DESC`
    )
    .all(req.currentUser!.id) as any[];
  success(res, rows);
});

export default router;
