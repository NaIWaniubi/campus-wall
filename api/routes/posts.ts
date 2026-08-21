/**
 * 帖子路由：列表、详情、发布、编辑、删除、点赞、收藏、举报
 */
import { Router } from 'express';
import { db } from '../db.js';
import { authRequired, authOptional } from '../middleware/auth.js';
import { success, fail, forbidden } from '../utils/response.js';
import { getRiskLevel } from '../utils/sensitive.js';

const router = Router();

/**
 * 格式化帖子对象（带作者、板块、互动状态）
 */
function formatPost(post: any, currentUserId?: number) {
  let author: any;
  if (post.is_anonymous) {
    author = { id: 0, nickname: '匿名用户', avatar: '', college: '' };
  } else {
    author = {
      id: post.author_id,
      nickname: post.author_nickname,
      avatar: post.author_avatar,
      college: post.author_college,
    };
  }

  let liked = false;
  let favorited = false;
  if (currentUserId) {
    const like = db.prepare('SELECT id FROM likes WHERE user_id = ? AND target_type = ? AND target_id = ?').get(currentUserId, 'post', post.id);
    liked = !!like;
    const fav = db.prepare('SELECT id FROM favorites WHERE user_id = ? AND post_id = ?').get(currentUserId, post.id);
    favorited = !!fav;
  }

  return {
    id: post.id,
    title: post.title,
    content: post.content,
    images: JSON.parse(post.images || '[]'),
    isAnonymous: !!post.is_anonymous,
    status: post.status,
    isTop: !!post.is_top,
    topType: post.top_type,
    rejectReason: post.reject_reason,
    viewCount: post.view_count,
    likeCount: post.like_count,
    commentCount: post.comment_count,
    favoriteCount: post.favorite_count,
    extraFields: JSON.parse(post.extra_fields || '{}'),
    section: { id: post.section_id, name: post.section_name, icon: post.section_icon },
    author,
    // 当前用户是否为作者（匿名帖子也能正确判断，前端据此显示删除按钮）
    isMine: !!currentUserId && post.author_id === currentUserId,
    liked,
    favorited,
    createdAt: post.created_at ? new Date(post.created_at).toISOString() : post.created_at,
    updatedAt: post.updated_at ? new Date(post.updated_at).toISOString() : post.updated_at,
  };
}

// 帖子列表（支持板块筛选、分页、关键词）
router.get('/', authOptional, (req, res) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const pageSize = Math.min(50, Math.max(1, parseInt(req.query.pageSize as string) || 20));
  const sectionId = req.query.sectionId ? parseInt(req.query.sectionId as string) : 0;
  const keyword = (req.query.keyword as string) || '';
  const sort = (req.query.sort as string) || 'new';

  const currentUserId = req.currentUser?.id;

  let where = `WHERE p.status = 'published' AND u.status != 'banned'`;
  const params: any[] = [];

  if (sectionId > 0) {
    where += ` AND p.section_id = ?`;
    params.push(sectionId);
  }
  if (keyword) {
    where += ` AND (p.title LIKE ? OR p.content LIKE ?)`;
    params.push(`%${keyword}%`, `%${keyword}%`);
  }

  const offset = (page - 1) * pageSize;

  // top_type 排序：global(全局) 应排在 section(板块) 之前；按字母倒序会导致 section>none>global，错误
  // 使用 CASE 显式指定优先级：global=2, section=1, none=0
  const topTypeOrder = `CASE p.top_type WHEN 'global' THEN 2 WHEN 'section' THEN 1 ELSE 0 END DESC`;
  const orderBy = sort === 'hot'
    ? `ORDER BY p.is_top DESC, ${topTypeOrder}, (p.like_count + p.comment_count * 2 + p.view_count / 10) DESC, p.created_at DESC`
    : `ORDER BY p.is_top DESC, ${topTypeOrder}, p.created_at DESC`;

  const posts = db.prepare(`
    SELECT p.*, u.id as author_id, u.nickname as author_nickname, u.avatar as author_avatar, u.college as author_college,
           s.name as section_name, s.icon as section_icon
    FROM posts p
    INNER JOIN users u ON p.user_id = u.id
    LEFT JOIN sections s ON p.section_id = s.id
    ${where}
    ${orderBy}
    LIMIT ? OFFSET ?
  `).all(...params, pageSize, offset) as any[];

  // 使用 INNER JOIN 避免在 LEFT JOIN 后用 `u.status != 'banned'` 过滤时 NULL 行为不一致
  const totalRow = db.prepare(`SELECT COUNT(*) as total FROM posts p INNER JOIN users u ON p.user_id = u.id ${where}`).get(...params) as any;

  const list = posts.map((p) => formatPost(p, currentUserId));

  success(res, {
    list,
    total: totalRow.total,
    page,
    pageSize,
    hasMore: offset + pageSize < totalRow.total,
  });
});

