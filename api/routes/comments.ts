/**
 * 评论路由：列表、发布、回复、删除、点赞
 */
import { Router } from 'express';
import { db } from '../db.js';
import { authRequired, authOptional } from '../middleware/auth.js';
import { commentLimiter } from '../middleware/rateLimit.js';
import { success, fail, forbidden } from '../utils/response.js';
import { getRiskLevel } from '../utils/sensitive.js';
import { upsertNotification } from '../utils/notification.js';
import { cacheInvalidate } from '../utils/cache.js';
import { validate, commonSchemas, commentSchemas } from '../utils/validation.js';
import { logger } from '../utils/logger.js';

const router = Router();

function formatComment(comment: any, currentUserId?: number): any {
  let author: any;
  if (comment.is_anonymous) {
    author = { id: 0, nickname: '匿名用户', avatar: '' };
  } else {
    author = {
      id: comment.author_id,
      nickname: comment.author_nickname,
      avatar: comment.author_avatar,
    };
  }

  let liked = false;
  if (currentUserId) {
    const like = db.prepare('SELECT id FROM likes WHERE user_id = ? AND target_type = ? AND target_id = ?').get(currentUserId, 'comment', comment.id);
    liked = !!like;
  }

  // 获取子回复
  const replies = db.prepare(`
    SELECT c.*, u.id as author_id, u.nickname as author_nickname, u.avatar as author_avatar
    FROM comments c
    LEFT JOIN users u ON c.user_id = u.id
    WHERE c.parent_id = ? AND c.status = 'active'
    ORDER BY c.created_at ASC
  `).all(comment.id) as any[];

  return {
    id: comment.id,
    content: comment.content,
    isAnonymous: !!comment.is_anonymous,
    likeCount: comment.like_count,
    liked,
    author,
    // 当前用户是否为评论作者（匿名评论也能正确判断，前端据此显示删除按钮）
    isMine: !!currentUserId && comment.user_id === currentUserId,
    replies: replies.map((r) => formatComment(r, currentUserId)),
    replyCount: replies.length,
    createdAt: comment.created_at ? new Date(comment.created_at).toISOString() : comment.created_at,
  };
}

// 评论列表
router.get('/posts/:id/comments', authOptional, validate({ params: commonSchemas.id }), (req, res) => {
  const postId = Number(req.params.id);
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(postId) as any;
  if (!post) return fail(res, '帖子不存在', 404, 404);

  const currentUserId = req.currentUser?.id;
  const comments = db.prepare(`
    SELECT c.*, u.id as author_id, u.nickname as author_nickname, u.avatar as author_avatar
    FROM comments c
    LEFT JOIN users u ON c.user_id = u.id
    WHERE c.post_id = ? AND c.parent_id IS NULL AND c.status = 'active'
    ORDER BY c.like_count DESC, c.created_at DESC
  `).all(postId) as any[];

  const list = comments.map((c) => formatComment(c, currentUserId));
  success(res, list);
});

// 发布评论
router.post('/posts/:id/comments', authRequired, commentLimiter, validate({ 
  params: commonSchemas.id, 
  body: commentSchemas.create 
}), (req, res) => {
  const postId = Number(req.params.id);
  const { content, isAnonymous } = req.body;

  const post = db.prepare('SELECT * FROM posts WHERE id = ? AND status = \'published\'').get(postId) as any;
  if (!post) return fail(res, '帖子不存在', 404, 404);

  // 信誉分校验
  if (req.currentUser!.creditScore < 60) return fail(res, '信誉分过低，暂不可评论');

  // 10秒内不可重复评论（仅统计未删除的评论，避免删除后无法立即重新评论）
  const recent = db.prepare(`
    SELECT id FROM comments WHERE user_id = ? AND post_id = ? AND status = 'active'
    AND datetime(created_at) > datetime('now', '-10 seconds')
  `).get(req.currentUser!.id, postId);
  if (recent) return fail(res, '评论过于频繁，请10秒后再试');

  // 敏感词检测
  const riskLevel = getRiskLevel(content);
  if (riskLevel === 'reject') return fail(res, '评论包含违规内容');

  // 匿名跟随帖子
  const anonymous = post.is_anonymous ? 1 : (isAnonymous ? 1 : 0);
  if (req.currentUser!.creditScore < 90 && anonymous) {
    return fail(res, '信誉分低于90，不可匿名评论');
  }

  const result = db.prepare(`
    INSERT INTO comments (post_id, user_id, parent_id, content, is_anonymous)
    VALUES (?, ?, NULL, ?, ?)
  `).run(postId, req.currentUser!.id, content, anonymous);

  const commentId = result.lastInsertRowid as number;
  db.prepare('UPDATE posts SET comment_count = comment_count + 1 WHERE id = ?').run(postId);
  cacheInvalidate('posts');

  // 通知作者（去重）
  if (post.user_id !== req.currentUser!.id) {
    upsertNotification(
      post.user_id, 'comment', `${req.currentUser!.nickname} 评论了你的帖子「${post.title}」`, postId
    );
  }

  const comment = db.prepare(`
    SELECT c.*, u.id as author_id, u.nickname as author_nickname, u.avatar as author_avatar
    FROM comments c LEFT JOIN users u ON c.user_id = u.id WHERE c.id = ?
  `).get(commentId) as any;

  logger.info('用户发布评论', { userId: req.currentUser!.id, postId, commentId });
  success(res, formatComment(comment, req.currentUser!.id), '评论成功');
});

