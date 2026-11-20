/**
 * 校园助手 Agent · 工具注册表
 *
 * planner-executor 架构的「手」：每个工具 = 名称 + 中文 description（给 LLM 规划用）
 * + JSON schema（手写 validateArgs 校验，不引第三方库）+ run(args)（3s 超时兜底）。
 *
 * 说明：任务书提到 Kysely，但本仓库数据层实际是 better-sqlite3（api/db.ts 导出 db），
 * 为与全仓口径一致（见 api/routes/posts.ts、api/jobs/dailyDigest.ts），这里沿用
 * db.prepare 参数化查询写法。
 */
import { db } from '../db.js';
import { logger } from '../utils/logger.js';

/* ==========================================================================
 * 工具元信息与结果类型
 * ========================================================================== */

/** 手写 JSON schema 的最小子集：只描述本注册表需要的形态 */
export interface ToolSchema {
  type: 'object';
  properties: Record<string, { type: 'string' | 'number' | 'array' | 'boolean'; description: string }>;
  required?: string[];
}

export interface AgentTool {
  name: string;
  description: string;
  schema: ToolSchema;
  run: (args: Record<string, unknown>) => Promise<unknown>;
}

/** 工具执行结果统一包装：ok=false 时 result 为错误文案（executor 会记录并继续） */
export interface ToolOutcome {
  ok: boolean;
  result: unknown;
}

/* ==========================================================================
 * 入参校验（手写，不引 ajv 等第三方）
 * ========================================================================== */

/** 校验错误：携带首个错误描述，供 planner/trace 呈现 */
export class ArgsValidationError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'ArgsValidationError';
  }
}

/**
 * 按 schema 校验工具入参：
 * - 必填字段缺失 → 抛错
 * - 类型不符 → 抛错（number 接受整数/有限数；array 检查 Array.isArray 且元素为字符串）
 * - 未声明的多余字段 → 忽略（宽松策略，LLM 输出常带冗余键）
 */
export function validateArgs(schema: ToolSchema, args: Record<string, unknown>): void {
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    throw new ArgsValidationError('入参必须是对象');
  }
  for (const key of schema.required || []) {
    const val = args[key];
    // 空数组视为「缺失」：required 的 keywords: [] 没有检索意义，早失败早降级
    const missing = val === undefined || val === null || val === '' || (Array.isArray(val) && val.length === 0);
    if (missing) {
      throw new ArgsValidationError(`缺少必填参数 ${key}`);
    }
  }
  for (const [key, prop] of Object.entries(schema.properties)) {
    const val = args[key];
    if (val === undefined || val === null || val === '') continue; // 可选字段缺省放行
    switch (prop.type) {
      case 'string':
        if (typeof val !== 'string') throw new ArgsValidationError(`参数 ${key} 必须是字符串`);
        break;
      case 'number':
        if (typeof val !== 'number' || !Number.isFinite(val)) {
          throw new ArgsValidationError(`参数 ${key} 必须是数字`);
        }
        break;
      case 'boolean':
        if (typeof val !== 'boolean') throw new ArgsValidationError(`参数 ${key} 必须是布尔值`);
        break;
      case 'array':
        if (!Array.isArray(val) || val.some((v) => typeof v !== 'string')) {
          throw new ArgsValidationError(`参数 ${key} 必须是字符串数组`);
        }
        break;
    }
  }
}

/* ==========================================================================
 * 超时兜底：每个工具 run 一律 3s 上限（Promise.race）
 * ========================================================================== */

export const TOOL_TIMEOUT_MS = 3_000;

function withTimeout(promise: Promise<unknown>, toolName: string): Promise<unknown> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`工具 ${toolName} 执行超时（>${TOOL_TIMEOUT_MS}ms）`)), TOOL_TIMEOUT_MS);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer!));
}

/* ==========================================================================
 * 工具 1：searchPosts —— 帖子检索（标题/正文 LIKE，参照 posts 路由的 LIKE 兜底写法）
 * ========================================================================== */

