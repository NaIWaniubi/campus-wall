/**
 * 管理后台路由：用户管理、内容审核、举报处理、数据统计、板块管理
 */
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db.js';
import { authRequired, superAdminRequired } from '../middleware/auth.js';
import { success, fail } from '../utils/response.js';
import { cacheInvalidate } from '../utils/cache.js';

const router = Router();

// 所有管理后台接口都需要登录 + 超级管理员权限
router.use(authRequired, superAdminRequired);

// 匿名帖作者身份揭示阈值：对齐「3 人举报提升优先级」机制。
// posts.ts 在插入新举报前统计 pending 数 >=2 即置 high（第 3 个举报人触发），
// 等效于帖子累计有效举报数达 3 条，此处用同一口径判断是否向管理端揭示真实作者。
const REPORT_REVEAL_THRESHOLD = 3;

// ============ 用户管理 ============

router.get('/users', (req, res) => {
  const { keyword, status, role, page = '1', pageSize = '20' } = req.query;
  let where = `WHERE 1=1`;
  const params: any[] = [];
  if (keyword) {
    where += ` AND (student_id LIKE ? OR nickname LIKE ?)`;
    params.push(`%${keyword}%`, `%${keyword}%`);
  }
  if (status) {
    where += ` AND status = ?`;
    params.push(status);
  }
  if (role) {
    where += ` AND role = ?`;
    params.push(role);
  }
  const p = parseInt(page as string);
  const ps = parseInt(pageSize as string);
  const offset = (p - 1) * ps;

  const users = db.prepare(`
    SELECT id, student_id, nickname, avatar, college, grade, signature, credit_score, role, status, ban_reason, ban_until, created_at
    FROM users ${where}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, ps, offset) as any[];

  const totalRow = db.prepare(`SELECT COUNT(*) as total FROM users ${where}`).get(...params) as any;

  const postCounts = db.prepare(`
    SELECT user_id, COUNT(*) as count FROM posts WHERE status != 'deleted' GROUP BY user_id
  `).all() as any[];
  const countMap = new Map(postCounts.map((p) => [p.user_id, p.count]));

  const list = users.map((u) => ({
    ...u,
    createdAt: u.created_at ? new Date(u.created_at).toISOString() : u.created_at,
    postCount: countMap.get(u.id) || 0,
  }));

  success(res, { list, total: totalRow.total, page: p, pageSize: ps });
});

// 封禁/解封用户
router.put('/users/:id/ban', (req, res) => {
  const id = Number(req.params.id);
  const { action, reason, duration } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as any;
  if (!user) return fail(res, '用户不存在', 404, 404);
  if (user.role === 'super_admin') return fail(res, '不可封禁超级管理员');

  if (action === 'ban') {
    let banUntil = '';
    if (duration && duration !== 'forever') {
      const days = parseInt(duration);
      banUntil = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
    }
    db.prepare('UPDATE users SET status = ?, ban_reason = ?, ban_until = ? WHERE id = ?').run(
      'banned', reason || '违规', banUntil, id
    );
    // 通知用户
    db.prepare('INSERT INTO messages (user_id, type, content) VALUES (?, ?, ?)').run(
      id, 'system', `您的账号已被封禁，原因：${reason || '违规'}${banUntil ? `，解封时间：${new Date(banUntil).toLocaleString('zh-CN')}` : '，永久封禁'}`
    );
    success(res, null, '已封禁用户');
  } else {
    db.prepare('UPDATE users SET status = ?, ban_reason = ?, ban_until = ? WHERE id = ?').run('active', '', '', id);
    db.prepare('INSERT INTO messages (user_id, type, content) VALUES (?, ?, ?)').run(id, 'system', '您的账号已解封');
    success(res, null, '已解封用户');
  }
});

// 重置密码
router.put('/users/:id/reset-password', (req, res) => {
  const id = Number(req.params.id);
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) return fail(res, '密码至少6位');
  const hashed = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashed, id);
  success(res, null, '密码已重置');
});

// 调整信誉分
router.put('/users/:id/credit', (req, res) => {
  const id = Number(req.params.id);
  const { score, reason } = req.body;
  if (typeof score !== 'number') return fail(res, '请输入有效分值');
  const user = db.prepare('SELECT credit_score FROM users WHERE id = ?').get(id) as any;
  if (!user) return fail(res, '用户不存在', 404, 404);
  const newScore = Math.max(0, Math.min(120, user.credit_score + score));
  db.prepare('UPDATE users SET credit_score = ? WHERE id = ?').run(newScore, id);
  db.prepare('INSERT INTO messages (user_id, type, content) VALUES (?, ?, ?)').run(
    id, 'system', `您的信誉分${score >= 0 ? '增加' : '减少'}${Math.abs(score)}分，当前信誉分：${newScore}${reason ? `，原因：${reason}` : ''}`
  );
  success(res, { creditScore: newScore }, '信誉分已调整');
});

// ============ 内容审核 ============

router.get('/posts', (req, res) => {
  const { status, sectionId, keyword, page = '1', pageSize = '20' } = req.query;
  let where = `WHERE p.status != 'deleted'`;
  const params: any[] = [];
  if (status) {
    where += ` AND p.status = ?`;
    params.push(status);
  }
  if (sectionId) {
    where += ` AND p.section_id = ?`;
    params.push(parseInt(sectionId as string));
  }
  if (keyword) {
    where += ` AND (p.title LIKE ? OR p.content LIKE ?)`;
    params.push(`%${keyword}%`, `%${keyword}%`);
  }
  const p = parseInt(page as string);
  const ps = parseInt(pageSize as string);
  const offset = (p - 1) * ps;

  const posts = db.prepare(`
    SELECT p.*, u.id as author_id, u.nickname as author_nickname, u.student_id as author_student_id, u.avatar as author_avatar,
           s.name as section_name
    FROM posts p
    LEFT JOIN users u ON p.user_id = u.id
    LEFT JOIN sections s ON p.section_id = s.id
    ${where}
    ORDER BY p.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, ps, offset) as any[];

  const totalRow = db.prepare(`SELECT COUNT(*) as total FROM posts p LEFT JOIN users u ON p.user_id = u.id ${where}`).get(...params) as any;

  const list = posts.map((p) => ({
    id: p.id,
    title: p.title,
    content: p.content,
    images: JSON.parse(p.images || '[]'),
    isAnonymous: !!p.is_anonymous,
    status: p.status,
    isTop: !!p.is_top,
    topType: p.top_type,
    rejectReason: p.reject_reason,
    viewCount: p.view_count,
    likeCount: p.like_count,
    commentCount: p.comment_count,
    section: { id: p.section_id, name: p.section_name },
    author: { id: p.author_id, nickname: p.author_nickname, studentId: p.author_student_id, avatar: p.author_avatar },
    createdAt: p.created_at ? new Date(p.created_at).toISOString() : p.created_at,
  }));

  success(res, { list, total: totalRow.total, page: p, pageSize: ps });
});

