/**
 * 意见反馈路由：用户提交反馈
 */
import { Router } from 'express';
import { db } from '../db.js';
import { authRequired } from '../middleware/auth.js';
import { success, fail } from '../utils/response.js';

const router = Router();

// 提交意见反馈（需登录）
router.post('/', authRequired, (req, res) => {
  const content = String(req.body.content ?? '').trim();
  const contact = String(req.body.contact ?? '').trim();
  if (!content) return fail(res, '反馈内容不能为空');
  if (content.length > 500) return fail(res, '反馈内容最多500字');
  if (contact.length > 100) return fail(res, '联系方式最多100字');

  db.prepare('INSERT INTO feedback (user_id, content, contact) VALUES (?, ?, ?)')
    .run(req.currentUser!.id, content, contact);
  success(res, null, '反馈已提交，感谢你的建议');
});

export default router;