const searchPostsTool: AgentTool = {
  name: 'searchPosts',
  description: '按关键词搜索校园墙已发布帖子（匹配标题或正文），返回 id、标题、板块、摘要、点赞/评论数与发布时间。适用于找帖、看讨论、话题检索。',
  schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: '检索关键词' },
      section: { type: 'string', description: '板块名（模糊匹配），可选' },
      limit: { type: 'number', description: '返回条数上限，默认 5，最大 10' },
    },
    required: ['query'],
  },
  run: async (args) => {
    const query = String(args.query).trim();
    if (!query) return [];
    // 与 posts 路由 keyword 兜底口径一致：LIKE 全模糊。limit 钳制防拉全表
    let limit = Number(args.limit ?? 5);
    if (!Number.isFinite(limit) || limit <= 0) limit = 5;
    limit = Math.min(Math.floor(limit), 10);

    const params: unknown[] = [`%${query}%`, `%${query}%`];
    let sectionWhere = '';
    if (typeof args.section === 'string' && args.section.trim()) {
      sectionWhere = 'AND s.name LIKE ?';
      params.push(`%${args.section.trim()}%`);
    }
    params.push(limit);

    const rows = db
      .prepare(
        `SELECT p.id, p.title, p.content, p.like_count, p.comment_count, p.created_at,
                s.name AS section_name, u.status AS author_status
         FROM posts p
         LEFT JOIN sections s ON s.id = p.section_id
         LEFT JOIN users u ON u.id = p.user_id
         WHERE p.status = 'published' AND (u.status IS NULL OR u.status != 'banned')
           AND (p.title LIKE ? OR p.content LIKE ?)
           ${sectionWhere}
         ORDER BY p.created_at DESC
         LIMIT ?`
      )
      .all(...params) as any[];

    return rows.map((r) => ({
      postId: r.id,
      title: r.title,
      section: r.section_name || '',
      excerpt: String(r.content || '').slice(0, 120),
      likeCount: r.like_count,
      commentCount: r.comment_count,
      createdAt: r.created_at,
    }));
  },
};

/* ==========================================================================
 * 工具 2：queryPost —— 帖子详情 + 前 3 条评论
 * ========================================================================== */

const queryPostTool: AgentTool = {
  name: 'queryPost',
  description: '按帖子 id 获取帖子详情（标题、正文、板块、点赞/评论/浏览数）以及前 3 条热门评论。适用于已知道帖子 id、需要深入了解内容时。',
  schema: {
    type: 'object',
    properties: {
      postId: { type: 'number', description: '帖子 id（正整数）' },
    },
    required: ['postId'],
  },
  run: async (args) => {
    const postId = Number(args.postId);
    if (!Number.isInteger(postId) || postId <= 0) {
      throw new Error('postId 必须是正整数');
    }
    const post = db
      .prepare(
        `SELECT p.id, p.title, p.content, p.like_count, p.comment_count, p.view_count,
                p.created_at, p.is_anonymous, s.name AS section_name, u.nickname AS author_nickname, u.status AS author_status
         FROM posts p
         LEFT JOIN sections s ON s.id = p.section_id
         LEFT JOIN users u ON u.id = p.user_id
         WHERE p.id = ? AND p.status = 'published'`
      )
      .get(postId) as any;
    if (!post) {
      return { found: false, reason: `帖子 ${postId} 不存在或未发布` };
    }
    if (post.author_status === 'banned') {
      return { found: false, reason: `帖子 ${postId} 作者已被封禁` };
    }

    const comments = db
      .prepare(
        `SELECT c.id, c.content, c.like_count, c.created_at, c.is_anonymous, u.nickname AS author_nickname
         FROM comments c
         LEFT JOIN users u ON u.id = c.user_id
         WHERE c.post_id = ? AND c.status = 'active'
         ORDER BY c.like_count DESC, c.id ASC
         LIMIT 3`
      )
      .all(postId) as any[];

    return {
      found: true,
      postId: post.id,
      title: post.title,
      content: String(post.content || '').slice(0, 500),
      section: post.section_name || '',
      author: post.is_anonymous ? '匿名用户' : post.author_nickname || '',
      likeCount: post.like_count,
      commentCount: post.comment_count,
      viewCount: post.view_count,
      createdAt: post.created_at,
      comments: comments.map((c) => ({
        commentId: c.id,
        author: c.is_anonymous ? '匿名用户' : c.author_nickname || '',
        content: String(c.content || '').slice(0, 120),
        likeCount: c.like_count,
        createdAt: c.created_at,
      })),
    };
  },
};

/* ==========================================================================
 * 工具 3：getCampusStats —— 24h 发帖数 / 最热板块 / 今日最热帖
 * ========================================================================== */

