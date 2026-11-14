/**
 * 评论路由：列表、发布、回复、删除、点赞
 */
import { Router } from 'express';
import { db } from '../db.js';
import { authRequired, authOptional } from '../middleware/auth.js';
import { commentLimiter } from '../middleware/rateLimit.js';
import { success, fail, forbidden } from '../utils/response.js';
import { getRiskLevel } from '../utils/sensitive.js';
import { trackEvent, trackFirstEvent, touchActive } from '../utils/events.js';
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
  // 可见性与帖子详情同口径：非 published（审核中/驳回/删除）只有作者/管理员可见，
  // 否则被管理员删除的帖子正文 404 了，评论还能被游客整段读走（绕过审核与删除）
  const viewer = req.currentUser;
  const canView =
    post.status === 'published' ||
    (viewer && (viewer.id === post.user_id || viewer.role === 'super_admin' || viewer.role === 'section_admin'));
  if (!canView) return fail(res, '帖子不存在', 404, 404);

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
  trackEvent(req.currentUser!.id, 'comment_create', postId, {});
  trackFirstEvent(req.currentUser!.id, 'first_comment', postId);
  touchActive(req.currentUser!.id);
  cacheInvalidate('posts');

  // 通知作者（去重）；匿名评论按展示口径归一，绝不把真实昵称写进消息——
  // 否则帖主打开消息中心就能看到「张三 评论了你的帖子」，全站匿名承诺在通知链路失效
  if (post.user_id !== req.currentUser!.id) {
    const who = anonymous ? '匿名同学' : req.currentUser!.nickname;
    upsertNotification(
      post.user_id, 'comment', `${who} 评论了你的帖子「${post.title}」`, postId, Number(commentId)
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
  // 回复也必须挂在 published 帖上（作者/管理员回复自己待审帖除外）
  const viewer = req.currentUser;
  const canReply =
    post.status === 'published' ||
    (viewer && (viewer.id === post.user_id || viewer.role === 'super_admin' || viewer.role === 'section_admin'));
  if (!canReply) return fail(res, '帖子不存在', 404, 404);
  const anonymous = post.is_anonymous ? 1 : (isAnonymous ? 1 : 0);

  // 归一化父级：parent 可能本身是楼中楼回复（前端「回复某条回复」），
  // 列表只展开一层——直接挂 reply 的 id 会生成三级嵌套，任何接口都查不回（静默丢评论）
  const topParentId = parent.parent_id ?? parent.id;

  const result = db.prepare(`
    INSERT INTO comments (post_id, user_id, parent_id, content, is_anonymous)
    VALUES (?, ?, ?, ?, ?)
  `).run(parent.post_id, req.currentUser!.id, topParentId, content, anonymous);

  const replyId = result.lastInsertRowid as number;
  // 回复也计入帖子评论数：否则「12 条评论」点进去有 20 层楼，展示与实际不符
  db.prepare('UPDATE posts SET comment_count = comment_count + 1 WHERE id = ?').run(parent.post_id);
  cacheInvalidate('posts');

  // 通知被回复者（去重）；匿名回复同样归一署名
  if (parent.user_id !== req.currentUser!.id) {
    const who = anonymous ? '匿名同学' : req.currentUser!.nickname;
    // 直达锚点用顶层父评论：回复嵌在楼中楼里，滚到父评论才能看见整条对话
    upsertNotification(
      parent.user_id, 'comment', `${who} 回复了你的评论`, parent.post_id, topParentId
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

  // 幂等删除：只有 active → deleted 的这一次才扣计数，
  // 否则重复 DELETE 同一评论会每次都 comment_count-1，导致计数漂移
  const marked = db.prepare("UPDATE comments SET status = 'deleted' WHERE id = ? AND status = 'active'").run(id);
  if (marked.changes > 0) {
    db.prepare('UPDATE posts SET comment_count = MAX(0, comment_count - 1) WHERE id = ?').run(comment.post_id);
  }
  cacheInvalidate('posts');

  logger.info('用户删除评论', { userId: req.currentUser!.id, commentId: id });
  success(res, null, '删除成功');
});

// 点赞评论（事务化：并发/连点下返回值必须与库一致，不能拿进事务前的快照算数）
router.post('/comments/:id/like', authRequired, validate({ params: commonSchemas.id }), (req, res) => {
  const id = Number(req.params.id);
  const comment = db.prepare("SELECT * FROM comments WHERE id = ? AND status = 'active'").get(id) as any;
  if (!comment) return fail(res, '评论不存在', 404, 404);

  const result = db.transaction(() => {
    const exist = db.prepare('SELECT id FROM likes WHERE user_id = ? AND target_type = ? AND target_id = ?').get(req.currentUser!.id, 'comment', id);
    if (exist) {
      db.prepare('DELETE FROM likes WHERE user_id = ? AND target_type = ? AND target_id = ?').run(req.currentUser!.id, 'comment', id);
      db.prepare('UPDATE comments SET like_count = MAX(0, like_count - 1) WHERE id = ?').run(id);
      return { liked: false, message: '已取消点赞' };
    }
    db.prepare('INSERT INTO likes (user_id, target_type, target_id) VALUES (?, ?, ?)').run(req.currentUser!.id, 'comment', id);
    db.prepare('UPDATE comments SET like_count = like_count + 1 WHERE id = ?').run(id);
    return { liked: true, message: '点赞成功' };
  })();
  const fresh = db.prepare('SELECT like_count FROM comments WHERE id = ?').get(id) as any;
  success(res, { liked: result.liked, likeCount: fresh.like_count }, result.message);
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

