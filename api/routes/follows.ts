/**
 * 关注路由：关注/取关（toggle）、关注列表、粉丝列表、关注状态
 * 挂载于 /api/users，与 users.ts 共用前缀（均为两段以上路径，无路由冲突）
 */
import { Router } from 'express';
import { db } from '../db.js';
import { authRequired } from '../middleware/auth.js';
import { success, fail, toInt } from '../utils/response.js';
import { followLimiter } from '../middleware/rateLimit.js';

const router = Router();

// 仅 toggle 写端点限流；GET 关注/粉丝列表为公开接口，不限流（用户进入个人主页时高频拉取）

// 关注/取消关注（toggle），返回最新状态
router.post('/:id/follow', authRequired, followLimiter, (req, res) => {
  const targetId = Number(req.params.id);
  const me = req.currentUser!.id;

  if (!targetId || targetId <= 0) return fail(res, '用户不存在', 404, 404);
  if (targetId === me) return fail(res, '不能关注自己');

  const target = db.prepare("SELECT id FROM users WHERE id = ? AND status != 'banned'").get(targetId);
  if (!target) return fail(res, '用户不存在', 404, 404);

  const exist = db.prepare('SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?').get(me, targetId);
  let following: boolean;
  if (exist) {
    db.prepare('DELETE FROM follows WHERE follower_id = ? AND following_id = ?').run(me, targetId);
    following = false;
  } else {
    db.prepare('INSERT INTO follows (follower_id, following_id) VALUES (?, ?)').run(me, targetId);
    following = true;
  }

  success(res, { following }, following ? '已关注' : '已取消关注');
});

// 关注/粉丝列表公共实现：标准分页形状
function followList(res: any, sql: string, params: any[], page: number, pageSize: number) {
  const offset = (page - 1) * pageSize;
  const rows = db.prepare(`${sql} LIMIT ? OFFSET ?`).all(...params, pageSize, offset) as any[];
  const total = (db.prepare(`SELECT COUNT(*) as total FROM (${sql})`).get(...params) as any).total;
  success(res, {
    list: rows.map((u) => ({ id: u.id, nickname: u.nickname, avatar: u.avatar, creditScore: u.credit_score })),
    total,
    page,
    pageSize,
    hasMore: offset + pageSize < total,
  });
}

// :id 用户关注的用户列表
router.get('/:id/following', (req, res) => {
  const id = Number(req.params.id);
  if (!id) return fail(res, '用户不存在', 404, 404);
  const page = toInt(req.query.page, 1, 1);
  const pageSize = toInt(req.query.pageSize, 20, 1, 50);
  followList(
    res,
    `SELECT u.id, u.nickname, u.avatar, u.credit_score FROM follows f INNER JOIN users u ON f.following_id = u.id WHERE f.follower_id = ? ORDER BY f.created_at DESC`,
    [id],
    page,
    pageSize
  );
});

// :id 用户的粉丝列表
router.get('/:id/followers', (req, res) => {
  const id = Number(req.params.id);
  if (!id) return fail(res, '用户不存在', 404, 404);
  const page = toInt(req.query.page, 1, 1);
  const pageSize = toInt(req.query.pageSize, 20, 1, 50);
  followList(
    res,
    `SELECT u.id, u.nickname, u.avatar, u.credit_score FROM follows f INNER JOIN users u ON f.follower_id = u.id WHERE f.following_id = ? ORDER BY f.created_at DESC`,
    [id],
    page,
    pageSize
  );
});

// 我与目标用户的关注状态 + 目标用户的粉丝数
router.get('/:id/follow-status', authRequired, (req, res) => {
  const targetId = Number(req.params.id);
  if (!targetId) return fail(res, '用户不存在', 404, 404);
  const followed = db
    .prepare('SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?')
    .get(req.currentUser!.id, targetId);
  const count = (db.prepare('SELECT COUNT(*) as count FROM follows WHERE following_id = ?').get(targetId) as any).count;
  success(res, { following: !!followed, count });
});

export default router;
