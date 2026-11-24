/**
 * 发布时相似帖检测（V3-P1）：帖子间文本相似度纯函数。
 *
 * 与失物雷达的评分（utils/matching.ts）刻意独立：雷达是多特征加权打分，
 * 这里只需要「重复/刷屏」判定，做法是归一化文本的 bigram 集合 Jaccard——
 * 完全相同=1、互不相干≈0，阈值可标定（scripts/eval-similar-posts.ts）。
 *
 * 为什么词面而非向量：刷重复帖的用户文本高度一致，词面重叠是最强且零成本
 * 的信号；校园规模下不必为此引入嵌入列迁移（过度工程，见 UPGRADE-PLAN-V3 非目标）。
 */
import { db } from '../db.js';

/** 正文参与比对的截断长度（控制大文本分词成本，重复刷帖帖不会差在这几百字里） */
const CONTENT_TOKEN_CAP = 600;

/** 全角 → 半角（字母/数字/常用符号），其余标点空白直接剔除 */
function toHalfWidth(text: string): string {
  return text
    .replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
    .replace(/\u3000/g, ' ');
}

/** 归一化：全角转半角 → 小写 → 剔除标点与空白（剩余为字母数字与汉字） */
export function normalizeText(text: string): string {
  return toHalfWidth(String(text || ''))
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

/**
 * 分词成 bigram 集合：ASCII 连续词块整体作为一个 token（如 ipad），
 * 中文按 2 字滑窗。集合天然去重；中文 2-gram 是校园问答最短可用的语义粒度。
 */
export function tokenizeBigrams(text: string): Set<string> {
  const out = new Set<string>();
  const norm = normalizeText(text);
  if (!norm) return out;
  for (const w of norm.match(/[a-z0-9]+/g) ?? []) out.add(w);
  const cjk = norm.replace(/[a-z0-9]/g, '');
  for (let i = 0; i + 2 <= cjk.length && i < CONTENT_TOKEN_CAP; i++) {
    out.add(cjk.slice(i, i + 2));
  }
  return out;
}

/** Jaccard 相似度：|交集| / |并集|；两集皆空按 0（无可比信号） */
export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (!a.size && !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union ? inter / union : 0;
}

export interface SimilarPostText {
  title: string;
  content: string;
}

/**
 * 帖子相似度：标题与正文各占一半权重——标题相同是「模板刷屏」最强的单一信号
 * （同一人改几个字重发多见于标题复制、正文小改），单独半边就能抬过阈值。
 */
export function postSimilarity(a: SimilarPostText, b: SimilarPostText): number {
  const titleSim = jaccardSimilarity(tokenizeBigrams(a.title), tokenizeBigrams(b.title));
  const contentSim = jaccardSimilarity(
    tokenizeBigrams(a.content.slice(0, CONTENT_TOKEN_CAP)),
    tokenizeBigrams(b.content.slice(0, CONTENT_TOKEN_CAP)),
  );
  return (titleSim + contentSim) / 2;
}

/** 相似提醒阈值（V3-P1 由 scripts/eval-similar-posts.ts 标定后回填于此；测试可注入） */
let similarNotifyThreshold = Number(process.env.SIMILAR_NOTIFY_THRESHOLD ?? 0.45);

/** 测试注入路径：定向覆盖阈值（生产固定常量即可） */
export function setSimilarThresholdForTest(v: number): void {
  similarNotifyThreshold = v;
}

/** 当前生效阈值（供评估脚本读取） */
export function similarThreshold(): number {
  return similarNotifyThreshold;
}

/** 超阈值候选条目（供 P2 推荐轨道复用同一函数） */
export interface SimilarCandidate {
  id: number;
  title: string;
  sectionName: string;
  likeCount: number;
  score: number;
}

export interface PublishedCandidate {
  id: number;
  title: string;
  content: string;
  sectionId: number;
  sectionName: string;
  likeCount: number;
}

/** 推荐轨的同板块兜底权重：内容不相似时仍给出「同板块」的可解释相关性 */
export const RELATED_SECTION_BOOST = 0.2;
export const RELATED_MIN_SCORE = 0.2;

/**
 * 取已发布候选集（排除自身 id）。传入 sectionId 时先取同板块最近 LIMIT 条，
 * 不足部分再用全库最近帖兜底；封禁口径与列表/详情/RAG 三处一致。
 */
export function recentPublishedCandidates(
  excludeId: number,
  limit = 500,
  sectionId?: number,
): PublishedCandidate[] {
  const cap = Math.max(0, Math.floor(limit));
  if (!cap) return [];
  const select = `SELECT p.id, p.title, p.content, p.section_id AS sectionId, s.name AS sectionName, p.like_count AS likeCount
       FROM posts p
       JOIN users u ON u.id = p.user_id
       LEFT JOIN sections s ON s.id = p.section_id
       WHERE p.status = 'published' AND u.status != 'banned' AND p.id <> ?`;

  if (sectionId) {
    const sameSection = db
      .prepare(`${select} AND p.section_id = ? ORDER BY p.id DESC LIMIT ?`)
      .all(excludeId, sectionId, cap) as PublishedCandidate[];
    if (sameSection.length >= cap) return sameSection;
    const rest = db
      .prepare(`${select} AND p.section_id <> ? ORDER BY p.id DESC LIMIT ?`)
      .all(excludeId, sectionId, cap - sameSection.length) as PublishedCandidate[];
    return [...sameSection, ...rest];
  }

  return db
    .prepare(`${select} ORDER BY p.id DESC LIMIT ?`)
    .all(excludeId, cap) as PublishedCandidate[];
}

/**
 * 在已发布、未封禁作者库里找与新帖最相似的 topK 条（排除自身 id）。
 * SQL 预收窄到最近 LIMIT 条，控制分词成本；调用方只关心 score ≥ 阈值者。
 */
export function findSimilarCandidates(
  newPost: { id: number; title: string; content: string },
  candidates: PublishedCandidate[],
  topK = 6
): SimilarCandidate[] {
  const scored = candidates
    .map((c) => ({ ...c, score: postSimilarity(newPost, c) }))
    .filter((c) => c.score >= similarNotifyThreshold && c.id !== newPost.id)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

/**
 * 详情页相关推荐（V3-P2）：高文本相似度优先，同板块作为可解释兜底。
 * 与 P1 共用 postSimilarity，但推荐不能套用「防重复」的高阈值，否则普通帖轨道长期为空。
 */
export function findRelatedCandidates(
  source: { id: number; title: string; content: string; sectionId: number },
  candidates: PublishedCandidate[],
  topK = 6
): SimilarCandidate[] {
  const scored = candidates
    .map((c) => {
      const lexical = postSimilarity(source, c);
      const sameSection = c.sectionId === source.sectionId;
      return { ...c, score: lexical + (sameSection ? RELATED_SECTION_BOOST : 0) };
    })
    .filter((c) => c.score >= RELATED_MIN_SCORE && c.id !== source.id)
    .sort((a, b) => b.score - a.score || b.id - a.id);
  return scored.slice(0, topK);
}
