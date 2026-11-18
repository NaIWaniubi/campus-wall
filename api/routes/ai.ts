/**
 * AI 助手路由：基于官网内容作答 + 论坛相关讨论推荐
 * 支持非流式 /chat 与 SSE 流式 /chat/stream，带频控与敏感词拦截
 */
import { Router, type Request, type Response } from 'express';
import { bumpStats, checkRateLimit } from './ai/usage.js';
import { extractTags, extractPrice } from './ai/text.js';
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
  isAiUsable,
  isAiEnabled,
  buildModelChain,
  type AiMessage,
  type AiCallOptions,
} from '../utils/ai.js';
import { retrieve, type RagSource } from '../rag/retrieve.js';
import { inspectInput, sanitizeOutput, REJECT_TEMPLATE, type GuardMeta } from '../ai/guard.js';

/** RAG 检索（失败静默回退为空 → 走原有知识库口径，不阻塞对话） */
async function safeRetrieve(message: string): Promise<RagSource[]> {
  try {
    return await retrieve(message);
  } catch (err: any) {
    logger.warn('RAG 检索失败，回退知识库模式', { error: err?.message });
    return [];
  }
}

/** 护栏输入检查（助手对话入口共用）：high 直接拒答，medium 用剥离文本继续 */
function guardInput(message: string): { blocked: boolean; text: string; meta: GuardMeta } {
  const v = inspectInput(message);
  const meta: GuardMeta = { inputLevel: v.level, rewritten: false, redactedCount: 0 };
  if (v.level === 'high') return { blocked: true, text: message, meta };
  return { blocked: false, text: v.level === 'medium' ? v.sanitized.trim() : message, meta };
}

/**
 * 护栏输出净化：风险改写 + 幻觉红线。
 *
 * 系统里并存两套引用编号：
 * - RAG 资料引用：[n]，编号来自 ragSources
 * - 论坛讨论引用：[论坛N]，编号来自 forums
 * 红线若只认一套，另一套的编造引用就 100% 存活（原实现只认 [n]，
 * 而非 RAG 路径的提示词要求输出 [论坛N] → 编造引用原样进前端）。
 * 现在两套分别校验：各用自己的合法集，越界即整句剔除。
 */
function guardOutput(
  reply: string,
  ragSources: RagSource[],
  meta: GuardMeta,
  forums: ForumSource[] = [],
): string {
  const validRefs = ragSources.map((s) => s.ref);
  const validForumRefs = forums.map((_, i) => i + 1);
  // 始终携带 validRefs（含空数组）：∅ 集下任何 [n] 视为编造，全句剔除
  let v = sanitizeOutput(reply, { validRefs, refScheme: 'rag' });
  // 论坛引用单独一轮：[论坛N] 用论坛列表的编号空间校验
  v = sanitizeOutput(v.text, { validRefs: validForumRefs, refScheme: 'forum' });
  meta.rewritten = v.rewritten;
  meta.redactedCount = v.redactedCount;
  return v.text;
}

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


/**
 * 无 AI Key 时的站内检索兜底：不编造答案，只用官网知识库与论坛检索结果作答。
 * 让「AI 助手」在纯离线/未配置网关的环境也保持可用，而不是一句「暂未启用」。
 */
