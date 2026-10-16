/**
 * AI 助手路由：基于官网内容作答 + 论坛相关讨论推荐
 * 支持非流式 /chat 与 SSE 流式 /chat/stream，带频控与敏感词拦截
 */
import { Router, type Request, type Response } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db, getSetting } from '../db.js';
import { authRequired } from '../middleware/auth.js';
import { aiLimiter } from '../middleware/rateLimit.js';
import { success, fail } from '../utils/response.js';
import { getRiskLevel } from '../utils/sensitive.js';
import { logger } from '../utils/logger.js';
import {
  chatWithAI,
  chatWithAIStream,
  isAiEnabled,
  buildModelChain,
  type AiMessage,
} from '../utils/ai.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// 源码运行（tsx）时位于 api/routes/../knowledge；打包为单文件时回退到 cwd/api/knowledge
const KB_CANDIDATES = [
  path.join(__dirname, '..', 'knowledge', 'official.md'),
  path.join(process.cwd(), 'api', 'knowledge', 'official.md'),
];

const router = Router();

/** 知识库写入路径：取目录存在的第一个候选 */
export function getKbWritePath(): string {
  const found = KB_CANDIDATES.find((p) => fs.existsSync(path.dirname(p)));
  return found ?? KB_CANDIDATES[0]!;
}

/** 读取官网知识库内容 */
function loadKnowledge(): string {
  for (const p of KB_CANDIDATES) {
    try {
      return fs.readFileSync(p, 'utf-8');
    } catch {
      // 尝试下一个候选路径
    }
  }
  logger.error('AI 知识库未找到', { candidates: KB_CANDIDATES.join(' | ') });
  return '';
}

// ---------- 调用量统计（内存计数，重启清零） ----------
function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}
export const aiStats = { date: todayStr(), today: 0, total: 0 };
function bumpStats(): void {
  const today = todayStr();
  if (aiStats.date !== today) {
    aiStats.date = today;
    aiStats.today = 0;
  }
  aiStats.today += 1;
  aiStats.total += 1;
}

// ---------- 频控（内存实现：10 秒间隔，每日 50 次） ----------
const RATE_INTERVAL_MS = 10_000;
const RATE_DAILY_LIMIT = 50;
const rateMap = new Map<number, { lastTs: number; count: number; date: string }>();

function checkRateLimit(userId: number): { ok: boolean; msg?: string } {
  const today = todayStr();
  let entry = rateMap.get(userId);
  if (!entry || entry.date !== today) {
    entry = { lastTs: 0, count: 0, date: today };
    rateMap.set(userId, entry);
  }
  if (Date.now() - entry.lastTs < RATE_INTERVAL_MS) {
    return { ok: false, msg: '提问太频繁啦，请稍等几秒再试' };
  }
  if (entry.count >= RATE_DAILY_LIMIT) {
    return { ok: false, msg: '今日提问次数已达上限（50 次），明天再来吧' };
  }
  entry.lastTs = Date.now();
  entry.count += 1;
  return { ok: true };
}

/**
 * 从问题中提取论坛检索关键词：
 * 英文/数字取连续词块；中文按 2 字滑窗切分（无分词依赖，召回优先，靠命中数排序去噪）
 */
