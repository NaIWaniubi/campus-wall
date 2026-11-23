/**
 * RAG 混合检索：向量余弦（0.6）+ 关键词命中（0.4）加权融合，
 * 输出带引用编号的资料片段。全库空召回时返回空数组，
 * 调用方（ai.ts）回退到原有 official.md 全文模式，行为不回归。
 */
import { logger } from '../utils/logger.js';
import { db } from '../db.js';
import { embedQuery, splitQueryTokens } from './embedder.js';
import { searchByVector, searchByKeyword, deleteBySource } from './store.js';
import type { VectorHit, UpsertChunk } from './store.js';

export interface RagSource {
  ref: number;             // 引用编号，回答中 [n] 对应
  title: string;
  snippet: string;         // 喂给 LLM 的资料正文（截断到 400 字）
  sourceType: 'kb' | 'post' | 'announcement';
  sourceId: number;        // post 时为帖子 id，供前端 chips 跳转
  score: number;
}

/** 常见中文功能词 2-gram（无信息量，命中后引入噪声） */
const STOP_BIGRAMS = new Set([
  '可以', '什么', '怎么', '怎样', '如何', '是否', '哪里', '哪个',
  '知道', '关于', '对于', '问题', '情况', '时候', '现在', '还是',
  '但是', '而且', '因为', '所以', '如果', '虽然', '已经', '应该',
  '这样', '那样', '一个', '一些', '的发', '的时', '的时',
]);