// 审核帖子
router.put('/posts/:id/audit', (req, res) => {
  const id = Number(req.params.id);
  const { action, reason } = req.body;
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(id) as any;
  if (!post) return fail(res, '帖子不存在', 404, 404);

  if (action === 'approve') {
    db.prepare("UPDATE posts SET status = 'published' WHERE id = ?").run(id);
    cacheInvalidate('posts');
    db.prepare('INSERT INTO messages (user_id, type, content, related_id) VALUES (?, ?, ?, ?)').run(
      post.user_id, 'system', `您发布的帖子「${post.title}」已通过审核`, id
    );
    success(res, null, '已通过审核');
  } else if (action === 'reject') {
    if (!reason) return fail(res, '请填写驳回原因');
    db.prepare("UPDATE posts SET status = 'rejected', reject_reason = ? WHERE id = ?").run(reason, id);
    cacheInvalidate('posts');
    db.prepare('INSERT INTO messages (user_id, type, content, related_id) VALUES (?, ?, ?, ?)').run(
      post.user_id, 'system', `您发布的帖子「${post.title}」被驳回，原因：${reason}`, id
    );
    success(res, null, '已驳回');
  } else {
    return fail(res, '无效操作');
  }
});

// 设置/取消置顶
router.put('/posts/:id/top', (req, res) => {
  const id = Number(req.params.id);
  const { action, topType } = req.body;
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(id) as any;
  if (!post) return fail(res, '帖子不存在', 404, 404);

  if (action === 'top') {
    // 全局置顶最多3条
    if (topType === 'global') {
      const globalTopCount = db.prepare("SELECT COUNT(*) as count FROM posts WHERE top_type = 'global'").get() as any;
      if (globalTopCount.count >= 3) return fail(res, '全局置顶最多3条');
    }
    db.prepare('UPDATE posts SET is_top = 1, top_type = ? WHERE id = ?').run(topType || 'section', id);
    cacheInvalidate('posts');
    success(res, null, '已设置置顶');
  } else {
    db.prepare('UPDATE posts SET is_top = 0, top_type = \'none\' WHERE id = ?').run(id);
    cacheInvalidate('posts');
    success(res, null, '已取消置顶');
  }
});

