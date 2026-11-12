/**
 * 帖子路由：列表、详情、发布、编辑、删除、点赞、收藏、举报
 */
import { Router } from 'express';
import { db } from '../db.js';
import { authRequired, authOptional } from '../middleware/auth.js';
import { success, fail, forbidden } from '../utils/response.js';
import { assessRisk } from '../utils/sensitive.js';
import { postLimiter, readLimiter } from '../middleware/rateLimit.js';
import { upsertNotification } from '../utils/notification.js';
import { findLostFoundMatches, notifyLostFoundMatch, formatMatch, isLostFoundSection } from '../utils/match.js';
import { findRadarMatches, MATCH_THRESHOLD, buildFtsQuery } from '../utils/matching.js';
import { sanitizeExtraFields, mergeExtraFields } from '../utils/extra-fields.js';
import { applyDirectionFilter } from '../utils/direction-filter.js';
import { cacheGet, cacheSet, cacheInvalidate } from '../utils/cache.js';
import { validate, postSchemas, commonSchemas } from '../utils/validation.js';
import { safeJsonParse, logger } from '../utils/logger.js';
import { trackEvent, trackFirstEvent, touchActive } from '../utils/events.js';

const router = Router();

/**
 * 格式化帖子对象（带作者、板块、互动状态）
 * 导出供「我的点赞」等个人列表复用（无循环依赖）
 */
