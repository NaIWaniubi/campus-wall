/**
 * RAG 混合检索：向量余弦（0.6）+ 关键词命中（0.4）加权融合，
 * 输出带引用编号的资料片段。全库空召回时返回空数组，
 * 调用方（ai.ts）回退到原有 official.md 全文模式，行为不回归。
 */
import { logger } from '../utils/logger.js';
import { db } from '../db.js';
import { embedQuery } from './embedder.js';
import { searchByVector } from './store.js';
import type { UpsertChunk } from './store.js';

export interface RagSource {
  ref: number;             // 引用编号，回答中 [n] 对应
  title: string;
  snippet: string;         // 喂给 LLM 的资料正文（截断到 400 字）
  sourceType: 'kb' | 'post' | 'announcement';
  sourceId: number;        // post 时为帖子 id，供前端 chips 跳转
  score: number;
}

/** 关键词提取：ASCII 词块 + 中文 2 字滑窗（与旧版 ai.ts 口径一致，命中数排序去噪） */
export function extractKeywords(question: string): string[] {
  const cleaned = question.replace(/[\s，。！？、；：,.!?;:~～"'"'（）()\[\]{}]/g, '');
  const words = new Set<string>();
  for (const w of question.match(/[a-zA-Z0-9]{2,}/g) || []) {
    if (w.length <= 20) words.add(w.toLowerCase());
  }
  const chinese = cleaned.replace(/[a-zA-Z0-9]/g, '');
  for (let i = 0; i + 2 <= chinese.length; i++) {
    words.add(chinese.slice(i, i + 2));
    if (words.size >= 8) break;
  }
  return Array.from(words).slice(0, 8);
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
  const rows = searchByVector(queryVec, topK * 3);
  if (!rows.length) return [];

  const keywords = extractKeywords(question);
  // 向量相似度已由 searchByVector 排序；这里补关键词分做融合
  const fused = rows.map((r) => ({
    ...r,
    fused: vecW * Math.max(r.score, 0) + kwW * keywordScore(keywords, r.title, r.content),
  }));
  fused.sort((a, b) => b.fused - a.fused);

  const sources: RagSource[] = [];
  let ref = 1;
  for (const f of fused) {
    if (f.fused <= 0.05) continue; // 阈值以下视为噪声
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
      .prepare("SELECT id, title, content FROM posts WHERE status = 'published' ORDER BY id DESC LIMIT 200")
      .all() as any[];
    if (!posts.length) logger.warn('RAG 索引：无已发布帖子入索引（检查 posts.status）')
    for (const p of posts) {
      inputs.push({ source: 'post', sourceId: p.id, title: p.title || '帖子', content: String(p.content || '') });
    }
  } catch { /* 表不存在时跳过 */ }

  if (!inputs.length) return { inserted: 0, skipped: 0 };

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
