/**
 * RAG 向量存储：rag_chunks 表 + upsert / 向量检索 / 按源清理。
 * 建表与索引放在 db.ts 末尾（本项目教训：索引必须晚于建表语句执行）。
 * 向量以 Float32Array 序列化为 BLOB 存储；全库量级在千级，余弦直接内存算。
 */
import { db } from '../db.js';
import { EMBED_DIM } from './embedder.js';

export interface StoredChunk {
  id: number;
  sourceType: string;
  sourceId: number;
  title: string;
  content: string;
}

interface RagRow {
  id: number;
  source_type: string;
  source_id: number;
  title: string;
  content: string;
  embedding: Buffer;
}

// 建表（幂等）：与既有表块一致的追加式建表
db.exec(`
  CREATE TABLE IF NOT EXISTS rag_chunks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_type TEXT NOT NULL,
    source_id INTEGER NOT NULL DEFAULT 0,
    title TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL,
    content_hash TEXT NOT NULL DEFAULT '',
    embedding BLOB NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_rag_chunks_hash ON rag_chunks (content_hash);`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_rag_chunks_source ON rag_chunks (source_type, source_id);`);

/** 向量 ↔ BLOB 互转（小端 float32） */
export function vecToBlob(vec: number[]): Buffer {
  const arr = new Float32Array(vec);
  return Buffer.from(arr.buffer);
}
export function blobToVec(buf: Buffer): number[] {
  const arr = new Float32Array(buf.buffer, buf.byteOffset, Math.min(EMBED_DIM, buf.byteLength / 4));
  return Array.from(arr);
}

/** 已存在的内容指纹集合：增量刷新时跳过未变化的块 */
export function existingHashes(): Set<string> {
  const rows = db.prepare('SELECT DISTINCT content_hash FROM rag_chunks WHERE content_hash != \'\'').all() as { content_hash: string }[];
  return new Set(rows.map((r) => r.content_hash));
}

export interface UpsertChunk {
  sourceType: string;
  sourceId: number;
  title: string;
  content: string;
  contentHash: string;
  embedding: number[];
}

/** 批量写入：hash 已存在的跳过；来源整体被替换时由调用方先 deleteBySource */
export function upsertChunks(chunks: UpsertChunk[]): { inserted: number; skipped: number } {
  const seen = existingHashes();
  const ins = db.prepare(
    `INSERT INTO rag_chunks (source_type, source_id, title, content, content_hash, embedding)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  let inserted = 0;
  let skipped = 0;
  const tx = db.transaction(() => {
    for (const c of chunks) {
      if (seen.has(c.contentHash)) { skipped++; continue; }
      ins.run(c.sourceType, c.sourceId, c.title, c.content, c.contentHash, vecToBlob(c.embedding));
      seen.add(c.contentHash);
      inserted++;
    }
  });
  tx();
  return { inserted, skipped };
}

/** 清空某来源（刷新帖子/公告时旧块先删） */
export function deleteBySource(sourceType: string, sourceId: number): void {
  db.prepare('DELETE FROM rag_chunks WHERE source_type = ? AND source_id = ?').run(sourceType, sourceId);
}

export interface VectorHit extends StoredChunk {
  score: number;
}

/** 全库余弦检索：返回 topK（query 需已归一化，库内向量为归一化存储） */
export function searchByVector(query: number[], topK: number): VectorHit[] {
  if (!query.length) return [];
  const rows = db.prepare('SELECT id, source_type, source_id, title, content, embedding FROM rag_chunks').all() as RagRow[];
  const q = new Float32Array(query);
  const scored: VectorHit[] = [];
  for (const r of rows) {
    const v = blobToVec(r.embedding);
    if (v.length !== EMBED_DIM) continue;
    let dot = 0;
    for (let i = 0; i < EMBED_DIM; i++) dot += (q[i] ?? 0) * (v[i] ?? 0);
    scored.push({
      id: r.id,
      sourceType: r.source_type,
      sourceId: r.source_id,
      title: r.title,
      content: r.content,
      score: dot,
    });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

/** 库内块数（评估与自检用） */
export function chunkCount(): number {
  return (db.prepare('SELECT COUNT(*) AS n FROM rag_chunks').get() as { n: number }).n;
}
