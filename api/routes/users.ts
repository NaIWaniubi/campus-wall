/**
 * 用户路由：公开信息、资料更新、我的帖子/评论/收藏
 */
import { Router } from 'express';
import { db } from '../db.js';
import { authRequired } from '../middleware/auth.js';
import { success, fail, toCamel } from '../utils/response.js';
import { formatPost } from './posts.js';
import { validate, userSchemas, commonSchemas } from '../utils/validation.js';
import { logger, safeJsonParse } from '../utils/logger.js';
import { readLimiter } from '../middleware/rateLimit.js';

const router = Router();

// 按学号查用户最小公开信息（标记交易买家等场景；仅暴露 id+昵称，须置于 /:id 之前）
// readLimiter：学号查询可被用来枚举「哪些学号已注册」，必须限速
router.get('/lookup', authRequired, readLimiter, (req, res) => {
  const studentId = (req.query.studentId as string) || '';
  if (!studentId.trim()) return fail(res, '请提供学号');
  const user = db.prepare("SELECT id, nickname FROM users WHERE student_id = ? AND status != 'banned'").get(studentId.trim()) as any;
  if (!user) return fail(res, '该学号未注册或已被封禁', 404, 404);
  success(res, user);
});

// 用户公开信息
router.get('/:id', readLimiter, validate({ params: commonSchemas.id }), (req, res) => {
  const id = Number(req.params.id);
  const user = db.prepare('SELECT id, nickname, avatar, college, grade, signature, credit_score, created_at FROM users WHERE id = ? AND status != \'banned\'').get(id) as any;
  if (!user) return fail(res, '用户不存在', 404, 404);
  
  logger.debug('查询用户信息', { userId: id });
  success(res, toCamel(user));
});

// 更新个人资料
router.put('/profile', authRequired, validate({ body: userSchemas.updateProfile }), (req, res) => {
  const { nickname, avatar, signature } = req.body;
  const updates: string[] = [];
  const params: any[] = [];

  if (nickname !== undefined) {
    updates.push('nickname = ?');
    params.push(nickname.trim());
  }
  if (avatar !== undefined) {
    updates.push('avatar = ?');
    params.push(avatar);
  }
  if (signature !== undefined) {
    updates.push('signature = ?');
    params.push(signature);
  }

  if (updates.length === 0) return fail(res, '无更新内容');

  params.push(req.currentUser!.id);
  db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);

  const user = db.prepare('SELECT id, student_id, nickname, avatar, college, grade, signature, credit_score, role, status, created_at FROM users WHERE id = ?').get(req.currentUser!.id) as any;
  
  logger.info('用户更新资料', { userId: req.currentUser!.id });
  success(res, toCamel(user), '资料更新成功');
});

// 我的帖子
router.get('/me/posts', authRequired, (req, res) => {
  const posts = db.prepare(`
    SELECT p.*, s.name as section_name, s.icon as section_icon
    FROM posts p
    LEFT JOIN sections s ON p.section_id = s.id
    WHERE p.user_id = ? AND p.status != 'deleted'
    ORDER BY p.created_at DESC
  `).all(req.currentUser!.id) as any[];

  const list = posts.map((p) => ({
    id: p.id,
    title: p.title,
    content: p.content,
    images: safeJsonParse<string[]>(p.images || '[]', [], 'users.posts.images'),
    isAnonymous: !!p.is_anonymous,
    status: p.status,
    rejectReason: p.reject_reason,
    viewCount: p.view_count,
    likeCount: p.like_count,
    commentCount: p.comment_count,
    favoriteCount: p.favorite_count,
    section: { id: p.section_id, name: p.section_name, icon: p.section_icon },
    createdAt: p.created_at ? new Date(p.created_at).toISOString() : p.created_at,
  }));

  success(res, list);
});