// 评论管理列表
router.get('/comments', (req, res) => {
  const { keyword, page = '1', pageSize = '20' } = req.query;
  let where = `WHERE c.status = 'active'`;
  const params: any[] = [];
  if (keyword) {
    where += ` AND c.content LIKE ?`;
    params.push(`%${keyword}%`);
  }
  const p = parseInt(page as string);
  const ps = parseInt(pageSize as string);
  const offset = (p - 1) * ps;

  const comments = db.prepare(`
    SELECT c.*, u.id as author_id, u.nickname as author_nickname, u.student_id as author_student_id,
           p.title as post_title, p.id as post_id
    FROM comments c
    LEFT JOIN users u ON c.user_id = u.id
    LEFT JOIN posts p ON c.post_id = p.id
    ${where}
    ORDER BY c.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, ps, offset) as any[];

  const totalRow = db.prepare(`SELECT COUNT(*) as total FROM comments c LEFT JOIN users u ON c.user_id = u.id ${where}`).get(...params) as any;

  const list = comments.map((c) => ({
    id: c.id,
    content: c.content,
    isAnonymous: !!c.is_anonymous,
    likeCount: c.like_count,
    status: c.status,
    post: { id: c.post_id, title: c.post_title },
    author: { id: c.author_id, nickname: c.author_nickname, studentId: c.author_student_id },
    createdAt: c.created_at ? new Date(c.created_at).toISOString() : c.created_at,
  }));

  success(res, { list, total: totalRow.total, page: p, pageSize: ps });
});

// 删除违规评论
router.delete('/comments/:id', (req, res) => {
  const id = Number(req.params.id);
  const comment = db.prepare('SELECT * FROM comments WHERE id = ?').get(id) as any;
  if (!comment) return fail(res, '评论不存在', 404, 404);
  db.prepare("UPDATE comments SET status = 'deleted' WHERE id = ?").run(id);
  db.prepare('UPDATE posts SET comment_count = MAX(0, comment_count - 1) WHERE id = ?').run(comment.post_id);
  cacheInvalidate('posts');
  success(res, null, '评论已删除');
});

// ============ 举报处理 ============

router.get('/reports', (req, res) => {
  const { status, page = '1', pageSize = '20' } = req.query;
  let where = `WHERE 1=1`;
  const params: any[] = [];
  if (status) {
    where += ` AND r.status = ?`;
    params.push(status);
  }
  const p = parseInt(page as string);
  const ps = parseInt(pageSize as string);
  const offset = (p - 1) * ps;

  const reports = db.prepare(`
    SELECT r.*, u.nickname as reporter_nickname, u.student_id as reporter_student_id
    FROM reports r
    LEFT JOIN users u ON r.reporter_id = u.id
    ${where}
    ORDER BY r.priority DESC, r.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, ps, offset) as any[];

  const totalRow = db.prepare(`SELECT COUNT(*) as total FROM reports r ${where}`).get(...params) as any;

  // 获取举报人数
  const list = reports.map((r) => {
    const count = db.prepare("SELECT COUNT(*) as count FROM reports WHERE target_type = ? AND target_id = ? AND status = 'pending'").get(r.target_type, r.target_id) as any;
    // 可追溯平衡设计：匿名帖有效举报数达阈值时，仅在本管理端接口附加真实作者；
    // 未达阈值不返回该字段，普通用户侧任何接口零改动、永不泄露
    let revealedAuthor: { id: any; nickname: any; studentId: any } | undefined;
    if (r.target_type === 'post' && count.count >= REPORT_REVEAL_THRESHOLD) {
      const post = db.prepare('SELECT user_id, is_anonymous FROM posts WHERE id = ?').get(r.target_id) as any;
      if (post && post.is_anonymous) {
        const author = db.prepare('SELECT id, nickname, student_id FROM users WHERE id = ?').get(post.user_id) as any;
        if (author) revealedAuthor = { id: author.id, nickname: author.nickname, studentId: author.student_id };
      }
    }
    return {
      id: r.id,
      targetType: r.target_type,
      targetId: r.target_id,
      reason: r.reason,
      status: r.status,
      priority: r.priority,
      handleResult: r.handle_result,
      reporter: { id: r.reporter_id, nickname: r.reporter_nickname, studentId: r.reporter_student_id },
      reportCount: count.count,
      ...(revealedAuthor ? { revealedAuthor } : {}),
      createdAt: r.created_at ? new Date(r.created_at).toISOString() : r.created_at,
    };
  });

  success(res, { list, total: totalRow.total, page: p, pageSize: ps });
});