// 楼中楼回复
router.post('/comments/:id/reply', authRequired, commentLimiter, validate({
  params: commonSchemas.id,
  body: commentSchemas.reply
}), (req, res) => {
  const commentId = Number(req.params.id);
  const { content, isAnonymous } = req.body;

  const parent = db.prepare("SELECT * FROM comments WHERE id = ? AND status = 'active'").get(commentId) as any;
  if (!parent) return fail(res, '评论不存在', 404, 404);

  if (req.currentUser!.creditScore < 60) return fail(res, '信誉分过低，暂不可评论');

  const riskLevel = getRiskLevel(content);
  if (riskLevel === 'reject') return fail(res, '回复包含违规内容');

  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(parent.post_id) as any;
  const anonymous = post.is_anonymous ? 1 : (isAnonymous ? 1 : 0);

  const result = db.prepare(`
    INSERT INTO comments (post_id, user_id, parent_id, content, is_anonymous)
    VALUES (?, ?, ?, ?, ?)
  `).run(parent.post_id, req.currentUser!.id, commentId, content, anonymous);

  const replyId = result.lastInsertRowid as number;
  cacheInvalidate('posts'); // 评论写路径统一失效（当前回复不改 comment_count，防御性保险）

  // 通知被回复者（去重）
  if (parent.user_id !== req.currentUser!.id) {
    upsertNotification(
      parent.user_id, 'comment', `${req.currentUser!.nickname} 回复了你的评论`, parent.post_id
    );
  }

  const reply = db.prepare(`
    SELECT c.*, u.id as author_id, u.nickname as author_nickname, u.avatar as author_avatar
    FROM comments c LEFT JOIN users u ON c.user_id = u.id WHERE c.id = ?
  `).get(replyId) as any;

  logger.info('用户回复评论', { userId: req.currentUser!.id, parentId: commentId, replyId });
  success(res, formatComment(reply, req.currentUser!.id), '回复成功');
});

// 删除评论
router.delete('/comments/:id', authRequired, validate({ params: commonSchemas.id }), (req, res) => {
  const id = Number(req.params.id);
  const comment = db.prepare('SELECT * FROM comments WHERE id = ?').get(id) as any;
  if (!comment) return fail(res, '评论不存在', 404, 404);

  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(comment.post_id) as any;
  // 权限：评论作者、帖子作者、管理员
  if (comment.user_id !== req.currentUser!.id && post.user_id !== req.currentUser!.id && req.currentUser!.role !== 'super_admin') {
    return forbidden(res, '无权删除该评论');
  }

  db.prepare("UPDATE comments SET status = 'deleted' WHERE id = ?").run(id);
  db.prepare('UPDATE posts SET comment_count = MAX(0, comment_count - 1) WHERE id = ?').run(comment.post_id);
  cacheInvalidate('posts');

  logger.info('用户删除评论', { userId: req.currentUser!.id, commentId: id });
  success(res, null, '删除成功');
});

// 点赞评论
router.post('/comments/:id/like', authRequired, validate({ params: commonSchemas.id }), (req, res) => {
  const id = Number(req.params.id);
  const comment = db.prepare("SELECT * FROM comments WHERE id = ? AND status = 'active'").get(id) as any;
  if (!comment) return fail(res, '评论不存在', 404, 404);

  const exist = db.prepare('SELECT id FROM likes WHERE user_id = ? AND target_type = ? AND target_id = ?').get(req.currentUser!.id, 'comment', id);
  if (exist) {
    db.prepare('DELETE FROM likes WHERE user_id = ? AND target_type = ? AND target_id = ?').run(req.currentUser!.id, 'comment', id);
    db.prepare('UPDATE comments SET like_count = MAX(0, like_count - 1) WHERE id = ?').run(id);
    success(res, { liked: false, likeCount: comment.like_count - 1 }, '已取消点赞');
  } else {
    db.prepare('INSERT INTO likes (user_id, target_type, target_id) VALUES (?, ?, ?)').run(req.currentUser!.id, 'comment', id);
    db.prepare('UPDATE comments SET like_count = like_count + 1 WHERE id = ?').run(id);
    success(res, { liked: true, likeCount: comment.like_count + 1 }, '点赞成功');
  }
});

// 举报评论
router.post('/comments/:id/report', authRequired, validate({
  params: commonSchemas.id,
  body: commentSchemas.report
}), (req, res) => {
  const id = Number(req.params.id);
  const { reason } = req.body;
  
  const comment = db.prepare("SELECT * FROM comments WHERE id = ? AND status = 'active'").get(id) as any;
  if (!comment) return fail(res, '评论不存在', 404, 404);

  // 24小时只能举报1次
  const exist = db.prepare(`
    SELECT id FROM reports WHERE reporter_id = ? AND target_type = ? AND target_id = ?
    AND datetime(created_at) > datetime('now', '-1 day')
  `).get(req.currentUser!.id, 'comment', id);
  if (exist) return fail(res, '您已在24小时内举报过该内容');

  const reportCount = db.prepare("SELECT COUNT(*) as count FROM reports WHERE target_type = 'comment' AND target_id = ? AND status = 'pending'").get(id) as any;
  const priority = reportCount.count >= 2 ? 'high' : 'normal';

  db.prepare('INSERT INTO reports (reporter_id, target_type, target_id, reason, priority) VALUES (?, ?, ?, ?, ?)').run(
    req.currentUser!.id, 'comment', id, reason, priority
  );
  
  logger.info('用户举报评论', { userId: req.currentUser!.id, commentId: id, reason });
  success(res, null, '举报已受理');
});

export default router;