function extractKeywords(question: string): string[] {
  const cleaned = question.replace(/[\s，。！？、；：,.!?;:~～"'"'（）()\[\]{}]/g, '');
  const words = new Set<string>();

  // ASCII 词块
  for (const w of question.match(/[a-zA-Z0-9]{2,}/g) || []) {
    if (w.length <= 20) words.add(w.toLowerCase());
  }

  // 中文 2 字滑窗
  const chinese = cleaned.replace(/[a-zA-Z0-9]/g, '');
  for (let i = 0; i + 2 <= chinese.length; i++) {
    words.add(chinese.slice(i, i + 2));
    if (words.size >= 8) break;
  }

  return Array.from(words).slice(0, 8);
}

interface ForumSource {
  id: number;            // 跳转用的帖子 id
  commentId?: number;    // 评论来源时携带
  title: string;
  excerpt: string;
  section: string;
  likeCount: number;
  commentCount: number;
  createdAt: string;
  type: 'post' | 'comment';
}

/**
 * 检索论坛相关内容：已发布帖子（最多 3 条）+ 活跃评论（最多 2 条）
 * 按命中关键词数 + 热度排序
 */
function searchForumSources(question: string): ForumSource[] {
  const keywords = extractKeywords(question);
  if (keywords.length === 0) return [];

  const postWhere = keywords.map(() => `(p.title LIKE ? OR p.content LIKE ?)`).join(' OR ');
  const postParams: any[] = [];
  for (const kw of keywords) postParams.push(`%${kw}%`, `%${kw}%`);
  const postHits = keywords.map(() => `(CASE WHEN p.title LIKE ? OR p.content LIKE ? THEN 1 ELSE 0 END)`).join(' + ');
  const postHitParams: any[] = [];
  for (const kw of keywords) postHitParams.push(`%${kw}%`, `%${kw}%`);

  const posts = db
    .prepare(
      `SELECT p.id, p.title, p.content, p.like_count, p.comment_count, p.created_at,
              s.name AS section_name
       FROM posts p
       JOIN sections s ON s.id = p.section_id
       JOIN users u ON u.id = p.user_id
       WHERE p.status = 'published' AND u.status != 'banned' AND (${postWhere})
       ORDER BY (${postHits}) DESC, p.is_top DESC, p.like_count DESC, p.created_at DESC
       LIMIT 3`
    )
    .all(...postParams, ...postHitParams) as any[];

  const commentWhere = keywords.map(() => `(c.content LIKE ?)`).join(' OR ');
  const commentParams: any[] = [];
  for (const kw of keywords) commentParams.push(`%${kw}%`);
  const commentHits = keywords.map(() => `(CASE WHEN c.content LIKE ? THEN 1 ELSE 0 END)`).join(' + ');
  const commentHitParams: any[] = [];
  for (const kw of keywords) commentHitParams.push(`%${kw}%`);

  const comments = db
    .prepare(
      `SELECT c.id AS comment_id, c.content AS comment_content, c.created_at AS comment_created,
              p.id AS post_id, p.title AS post_title, s.name AS section_name
       FROM comments c
       JOIN posts p ON p.id = c.post_id
       JOIN sections s ON s.id = p.section_id
       WHERE c.status = 'active' AND p.status = 'published' AND (${commentWhere})
       ORDER BY (${commentHits}) DESC, c.like_count DESC, c.created_at DESC
       LIMIT 2`
    )
    .all(...commentParams, ...commentHitParams) as any[];

  const sources: ForumSource[] = [];

  for (const p of posts) {
    sources.push({
      id: p.id,
      title: p.title,
      excerpt: p.content.length > 120 ? p.content.slice(0, 120) + '…' : p.content,
      section: p.section_name,
      likeCount: p.like_count,
      commentCount: p.comment_count,
      createdAt: p.created_at,
      type: 'post',
    });
  }
  for (const c of comments) {
    sources.push({
      id: c.post_id,
      commentId: c.comment_id,
      title: c.post_title,
      excerpt: c.comment_content.length > 120 ? c.comment_content.slice(0, 120) + '…' : c.comment_content,
      section: c.section_name,
      likeCount: 0,
      commentCount: 0,
      createdAt: c.comment_created,
      type: 'comment',
    });
  }
  return sources.slice(0, 5);
}

/** 组装对话消息（系统提示 + 最近历史 + 当前问题） */
function buildMessages(message: string, history: AiMessage[], knowledge: string, forums: ForumSource[]): AiMessage[] {
  const forumContext = forums
    .map((f, i) => `${i + 1}. [论坛${i + 1}]【${f.type === 'comment' ? '评论' : '帖子'}·${f.section}】${f.title}：${f.excerpt}`)
    .join('\n');

  const systemPrompt = `你是"校园墙"平台的 AI 助手，面向本校学生答疑。

回答规则：
1. 平台规则、板块功能、使用方法类问题：严格依据下方【官网内容】回答，不要编造官网内容里没有的信息。
2. 引用下方【相关论坛讨论】的内容时，在对应句子末尾标注引用编号，格式如 [论坛1]、[论坛3]，编号必须与列表一致。
3. 官网内容与论坛讨论都没有覆盖的问题：如实说明"这个问题我在官网资料里没有找到，建议在互助问答板块发帖求助"。
4. 用简体中文回答，简洁友好，不超过 300 字。

【官网内容】
${knowledge || '（暂无官网内容）'}

【相关论坛讨论】
${forumContext || '（无）'}`;

  const recentHistory = history
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-6)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 1000) }));

  return [
    { role: 'system', content: systemPrompt },
    ...recentHistory,
    { role: 'user', content: message },
  ];
}