function localRetrievalAnswer(message: string, knowledge: string, forums: ForumSource[]): string {
  const lower = message.toLowerCase();
  const grams = new Set<string>();
  for (const w of lower.match(/[a-z0-9]{2,}/g) ?? []) grams.add(w);
  const cjk = message.replace(/[^一-龥]/g, '');
  for (let i = 0; i + 2 <= cjk.length; i++) grams.add(cjk.slice(i, i + 2));

  // 知识库按空行/标题切段，按「命中词数 / 段长」排序，取最相关的一段
  const paras = knowledge
    .split(/\n{2,}|(?=^#{1,4}\s)/m)
    .map((t) => t.replace(/^#{1,4}\s*/gm, '').trim())
    .filter((t) => t.length >= 12 && t.length <= 600);

  let best = '';
  let bestScore = 0;
  for (const para of paras) {
    let hit = 0;
    for (const g of grams) if (para.toLowerCase().includes(g)) hit++;
    const score = hit / Math.sqrt(para.length);
    if (score > bestScore) { bestScore = score; best = para; }
  }

  const parts: string[] = [];
  if (bestScore >= 0.35 && best) {
    parts.push(`根据平台说明：${best.replace(/\s+/g, ' ').slice(0, 220)}`);
  }
  if (forums.length) {
    parts.push(`站内找到 ${forums.length} 条相关讨论，已列在下方，可直接点开查看。`);
  }
  if (!parts.length) {
    parts.push('这个问题我在站内资料里没有找到直接答案。建议到「互助问答」板块发帖，通常很快会有同学回复。');
  }
  parts.push('（当前为站内检索模式，未接入在线大模型）');
  return parts.join('\n\n');
}

/** 组装对话消息（系统提示 + 最近历史 + 当前问题） */
function buildMessages(message: string, history: AiMessage[], knowledge: string, forums: ForumSource[], ragSources: RagSource[] = []): AiMessage[] {
  const forumContext = forums
    .map((f, i) => `${i + 1}. [论坛${i + 1}]【${f.type === 'comment' ? '评论' : '帖子'}·${f.section}】${f.title}：${f.excerpt}`)
    .join('\n');

  // RAG 检索资料块：有命中时以「仅基于资料 + 引用 [n]」口径替换弱知识库上下文
  const ragBlock = ragSources.length
    ? ragSources
        .map((s) => `[${s.ref}]【${s.title}】${s.snippet}`)
        .join('\n')
    : '';

  const ragRules = ragSources.length
    ? `1. 严格基于下方【检索资料】回答，每个关键结论在句末标注引用编号，格式 [1]、[2]，编号必须与资料列表一致。
2. 检索资料未涵盖的问题：如实说明"这个问题我在校园资料里没有找到，建议在互助问答板块发帖求助"，不要编造。`
    : `1. 平台规则、板块功能、使用方法类问题：严格依据下方【官网内容】回答，不要编造官网内容里没有的信息。
2. 引用下方【相关论坛讨论】的内容时，在对应句子末尾标注引用编号，格式如 [论坛1]、[论坛3]，编号必须与列表一致。
3. 官网内容与论坛讨论都没有覆盖的问题：如实说明"这个问题我在官网资料里没有找到，建议在互助问答板块发帖求助"。`;

  const systemPrompt = `你是"校园墙"平台的 AI 助手，面向本校学生答疑。

回答规则：
${ragRules}
${ragSources.length ? '3.' : '4.'} 用简体中文回答，简洁友好，不超过 300 字。
${ragSources.length ? `\n【检索资料】\n${ragBlock}\n` : ''}
【官网内容】
${knowledge || '（暂无官网内容）'}

【相关论坛讨论】
${forumContext || '（无）'}`;

  // history 也要过注入护栏：此前只检查 req.body.message，
  // 攻击者把注入放进 history[].content 就能直接进入 LLM 上下文（slice(-6) 全量带入）。
  // high → 整条 history 该条丢弃（不整轮拒答，避免历史里一条脏数据就废掉整轮对话）；
  // medium → 剥离注入片段后带入。
  const recentHistory = history
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-6)
    .map((m) => {
      const raw = m.content.slice(0, 1000);
      const v = inspectInput(raw);
      if (v.level === 'high') return null;          // 丢弃该条历史
      return { role: m.role, content: v.level === 'medium' ? v.sanitized.trim() : raw };
    })
    .filter((m): m is { role: 'user' | 'assistant'; content: string } => m !== null);

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

/**
 * 当前可用模型链。
 * @param fastOnly 前台「当面等」场景传 true：剔除 :free 慢推理档（实测 ~35s），
 *   让请求在 auth 短路后 1–2s 内落到离线套版，而不是干等满预算。
 *   后台任务（简报）不传，保留免费档真实出稿。
 */
function currentModels(fastOnly = false): string[] {
  const chain = buildModelChain(getSetting('ai_model'));
  return fastOnly ? chain.filter((m) => !m.endsWith(':free')) : chain;
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
  const ragSources = await safeRetrieve(message);

  // 护栏输入检查：高危注入/敏感词直接拒答，不调 LLM
  const g = guardInput(message);
  if (g.blocked) {
    return success(res, {
      reply: REJECT_TEMPLATE,
      forums,
      sources: ragSources,
      guard: g.meta,
    });
  }
  const cleanMessage = g.text;

  if (!isAiUsable()) {
    return success(res, {
      reply: localRetrievalAnswer(cleanMessage, loadKnowledge(), forums),
      forums,
      sources: ragSources,
      guard: g.meta,
    });
  }

  try {
    const messages = buildMessages(cleanMessage, history, loadKnowledge(), forums, ragSources);
    const rawReply = await chatWithAI(messages, 1024, currentModels(true));
    bumpStats();
    const reply = guardOutput(rawReply, ragSources, g.meta, forums);
    return success(res, { reply, forums, sources: ragSources, guard: g.meta });
  } catch (err: any) {
    logger.error('AI 对话失败', { error: err?.message });
    return success(res, {
      reply: localRetrievalAnswer(cleanMessage, loadKnowledge(), forums),
      forums,
      sources: ragSources,
      guard: g.meta,
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
  const ragSources = await safeRetrieve(message);

  // 护栏输入检查：高危直接走拒答模板流（不调 LLM），medium 剥离后继续
  const g = guardInput(message);
  const cleanMessage = g.text;

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
  // RAG 引用资料：前端渲染「引用来源」chips，回答中的 [n] 与之对应
  send('sources', { sources: ragSources });
  // 护栏 meta：前端可解释性展示（内容安全：已过滤 n 处）
  send('meta', { guard: g.meta });

  // 高危注入：拒答模板直出
  if (g.blocked) {
    send('delta', { t: REJECT_TEMPLATE });
    send('done', { ok: true });
    return res.end();
  }

  // 在线模型不可用时用站内检索兜底（与 /chat 的 catch 行为一致），不丢上下文
  const fallbackReply = localRetrievalAnswer(cleanMessage, loadKnowledge(), forums);

  if (!isAiUsable()) {
    // degraded 标识：前端展示「站内检索回答」角标，用户能分辨这不是在线大模型
    send('delta', { t: fallbackReply });
    send('done', { ok: true, degraded: true });
    return res.end();
  }

  try {
    const messages = buildMessages(cleanMessage, history, loadKnowledge(), forums, ragSources);
    // 流式输出需要整体缓冲后过护栏（幻觉红线与风险改写按句处理，流式逐字改写会造成前后矛盾）
    let full = '';
    await chatWithAIStream(
      messages,
      (t) => {
        full += t;
      },
      1024,
      currentModels(true)
    );
    bumpStats();
    const reply = guardOutput(full, ragSources, g.meta, forums);
    send('delta', { t: reply });
    send('done', { ok: true, guard: g.meta });
  } catch (err: any) {
    logger.error('AI 流式对话失败', { error: err?.message });
    // 降级到站内兜底同样带标识
    send('error', { message: fallbackReply, degraded: true });
  }
  res.end();
});


/* ==========================================================================
 * V3 AI 产品层：把大模型用进「发帖 → 读帖 → 看今天」主链路，而不是角落里的聊天框。
 * 三个能力，每个都有规则化离线兜底：没有 Key / 网关挂了 / 模型抽风时依然给出可用结果。
 *   POST /ai/draft      发布助手：一句话 → 标题 / 正文 / 标签 / 板块 / 价格
 *   POST /ai/summarize  帖子划重点：3 条要点 + 交易风险提示
 *   GET  /ai/digest     今日简报：当日动态概览 + 最热板块 + 一条提醒
 * ========================================================================== */

/** 板块关键词表：用于「一句话 → 板块」的规则判定（离线可用） */
export const SECTION_HINTS: Array<{ id: number; name: string; words: string[] }> = [
  { id: 1, name: '二手交易', words: ['出', '出售', '转', '转让', '卖', '闲置', '求购', '收', '全新', '成新', '价格', '低价', '包邮'] },
  { id: 2, name: '失物招领', words: ['丢', '丢失', '丢了', '捡', '捡到', '失物', '寻物', '认领', '钱包', '校园卡', '身份证', '钥匙', '耳机'] },
  { id: 3, name: '表白墙', words: ['表白', '喜欢', '心动', '暗恋', '寻人', '祝福', 'crush', '想认识'] },
  { id: 4, name: '吐槽树洞', words: ['吐槽', '无语', '难吃', '好吃', '食堂', '避雷', '红榜', '黑榜', 'emo', '破防', '宿舍'] },
  { id: 5, name: '互助问答', words: ['怎么', '如何', '请问', '求教', '求助', '选课', '考试', '考研', '复习', '资料', '建议', '有没有人知道'] },
  { id: 6, name: '校园活动', words: ['活动', '讲座', '演出', '比赛', '报名', '社团', '招新', '晚会', '志愿', '门票'] },
  { id: 7, name: '拼车', words: ['拼车', '顺风', '返校', '机场', '高铁', '火车站', '搭车', '同路', '出发'] },
  { id: 8, name: '组队', words: ['组队', '开黑', '搭子', '队友', '一起', '自习', '竞赛', '缺人', '找人一起'] },
];

/** 风险词：只做提示，不做拦截（拦截交给 sensitive.ts 的发布校验） */
const RISK_PATTERNS: Array<{ re: RegExp; note: string }> = [
  { re: /(押金|保证金|定金|手续费|解冻费|激活费|先付款|先转账)/, note: '出现「先交押金/保证金」类要求，二手交易中是典型骗局特征' },
  { re: /(私下|加 ?wx|加微信|扫码|点链接|二维码|银行卡|转账|汇款|代付|口令红包)/, note: '引导离开平台私下转账或扫码，转账后资金无法追回' },
  { re: /(刷单|兼职日结|返利|垫付|做任务|高回报|稳赚|投资|理财)/, note: '刷单返利类话术，属于高发诈骗类型' },
  { re: /(裸聊|色情|约炮|贷款|套现|代开发票|代考|代写论文)/, note: '可能涉及违规内容，发布前请再确认' },
];


/** 用关键词命中数给板块打分，返回最可能的板块 id（无命中返回 fallbackId 或 null） */
export function guessSectionId(raw: string, fallbackId?: number | null): number | null {
  let best: { id: number; score: number } | null = null;
  for (const s of SECTION_HINTS) {
    let score = 0;
    for (const w of s.words) if (raw.includes(w)) score += w.length >= 2 ? 1 : 0.5;
    if (score > 0 && (!best || score > best.score)) best = { id: s.id, score };
  }
  return best?.id ?? fallbackId ?? null;
}



/** 离线划重点：标题 2 字滑窗命中 + 句长 + 位置权重，抽取式摘要 */
export function extractiveSummary(title: string, text: string, limit = 3): string[] {
  const titleGrams = new Set<string>();
  const tc = title.replace(/[^\u4e00-\u9fa5A-Za-z0-9]/g, '');
  for (let i = 0; i + 2 <= tc.length; i++) titleGrams.add(tc.slice(i, i + 2));

  const sentences = text
    .split(/[。！？!?；;\n]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 6);

  const scored = sentences.map((sen, idx) => {
    let hit = 0;
    for (const g of titleGrams) if (sen.includes(g)) hit++;
    const posBonus = idx === 0 ? 1.2 : idx === 1 ? 0.5 : 0;
    return { sen, score: hit * 1.5 + Math.min(sen.length, 60) / 60 + posBonus };
  });

  scored.sort((a, b) => b.score - a.score);
  const picked: string[] = [];
  for (const { sen } of scored) {
    if (picked.some((p) => p.includes(sen) || sen.includes(p))) continue;
    picked.push(sen.length > 46 ? sen.slice(0, 46) + '…' : sen);
    if (picked.length >= limit) break;
  }
  if (!picked.length && text.trim()) picked.push(text.trim().slice(0, 46) + '…');
  return picked;
}

/** 风险提示：命中即给 note */
export function detectRisk(text: string): { level: 'low' | 'medium' | 'high'; note: string | null } {
  for (const p of RISK_PATTERNS) {
    if (p.re.test(text)) return { level: 'high', note: p.note };
  }
  if (/\d{7,}|\bwx\b|微信/.test(text)) {
    return { level: 'medium', note: '正文含联系方式，建议先在平台内沟通，避免私下先款' };
  }
  return { level: 'low', note: null };
}

/** 宽容 JSON 提取：模型爱把 JSON 包进 ```json 或前后多说话 */
export function parseJsonLoose(text: string): any | null {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced && fenced[1] ? fenced[1] : text).trim();
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** 结构化字段抽取（离线套版用）：只抽取原文里确实出现的，绝不编造 */
// 地点 = 可选「≤8 个逐字校验的实义字」+ 场所后缀（长词在前）。
// 每个前缀字都要过虚词黑名单，「昨天下午在操场」到「在」即断，不会吞出巨型假地点。
const LOC_STOP = '在了的往向从到对跟和与是这那哪几个么吗呢吧啊呀有要能过给被把叫让做作每两去'
const OFFLINE_LOC_RE = new RegExp(
  '((?:(?![' + LOC_STOP + '])[\\u4e00-\\u9fa5A-Za-z0-9]){0,8}'
  + '(?:体育馆|教学楼|实验楼|行政楼|图书馆|快递驿站|自习室|研讨室|操场|食堂|浴室|超市|驿站|车站|地铁站|机场|广场|宿舍|中心|礼堂|剧场|楼|栋|馆|舍|室|门|站))'
);
const OFFLINE_TIME_HEAD = /(今天|明天|后天|昨天|前天|昨晚|今夜|今晚|今早|凌晨|中午|上午|下午|晚上|早上|周[一二三四五六日天]|星期[一二三四五六日天]|礼拜[一二三四五六日天]|\d{1,2}月\d{1,2}[日号]?|[上下]午\s*\d{1,2}(?:[:：]\d{2})?|\d{1,2}[:：]\d{2}|[零一二三四五六七八九十两]{1,3}\s*点(?:半|[零一二三四五六七八九十\d]{1,2}分)?|\d{1,2}\s*点(?:半|\d{1,2}分)?)/;
// 相邻时间词缝合：「昨天下午」分开命中时拼回完整时间
const TIME_TAIL_RE = /^\s*的?(上午|下午|中午|晚上|傍晚|凌晨|早上)/;
function extractOfflineTime(raw: string): string | null {
  const m = raw.match(OFFLINE_TIME_HEAD);
  if (!m || m.index == null) return null;
  let val = (m[1] ?? '').trim();
  const tail = raw.slice(m.index + m[0].length).match(TIME_TAIL_RE);
  if (tail) val += tail[1] ?? '';
  return val;
}
const OFFLINE_CONTACT_RE =
  /(1[3-9]\d{9}|\d{7,11}|(?:微信|weixin|wx|QQ|q群|扣扣)\s*[:：]?\s*[A-Za-z0-9_-]{4,15}|[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,})/i;
const OFFLINE_ITEM_LEXICON = [
  '校园卡', '一卡通', '饭卡', '身份证', '学生证', '钥匙', '钱包', '蓝牙耳机', '耳机', '手机', '平板',
  '电脑', '笔记本', '显示器', '水杯', '保温杯', '雨伞', '自行车', '电动车', '充电宝', '背包', '帽子',
  '外套', '课本', '资料', '宠物', '猫', '狗',
];
const OFFLINE_COND_RE = /(全新|九五成新|九成新|八成新|七成新|成新)/;

function extractOfflineItem(raw: string): string | null {
  const lower = raw.toLowerCase();
  for (const it of OFFLINE_ITEM_LEXICON) {
    if (lower.includes(it.toLowerCase())) return it;
  }
  return null;
}

/**
 * 组装离线结构化字段（按板块挑选相关项，顺序即展示顺序）。
 * 返回 [标签, 值] 列表；空数组表示原文信息太少，不值得套版。
 */
function offlineFields(sectionId: number | null, raw: string, price: number | null): Array<[string, string]> {
  const locRaw = raw.match(OFFLINE_LOC_RE)?.[1] ?? null;
  // 只匹配到光杆后缀（「哪个楼」→「楼」）视为噪声
  const loc = locRaw && locRaw.length >= 2 ? locRaw : null;
  const time = extractOfflineTime(raw);
  const contact = raw.match(OFFLINE_CONTACT_RE)?.[1]?.trim() ?? null;
  const item = extractOfflineItem(raw);
  const cond = raw.match(OFFLINE_COND_RE)?.[1] ?? null;
  const pairs = new Map<string, string>();
  if (item) pairs.set('物品', item);
  if (price != null) pairs.set('价格', `¥${price}`);
  if (cond) pairs.set('成色', cond);
  if (time) pairs.set('时间', time);
  if (loc) pairs.set('地点', loc);
  if (contact) pairs.set('联系方式', contact);
  // 失物招领额外标注意向（捡到 or 丢失），其余板块按通用字段
  const rows: Array<[string, string]> = [];
  if (sectionId === 2) {
    // 「丢了校园卡，捡到请联系」同时含两个方向词 —— 以首现者为准（那才是发帖人立场）
    const iFound = raw.search(/[捡拾]/);
    const iLost = raw.search(/[丢忘落]|不见/);
    if (iLost >= 0 && (iFound < 0 || iLost < iFound)) rows.push(['状态', '丢失寻找']);
    else if (iFound >= 0) rows.push(['状态', '捡到待认领']);
  }
  // 交易/拼车把价格提前，读起来更像正文
  const order = sectionId === 1 || sectionId === 7
    ? ['物品', '价格', '成色', '时间', '地点', '联系方式']
    : sectionId === 2
      ? ['物品', '时间', '地点', '联系方式']
      : ['时间', '地点', '物品', '价格', '成色', '联系方式'];
  for (const key of order) {
    const v = pairs.get(key);
    if (v) rows.push([key, v]);
  }
  return rows;
}

/** 标题：板块前缀 + 核心（物品/成色/价格），整体 ≤24，超了就退回首行截断 */
function offlineTitle(sectionName: string | null, fields: Array<[string, string]>, firstLine: string): string {
  const item = fields.find((f) => f[0] === '物品')?.[1];
  const price = fields.find((f) => f[0] === '价格')?.[1];
  const cond = fields.find((f) => f[0] === '成色')?.[1];
  const prefix = sectionName ? `【${sectionName}】` : '';
  let core = item ? `${cond ? cond + ' ' : ''}${item}${price ? ' ' + price : ''}` : firstLine.slice(0, 16);
  if (!core.trim()) core = firstLine.slice(0, 16);
  const full = prefix + core;
  if (full.length <= 24) return full;
  return (prefix + core).slice(0, 23) + '…';
}

/** 情绪板块（表白/吐槽）不套结构化清单，避免把有感情的话削成表格 */
function isEmotionalSection(id: number | null): boolean {
  return id === 3 || id === 4;
}

/** 规则版成稿：首行截断做标题 + 抽标签 + 猜板块 + 抽价格 */
export function ruleDraft(raw: string, sectionId?: number | null) {
  const text = raw.replace(/\s+/g, ' ').trim();
  const firstLine = (raw.split(/\n/)[0] || text).trim();
  const sid = guessSectionId(text, sectionId);
  const sectionName = SECTION_HINTS.find((s) => s.id === sid)?.name ?? null;
  const price = extractPrice(text);
  const fields = isEmotionalSection(sid) ? [] : offlineFields(sid, text, price);

  const title = offlineTitle(sectionName, fields, firstLine) || '新动态';
  // 正文：保留用户原话，再附「📌 结构化信息」（≥1 个字段才加），短内容仍给补充提示
  let content = text;
  if (fields.length >= 1) {
    const block = fields.map((f) => `📌 ${f[0]}：${f[1]}`).join('\n');
    content = `${text}\n\n${block}`;
  }
  if (text.length < 12) {
    content += '\n\n（还想补充：物品成色 / 期望价格 / 见面地点 / 联系方式）';
  }
  // 标签：结构化字段里的干净词（物品/地点）作种子，其余交给词表/价格/ASCII 抽取
  const seeds: string[] = [];
  for (const key of ['物品', '地点']) {
    const v = fields.find((f) => f[0] === key)?.[1];
    if (v && v.length >= 2) seeds.push(v);
  }
  const tags = extractTags(text, 4, seeds);
  return { title, content, tags, sectionId: sid, sectionName, price, fields };
}

// ---------- 1. 发布助手：一句话 → 完整草稿 ----------
router.post('/draft', authRequired, aiLimiter, async (req: Request, res: Response) => {
  const raw = String(req.body?.raw || '').trim();
  const sectionId = req.body?.sectionId ? Number(req.body.sectionId) : null;
  if (!raw) return fail(res, '先写一句话，AI 才能帮你成稿');
  if (raw.length > 600) return fail(res, '一句话最长 600 字');
  if (getRiskLevel(raw) === 'reject') return fail(res, '内容包含违规词，请修改后再试');

  const base = ruleDraft(raw, sectionId);
  if (!isAiUsable()) return success(res, { ...base, offline: true });

  try {
    const sys = '你是校园墙的发布助手。把用户的一句话扩写成一条规范的校园墙帖子，只输出 JSON，不要解释。'
      + 'JSON 字段：{"title":"不超过 24 字的标题","content":"80-200 字正文，口语化、信息完整（物品/时间/地点/价格/联系方式择要）","tags":["2-4 个标签"],"sectionName":"板块名","price":数字或 null}。'
      + '可选板块：' + SECTION_HINTS.map((s) => s.name).join('、') + '。不要编造用户没提到的价格与联系方式。';
    const out = await chatWithAI(
      [
        { role: 'system', content: sys },
        { role: 'user', content: raw },
      ],
      1024,
      currentModels(true),
      // 发布是「当着用户面等」的场景：超预算就交给规则兜底，不让用户干等
      { budgetMs: 15_000, perModelTimeoutMs: 8_000 } satisfies AiCallOptions
    );
    bumpStats();
    const j = parseJsonLoose(out);
    if (!j || typeof j.title !== 'string' || typeof j.content !== 'string') {
      return success(res, { ...base, offline: true });
    }
    const name = typeof j.sectionName === 'string' ? j.sectionName : null;
    const sid = name ? SECTION_HINTS.find((s) => s.name === name)?.id ?? base.sectionId : base.sectionId;
    const price = typeof j.price === 'number' && j.price > 0 ? j.price : base.price;
    return success(res, {
      title: j.title.slice(0, 40),
      content: j.content.slice(0, 1200),
      tags: Array.isArray(j.tags) ? j.tags.filter((t: any) => typeof t === 'string').slice(0, 4) : base.tags,
      sectionId: sid,
      sectionName: SECTION_HINTS.find((s) => s.id === sid)?.name ?? name,
      price,
      offline: false,
    });
  } catch (err: any) {
    logger.error('AI 成稿失败', { error: err?.message });
    return success(res, { ...base, offline: true });
  }
});

// ---------- 2. 帖子划重点：3 条要点 + 风险提示 ----------
router.post('/summarize', authRequired, aiLimiter, async (req: Request, res: Response) => {
  let title = String(req.body?.title || '').trim().slice(0, 60);
  let content = String(req.body?.content || '').trim();
  const postId = req.body?.postId ? Number(req.body.postId) : null;

  if ((!content || !title) && postId) {
    const row = db
      .prepare('SELECT title, content FROM posts WHERE id = ? AND status = \'published\'')
      .get(postId) as { title: string; content: string } | undefined;
    if (row) {
      title = title || row.title;
      content = content || row.content;
    }
  }
  if (!content) return fail(res, '没有可总结的内容');
  if (content.length > 6000) content = content.slice(0, 6000);

  const full = title + '\n' + content;
  const risk = detectRisk(full);
  const base = { points: extractiveSummary(title, content), risk: risk.level, riskNote: risk.note };
  if (!isAiUsable()) return success(res, { ...base, offline: true });

  try {
    const out = await chatWithAI(
      [
        {
          role: 'system',
          content:
            '你是校园墙的阅读助手。读一条校园墙帖子，只输出 JSON：{"points":["要点1","要点2","要点3"],"risk":"low|medium|high","riskNote":"一句话风险提示，无风险填空字符串"}。要点必须来自原文，每条不超过 30 字，不要编造。risk 只在出现先交押金、私下转账、刷单返利、二维码链接等风险时标记 medium/high。',
        },
        { role: 'user', content: '标题：' + title + '\n正文：' + content },
      ],
      1024,
      currentModels(true),
      // 划重点同样在阅读时同步等待：8 秒拿不到就退回抽取式摘要
      { budgetMs: 10_000, perModelTimeoutMs: 7_000 } satisfies AiCallOptions
    );
    bumpStats();
    const j = parseJsonLoose(out);
    if (!j || !Array.isArray(j.points) || !j.points.length) return success(res, { ...base, offline: true });
    const points = j.points
      .filter((p: any) => typeof p === 'string' && p.trim())
      .map((p: string) => (p.length > 40 ? p.slice(0, 40) + '…' : p))
      .slice(0, 4);
    const level = ['low', 'medium', 'high'].includes(j.risk) ? j.risk : risk.level;
    const finalRisk = risk.level === 'high' ? 'high' : level;
    return success(res, {
      points,
      risk: finalRisk,
      riskNote:
        typeof j.riskNote === 'string' && j.riskNote.trim() ? j.riskNote.trim().slice(0, 120) : risk.note,
      offline: false,
    });
  } catch (err: any) {
    logger.error('AI 划重点失败', { error: err?.message });
    return success(res, { ...base, offline: true });
  }
});

// ---------- 3. 今日简报（60 秒缓存，公开只读，只统计已发布内容） ----------
const digestCache: { ts: number; data: any } = { ts: 0, data: null };
const DIGEST_TTL_MS = 60_000;

/** 简报统计窗口：优先「今天的 24 小时」，全站冷清时退到近 7 天，避免首页出现空白简报 */
function digestWindow(): { since: string; label: string } {
  const since24 = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const today = db
    .prepare('SELECT COUNT(*) AS n FROM posts WHERE status = \'published\' AND created_at >= ?')
    .get(since24) as { n: number };
  if (today.n > 0) return { since: since24, label: '24 小时' };
  return { since: new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString(), label: '近 7 天' };
}

export function ruleDigest() {
  const win = digestWindow();
  const since = win.since;
  const posts = db
    .prepare('SELECT COUNT(*) AS n FROM posts WHERE status = \'published\' AND created_at >= ?')
    .get(since) as { n: number };
  const comments = db
    .prepare('SELECT COUNT(*) AS n FROM comments WHERE status = \'active\' AND created_at >= ?')
    .get(since) as { n: number };
  const hot = db
    .prepare(
      'SELECT p.id, p.title, p.like_count, s.name AS section_name' +
        ' FROM posts p JOIN sections s ON s.id = p.section_id' +
        ' WHERE p.status = \'published\'' +
        ' ORDER BY p.is_top DESC, (p.like_count * 2 + p.comment_count) DESC, p.created_at DESC LIMIT 1'
    )
    .get() as { id: number; title: string; like_count: number; section_name: string } | undefined;
  const sections = db
    .prepare(
      'SELECT s.name, COUNT(*) AS n FROM posts p JOIN sections s ON s.id = p.section_id' +
        ' WHERE p.status = \'published\' AND p.created_at >= ? GROUP BY s.id ORDER BY n DESC LIMIT 3'
    )
    .all(since) as Array<{ name: string; n: number }>;

  const bits: string[] = [];
  if (posts.n > 0) bits.push(`${win.label}有 ${posts.n} 条新动态、${comments.n} 条评论`);
  else bits.push('最近还没有新动态，等你发第一条');
  const topSection = sections[0];
  if (topSection) bits.push('最活跃的是「' + topSection.name + '」（' + topSection.n + ' 条）');
  if (hot) {
    bits.push('全站最热是《' + (hot.title.length > 18 ? hot.title.slice(0, 18) + '…' : hot.title) + '》');
  }
  return {
    date: new Date().toISOString().slice(0, 10),
    window: win.label,
    stats: { posts: posts.n, comments: comments.n },
    sections,
    hot: hot ? { id: hot.id, title: hot.title, section: hot.section_name, likes: hot.like_count } : null,
    summary: bits.join('，') + '。',
    tip: '提示：二手交易务必当面验货、平台内沟通，任何「先交押金 / 私下转账」都请直接举报。',
    offline: true,
  };
}

/**
 * 简报刷新：先由规则版兜底，AI 只负责把统计写成人话。
 * 关键设计：AI 永远在后台跑，HTTP 响应不等模型 —— 首屏稳定 <20ms。
 */
let digestRefreshing = false;

async function refreshDigest(): Promise<void> {
  if (digestRefreshing) return;
  digestRefreshing = true;
  try {
    const base = digestCache.data ?? ruleDigest();
    // 后台任务：配置了 key 就尝试（无视熔断窗口）——免费推理档实测 ~35s 才出稿，
    // 前台成稿等不起，但简报没人等；成功会复位熔断，等于持续为前台「探活」
    if (!isAiEnabled() || base.stats.posts === 0) {
      digestCache.data = { ...base, offline: true };
      digestCache.ts = Date.now();
      return;
    }
    const out = await chatWithAI(
      [
        {
          role: 'system',
          content:
            '你是校园墙的每日播报员。根据给定的统计数据，用一句不超过 60 字的简体中文播报今天校园里的情况，语气活泼但不夸张，只输出这一句话，不要引号、不要 emoji。',
        },
        {
          role: 'user',
          content:
            base.window + '新动态：' + base.stats.posts + ' 条；评论：' + base.stats.comments + ' 条；活跃板块：' +
            (base.sections.map((s: { name: string; n: number }) => s.name + '(' + s.n + ')').join('、') || '无') +
            '；最热帖子：' + (base.hot?.title ?? '无') + '。',
        },
      ],
      512,
      currentModels(),
      // 后台预算放宽到 100s，允许慢但真实的大模型出稿；无视熔断窗口照常尝试
      { budgetMs: 100_000, perModelTimeoutMs: 95_000, ignoreBreaker: true } satisfies AiCallOptions
    );
    bumpStats();
    const line = (out.trim().split(/\n/)[0] ?? '').replace(/^["「]|["」]$/g, '').slice(0, 80);
    digestCache.data = line.length >= 8 ? { ...base, summary: line, offline: false } : { ...base, offline: true };
    digestCache.ts = Date.now();
  } catch (err: any) {
    logger.warn('AI 简报生成失败，保留统计版', { error: err?.message });
    if (digestCache.data) digestCache.data = { ...digestCache.data, offline: true };
    digestCache.ts = Date.now();
  } finally {
    digestRefreshing = false;
  }
}

router.get('/digest', (_req: Request, res: Response) => {
  try {
    const now = Date.now();
    // 命中缓存：直接返回；过期则后台刷新，本次仍返回旧值（stale-while-revalidate）
    if (digestCache.data) {
      if (now - digestCache.ts > DIGEST_TTL_MS) void refreshDigest();
      return success(res, digestCache.data);
    }
    // 冷启首个请求：立刻给规则版（SQL 聚合，毫秒级），AI 版本随后台刷新进缓存
    const base = ruleDigest();
    digestCache.data = base;
    digestCache.ts = now;
    void refreshDigest();
    return success(res, base);
  } catch (err: any) {
    logger.error('今日简报失败', { error: err?.message });
    return success(res, {
      date: new Date().toISOString().slice(0, 10),
      stats: { posts: 0, comments: 0 },
      sections: [],
      hot: null,
      summary: '今天的简报暂时取不到，稍后再来看看。',
      tip: '',
      offline: true,
    });
  }
});

export default router;
