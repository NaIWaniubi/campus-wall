/**
 * 多模态存储：post_image_meta 表读写 + analyzeAndSave 编排入口。
 * 建表追加在 db.ts 末尾（索引在建表之后——仓库既有教训）。
 */
import { db } from '../db.js';
import { analyzeImage } from './vision.js';

export interface PostImageMeta {
  postId: number;
  labels: string[];
  summary: string;
  categoryGuess: string;
  safe: boolean;
  model: string;
}

// 建表（幂等）
db.exec(`
  CREATE TABLE IF NOT EXISTS post_image_meta (
    post_id INTEGER PRIMARY KEY,
    labels TEXT NOT NULL DEFAULT '[]',
    summary TEXT NOT NULL DEFAULT '',
    category_guess TEXT NOT NULL DEFAULT '其他',
    safe INTEGER NOT NULL DEFAULT 1,
    model TEXT NOT NULL DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

const saveStmt = db.prepare(`
  INSERT INTO post_image_meta (post_id, labels, summary, category_guess, safe, model)
  VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT(post_id) DO UPDATE SET
    labels = excluded.labels,
    summary = excluded.summary,
    category_guess = excluded.category_guess,
    safe = excluded.safe,
    model = excluded.model,
    created_at = CURRENT_TIMESTAMP
`);

export function saveMeta(meta: PostImageMeta): void {
  saveStmt.run(meta.postId, JSON.stringify(meta.labels), meta.summary, meta.categoryGuess, meta.safe ? 1 : 0, meta.model);
}

export function getMeta(postId: number): PostImageMeta | null {
  const row = db
    .prepare('SELECT post_id, labels, summary, category_guess, safe, model FROM post_image_meta WHERE post_id = ?')
    .get(postId) as any;
  if (!row) return null;
  let labels: string[] = [];
  try {
    labels = JSON.parse(row.labels);
  } catch {
    labels = [];
  }
  return {
    postId: row.post_id,
    labels,
    summary: row.summary,
    categoryGuess: row.category_guess,
    safe: row.safe === 1,
    model: row.model,
  };
}

/** 标签云：全部已解析图片的标签聚合（板块页筛选入口数据源） */
export function allLabels(limit = 20): { label: string; count: number }[] {
  const rows = db.prepare('SELECT labels FROM post_image_meta').all() as { labels: string }[];
  const counter = new Map<string, number>();
  for (const r of rows) {
    try {
      for (const l of JSON.parse(r.labels) as string[]) {
        if (l === '离线解析' || l === '图片') continue; // 通用标签不进云
        counter.set(l, (counter.get(l) ?? 0) + 1);
      }
    } catch { /* 忽略脏数据 */ }
  }
  return Array.from(counter.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/**
 * 编排入口（供 posts 路由异步钩子调用）：
 * analyzeImage → saveMeta；永不 reject，失败不影响发帖主流程。
 */
export async function analyzeAndSave(postId: number, imagePath: string): Promise<void> {
  try {
    const meta = await analyzeImage(imagePath);
    saveMeta({
      postId,
      labels: meta.labels,
      summary: meta.summary,
      categoryGuess: meta.category_guess,
      safe: meta.safe,
      model: meta.model,
    });
  } catch {
    // 分析失败静默：多模态是增强能力，不阻塞发帖
  }
}