// 我的评论
router.get('/me/comments', authRequired, (req, res) => {
  const comments = db.prepare(`
    SELECT c.*, p.title as post_title, p.id as post_id
    FROM comments c
    LEFT JOIN posts p ON c.post_id = p.id
    WHERE c.user_id = ? AND c.status = 'active'
    ORDER BY c.created_at DESC
  `).all(req.currentUser!.id) as any[];

  const list = comments.map((c) => ({
    id: c.id,
    content: c.content,
    postId: c.post_id,
    postTitle: c.post_title,
    createdAt: c.created_at ? new Date(c.created_at).toISOString() : c.created_at,
  }));

  success(res, list);
});

// 我的收藏
router.get('/me/favorites', authRequired, (req, res) => {
  const posts = db.prepare(`
    SELECT p.*, s.name as section_name, s.icon as section_icon,
           u.id as author_id, u.nickname as author_nickname, u.avatar as author_avatar, u.college as author_college
    FROM favorites f
    LEFT JOIN posts p ON f.post_id = p.id
    LEFT JOIN sections s ON p.section_id = s.id
    LEFT JOIN users u ON p.user_id = u.id
    WHERE f.user_id = ? AND p.status = 'published'
    ORDER BY f.created_at DESC
  `).all(req.currentUser!.id) as any[];

  const list = posts.map((p) => ({
    id: p.id,
    title: p.title,
    content: p.content,
    images: safeJsonParse<string[]>(p.images || '[]', [], 'users.favorites.images'),
    isAnonymous: !!p.is_anonymous,
    viewCount: p.view_count,
    likeCount: p.like_count,
    commentCount: p.comment_count,
    favoriteCount: p.favorite_count,
    section: { id: p.section_id, name: p.section_name, icon: p.section_icon },
    author: p.is_anonymous
      ? { id: 0, nickname: '匿名用户', avatar: '', college: '' }
      : { id: p.author_id, nickname: p.author_nickname, avatar: p.author_avatar, college: p.author_college },
    createdAt: p.created_at ? new Date(p.created_at).toISOString() : p.created_at,
  }));

  success(res, list);
});

// 我点赞过的帖子（likes JOIN posts，复用 formatPost 与帖子列表分页形状）
router.get('/me/likes', authRequired, (req, res) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const pageSize = Math.min(50, Math.max(1, parseInt(req.query.pageSize as string) || 20));
  const uid = req.currentUser!.id;
  const offset = (page - 1) * pageSize;

  const where = `WHERE l.user_id = ? AND l.target_type = 'post' AND p.status = 'published'`;
  const base = `
    FROM likes l
    INNER JOIN posts p ON l.target_id = p.id
    INNER JOIN users u ON p.user_id = u.id
    LEFT JOIN sections s ON p.section_id = s.id`;

  const rows = db.prepare(`
    SELECT p.*, u.nickname as author_nickname, u.avatar as author_avatar,
           u.college as author_college, u.credit_score as author_credit_score,
           s.name as section_name, s.icon as section_icon
    ${base} ${where}
    ORDER BY l.created_at DESC
    LIMIT ? OFFSET ?
  `).all(uid, pageSize, offset) as any[];

  const total = (db.prepare(`SELECT COUNT(*) as total ${base} ${where}`).get(uid) as any).total;

  // 本列表全部为已点赞；收藏状态批量预加载避免 N+1
  const likedMap = new Map<number, boolean>(rows.map((r) => [r.id, true]));
  const favoritedMap = new Map<number, boolean>();
  if (rows.length > 0) {
    const placeholders = rows.map(() => '?').join(',');
    const favRows = db.prepare(
      `SELECT post_id FROM favorites WHERE user_id = ? AND post_id IN (${placeholders})`
    ).all(uid, ...rows.map((r) => r.id)) as any[];
    favRows.forEach((f) => favoritedMap.set(f.post_id, true));
  }

  success(res, {
    list: rows.map((p) => formatPost(p, uid, likedMap, favoritedMap)),
    total,
    page,
    pageSize,
    hasMore: offset + pageSize < total,
  });
});

export default router;