// 处理举报
router.put('/reports/:id', (req, res) => {
  const id = Number(req.params.id);
  const { action, result } = req.body;
  const report = db.prepare('SELECT * FROM reports WHERE id = ?').get(id) as any;
  if (!report) return fail(res, '举报工单不存在', 404, 404);

  db.prepare('UPDATE reports SET status = ?, handler_id = ?, handle_result = ? WHERE id = ?').run(
    'handled', req.currentUser!.id, result || action, id
  );

  if (action === 'delete_content') {
    if (report.target_type === 'post') {
      db.prepare("UPDATE posts SET status = 'deleted' WHERE id = ?").run(report.target_id);
      cacheInvalidate('posts');
    } else if (report.target_type === 'comment') {
      // 删除评论时同步减少帖子 comment_count，与 comments.ts 删除逻辑保持一致
      const comment = db.prepare('SELECT post_id FROM comments WHERE id = ?').get(report.target_id) as any;
      db.prepare("UPDATE comments SET status = 'deleted' WHERE id = ?").run(report.target_id);
      if (comment?.post_id) {
        db.prepare('UPDATE posts SET comment_count = MAX(0, comment_count - 1) WHERE id = ?').run(comment.post_id);
        cacheInvalidate('posts');
      }
    }
  } else if (action === 'ban_user') {
    // 封禁被举报内容的作者：找到目标作者并执行封禁
    let authorId = 0;
    if (report.target_type === 'post') {
      const post = db.prepare('SELECT user_id FROM posts WHERE id = ?').get(report.target_id) as any;
      authorId = post?.user_id || 0;
    } else if (report.target_type === 'comment') {
      const comment = db.prepare('SELECT user_id FROM comments WHERE id = ?').get(report.target_id) as any;
      authorId = comment?.user_id || 0;
    }
    if (authorId > 0) {
      const author = db.prepare('SELECT role FROM users WHERE id = ?').get(authorId) as any;
      // 不封禁超级管理员
      if (author && author.role !== 'super_admin') {
        db.prepare("UPDATE users SET status = 'banned', ban_reason = ?, ban_until = '' WHERE id = ?").run(
          result || '因举报被封禁', authorId
        );
        db.prepare('INSERT INTO messages (user_id, type, content) VALUES (?, ?, ?)').run(
          authorId, 'system', `您的账号因举报已被封禁，原因：${result || '违规'}`
        );
      }
    }
  }

  // 通知举报人
  db.prepare('INSERT INTO messages (user_id, type, content) VALUES (?, ?, ?)').run(
    report.reporter_id, 'system', `您的举报工单已处理，处理结果：${result || action}`
  );

  success(res, null, '举报已处理');
});

// ============ 数据统计 ============

router.get('/stats', (_req, res) => {
  const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users WHERE role = \'user\'').get() as any;
  const todayUsers = db.prepare("SELECT COUNT(*) as count FROM users WHERE date(created_at) = date('now')").get() as any;
  const totalPosts = db.prepare("SELECT COUNT(*) as count FROM posts WHERE status != 'deleted'").get() as any;
  const todayPosts = db.prepare("SELECT COUNT(*) as count FROM posts WHERE date(created_at) = date('now')").get() as any;
  const totalComments = db.prepare("SELECT COUNT(*) as count FROM comments WHERE status = 'active'").get() as any;
  const todayComments = db.prepare("SELECT COUNT(*) as count FROM comments WHERE date(created_at) = date('now')").get() as any;
  const pendingReports = db.prepare("SELECT COUNT(*) as count FROM reports WHERE status = 'pending'").get() as any;
  const pendingPosts = db.prepare("SELECT COUNT(*) as count FROM posts WHERE status IN ('pending', 'pending_review')").get() as any;
  const approvedPosts = db.prepare("SELECT COUNT(*) as count FROM posts WHERE status = 'published'").get() as any;
  const totalAllPosts = db.prepare("SELECT COUNT(*) as count FROM posts WHERE status IN ('published', 'pending', 'rejected')").get() as any;
  const auditPassRate = totalAllPosts.count > 0 ? Math.round((approvedPosts.count / totalAllPosts.count) * 100) : 100;

  // 近7天数据趋势
  const trend: any[] = [];
  for (let i = 6; i >= 0; i--) {
    const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const users = db.prepare("SELECT COUNT(*) as count FROM users WHERE date(created_at) = ?").get(date) as any;
    const posts = db.prepare("SELECT COUNT(*) as count FROM posts WHERE date(created_at) = ?").get(date) as any;
    const comments = db.prepare("SELECT COUNT(*) as count FROM comments WHERE date(created_at) = ?").get(date) as any;
    trend.push({ date, users: users.count, posts: posts.count, comments: comments.count });
  }

  // 板块分布
  const sectionDist = db.prepare(`
    SELECT s.name, COUNT(p.id) as count
    FROM sections s
    LEFT JOIN posts p ON s.id = p.section_id AND p.status = 'published'
    GROUP BY s.id
    ORDER BY count DESC
  `).all() as any[];

  // 学院分布
  const collegeDist = db.prepare(`
    SELECT college, COUNT(*) as count FROM users WHERE college != '' GROUP BY college ORDER BY count DESC LIMIT 10
  `).all() as any[];

  success(res, {
    cards: {
      totalUsers: totalUsers.count,
      todayUsers: todayUsers.count,
      totalPosts: totalPosts.count,
      todayPosts: todayPosts.count,
      totalComments: totalComments.count,
      todayComments: todayComments.count,
      pendingReports: pendingReports.count,
      pendingPosts: pendingPosts.count,
      auditPassRate,
    },
    trend,
    sectionDist,
    collegeDist,
  });
});

