/**
 * 板块路由与搜索
 */
import { Router } from 'express';
import { db } from '../db.js';
import { success } from '../utils/response.js';

const router = Router();

// 板块列表
router.get('/sections', (req, res) => {
  const onlyActive = req.query.all !== '1';
  let sql = `SELECT * FROM sections`;
  if (onlyActive) sql += ` WHERE is_active = 1`;
  sql += ` ORDER BY sort ASC`;
  const sections = db.prepare(sql).all() as any[];
  const list = sections.map((s) => ({
    id: s.id,
    name: s.name,
    icon: s.icon,
    sort: s.sort,
    isActive: !!s.is_active,
    forceAnonymous: !!s.force_anonymous,
    needAudit: !!s.need_audit,
  }));
  success(res, list);
});

// 热门搜索词
router.get('/search/hot', (_req, res) => {
  const hotWords = ['二手自行车', '考研资料', '失物招领', '食堂吐槽', '选课推荐', '社团招新', '表白', '兼职'];
  success(res, hotWords);
});

// 搜索帖子
router.get('/search', (req, res) => {
  const keyword = (req.query.keyword as string) || '';
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const pageSize = 20;
  if (!keyword.trim()) {
    return success(res, { list: [], total: 0, page, pageSize, hasMore: false });
  }

  const offset = (page - 1) * pageSize;
  // 使用 INNER JOIN 与列表主查询保持一致，避免 LEFT JOIN 后 u.status 为 NULL 的过滤问题
  const posts = db.prepare(`
    SELECT p.*, u.id as author_id, u.nickname as author_nickname, u.avatar as author_avatar, u.college as author_college,
           s.name as section_name, s.icon as section_icon
    FROM posts p
    INNER JOIN users u ON p.user_id = u.id
    LEFT JOIN sections s ON p.section_id = s.id
    WHERE p.status = 'published' AND u.status != 'banned'
    AND (p.title LIKE ? OR p.content LIKE ?)
    ORDER BY p.created_at DESC
    LIMIT ? OFFSET ?
  `).all(`%${keyword}%`, `%${keyword}%`, pageSize, offset) as any[];

  const totalRow = db.prepare(`
    SELECT COUNT(*) as total FROM posts p INNER JOIN users u ON p.user_id = u.id
    WHERE p.status = 'published' AND u.status != 'banned'
    AND (p.title LIKE ? OR p.content LIKE ?)
  `).get(`%${keyword}%`, `%${keyword}%`) as any;

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
    extraFields: JSON.parse(p.extra_fields || '{}'),
    section: { id: p.section_id, name: p.section_name, icon: p.section_icon },
    author: p.is_anonymous
      ? { id: 0, nickname: '匿名用户', avatar: '', college: '' }
      : { id: p.author_id, nickname: p.author_nickname, avatar: p.author_avatar, college: p.author_college },
    createdAt: p.created_at ? new Date(p.created_at).toISOString() : p.created_at,
  }));

  success(res, { list, total: totalRow.total, page, pageSize, hasMore: offset + pageSize < totalRow.total });
});

export default router;