// 帖子详情
router.get('/:id', authOptional, (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return fail(res, '帖子不存在', 404, 404);

  const post = db.prepare(`
    SELECT p.*, u.id as author_id, u.nickname as author_nickname, u.avatar as author_avatar, u.college as author_college,
           s.name as section_name, s.icon as section_icon
    FROM posts p
    LEFT JOIN users u ON p.user_id = u.id
    LEFT JOIN sections s ON p.section_id = s.id
    WHERE p.id = ?
  `).get(id) as any;

  if (!post) return fail(res, '帖子不存在', 404, 404);

  // 权限校验：非发布状态仅作者和管理员可见
  const currentUserId = req.currentUser?.id;
  const isAdmin = req.currentUser?.role === 'super_admin' || req.currentUser?.role === 'section_admin';
  if (post.status !== 'published' && post.author_id !== currentUserId && !isAdmin) {
    return fail(res, '帖子不存在', 404, 404);
  }

  // 增加浏览量
  db.prepare('UPDATE posts SET view_count = view_count + 1 WHERE id = ?').run(id);

  const postData = formatPost(post, currentUserId);
  postData.viewCount = post.view_count + 1;

  success(res, postData);
});

// 发布帖子
router.post('/', authRequired, (req, res) => {
  const { sectionId, title, content, images, isAnonymous, extraFields } = req.body;

  if (!sectionId) return fail(res, '请选择板块');
  if (!title || !title.trim()) return fail(res, '标题不能为空');
  if (!content || content.length < 10) return fail(res, '正文至少10字');
  if (content.length > 500) return fail(res, '正文最多500字');
  if (title.length > 50) return fail(res, '标题最多50字');

  const section = db.prepare('SELECT * FROM sections WHERE id = ? AND is_active = 1').get(sectionId) as any;
  if (!section) return fail(res, '板块不存在或已停用');

  // 信誉分校验
  const creditScore = req.currentUser!.creditScore;
  if (creditScore < 60) return fail(res, '信誉分过低，暂不可发帖');
  if (creditScore < 90 && isAnonymous) return fail(res, '信誉分低于90，不可匿名发布');
  if (section.force_anonymous && !isAnonymous) {
    return fail(res, '该板块必须匿名发布');
  }

  // 每日发帖上限校验
  const todayCount = db.prepare("SELECT COUNT(*) as count FROM posts WHERE user_id = ? AND date(created_at) = date('now')").get(req.currentUser!.id) as any;
  const limit = creditScore < 80 ? 3 : 10;
  if (todayCount.count >= limit) {
    return fail(res, `今日发帖已达上限(${limit}条)`);
  }

  // 敏感词检测
  const riskLevel = getRiskLevel(title + ' ' + content);
  let status = 'published';
  if (riskLevel === 'reject') {
    return fail(res, '内容包含违规信息，请修改后重试');
  }
  if (riskLevel === 'review' || section.need_audit) {
    status = 'pending';
  }

  const imgs = Array.isArray(images) ? images.slice(0, 9) : [];
  const extra = extraFields || {};

  const result = db.prepare(`
    INSERT INTO posts (user_id, section_id, title, content, images, is_anonymous, status, extra_fields)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.currentUser!.id,
    sectionId,
    title.trim(),
    content,
    JSON.stringify(imgs),
    isAnonymous ? 1 : 0,
    status,
    JSON.stringify(extra)
  );

  const postId = result.lastInsertRowid as number;

  if (status === 'published') {
    // 发送系统消息
    db.prepare('INSERT INTO messages (user_id, type, content, related_id) VALUES (?, ?, ?, ?)').run(
      req.currentUser!.id, 'system', '您发布的帖子已通过审核并展示', postId
    );
  } else {
    db.prepare('INSERT INTO messages (user_id, type, content, related_id) VALUES (?, ?, ?, ?)').run(
      req.currentUser!.id, 'system', '您发布的帖子正在审核中，请耐心等待', postId
    );
  }

  success(res, { id: postId, status }, status === 'published' ? '发布成功' : '发布成功，内容正在审核中');
});

// 编辑帖子（24小时内可编辑1次）
router.put('/:id', authRequired, (req, res) => {
  const id = parseInt(req.params.id);
  const { title, content, images, isAnonymous, extraFields } = req.body;

  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(id) as any;
  if (!post) return fail(res, '帖子不存在', 404, 404);
  if (post.user_id !== req.currentUser!.id) return forbidden(res, '只能编辑自己的帖子');

  const hoursDiff = (Date.now() - new Date(post.created_at).getTime()) / (1000 * 60 * 60);
  if (hoursDiff > 24) return fail(res, '发布超过24小时，不可编辑');

  const riskLevel = getRiskLevel((title || '') + ' ' + (content || ''));
  if (riskLevel === 'reject') return fail(res, '内容包含违规信息');

  const section = db.prepare('SELECT * FROM sections WHERE id = ?').get(post.section_id) as any;
  let status = post.status === 'published' ? 'published' : 'pending';
  if (riskLevel === 'review' || (section && section.need_audit)) {
    status = 'pending';
  }

  db.prepare(`
    UPDATE posts SET title = ?, content = ?, images = ?, is_anonymous = ?, extra_fields = ?, status = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    title?.trim() || post.title,
    content || post.content,
    JSON.stringify(Array.isArray(images) ? images.slice(0, 9) : JSON.parse(post.images)),
    isAnonymous ? 1 : 0,
    JSON.stringify(extraFields || JSON.parse(post.extra_fields)),
    status,
    id
  );

  success(res, { id, status }, '编辑成功');
});