export function formatPost(
  post: any,
  currentUserId?: number,
  likedMap?: Map<number, boolean>,
  favoritedMap?: Map<number, boolean>
) {
  let author: any;
  if (post.is_anonymous) {
    // 匿名帖作者信誉分置 null（前端据此不显示徽章）
    author = { id: 0, nickname: '匿名用户', avatar: '', college: '', creditScore: null };
  } else {
    author = {
      id: post.author_id,
      nickname: post.author_nickname,
      avatar: post.author_avatar,
      college: post.author_college,
      creditScore: post.author_credit_score,
    };
  }

  // 点赞/收藏状态优先使用列表处批量预加载的 Map，避免 N+1；
  // 详情接口若未传 Map，则单条回退查询。
  let liked = false;
  let favorited = false;
  if (currentUserId) {
    if (likedMap && favoritedMap) {
      liked = !!likedMap.get(post.id);
      favorited = !!favoritedMap.get(post.id);
    } else {
      const like = db.prepare('SELECT id FROM likes WHERE user_id = ? AND target_type = ? AND target_id = ?').get(currentUserId, 'post', post.id);
      liked = !!like;
      const fav = db.prepare('SELECT id FROM favorites WHERE user_id = ? AND post_id = ?').get(currentUserId, post.id);
      favorited = !!fav;
    }
  }

  const images = safeJsonParse<string[]>(post.images || '[]', [], 'formatPost.images');
  const extraFields = safeJsonParse<Record<string, any>>(post.extra_fields || '{}', {}, 'formatPost.extraFields');

  return {
    id: post.id,
    title: post.title,
    content: post.content,
    images,
    // 每张图对应的服务端缩略图地址（旧图可能不存在，前端加载失败时回退原图）
    thumbImages: images.map((u) => `${u}.thumb.webp`),
    isAnonymous: !!post.is_anonymous,
    status: post.status,
    isTop: !!post.is_top,
    topType: post.top_type,
    rejectReason: post.reject_reason,
    viewCount: post.view_count,
    likeCount: post.like_count,
    commentCount: post.comment_count,
    favoriteCount: post.favorite_count,
    extraFields,
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
router.get('/', authOptional, readLimiter, validate({ query: postSchemas.list }), (req, res) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const pageSize = Math.min(50, Math.max(1, parseInt(req.query.pageSize as string) || 20));
  const sectionId = req.query.sectionId ? parseInt(req.query.sectionId as string) : 0;
  const keyword = (req.query.keyword as string) || '';
  // 排序：hot（默认，HN 风格热度）/ new（时间倒序）；price_* 为交易板块专用
  const sort = (req.query.sort as string) || 'hot';
  // 交易/失物筛选项（全局执行，优于客户端二次排序）
  const priceRange = (req.query.priceRange as string) || '';   // 形如 "0-100" / "100-500" / "500-"
  const timeRange = (req.query.timeRange as string) || '';     // 形如 "1" / "7" / "30"（天）
  const subType = (req.query.subType as string) || '';          // extra_fields 子类型，如 tradeType/itemType

  const currentUserId = req.currentUser?.id;

  let where = `WHERE p.status = 'published' AND u.status != 'banned'`;
  const params: any[] = [];

  if (sectionId > 0) {
    where += ` AND p.section_id = ?`;
    params.push(sectionId);
  }
  // 按作者筛选（公开主页用；配合 status=published 即该作者的公开可见帖）
  // 匿名帖必须排除：否则任何人可用 ?authorId=N 把该用户发过的匿名帖逐条筛出来，
  // 匿名承诺在列表接口层面直接失效（只有本节作者或管理员能看到自己的匿名帖）。
  const authorId = req.query.authorId ? parseInt(req.query.authorId as string) : 0;
  if (authorId > 0) {
    where += ` AND p.user_id = ?`;
    params.push(authorId);
    const viewerIsOwner = currentUserId === authorId;
    const viewerIsAdmin = req.currentUser?.role === 'super_admin' || req.currentUser?.role === 'section_admin';
    if (!viewerIsOwner && !viewerIsAdmin) {
      where += ` AND p.is_anonymous = 0`;
    }
  }
  if (keyword) {
    // FTS5 全文检索：unicode61 分词 + BM25，避免 LIKE 全表扫描；空词回退 LIKE 兜底
    const ftsQuery = buildFtsQuery(keyword, 8);
    if (ftsQuery && ftsQuery !== '""') {
      where += ` AND p.id IN (SELECT rowid FROM posts_fts WHERE posts_fts MATCH ?)`;
      params.push(ftsQuery);
    } else {
      where += ` AND (p.title LIKE ? OR p.content LIKE ?)`;
      params.push(`%${keyword}%`, `%${keyword}%`);
    }
  }
  // 价格区间筛选（针对 extra_fields.price 数值字段，仅对带 price 的板块有效）
  if (priceRange) {
    const m = priceRange.match(/^(\d+)?-(\d+)?$/);
    if (m) {
      const min = m[1] ? parseFloat(m[1]) : null;
      const max = m[2] ? parseFloat(m[2]) : null;
      if (min !== null) {
        where += ` AND CAST(json_extract(p.extra_fields, '$.price') AS REAL) >= ?`;
        params.push(min);
      }
      if (max !== null) {
        where += ` AND CAST(json_extract(p.extra_fields, '$.price') AS REAL) <= ?`;
        params.push(max);
      }
    }
  }
  // 时间范围筛选
  if (timeRange && /^\d+$/.test(timeRange)) {
    where += ` AND p.created_at >= datetime('now', '-' || ? || ' days')`;
    params.push(timeRange);
  }
  // 子类型筛选（extra_fields 中的某个 key 精确匹配，使用安全的参数化查询）
  if (subType) {
    const SAFE_JSON_PATHS: Record<string, string> = {
      tradeType: '$.tradeType',
      itemType: '$.itemType',
      direction: '$.direction',
      activityType: '$.activityType',
    };
    const [rawKey, val] = subType.split(':');
    const safePath = rawKey && SAFE_JSON_PATHS[rawKey];
    if (safePath && val) {
      // 使用参数化查询，避免模板字符串拼接
      where += ` AND json_extract(p.extra_fields, ?) = ?`;
      params.push(safePath, val);
    }
  }
  // 校区筛选：小程序「我的」与板块页的校区 picker 传 campus。
  // 之前适配层直接丢弃该参数，导致切校区完全无效——这里落到 extra_fields.campus 上。
  const campus = (req.query.campus as string) || '';
  if (campus) {
    where += ` AND json_extract(p.extra_fields, '$.campus') = ?`;
    params.push(campus);
  }
  // 失物方向筛选：仅当目标板块为失物招领类时生效（lost=丢失 / found=拾到）
  const directionRaw = (req.query.direction as string) || '';
  let directionApplied = '';
  if (sectionId > 0) {
    const sec = db.prepare('SELECT name FROM sections WHERE id = ?').get(sectionId) as any;
    const { applied } = applyDirectionFilter(directionRaw, sectionId, sec?.name);
    if (applied) {
      where += ` AND json_extract(p.extra_fields, '$.direction') = ?`;
      params.push(applied);
      directionApplied = applied;
    }
  }

  const offset = (page - 1) * pageSize;

  // top_type 排序：global(全局) 应排在 section(板块) 之前；按字母倒序会导致 section>none>global，错误
  // 使用 CASE 显式指定优先级：global=2, section=1, none=0
  const topTypeOrder = `CASE p.top_type WHEN 'global' THEN 2 WHEN 'section' THEN 1 ELSE 0 END DESC`;
  // 热度得分（HN 公式改造）：(点赞×2 + 评论×3) / (帖子年龄小时数+2)^1.5，
  // 发布 ≤30 分钟的帖子得分 ×1.5 冷启动加权（新内容有曝光窗口）；年龄钳制为非负
  const hotScoreSql = `
    (
      (p.like_count * 2.0 + p.comment_count * 3.0)
      / POW(MAX((julianday('now') - julianday(p.created_at)) * 24.0, 0) + 2, 1.5)
    ) * CASE WHEN (julianday('now') - julianday(p.created_at)) * 1440.0 <= 30 THEN 1.5 ELSE 1.0 END
  `;
  // 价格排序（交易板块）
  const orderBy =
    sort === 'price_asc' ? `ORDER BY p.is_top DESC, ${topTypeOrder}, CAST(json_extract(p.extra_fields, '$.price') AS REAL) ASC, p.created_at DESC`
    : sort === 'price_desc' ? `ORDER BY p.is_top DESC, ${topTypeOrder}, CAST(json_extract(p.extra_fields, '$.price') AS REAL) DESC, p.created_at DESC`
    : sort === 'new'
      ? `ORDER BY p.is_top DESC, ${topTypeOrder}, p.created_at DESC`
      : /* hot（默认） */ `ORDER BY p.is_top DESC, ${topTypeOrder}, (${hotScoreSql}) DESC, p.created_at DESC`;

  // 读缓存（读写比约 100:1）：以全部查询参数为 key 缓存原始查询行。
  // 注意只缓存 DB 行，formatPost 与 liked/favorited/isMine 等用户态在缓存后按请求现算，
  // 避免个人数据串号；任何帖子写入路径成功后统一 cacheInvalidate('posts') 前缀失效。
  const cacheKey = [
    'posts',
    `sort=${sort}`, `page=${page}`, `pageSize=${pageSize}`,
    `sectionId=${sectionId}`, `keyword=${keyword}`,
    `priceRange=${priceRange}`, `timeRange=${timeRange}`, `subType=${subType}`,
    `direction=${directionApplied}`, `campus=${campus}`,
    // authorId 是 WHERE 条件，漏进 key 会让不同作者的主页命中同一份缓存行
    `authorId=${authorId}`,
    // 匿名可见性随查看者身份变化（作者/管理员能看到自己的匿名帖，陌生人不能）。
    // 不把可见性维度写进 key，会让游客结果与作者结果互相复用 → 匿名帖串号泄露。
    `anon=${authorId > 0 ? (currentUserId === authorId || req.currentUser?.role === 'super_admin' || req.currentUser?.role === 'section_admin' ? 'own' : 'public') : 'all'}`,
  ].join(':');

  let posts: any[];
  let total: number;
  const cachedRows = cacheGet<{ rows: any[]; total: number }>(cacheKey);
  if (cachedRows) {
    res.setHeader('X-Cache', 'HIT');
    posts = cachedRows.rows;
    total = cachedRows.total;
  } else {
    res.setHeader('X-Cache', 'MISS');
    posts = db.prepare(`
      SELECT p.*, u.id as author_id, u.nickname as author_nickname, u.avatar as author_avatar, u.college as author_college, u.credit_score as author_credit_score,
             s.name as section_name, s.icon as section_icon
      FROM posts p
      INNER JOIN users u ON p.user_id = u.id
      LEFT JOIN sections s ON p.section_id = s.id
      ${where}
      ${orderBy}
      LIMIT ? OFFSET ?
    `).all(...params, pageSize, offset) as any[];

    // 使用 INNER JOIN 避免在 LEFT JOIN 后用 `u.status != 'banned'` 过滤时 NULL 行为不一致
    total = (db.prepare(`SELECT COUNT(*) as total FROM posts p INNER JOIN users u ON p.user_id = u.id ${where}`).get(...params) as any).total;

    cacheSet(cacheKey, { rows: posts, total });
  }

  // 批量预加载当前用户对这批帖子的点赞/收藏状态，消除 N+1（原 2N 次单查 -> 2 次 IN 查询）
  const likedMap = new Map<number, boolean>();
  const favoritedMap = new Map<number, boolean>();
  if (currentUserId && posts.length > 0) {
    const ids = posts.map((p) => p.id);
    const placeholders = ids.map(() => '?').join(',');
    const likeRows = db.prepare(
      `SELECT target_id FROM likes WHERE user_id = ? AND target_type = 'post' AND target_id IN (${placeholders})`
    ).all(currentUserId, ...ids) as any[];
    likeRows.forEach((r) => likedMap.set(r.target_id, true));
    const favRows = db.prepare(
      `SELECT post_id FROM favorites WHERE user_id = ? AND post_id IN (${placeholders})`
    ).all(currentUserId, ...ids) as any[];
    favRows.forEach((r) => favoritedMap.set(r.post_id, true));
  }

  const list = posts.map((p) => formatPost(p, currentUserId, likedMap, favoritedMap));

  success(res, {
    list,
    total,
    page,
    pageSize,
    hasMore: offset + pageSize < total,
  });
});

// 失物招领智能匹配：返回该帖在失物/招领类板块下的相似候选帖列表
router.get('/:id/matches', authOptional, (req, res) => {
  const id = Number(req.params.id);
  if (!id) return fail(res, '帖子不存在', 404, 404);

  const post = db.prepare(`
    SELECT p.id, p.user_id, p.title, p.content, p.extra_fields, s.name AS section_name
    FROM posts p LEFT JOIN sections s ON p.section_id = s.id
    WHERE p.id = ? AND p.status = 'published'
  `).get(id) as any;
  if (!post) return fail(res, '帖子不存在', 404, 404);
  if (!isLostFoundSection(post.section_name)) return success(res, []);

  const matches = findLostFoundMatches(post).map(formatMatch);
  success(res, matches);
});

// 智能雷达（FTS5 + BM25 + 地点/时间复合评分）：返回反向方向的高相似失物/招领帖
router.get('/:id/radar', authOptional, (req, res) => {
  const id = Number(req.params.id);
  if (!id) return fail(res, '帖子不存在', 404, 404);

  // 按帖子自身板块做反向匹配（findRadarMatches 内部校验方向字段）
  const postSec = db.prepare('SELECT section_id FROM posts WHERE id = ? AND status = \'published\'').get(id) as any;
  if (!postSec) return fail(res, '帖子不存在', 404, 404);

  const matches = findRadarMatches(id, postSec.section_id, 3);
  success(res, { threshold: MATCH_THRESHOLD, matches });
});

// 帖子详情
router.get('/:id', authOptional, (req, res) => {
  const id = Number(req.params.id);
  if (!id) return fail(res, '帖子不存在', 404, 404);

  const post = db.prepare(`
    SELECT p.*, u.id as author_id, u.nickname as author_nickname, u.avatar as author_avatar, u.college as author_college, u.credit_score as author_credit_score,
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

  // 作者已封禁：列表接口已过滤（见 where 条件 u.status != 'banned'），
  // 详情也必须一致，否则匿名访客仍可直读被封用户的昵称/学院/信誉分
  if (post.status === 'published' && !isAdmin) {
    const author = db.prepare('SELECT status FROM users WHERE id = ?').get(post.author_id) as any;
    if (author && author.status === 'banned' && post.author_id !== currentUserId) {
      return fail(res, '帖子不存在', 404, 404);
    }
  }

  // 增加浏览量
  db.prepare('UPDATE posts SET view_count = view_count + 1 WHERE id = ?').run(id);

  const postData = formatPost(post, currentUserId);
  postData.viewCount = post.view_count + 1;

  success(res, postData);
});

// 发布帖子
router.post('/', authRequired, postLimiter, validate({ body: postSchemas.create }), (req, res) => {
  const { sectionId, title, content, images, isAnonymous, extraFields } = req.body;

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

  // 敏感词风险分级：review→人工审核队列(pending_review)；warn→放行但标记 risk_flag；pass→直接过
  const risk = assessRisk(title, content);
  let status = 'published';
  if (risk.level === 'review') {
    status = 'pending_review';
  } else if (section.need_audit) {
    status = 'pending';
  }

  const imgs = Array.isArray(images) ? images.slice(0, 9) : [];
  const extra = (extraFields && typeof extraFields === 'object' && !Array.isArray(extraFields))
    ? { ...extraFields }
    : {};
  // 中风险标记（最小侵入：写入 extra_fields，前端 PostCard 无需改动）
  if (risk.level === 'warn') {
    extra.riskFlag = { level: 'warn', hits: risk.hits };
  }

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
  cacheInvalidate('posts');

  // 失物招领智能匹配：发布成功后检索相似候选帖并双向站内通知（失败不影响发帖主流程）
  let matchedCount = 0;
  if (status === 'published') {
    try {
      // 传 extra_fields：匹配器要靠 direction/itemType 排除同向帖与不同品类
      const newPost = {
        id: postId,
        user_id: req.currentUser!.id,
        title: title.trim(),
        content,
        extra_fields: JSON.stringify({ ...extra, riskFlag: undefined }),
      };
      const matches = findLostFoundMatches(newPost);
      if (matches.length) {
        notifyLostFoundMatch(newPost, matches);
        matchedCount = matches.length;
      }
    } catch (err: any) {
      logger.error('失物招领匹配失败', { error: err?.message });
    }
  }

  if (status === 'published') {
    // 发送系统消息
    db.prepare('INSERT INTO messages (user_id, type, content, related_id) VALUES (?, ?, ?, ?)').run(
      req.currentUser!.id, 'system', '您发布的帖子已通过审核并展示', postId
    );
  } else if (status === 'pending_review') {
    db.prepare('INSERT INTO messages (user_id, type, content, related_id) VALUES (?, ?, ?, ?)').run(
      req.currentUser!.id, 'system', '您发布的帖子内容待人工审核，请耐心等待', postId
    );
  } else {
    db.prepare('INSERT INTO messages (user_id, type, content, related_id) VALUES (?, ?, ?, ?)').run(
      req.currentUser!.id, 'system', '您发布的帖子正在审核中，请耐心等待', postId
    );
  }

  // 埋点：发帖 + 首次发帖（激活标志，漏斗核心指标）
  trackEvent(req.currentUser!.id, 'post_create', postId, { sectionId, status });
  trackFirstEvent(req.currentUser!.id, 'first_post', postId);
  touchActive(req.currentUser!.id);

  success(res, { id: postId, status, matchedCount }, status === 'published' ? '发布成功'
    : status === 'pending_review' ? '内容待审核，请等待管理员审核'
    : '发布成功，内容正在审核中');
});

// 编辑帖子（24小时内可编辑1次）
router.put('/:id', authRequired, validate({ params: commonSchemas.id, body: postSchemas.update }), (req, res) => {
  const id = Number(req.params.id);
  const { title, content, images, isAnonymous, extraFields } = req.body;

  // extraFields 合并语义：请求键（过白名单后）覆盖库中现有键，未传的现有键保留
  // （否则编辑漏带 direction 等扩展键会被整体抹除，帖子从对应筛选 tab 消失）

  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(id) as any;
  if (!post) return fail(res, '帖子不存在', 404, 404);
  if (post.user_id !== req.currentUser!.id) return forbidden(res, '只能编辑自己的帖子');

  const hoursDiff = (Date.now() - new Date(post.created_at).getTime()) / (1000 * 60 * 60);
  if (hoursDiff > 24) return fail(res, '发布超过24小时，不可编辑');

  // 风险分级与发布路由保持一致：review→人工审核队列；warn→放行但刷新标记
  const risk = assessRisk(title || '', content || '');

  // status 始终由服务端规则推导，禁止客户端修改（防止越权改状态）
  const section = db.prepare('SELECT * FROM sections WHERE id = ?').get(post.section_id) as any;

  // 匿名状态：未传则沿用原值（缺省写 0 会把匿名帖一键脱匿名并暴露作者）；
  // 显式变更时复用创建侧门槛：强制匿名板块不可改公开、信誉分<90 不可改匿名
  const wasAnonymous = Number(post.is_anonymous) === 1;
  const nextAnonymous = isAnonymous === undefined ? wasAnonymous : isAnonymous;
  if (nextAnonymous !== wasAnonymous) {
    if (section?.force_anonymous && !nextAnonymous) {
      return fail(res, '该板块必须匿名发布');
    }
    if (nextAnonymous && req.currentUser!.creditScore < 90) {
      return fail(res, '信誉分低于90，不可匿名发布');
    }
  }

  let status = post.status === 'published' ? 'published' : 'pending';
  if (risk.level === 'review') {
    status = 'pending_review';
  } else if (section && section.need_audit) {
    status = 'pending';
  }

  // extraFields 合并语义：请求键（过白名单后）覆盖库中现有键，未传的现有键保留
  // （否则编辑漏带 direction 等扩展键会被整体抹除，帖子从对应筛选 tab 消失）
  const sanitizedExtra = sanitizeExtraFields(extraFields);
  const existingExtra = JSON.parse(post.extra_fields || '{}');
  const finalExtra = mergeExtraFields(existingExtra, sanitizedExtra);
  // 风险标记跟随最新内容重建（白名单会剥离旧标记）
  if (risk.level === 'warn') {
    finalExtra.riskFlag = { level: 'warn', hits: risk.hits };
  } else {
    delete finalExtra.riskFlag;
  }

  db.prepare(`
    UPDATE posts SET title = ?, content = ?, images = ?, is_anonymous = ?, extra_fields = ?, status = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    title?.trim() || post.title,
    content || post.content,
    JSON.stringify(Array.isArray(images) ? images.slice(0, 9) : JSON.parse(post.images)),
    nextAnonymous ? 1 : 0,
    JSON.stringify(finalExtra),
    status,
    id
  );
  cacheInvalidate('posts');

  success(res, { id, status }, '编辑成功');
});

// 删除帖子（软删除）
router.delete('/:id', authRequired, (req, res) => {
  const id = Number(req.params.id);
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(id) as any;
  if (!post) return fail(res, '帖子不存在', 404, 404);

  if (post.user_id !== req.currentUser!.id && req.currentUser!.role !== 'super_admin') {
    return forbidden(res, '只能删除自己的帖子');
  }

  db.prepare("UPDATE posts SET status = 'deleted', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
  cacheInvalidate('posts');
  success(res, null, '删除成功');
});

// 点赞/取消点赞（事务化：likes 表 INSERT/DELETE + posts.like_count UPDATE 原子完成，避免计数漂移）
router.post('/:id/like', authRequired, (req, res) => {
  const id = Number(req.params.id);
  const userId = req.currentUser!.id;
  const result = db.transaction(() => {
    const post = db.prepare("SELECT id, user_id, title FROM posts WHERE id = ? AND status = 'published'").get(id) as any;
    if (!post) return { error: '帖子不存在' } as const;
    const exist = db.prepare('SELECT id FROM likes WHERE user_id = ? AND target_type = ? AND target_id = ?').get(userId, 'post', id);
    let liked: boolean;
    if (exist) {
      db.prepare('DELETE FROM likes WHERE user_id = ? AND target_type = ? AND target_id = ?').run(userId, 'post', id);
      db.prepare('UPDATE posts SET like_count = MAX(0, like_count - 1) WHERE id = ?').run(id);
      liked = false;
    } else {
      db.prepare('INSERT INTO likes (user_id, target_type, target_id) VALUES (?, ?, ?)').run(userId, 'post', id);
      db.prepare('UPDATE posts SET like_count = like_count + 1 WHERE id = ?').run(id);
      liked = true;
    }
    const likeCount = (db.prepare('SELECT like_count FROM posts WHERE id = ?').get(id) as any).like_count;
    return { liked, likeCount, post, justLiked: !exist };
  })();
  if ('error' in result) return fail(res, result.error || '操作失败', 404, 404);
  cacheInvalidate('posts');
  if (result.justLiked && result.post.user_id !== userId) {
    const nickname = req.currentUser?.nickname ?? '某用户';
    const title = result.post.title ?? '该帖子';
    upsertNotification(
      result.post.user_id, 'like', `${nickname} 赞了你的帖子「${title}」`, id
    );
  }
  success(res, { liked: result.liked, likeCount: result.likeCount }, result.liked ? '点赞成功' : '已取消点赞');
});

// 收藏/取消收藏（事务化：favorites 表 INSERT/DELETE + posts.favorite_count UPDATE 原子完成）
router.post('/:id/favorite', authRequired, (req, res) => {
  const id = Number(req.params.id);
  const userId = req.currentUser!.id;
  const result = db.transaction(() => {
    const post = db.prepare("SELECT id, user_id FROM posts WHERE id = ? AND status = 'published'").get(id) as any;
    if (!post) return { error: '帖子不存在' } as const;
    const exist = db.prepare('SELECT id FROM favorites WHERE user_id = ? AND post_id = ?').get(userId, id);
    let favorited: boolean;
    if (exist) {
      db.prepare('DELETE FROM favorites WHERE user_id = ? AND post_id = ?').run(userId, id);
      db.prepare('UPDATE posts SET favorite_count = MAX(0, favorite_count - 1) WHERE id = ?').run(id);
      favorited = false;
    } else {
      db.prepare('INSERT INTO favorites (user_id, post_id) VALUES (?, ?)').run(userId, id);
      db.prepare('UPDATE posts SET favorite_count = favorite_count + 1 WHERE id = ?').run(id);
      favorited = true;
    }
    const favoriteCount = (db.prepare('SELECT favorite_count FROM posts WHERE id = ?').get(id) as any).favorite_count;
    return { favorited, favoriteCount };
  })();
  if ('error' in result) return fail(res, result.error || '操作失败', 404, 404);
  cacheInvalidate('posts');
  success(res, { favorited: result.favorited, favoriteCount: result.favoriteCount }, result.favorited ? '收藏成功' : '已取消收藏');
});

// 举报帖子
router.post('/:id/report', authRequired, (req, res) => {
  const id = Number(req.params.id);
  const { reason } = req.body;
  if (!reason) return fail(res, '请选择举报原因');
  // 长度上限：举报原因会进管理端列表与通知，不设上限可被灌入超长文本（实测 5000 字入库）
  if (typeof reason !== 'string' || reason.length > 200) {
    return fail(res, '举报原因最多 200 字');
  }

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