// ============ 板块管理 ============

router.post('/sections', (req, res) => {
  const { name, icon, sort, isActive, forceAnonymous, needAudit } = req.body;
  if (!name || !name.trim()) return fail(res, '板块名称不能为空');
  const result = db.prepare('INSERT INTO sections (name, icon, sort, is_active, force_anonymous, need_audit) VALUES (?, ?, ?, ?, ?, ?)').run(
    name.trim(), icon || '', sort || 0, isActive ? 1 : 0, forceAnonymous ? 1 : 0, needAudit ? 1 : 0
  );
  success(res, { id: result.lastInsertRowid }, '板块已创建');
});

router.put('/sections/:id', (req, res) => {
  const id = Number(req.params.id);
  const { name, icon, sort, isActive, forceAnonymous, needAudit } = req.body;
  const section = db.prepare('SELECT * FROM sections WHERE id = ?').get(id) as any;
  if (!section) return fail(res, '板块不存在', 404, 404);
  db.prepare('UPDATE sections SET name = ?, icon = ?, sort = ?, is_active = ?, force_anonymous = ?, need_audit = ? WHERE id = ?').run(
    name?.trim() || section.name, icon ?? section.icon, sort ?? section.sort,
    isActive !== undefined ? (isActive ? 1 : 0) : section.is_active,
    forceAnonymous !== undefined ? (forceAnonymous ? 1 : 0) : section.force_anonymous,
    needAudit !== undefined ? (needAudit ? 1 : 0) : section.need_audit,
    id
  );
  success(res, null, '板块已更新');
});

router.delete('/sections/:id', (req, res) => {
  const id = Number(req.params.id);
  const postCount = db.prepare('SELECT COUNT(*) as count FROM posts WHERE section_id = ? AND status = \'published\'').get(id) as any;
  if (postCount.count > 0) return fail(res, '该板块下还有帖子，不可删除，可停用板块');
  db.prepare('DELETE FROM sections WHERE id = ?').run(id);
  success(res, null, '板块已删除');
});

// ============ 意见反馈 ============

// 反馈列表（分页，status 过滤 open/closed，keyword 搜内容/联系方式/用户）
router.get('/feedbacks', (req, res) => {
  const { keyword, status, page = '1', pageSize = '20' } = req.query;
  let where = `WHERE 1=1`;
  const params: any[] = [];
  if (status) {
    where += ` AND f.status = ?`;
    params.push(status);
  }
  if (keyword) {
    where += ` AND (f.content LIKE ? OR f.contact LIKE ? OR u.nickname LIKE ? OR u.student_id LIKE ?)`;
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }
  const p = parseInt(page as string);
  const ps = parseInt(pageSize as string);
  const offset = (p - 1) * ps;

  const base = `FROM feedback f LEFT JOIN users u ON f.user_id = u.id ${where}`;
  const rows = db.prepare(`
    SELECT f.id, f.content, f.contact, f.status, f.created_at, f.user_id,
           u.nickname, u.student_id, u.avatar
    ${base}
    ORDER BY f.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, ps, offset) as any[];

  const totalRow = db.prepare(`SELECT COUNT(*) as total ${base}`).get(...params) as any;

  const list = rows.map((f) => ({
    id: f.id,
    content: f.content,
    contact: f.contact,
    status: f.status || 'open',
    userId: f.user_id,
    nickname: f.nickname,
    studentId: f.student_id,
    avatar: f.avatar,
    createdAt: f.created_at ? new Date(f.created_at).toISOString() : f.created_at,
  }));

  success(res, { list, total: totalRow.total, page: p, pageSize: ps });
});

export default router;