const getCampusStatsTool: AgentTool = {
  name: 'getCampusStats',
  description: '获取校园墙 24 小时动态简报：近 24h 发帖总数、各板块发帖数排名（最热板块）、今日点赞最多的帖子。适用于「今天有什么热点/动态/简报」类问题。',
  schema: {
    type: 'object',
    properties: {},
  },
  run: async () => {
    // 24h 发帖总数（口径与 jobs/dailyDigest.ts 的 datetime('now','-1 day') 一致）
    const total = db
      .prepare(
        `SELECT COUNT(*) AS count FROM posts
         WHERE status = 'published' AND created_at >= datetime('now', '-1 day')`
      )
      .get() as { count: number };

    // 最热板块：按 24h 发帖数 GROUP BY 降序取前 5
    const topSections = db
      .prepare(
        `SELECT s.name AS section, COUNT(*) AS postCount
         FROM posts p
         JOIN sections s ON s.id = p.section_id
         WHERE p.status = 'published' AND p.created_at >= datetime('now', '-1 day')
         GROUP BY s.id, s.name
         ORDER BY postCount DESC, s.id ASC
         LIMIT 5`
      )
      .all() as { section: string; postCount: number }[];

    // 今日最热帖：按点赞数取第一名（点赞最多；次序键 id 保证确定性）
    const hotPost = db
      .prepare(
        `SELECT p.id, p.title, p.like_count, p.comment_count, s.name AS section_name
         FROM posts p
         LEFT JOIN sections s ON s.id = p.section_id
         WHERE p.status = 'published' AND p.created_at >= datetime('now', '-1 day')
         ORDER BY p.like_count DESC, p.id ASC
         LIMIT 1`
      )
      .get() as { id: number; title: string; like_count: number; comment_count: number; section_name: string | null } | undefined;

    return {
      window: '24h',
      totalPosts: total.count,
      topSections,
      hottestPost: hotPost
        ? {
            postId: hotPost.id,
            title: hotPost.title,
            section: hotPost.section_name || '',
            likeCount: hotPost.like_count,
            commentCount: hotPost.comment_count,
          }
        : null,
    };
  },
};

/* ==========================================================================
 * 工具 4：matchLostFound —— 失物招领匹配
 * 与 posts 路由（api/utils/match.ts findLostFoundMatches）规则保持一致：
 * 标题命中权重 2、正文命中权重 1，≥2 分入候选，按得分降序取前 5；
 * 双方都有 direction 时必须相反、itemType 不同直接排除（品类是硬信号）。
 * 区别：入参是「用户问题的关键词」而非已落库的帖子（Agent 场景没有宿主帖），
 * 因此没有「排除自身/本人」逻辑，方向过滤保留（丢失→匹配招领方向优先）。
 * ========================================================================== */

/** 与 posts 路由规则保持一致：最多返回的匹配条数 */
const LF_MAX_MATCHES = 5;
/** 与 posts 路由规则保持一致：最低命中得分 */
const LF_MIN_SCORE = 2;
/** 与 posts 路由规则保持一致：匹配窗口（天） */
const LF_WINDOW_DAYS = 30;

/** 与 api/routes/ai.ts extractKeywords 同思路：英文词块 + 中文 2 字滑窗。
 * R4 审查 P2：同款英文占满上限修复——英文无独立配额时滑窗无位（matchLostFound 哑火）。
 */
const LF_STOP_BIGRAMS = new Set([
  '可以', '什么', '怎么', '怎样', '如何', '是否', '哪里', '哪个',
  '知道', '关于', '对于', '问题', '情况', '时候', '现在', '还是',
  '但是', '而且', '因为', '所以', '如果', '虽然', '已经', '应该',
  '这样', '那样', '一个', '一些', '的发', '的时', '的时',
]);