/** 公共入参校验：返回错误文案或 null */
function validateInput(message: string): string | null {
  if (!message) return '请输入问题';
  if (message.length > 500) return '问题长度不能超过 500 字';
  if (getRiskLevel(message) === 'reject') return '消息包含违规内容，无法回答';
  return null;
}

function currentModels(): string[] {
  return buildModelChain(getSetting('ai_model'));
}

// ---------- 非流式对话 ----------
router.post('/chat', authRequired, aiLimiter, async (req: Request, res: Response) => {
  const message = String(req.body?.message || '').trim();
  const history: AiMessage[] = Array.isArray(req.body?.history) ? req.body.history : [];

  const invalid = validateInput(message);
  if (invalid) return fail(res, invalid);

  const limited = checkRateLimit(req.currentUser!.id);
  if (!limited.ok) return fail(res, limited.msg!);

  const forums = searchForumSources(message);

  if (!isAiEnabled()) {
    return success(res, {
      reply: forums.length
        ? 'AI 助手暂未启用，为你找到了以下相关论坛讨论：'
        : 'AI 助手暂未启用，暂时无法回答该问题。',
      forums,
    });
  }

  try {
    const messages = buildMessages(message, history, loadKnowledge(), forums);
    const reply = await chatWithAI(messages, 1024, currentModels());
    bumpStats();
    return success(res, { reply, forums });
  } catch (err: any) {
    logger.error('AI 对话失败', { error: err?.message });
    return success(res, {
      reply: forums.length
        ? 'AI 服务暂时不可用，为你找到了以下相关论坛讨论：'
        : 'AI 服务暂时不可用，请稍后再试。',
      forums,
    });
  }
});

// ---------- 流式对话（SSE） ----------
router.post('/chat/stream', authRequired, aiLimiter, async (req: Request, res: Response) => {
  const message = String(req.body?.message || '').trim();
  const history: AiMessage[] = Array.isArray(req.body?.history) ? req.body.history : [];

  // 校验阶段尚未进入 SSE，可直接返回 JSON 错误
  const invalid = validateInput(message);
  if (invalid) return fail(res, invalid);

  const limited = checkRateLimit(req.currentUser!.id);
  if (!limited.ok) return fail(res, limited.msg!);

  const forums = searchForumSources(message);

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = (event: string, data: any) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  // 论坛卡片先送达，前端可立即渲染
  send('forums', forums);

  const fallbackReply = forums.length
    ? 'AI 服务暂时不可用，为你找到了以下相关论坛讨论。'
    : 'AI 服务暂时不可用，请稍后再试。';

  if (!isAiEnabled()) {
    send('delta', { t: forums.length ? 'AI 助手暂未启用，为你找到了以下相关论坛讨论：' : 'AI 助手暂未启用，暂时无法回答该问题。' });
    send('done', { ok: true });
    return res.end();
  }

  try {
    const messages = buildMessages(message, history, loadKnowledge(), forums);
    await chatWithAIStream(
      messages,
      (t) => send('delta', { t }),
      1024,
      currentModels()
    );
    bumpStats();
    send('done', { ok: true });
  } catch (err: any) {
    logger.error('AI 流式对话失败', { error: err?.message });
    send('error', { message: fallbackReply });
  }
  res.end();
});

export default router;
