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
  /** 解析是否成功（false = 结果未知，不能当作安全结论） */
  parsed: boolean;
  /** 安全判定：仅 parsed=true 且模型给出判定时有值，否则 null（未知） */
  safe: boolean | null;
  model: string;
}

// 建表（幂等）
db.exec(`
  CREATE TABLE IF NOT EXISTS post_image_meta (
    post_id INTEGER PRIMARY KEY,
    labels TEXT NOT NULL DEFAULT '[]',
    summary TEXT NOT NULL DEFAULT '',
    category_guess TEXT NOT NULL DEFAULT '其他',
    safe INTEGER,                -- 可空：NULL = 未知（未判定）
    parsed INTEGER NOT NULL DEFAULT 0,
    model TEXT NOT NULL DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// 迁移：存量库升级到新语义（safe 可空 + parsed 列）。
// CREATE TABLE IF NOT EXISTS 不会给旧表加列/改约束；
// 且 SQLite 无法直接改 NOT NULL → 需要重建表并搬运数据。
{
  const cols = db.prepare('PRAGMA table_info(post_image_meta)').all() as {
    name: string;
    notnull: number;
  }[];
  const hasParsed = cols.some((c) => c.name === 'parsed');
  const safeCol = cols.find((c) => c.name === 'safe');
  const safeNullable = !safeCol || !safeCol.notnull;

  if (!hasParsed || !safeNullable) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS post_image_meta_new (
        post_id INTEGER PRIMARY KEY,
        labels TEXT NOT NULL DEFAULT '[]',
        summary TEXT NOT NULL DEFAULT '',
        category_guess TEXT NOT NULL DEFAULT '其他',
        safe INTEGER,
        parsed INTEGER NOT NULL DEFAULT 0,
        model TEXT NOT NULL DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      INSERT OR REPLACE INTO post_image_meta_new
        (post_id, labels, summary, category_guess, safe, parsed, model, created_at)
      SELECT post_id, labels, summary, category_guess,
             CASE WHEN safe IS NULL OR safe NOT IN (0,1) THEN NULL ELSE safe END,
             CASE WHEN safe IN (0,1) THEN 1 ELSE 0 END,
             model, created_at
      FROM post_image_meta;
      DROP TABLE post_image_meta;
      ALTER TABLE post_image_meta_new RENAME TO post_image_meta;
    `);
  }
}

const saveStmt = db.prepare(`
  INSERT INTO post_image_meta (post_id, labels, summary, category_guess, safe, parsed, model)
  VALUES (?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(post_id) DO UPDATE SET
    labels = excluded.labels,
    summary = excluded.summary,
    category_guess = excluded.category_guess,
    safe = excluded.safe,
    parsed = excluded.parsed,
    model = excluded.model,
    created_at = CURRENT_TIMESTAMP
`);

export function saveMeta(meta: PostImageMeta): void {
  // safe 为 null（未知）时存 NULL，不压成 0（0 会被读成「判定为不安全」）
  const safeVal = meta.safe === null || meta.safe === undefined ? null : meta.safe ? 1 : 0;
  saveStmt.run(
    meta.postId,
    JSON.stringify(meta.labels),
    meta.summary,
    meta.categoryGuess,
    safeVal,
    meta.parsed ? 1 : 0,
    meta.model
  );
}

export function getMeta(postId: number): PostImageMeta | null {
  const row = db
    .prepare('SELECT post_id, labels, summary, category_guess, safe, parsed, model FROM post_image_meta WHERE post_id = ?')
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
    parsed: row.parsed === 1,
    // NULL = 未知（未判定），不能读成 false
    safe: row.safe === null || row.safe === undefined ? null : row.safe === 1,
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
      parsed: meta.parsed,
      safe: meta.safe,
      model: meta.model,
    });
  } catch {
    // 分析失败静默：多模态是增强能力，不阻塞发帖
  }
}
