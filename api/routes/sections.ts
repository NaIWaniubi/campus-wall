/**
 * 板块路由与搜索
 */
import { Router } from 'express';
import { db } from '../db.js';
import { success, toInt } from '../utils/response.js';
import { buildFtsQuery } from '../utils/matching.js';
import { safeJsonParse } from '../utils/logger.js';
import { readLimiter } from '../middleware/rateLimit.js';

const router = Router();

// 板块列表
router.get('/sections', readLimiter, (req, res) => {
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
router.get('/search/hot', readLimiter, (_req, res) => {
  const hotWords = ['二手自行车', '考研资料', '失物招领', '食堂吐槽', '选课推荐', '社团招新', '表白', '兼职'];
  success(res, hotWords);
});

// 搜索帖子（FTS5 全文检索 + 降级 LIKE + 安全 JSON 解析）
// sectionId/sort 为前端筛选器的真实后端消费（SearchPage 传 sectionId + sort: 'new'|'hot'）
router.get('/search', readLimiter, (req, res) => {
  const keyword = (req.query.keyword as string) || '';
  const page = toInt(req.query.page, 1, 1);
  const pageSize = 20;
  // 板块过滤：0/缺省 = 全部；sort：new（时间倒序，默认）/ hot（热度分）
  const sectionId = toInt(req.query.sectionId, 0, 0);
  const sort = (req.query.sort as string) === 'hot' ? 'hot' : 'new';
  if (!keyword.trim()) {
    return success(res, { list: [], total: 0, page, pageSize, hasMore: false });
  }

  const offset = (page - 1) * pageSize;
  const ftsQuery = buildFtsQuery(keyword, 8);
  let matchClause = '(p.title LIKE ? OR p.content LIKE ?)';
  let matchParams: any[] = [`%${keyword}%`, `%${keyword}%`];

  if (ftsQuery && ftsQuery !== '""') {
    matchClause = 'p.id IN (SELECT rowid FROM posts_fts WHERE posts_fts MATCH ?)';
    matchParams = [ftsQuery];
  }

  // 板块过滤条件拼在 match 之后，参数顺序与占位符一一对应
  const sectionClause = sectionId > 0 ? ' AND p.section_id = ?' : '';
  if (sectionId > 0) matchParams.push(sectionId);

  // 热度得分与 /posts 列表同源（HN 公式改造 + 30 分钟冷启动加权）
  const hotScoreSql = `
    (
      (p.like_count * 2.0 + p.comment_count * 3.0)
      / POW(MAX((julianday('now') - julianday(p.created_at)) * 24.0, 0) + 2, 1.5)
    ) * CASE WHEN (julianday('now') - julianday(p.created_at)) * 1440.0 <= 30 THEN 1.5 ELSE 1.0 END
  `;
  const orderBy = sort === 'hot'
    ? `ORDER BY (${hotScoreSql}) DESC, p.created_at DESC`
    : 'ORDER BY p.created_at DESC';

  // 使用 INNER JOIN 与列表主查询保持一致，避免 LEFT JOIN 后 u.status 为 NULL 的过滤问题
  const posts = db.prepare(`
    SELECT p.*, u.id as author_id, u.nickname as author_nickname, u.avatar as author_avatar, u.college as author_college,
           s.name as section_name, s.icon as section_icon
    FROM posts p
    INNER JOIN users u ON p.user_id = u.id
    LEFT JOIN sections s ON p.section_id = s.id
    WHERE p.status = 'published' AND u.status != 'banned'
    AND ${matchClause}${sectionClause}
    ${orderBy}
    LIMIT ? OFFSET ?
  `).all(...matchParams, pageSize, offset) as any[];

  const totalRow = db.prepare(`
    SELECT COUNT(*) as total FROM posts p INNER JOIN users u ON p.user_id = u.id
    WHERE p.status = 'published' AND u.status != 'banned'
    AND ${matchClause}${sectionClause}
  `).get(...matchParams) as any;

  const total = totalRow ? totalRow.total : 0;
  const list = posts.map((p) => ({
    id: p.id,
    title: p.title,
    content: p.content,
    images: safeJsonParse<string[]>(p.images || '[]', [], 'sections.search.images'),
    isAnonymous: !!p.is_anonymous,
    viewCount: p.view_count,
    likeCount: p.like_count,
    commentCount: p.comment_count,
    favoriteCount: p.favorite_count,
    extraFields: safeJsonParse<Record<string, any>>(p.extra_fields || '{}', {}, 'sections.search.extraFields'),
    section: { id: p.section_id, name: p.section_name, icon: p.section_icon },
    author: p.is_anonymous
      ? { id: 0, nickname: '匿名用户', avatar: '', college: '' }
      : { id: p.author_id, nickname: p.author_nickname, avatar: p.author_avatar, college: p.author_college },
    createdAt: p.created_at ? new Date(p.created_at).toISOString() : p.created_at,
  }));

  success(res, { list, total, page, pageSize, hasMore: offset + pageSize < total });
});

export default router;
