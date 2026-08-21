/**
 * 用户路由：公开信息、资料更新、我的帖子/评论/收藏
 */
import { Router } from 'express';
import { db } from '../db.js';
import { authRequired } from '../middleware/auth.js';
import { success, fail } from '../utils/response.js';

const router = Router();

// 用户公开信息
router.get('/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const user = db.prepare('SELECT id, nickname, avatar, college, grade, signature, credit_score, created_at FROM users WHERE id = ? AND status != \'banned\'').get(id) as any;
  if (!user) return fail(res, '用户不存在', 404, 404);
  success(res, { ...user, created_at: user.created_at ? new Date(user.created_at).toISOString() : user.created_at });
});

// 更新个人资料
router.put('/profile', authRequired, (req, res) => {
  const { nickname, avatar, signature } = req.body;
  const updates: string[] = [];
  const params: any[] = [];

  if (nickname !== undefined) {
    if (!nickname.trim()) return fail(res, '昵称不能为空');
    updates.push('nickname = ?');
    params.push(nickname.trim());
  }
  if (avatar !== undefined) {
    updates.push('avatar = ?');
    params.push(avatar);
  }
  if (signature !== undefined) {
    if (signature.length > 100) return fail(res, '个性签名最多100字');
    updates.push('signature = ?');
    params.push(signature);
  }

  if (updates.length === 0) return fail(res, '无更新内容');

  params.push(req.currentUser!.id);
  db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);

  const user = db.prepare('SELECT id, student_id, nickname, avatar, college, grade, signature, credit_score, role, status, created_at FROM users WHERE id = ?').get(req.currentUser!.id) as any;
  success(res, { ...user, created_at: user.created_at ? new Date(user.created_at).toISOString() : user.created_at }, '资料更新成功');
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
    images: JSON.parse(p.images || '[]'),
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
    images: JSON.parse(p.images || '[]'),
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

export default router;