// 删除帖子（软删除）
router.delete('/:id', authRequired, (req, res) => {
  const id = parseInt(req.params.id);
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(id) as any;
  if (!post) return fail(res, '帖子不存在', 404, 404);

  if (post.user_id !== req.currentUser!.id && req.currentUser!.role !== 'super_admin') {
    return forbidden(res, '只能删除自己的帖子');
  }

  db.prepare("UPDATE posts SET status = 'deleted', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
  success(res, null, '删除成功');
});

// 点赞/取消点赞
router.post('/:id/like', authRequired, (req, res) => {
  const id = parseInt(req.params.id);
  const post = db.prepare('SELECT * FROM posts WHERE id = ? AND status = \'published\'').get(id) as any;
  if (!post) return fail(res, '帖子不存在', 404, 404);

  const exist = db.prepare('SELECT id FROM likes WHERE user_id = ? AND target_type = ? AND target_id = ?').get(req.currentUser!.id, 'post', id);
  if (exist) {
    db.prepare('DELETE FROM likes WHERE user_id = ? AND target_type = ? AND target_id = ?').run(req.currentUser!.id, 'post', id);
    db.prepare('UPDATE posts SET like_count = MAX(0, like_count - 1) WHERE id = ?').run(id);
    success(res, { liked: false, likeCount: post.like_count - 1 }, '已取消点赞');
  } else {
    db.prepare('INSERT INTO likes (user_id, target_type, target_id) VALUES (?, ?, ?)').run(req.currentUser!.id, 'post', id);
    db.prepare('UPDATE posts SET like_count = like_count + 1 WHERE id = ?').run(id);
    // 通知作者
    if (post.user_id !== req.currentUser!.id) {
      db.prepare('INSERT INTO messages (user_id, type, content, related_id) VALUES (?, ?, ?, ?)').run(
        post.user_id, 'like', `${req.currentUser!.nickname} 赞了你的帖子「${post.title}」`, id
      );
    }
    success(res, { liked: true, likeCount: post.like_count + 1 }, '点赞成功');
  }
});

// 收藏/取消收藏
router.post('/:id/favorite', authRequired, (req, res) => {
  const id = parseInt(req.params.id);
  const post = db.prepare('SELECT * FROM posts WHERE id = ? AND status = \'published\'').get(id) as any;
  if (!post) return fail(res, '帖子不存在', 404, 404);

  const exist = db.prepare('SELECT id FROM favorites WHERE user_id = ? AND post_id = ?').get(req.currentUser!.id, id);
  if (exist) {
    db.prepare('DELETE FROM favorites WHERE user_id = ? AND post_id = ?').run(req.currentUser!.id, id);
    db.prepare('UPDATE posts SET favorite_count = MAX(0, favorite_count - 1) WHERE id = ?').run(id);
    success(res, { favorited: false, favoriteCount: post.favorite_count - 1 }, '已取消收藏');
  } else {
    db.prepare('INSERT INTO favorites (user_id, post_id) VALUES (?, ?)').run(req.currentUser!.id, id);
    db.prepare('UPDATE posts SET favorite_count = favorite_count + 1 WHERE id = ?').run(id);
    success(res, { favorited: true, favoriteCount: post.favorite_count + 1 }, '收藏成功');
  }
});

// 举报帖子
router.post('/:id/report', authRequired, (req, res) => {
  const id = parseInt(req.params.id);
  const { reason } = req.body;
  if (!reason) return fail(res, '请选择举报原因');

  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(id) as any;
  if (!post) return fail(res, '帖子不存在', 404, 404);

  // 24小时只能举报1次
  const exist = db.prepare(`
    SELECT id FROM reports WHERE reporter_id = ? AND target_type = ? AND target_id = ?
    AND datetime(created_at) > datetime('now', '-1 day')
  `).get(req.currentUser!.id, 'post', id);
  if (exist) return fail(res, '您已在24小时内举报过该内容');

  // 3人举报升优先级
  const reportCount = db.prepare("SELECT COUNT(*) as count FROM reports WHERE target_type = 'post' AND target_id = ? AND status = 'pending'").get(id) as any;
  const priority = reportCount.count >= 2 ? 'high' : 'normal';

  db.prepare('INSERT INTO reports (reporter_id, target_type, target_id, reason, priority) VALUES (?, ?, ?, ?, ?)').run(
    req.currentUser!.id, 'post', id, reason, priority
  );

  success(res, null, '举报已受理，我们会尽快处理');
});

export default router;