/** 关键词提取：英文词块（优先，≤4）+ 中文 2-gram（≤8），总计 ≤8 */
export function extractKeywords(question: string): string[] {
  // English/ASCII word blocks first (higher specificity per token)
  const englishWords: string[] = [];
  for (const w of question.match(/[a-zA-Z0-9]{2,}/g) || []) {
    const low = w.toLowerCase();
    if (!englishWords.includes(low)) englishWords.push(low);
    if (englishWords.length >= 4) break;
  }
  // Chinese bigrams separately capped (original: English monopolized all 8 slots)
  const cleaned = question.replace(/[\s，。！？、；：,.!?;:~～"'"'（）()\[\]{}]/g, '');
  const chinese = cleaned.replace(/[a-zA-Z0-9]/g, '');
  const bigrams: string[] = [];
  for (let i = 0; i + 2 <= chinese.length && bigrams.length < 8; i++) {
    const bg = chinese.slice(i, i + 2)!;
    if (!STOP_BIGRAMS.has(bg) && !bigrams.includes(bg)) bigrams.push(bg);
  }
  return [...englishWords, ...bigrams].slice(0, 8);
}

/** 关键词得分：标题命中 ×2 + 正文命中 ×1，占命中关键词数比例 */
function keywordScore(keywords: string[], title: string, content: string): number {
  if (!keywords.length) return 0;
  let hits = 0;
  for (const k of keywords) {
    if (title.includes(k)) hits += 2;
    else if (content.includes(k)) hits += 1;
  }
  return hits / (keywords.length * 2);
}

export interface RetrieveOptions {
  topK?: number;
  vecWeight?: number; // 默认 0.6，关键词 0.4
}

/** 主入口：问题 → 融合排序资料列表（ref 从 1 起） */
export async function retrieve(question: string, opts: RetrieveOptions = {}): Promise<RagSource[]> {
  const topK = opts.topK ?? 4;
  const vecW = opts.vecWeight ?? 0.6;
  const kwW = 1 - vecW;

  const queryVec: number[] = await embedQuery(question);
  // 双路候选池：纯向量排序的候选可能因向量相似度低而漏掉强关键词命中的块，
  // 增加关键词扫描候选后按 chunk id 合并，确保两条路径都能进入融合阶段。
  const vecRows = searchByVector(queryVec, topK * 3);
  const keywords = extractKeywords(question);
  const kwRows = searchByKeyword(keywords, topK * 3);

  // 按 chunk id 去重合并；同一条 chunk 取两路中的最高原始分
  const merged = new Map<number, VectorHit>();
  for (const r of vecRows) merged.set(r.id, r);
  for (const r of kwRows) {
    const existing = merged.get(r.id);
    if (!existing || r.score > existing.score) merged.set(r.id, r);
  }

  if (!merged.size) return [];

  // R4 评测修复的第三件套——实义重叠校验：
  // 哈希嵌入无监督区分「真实共享词面」与「词汇落桶碰撞」，互不相干短文本可得
  // ~0.15 的伪余弦；再叠加同名词面（如「学生」）又会召回主题完全偏离的文档。
  // 这里用与 hashEmbed 完全同口径的分词做词面交集校验：真实共享 token、或融合
  // 分高到足以覆盖措辞差异，才允许进入引用集合。
  const qTokenSet = new Set(splitQueryTokens(question));

  // 向量相似度 + 关键词命中融合排序
  const fused = Array.from(merged.values()).map((r) => ({
    ...r,
    fused: vecW * Math.max(r.score, 0) + kwW * keywordScore(keywords, r.title, r.content),
  }));
  fused.sort((a, b) => b.fused - a.fused);

  const sources: RagSource[] = [];
  let ref = 1;
  for (const f of fused) {
    // 实义重叠校验的落点：无真实共享词面的候选只能靠哈希碰撞或极端权重撑高分，
    // 观测噪声上限约 0.10——低于 0.35 一律剔除（0.35 以上视为措辞差异大的强信号放行）
    const realOverlap = hasRealOverlap(qTokenSet, f.content);
    if (!realOverlap && f.fused < 0.35) continue; // 桶碰撞伪信号剔除
    sources.push({
      ref: ref++,
      title: f.title || (f.sourceType === 'kb' ? '平台知识库' : '站内帖子'),
      snippet: f.content.slice(0, 400),
      sourceType: (f.sourceType as RagSource['sourceType']) || 'post',
      sourceId: f.sourceId,
      score: Number(f.fused.toFixed(4)),
    });
    if (sources.length >= topK) break;
  }
  return sources;
}

/** 查询与候选块是否存在真实共享词面（与 hashEmbed 同口径分词） */
function hasRealOverlap(qTokens: Set<string>, content: string): boolean {
  if (!qTokens.size) return true; // 无分词信息时不做校验，避免误杀
  for (const t of splitQueryTokens(content)) {
    if (qTokens.has(t)) return true;
  }
  return false;
}

/**
 * 启动增量刷新：official.md + 公告 + 最近帖子 → 分块嵌入入库。
 * hash 未变化的块自动跳过；来源被清理重建时旧块先删。
 * 在 api/index.ts 启动流程异步调用，失败仅记日志不阻塞启动。
 */
export async function refreshIndex(): Promise<{ inserted: number; skipped: number }> {
  const { buildChunks } = await import('./chunker.js');
  const { embedTexts } = await import('./embedder.js');
  const { upsertChunks, existingHashes } = await import('./store.js');
  const fs = await import('fs');
  const path = await import('path');
  const { fileURLToPath } = await import('url');

  const inputs: { source: 'kb' | 'post' | 'announcement'; sourceId: number; title: string; content: string }[] = [];

  // 1) 知识库 markdown
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const kbPaths = [
    path.join(__dirname, '..', 'knowledge', 'official.md'),
    path.join(process.cwd(), 'api', 'knowledge', 'official.md'),
  ];
  for (const p of kbPaths) {
    try {
      inputs.push({ source: 'kb', sourceId: 0, title: '平台知识库', content: fs.readFileSync(p, 'utf-8') });
      break;
    } catch { /* 尝试下一个候选路径 */ }
  }

  // 2) 公告（announcements 表存在则取）
  try {
    const anns = db.prepare('SELECT id, title, content FROM announcements ORDER BY id DESC LIMIT 50').all() as any[];
    for (const a of anns) {
      inputs.push({ source: 'announcement', sourceId: a.id, title: a.title || '公告', content: String(a.content || '') });
    }
  } catch { /* 表不存在时跳过 */ }

  // 3) 最近 200 条帖子
  try {
    const posts = db
      // 修复：原写 status='active'，而本库 posts 只写 pending/published/rejected/deleted——
      // 查询恒 0 行，RAG 的「站内帖子引用」实为死功能且无告警。
      // JOIN users 过滤封禁：否则封禁用户的帖子仍进检索库并被引用，
      // 封禁在 AI 问答通道失效（posts 路由 / agent 工具 / forum 检索三处都有此过滤）。
      .prepare(
        `SELECT p.id, p.title, p.content FROM posts p
         JOIN users u ON u.id = p.user_id
         WHERE p.status = 'published' AND u.status != 'banned'
         ORDER BY p.id DESC LIMIT 200`
      )
      .all() as any[];
    if (!posts.length) logger.warn('RAG 索引：无已发布帖子入索引（检查 posts.status）')
    for (const p of posts) {
      inputs.push({ source: 'post', sourceId: p.id, title: p.title || '帖子', content: String(p.content || '') });
    }
  } catch { /* 表不存在时跳过 */ }

  if (!inputs.length) return { inserted: 0, skipped: 0 };

  // 失效来源清理：帖子被删/驳回/封禁后，其旧块仍在 rag_chunks 里被检索并引用
  // （用户会看到已删除帖子的内容，引用 chips 跳转到空）。
  // upsertChunks 按 hash 去重 → 内容改了会新旧并存；这里按「本次不在索引里的帖子」清理。
  try {
    const livePostIds = new Set(
      (db
        .prepare(
          `SELECT p.id FROM posts p JOIN users u ON u.id = p.user_id
           WHERE p.status = 'published' AND u.status != 'banned'`
        )
        .all() as any[]).map((r) => r.id),
    );
    const stalePosts = db
      .prepare("SELECT DISTINCT source_id FROM rag_chunks WHERE source_type = 'post'")
      .all() as { source_id: number }[];
    for (const sp of stalePosts) {
      if (!livePostIds.has(sp.source_id)) deleteBySource('post', sp.source_id);
    }
  } catch (err: any) {
    logger.warn('RAG 索引：清理失效来源失败（不影响主流程）', { error: err?.message });
  }

  const chunks = buildChunks(inputs);
  const seen = existingHashes();
  const pending = chunks.filter((c) => !seen.has(c.contentHash));
  if (!pending.length) return { inserted: 0, skipped: chunks.length };

  // 嵌入批量做（网关一次请求；本地路径同函数）
  const BATCH = 32;
  let inserted = 0;
  let skipped = 0;
  for (let i = 0; i < pending.length; i += BATCH) {
    const batch = pending.slice(i, i + BATCH);
    const vecs = await embedTexts(batch.map((c) => c.content));
    const payload: UpsertChunk[] = [];
    batch.forEach((c, j) => {
      payload.push({
        sourceType: c.source,
        sourceId: c.sourceId,
        title: c.title,
        content: c.content,
        contentHash: c.contentHash,
        embedding: vecs[j] ?? [],
      });
    });
    const res = upsertChunks(payload);
    inserted += res.inserted;
    skipped += res.skipped;
  }
  return { inserted, skipped };
}