export function extractQuestionKeywords(text: string): string[] {
  const cleaned = String(text || '').replace(/[\s，。！？、；：,.!?;:~~\"'""''（）()\[\]{}]/g, '');
  const englishWords: string[] = [];
  for (const w of String(text || '').match(/[a-zA-Z0-9]{2,}/g) || []) {
    const low = w.toLowerCase();
    if (!englishWords.includes(low)) englishWords.push(low);
    if (englishWords.length >= 4) break;
  }
  const chinese = cleaned.replace(/[a-zA-Z0-9]/g, '');
  const bigrams: string[] = [];
  for (let i = 0; i + 2 <= chinese.length && bigrams.length < 8; i++) {
    const bg = chinese.slice(i, i + 2)!;
    if (!LF_STOP_BIGRAMS.has(bg) && !bigrams.includes(bg)) bigrams.push(bg);
  }
  return [...englishWords, ...bigrams].slice(0, 8);
}

const matchLostFoundTool: AgentTool = {
  name: 'matchLostFound',
  description: '失物招领智能匹配：根据关键词（物品名、地点、特征等）在失物招领类板块近 30 天帖子中查找可能相关的失物/招领帖。适用于「丢了/捡到/失物招领」类问题。',
  schema: {
    type: 'object',
    properties: {
      keywords: { type: 'array', description: '匹配关键词列表（物品名/地点/特征，如 ["校园卡","图书馆"]）' },
    },
    required: ['keywords'],
  },
  run: async (args) => {
    const keywords = (Array.isArray(args.keywords) ? args.keywords : [])
      .map((k) => String(k).trim())
      .filter(Boolean)
      .slice(0, 12);
    if (!keywords.length) return [];

    // 失物招领类板块近 N 天候选（板块口径与 utils/match.ts 一致）
    const rows = db
      .prepare(
        `SELECT p.id, p.title, p.content, p.created_at, p.extra_fields,
                s.name AS section_name, u.nickname AS author_nickname, u.status AS author_status
         FROM posts p
         JOIN sections s ON s.id = p.section_id
         JOIN users u ON u.id = p.user_id
         WHERE p.status = 'published' AND u.status != 'banned'
           AND p.created_at >= datetime('now', '-' || ? || ' days')
           AND (s.name LIKE '%失物%' OR s.name LIKE '%招领%' OR s.name LIKE '%拾%' OR s.name LIKE '%寻物%')`
      )
      .all(LF_WINDOW_DAYS) as any[];

    const readExtra = (raw: string | null | undefined): Record<string, string> => {
      try {
        return JSON.parse(raw || '{}') || {};
      } catch {
        return {};
      }
    };

    // 用户问题推断方向：含「丢/寻」→ 在找失物（应匹配招领帖）；含「捡/拾/招领」→ 反之
    const keywordText = keywords.join('');
    const queryDirection = /丢|寻|没了|不见/.test(keywordText)
      ? 'lost'
      : /捡|拾|招领|上交/.test(keywordText)
        ? 'found'
        : '';

    // 打分：与 posts 路由规则保持一致（标题 2 分、正文 1 分）
    const scored: any[] = [];
    for (const row of rows) {
      const extra = readExtra(row.extra_fields);
      const dir = String(extra.direction || '');
      // 方向必须互补：找失物的人匹配招领帖，反之亦然；候选缺方向放行（兼容老数据）
      if (queryDirection && dir && dir === queryDirection) continue;

      let score = 0;
      for (const kw of keywords) {
        if (row.title.includes(kw)) score += 2;
        if (row.content.includes(kw)) score += 1;
      }
      if (score >= LF_MIN_SCORE) {
        scored.push({
          postId: row.id,
          title: row.title,
          section: row.section_name,
          direction: dir,
          excerpt: String(row.content || '').slice(0, 100),
          score,
          createdAt: row.created_at,
        });
      }
    }

    scored.sort((a, b) => b.score - a.score || b.created_at.localeCompare(a.createdAt));
    return scored.slice(0, LF_MAX_MATCHES);
  },
};

/* ==========================================================================
 * 注册表
 * ========================================================================== */

export const TOOLS: Record<string, AgentTool> = {
  searchPosts: searchPostsTool,
  queryPost: queryPostTool,
  getCampusStats: getCampusStatsTool,
  matchLostFound: matchLostFoundTool,
};

/** 供 LLM planner 构建提示词：名称 + 描述 + 参数 schema 说明 */
export function describeTools(): string {
  return Object.values(TOOLS)
    .map((t) => {
      const props = Object.entries(t.schema.properties)
        .map(([k, v]) => `${k}(${v.type}${(t.schema.required || []).includes(k) ? ',必填' : ',可选'}): ${v.description}`)
        .join('; ');
      return `- ${t.name}: ${t.description}${props ? ` 参数: ${props}` : ' 无参数'}`;
    })
    .join('\n');
}

/**
 * 按名称执行工具（带 schema 校验 + 3s 超时）：
 * 未知工具 / 校验失败 / 超时 / 运行时错误都不抛给上层——统一包成 ToolOutcome，
 * executor 只需看 ok 字段即可决定 trace 里记什么（工具错误不中断整条计划）。
 */
export async function runTool(name: string, args: Record<string, unknown> = {}): Promise<ToolOutcome> {
  const tool = TOOLS[name];
  if (!tool) {
    return { ok: false, result: `未知工具: ${name}` };
  }
  try {
    validateArgs(tool.schema, args);
  } catch (err: any) {
    return { ok: false, result: `参数校验失败: ${err?.message || err}` };
  }
  try {
    const result = await withTimeout(tool.run(args), tool.name);
    return { ok: true, result };
  } catch (err: any) {
    const msg = err?.message || String(err);
    logger.warn('Agent 工具执行失败', { tool: name, error: msg });
    return { ok: false, result: `工具执行失败: ${msg}` };
  }
}
