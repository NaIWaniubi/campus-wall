/**
 * 智能撮合引擎：失物招领"智能雷达"相似度匹配
 *
 * 复合评分公式：
 *   Score = BM25 归一化得分(0~30) + 地点强匹配(+35) + 时间衰减(0~25)
 * 综合得分 >= MATCH_THRESHOLD (60) 判定为高度相似候选；
 * 「同地点 + 同时段」(35+25=60) 必然达标，纯时间衰减无地点(≤55)被正确排除。
 */
import { db } from '../db.js';

/** 高匹配度阈值：达到该分数才作为"智能雷达"候选呈现 */
export const MATCH_THRESHOLD = 60;
/** 时间窗：丢失/拾获日期相差超过该天数不参与匹配 */
export const TIME_WINDOW_DAYS = 30;

export interface RadarMatch {
  postId: number;
  title: string;
  excerpt: string;
  direction: string;          // 候选帖方向（与我相反）
  score: number;              // 综合匹配得分 0-100
  reasons: string[];          // 命中原因（如：地点匹配"一教"）
  createdAt: string;
}

interface PostRow {
  id: number;
  title: string;
  content: string;
  extra_fields: string | null;
  created_at: string;
}

/** 从文本中提取地点词块（教学楼/食堂/宿舍/图书馆等 + 序号） */
const LOCATION_RE = /[一二三四五六七八九十\d]{0,3}(?:教|教学楼|食堂|餐厅|宿舍|公寓|楼栋|图书馆|操场|体育馆|实验楼|行政楼|超市|快递|驿站|教室)/g;

/** 提取文本中的地点集合（归一化为小写无空白） */
export function extractLocations(text: string): Set<string> {
  const found = text.match(LOCATION_RE) || [];
  return new Set(found.map((s) => s.replace(/\s+/g, '')));
}

/** 两个地点集合的交集（空字符串地点忽略） */
export function locationIntersection(a: Set<string>, b: Set<string>): string[] {
  const hits: string[] = [];
  for (const item of a) {
    if (item && b.has(item)) hits.push(item);
  }
  return hits;
}

/** 时间衰减得分：相差 0 天=25 分，TIME_WINDOW_DAYS 天=0 分，线性衰减 */
export function timeDecayScore(daysDiff: number): number {
  if (daysDiff < 0) daysDiff = 0;
  if (daysDiff >= TIME_WINDOW_DAYS) return 0;
  return Math.round((1 - daysDiff / TIME_WINDOW_DAYS) * 25);
}

/** 两个 ISO/SQLite 日期字符串相差天数（绝对值） */
export function daysBetween(a: string, b: string): number {
  const ta = Date.parse(a.replace(' ', 'T'));
  const tb = Date.parse(b.replace(' ', 'T'));
  if (Number.isNaN(ta) || Number.isNaN(tb)) return TIME_WINDOW_DAYS;
  return Math.abs(ta - tb) / 86_400_000;
}

/**
 * 智能雷达：为指定失物帖寻找反向方向的高相似候选帖
 * - 仅失物招领板块（sectionId）内生效
 * - 候选召回：FTS5 BM25 快速召回 + 方向相反 + 时间窗内
 * - 复合评分：BM25 归一化 + 地点 + 品类 + 时间衰减
 */
export function findRadarMatches(
  postId: number,
  sectionId: number,
  limit = 3
): RadarMatch[] {
  // 1. 取当前帖子
  const current = db
    .prepare(
      `SELECT id, title, content, extra_fields, section_id, created_at
       FROM posts WHERE id = ? AND status = 'published'`
    )
    .get(postId) as (PostRow & { section_id: number }) | undefined;
  if (!current || current.section_id !== sectionId) return [];

  // 2. 解析方向：失物招领板块帖子 extra_fields.direction = 'lost' | 'found'
  let direction = '';
  try {
    const extra = JSON.parse(current.extra_fields || '{}');
    direction = String(extra.direction || '');
  } catch { /* 无 direction 字段 */ }
  if (direction !== 'lost' && direction !== 'found') return [];
  const opposite = direction === 'lost' ? 'found' : 'lost';

  // 3. FTS5 BM25 快速召回（方向相反 + 同板块 + 发布中 + 时间窗内）
  const candidates = db
    .prepare(
      `SELECT p.id, p.title, p.content, p.extra_fields, p.created_at,
              bm25(posts_fts, 5.0, 1.0, 2.0) AS rank
       FROM posts_fts
       JOIN posts p ON p.id = posts_fts.rowid
       JOIN sections s ON s.id = p.section_id
       WHERE posts_fts MATCH ?
         AND p.id != ?
         AND p.section_id = ?
         AND json_extract(p.extra_fields, '$.direction') = ?
         AND p.status = 'published'
         AND p.created_at >= datetime('now', '-30 days')
       ORDER BY rank
       LIMIT 12`
    )
    .all(buildFtsQuery(current.title + ' ' + current.content), postId, sectionId, opposite) as (PostRow & { rank: number })[];

  if (candidates.length === 0) return [];

  // 4. 复合评分
  const myLocations = extractLocations(current.title + ' ' + current.content);
  const nowStr = new Date().toISOString();

  const scored: RadarMatch[] = [];
  for (const c of candidates) {
    const reasons: string[] = [];
    let score = 0;

    // BM25 归一化：rank 越小（越相关）得分越高，映射到 0~30
    const bm25Score = Math.max(0, Math.min(30, Math.round(30 / (1 + Math.abs(c.rank)))));
    score += bm25Score;
    reasons.push('内容关键词匹配');

    // 地点强匹配（最强信号：同教学楼/食堂等）
    const cLocations = extractLocations(c.title + ' ' + c.content);
    const locHits = locationIntersection(myLocations, cLocations);
    if (locHits.length > 0) {
      score += 35;
      reasons.push(`地点匹配「${locHits[0]}」`);
    }

    // 时间衰减
    const days = daysBetween(c.created_at, nowStr);
    const tScore = timeDecayScore(days);
    score += tScore;
    if (tScore >= 20) reasons.push('时间高度接近');

    if (score >= MATCH_THRESHOLD) {
      scored.push({
        postId: c.id,
        title: c.title,
        excerpt: c.content.length > 80 ? c.content.slice(0, 80) + '…' : c.content,
        direction: opposite,
        score,
        reasons: reasons.slice(0, 3),
        createdAt: c.created_at,
      });
    }
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

/**
 * 构造 FTS5 MATCH 查询串：
 * 提取关键词（ASCII 词块 + 中文 2 字滑窗）并用 OR 连接，召回优先
 */
export function buildFtsQuery(text: string, maxTerms = 8): string {
  const cleaned = text.replace(/[\s，。！？、；：,.!?;:~～"'‘’（）()\[\]{}#*]/g, '');
  const terms = new Set<string>();

  // ASCII 词块
  for (const w of text.match(/[a-zA-Z0-9]{2,}/g) || []) {
    if (w.length <= 20) terms.add(`"${w.toLowerCase()}"`);
  }

  // 中文 2 字滑窗（召回优先）
  const chinese = cleaned.replace(/[a-zA-Z0-9]/g, '');
  for (let i = 0; i + 2 <= chinese.length; i++) {
    terms.add(`"${chinese.slice(i, i + 2)}"`);
    if (terms.size >= maxTerms) break;
  }

  if (terms.size === 0) return '""'; // 空查询（不会命中）
  return Array.from(terms).slice(0, maxTerms).join(' OR ');
}
