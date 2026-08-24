/**
 * 二手交易路由：交易完成标记 + 双向互评 + 评分计入信誉分
 */
import { Router } from 'express';
import { db } from '../db.js';
import { authRequired, authOptional } from '../middleware/auth.js';
import { success, fail, forbidden } from '../utils/response.js';
import { upsertNotification } from '../utils/notification.js';
import { cacheInvalidate } from '../utils/cache.js';

const router = Router();

// 信誉分调整规则：好评(4-5星)+2，差评(1-2星)-3，中评(3星)不变；钳制 0-120
const CREDIT_MIN = 0;
const CREDIT_MAX = 120;

function creditDelta(rating: number): number {
  if (rating >= 4) return 2;
  if (rating <= 2) return -3;
  return 0;
}

function getPost(id: number): any {
  return db.prepare("SELECT id, user_id, title, status, extra_fields FROM posts WHERE id = ? AND status != 'deleted'").get(id);
}

// 标记交易完成（仅帖子作者；posts.extra_fields 写入 soldAt，最小侵入）
router.post('/trades/:postId/complete', authRequired, (req, res) => {
  const postId = Number(req.params.postId);
  const post = getPost(postId);
  if (!post) return fail(res, '帖子不存在', 404, 404);
  if (post.user_id !== req.currentUser!.id) return forbidden(res, '只有发布者可以标记交易完成');

  const extra = JSON.parse(post.extra_fields || '{}');
  if (extra.soldAt) return fail(res, '该交易已标记完成');
  extra.soldAt = new Date().toISOString();

  db.prepare('UPDATE posts SET extra_fields = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(
    JSON.stringify(extra), postId
  );
  cacheInvalidate('posts'); // extra_fields 影响列表价格排序与筛选

  success(res, { postId, soldAt: extra.soldAt }, '交易已完成');
});

// 互评：作者可对指定用户评分一次；其他用户只能对该帖作者评分一次（每人每帖限一次）
router.post('/trades/:postId/rate', authRequired, (req, res) => {
  const postId = Number(req.params.postId);
  const { targetUserId, rating, comment } = req.body;

  const post = getPost(postId);
  if (!post) return fail(res, '帖子不存在', 404, 404);

  // 仅已标记完成的交易可评价
  const extra = JSON.parse(post.extra_fields || '{}');
  if (!extra.soldAt) return fail(res, '交易完成后才能评价');

  // 评价对象：作者指定目标用户，非作者固定评帖子作者
  const isAuthor = post.user_id === req.currentUser!.id;
  let rateeId: number;
  if (isAuthor) {
    rateeId = Number(targetUserId);
    if (!rateeId) return fail(res, '请指定要评价的用户');
  } else {
    rateeId = post.user_id;
  }
  if (rateeId === req.currentUser!.id) return fail(res, '不能评价自己');

  const score = Number(rating);
  if (!Number.isInteger(score) || score < 1 || score > 5) return fail(res, '评分需为 1-5 的整数星');

  const ratee = db.prepare('SELECT id FROM users WHERE id = ?').get(rateeId) as any;
  if (!ratee) return fail(res, '被评价的用户不存在', 404, 404);

  const commentText = typeof comment === 'string' ? comment.slice(0, 200) : '';

  try {
    db.prepare(`
      INSERT INTO trade_ratings (post_id, rater_id, ratee_id, rating, comment)
      VALUES (?, ?, ?, ?, ?)
    `).run(postId, req.currentUser!.id, rateeId, score, commentText);
  } catch (err: any) {
    if (String(err?.message || '').includes('UNIQUE')) return fail(res, '您已评价过该交易');
    throw err;
  }

  // 计入信誉分（好评+2 差评-3，钳制 0-120）
  const delta = creditDelta(score);
  let newScore = (db.prepare('SELECT credit_score FROM users WHERE id = ?').get(rateeId) as any).credit_score;
  if (delta !== 0) {
    db.prepare('UPDATE users SET credit_score = MAX(?, MIN(?, credit_score + ?)) WHERE id = ?').run(
      CREDIT_MIN, CREDIT_MAX, delta, rateeId
    );
    newScore = (db.prepare('SELECT credit_score FROM users WHERE id = ?').get(rateeId) as any).credit_score;
  }

  // 通知被评人（复用通知去重工具）
  upsertNotification(
    rateeId,
    'system',
    `您在「${post.title}」的交易中获得 ${score} 星评价${delta > 0 ? '，信誉分 +2' : delta < 0 ? '，信誉分 -3' : ''}`,
    postId
  );

  success(res, { postId, rateeId, rating: score, creditDelta: delta, creditScore: newScore }, '评价成功');
});

// 某用户的互评记录与均分（公开可查）
router.get('/users/:id/trade-ratings', authOptional, (req, res) => {
  const userId = Number(req.params.id);
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) return fail(res, '用户不存在', 404, 404);

  const rows = db.prepare(`
    SELECT t.id, t.post_id, t.rater_id, t.ratee_id, t.rating, t.comment, t.created_at,
           u.nickname as rater_nickname, u.avatar as rater_avatar,
           p.title as post_title
    FROM trade_ratings t
    LEFT JOIN users u ON t.rater_id = u.id
    LEFT JOIN posts p ON t.post_id = p.id
    WHERE t.ratee_id = ?
    ORDER BY t.created_at DESC
    LIMIT 50
  `).all(userId) as any[];

  const stat = db.prepare('SELECT AVG(rating) as avg, COUNT(*) as total FROM trade_ratings WHERE ratee_id = ?').get(userId) as any;

  const list = rows.map((r) => ({
    id: r.id,
    postId: r.post_id,
    postTitle: r.post_title,
    rating: r.rating,
    comment: r.comment,
    createdAt: r.created_at ? new Date(r.created_at).toISOString() : r.created_at,
    rater: r.rater_nickname
      ? { id: r.rater_id, nickname: r.rater_nickname, avatar: r.rater_avatar }
      : null,
  }));

  success(res, {
    total: stat.total,
    avg: stat.avg != null ? Math.round(stat.avg * 10) / 10 : null,
    list,
  });
});

export default router;
