/**
 * 智能撮合引擎：失物招领"智能雷达"相似度匹配
 *
 * 复合评分公式（各子项独立归一化到 0~1 后加权，避免量纲互相压制）：
 *   Score = 100 * (0.35*品类 + 0.25*地点 + 0.25*关键词语义 + 0.15*时间)
 * 综合得分 >= MATCH_THRESHOLD (60) 判定为高度相似候选；
 * 品类是失物招领里最强的可判别信号（"校园卡"与"雨伞"不同地点也不该匹配）。
 *
 * 关键修正：FTS5 的 bm25() 返回负值，越相关绝对值越大（实测 -4.3 vs -2.1），
 * 早期实现用 30/(1+|rank|) 会把最相关的候选打成最低分，特征方向是反的。
 */
import { db } from '../db.js';

/** 高匹配度阈值：达到该分数才作为"智能雷达"候选呈现 */
export const MATCH_THRESHOLD = 60;
/** 时间窗：丢失/拾获日期相差超过该天数不参与匹配 */
export const TIME_WINDOW_DAYS = 30;

/**
 * 各特征权重（合计 1.0）
 *
 * 校准依据见 scripts/eval-radar.ts 与对抗样本集：
 * - 品类 0.40：失物招领里最硬的判别信号
 * - 地点 0.25：同地点把「同品类不同地点」的噪声压到线下
 * - 文本 0.20：覆盖无结构化字段的老帖
 * - 时间 0.15：近因优先
 *
 * 阈值语义：品类+地点+时间全中 = 0.80，稳过 60；
 * 品类+文本+时间 = 0.75，过线；仅品类+时间 = 0.55，不到线（需文本或地点佐证）。
 * 即「只撞品类不算命中」，必须至少再有一项实质证据。
 */
export const FEATURE_WEIGHTS = {
  item: 0.40,
  location: 0.25,
  text: 0.20,
  time: 0.15,
} as const;

/** 时间衰减半衰期（天）：相差 7 天仍保留约一半时间分 */
const TIME_HALF_LIFE_DAYS = 7;

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
  const found = (text || '').match(LOCATION_RE) || [];
  return new Set(found.map((s) => s.replace(/\s+/g, '')));
}

/**
 * 帖子地点集合：结构化 extra_fields.location 优先，再并入标题/正文的正则命中。
 * 只扫正文会漏掉发布表单里显式填写的结构化地点（如 "一食堂二楼"），
 * 导致同地点的一对失物/拾获帖无法命中地点特征。
 */
export function postLocations(post: {
  title?: string | null;
  content?: string | null;
  extra_fields?: string | null;
}): Set<string> {
  const locs = extractLocations(`${post.title || ''} ${post.content || ''}`);
  try {
    const extra = JSON.parse(post.extra_fields || '{}') as Record<string, unknown>;
    const structured = String(extra.location || '').trim();
    if (structured) {
      // 结构化地点整体保留（"一食堂二楼"），同时并入其局部词块（"一食堂"）
      locs.add(structured.replace(/\s+/g, ''));
      for (const token of extractLocations(structured)) locs.add(token);
    }
  } catch { /* extra_fields 非法时忽略 */ }
  return locs;
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

/** 时间特征归一化到 0~1：指数衰减，同一天≈1，超过时间窗≈0 */
export function timeFeature(daysDiff: number): number {
  if (daysDiff < 0) daysDiff = 0;
  if (daysDiff >= TIME_WINDOW_DAYS) return 0;
  return Math.pow(0.5, daysDiff / TIME_HALF_LIFE_DAYS);
}

/**
 * BM25 特征归一化：bm25() 返回负值且越相关绝对值越大。
 * 取绝对值后做饱和映射 |rank| / (|rank| + K)，把无上界的相关度压进 0~1。
 * 注意：该值随语料规模漂移（小语料下 IDF≈0 → 趋近 0），
 * 所以最终文本分由 textFeature 与词项覆盖率取较大者，不要单独依赖它。
 */
export function bm25Feature(rank: number): number {
  const magnitude = Math.abs(Number(rank) || 0);
  return magnitude / (magnitude + 2);
}

/**
 * 文本相关度特征（0~1）：BM25 归一化与词项覆盖率取较大者。
 *
 * 只用 BM25 在小语料下会失效：bm25() 的绝对值依赖 IDF，当某个词在库里几乎处处出现
 * （或库只有几十条帖）时 IDF≈0，实测 rank=-8.6e-6，归一化后文本分直接归零，
 * 明明关键词全中的候选也进不了阈值。
 *
 * 因此并行计算「查询词项被候选覆盖的比例」作为兜底信号——它不随语料规模漂移，
 * 也更容易在答辩时解释：命中 8 个词里的 6 个 → 0.75。
 */
export function textFeature(bm25Rank: number, queryTerms: string[], candidateText: string): number {
  const fromBm25 = bm25Feature(bm25Rank);
  if (queryTerms.length === 0) return fromBm25;

  const haystack = (candidateText || '').toLowerCase();
  let hit = 0;
  for (const t of queryTerms) {
    if (t && haystack.includes(t)) hit++;
  }
  const coverage = hit / queryTerms.length;
  return Math.max(fromBm25, coverage);
}

/** 两个 ISO/SQLite 日期字符串相差天数（绝对值）；任一缺失/非法即视为超出时间窗 */
export function daysBetween(a: string, b: string): number {
  if (!a || !b) return TIME_WINDOW_DAYS;
  const ta = Date.parse(String(a).replace(' ', 'T'));
  const tb = Date.parse(String(b).replace(' ', 'T'));
  if (Number.isNaN(ta) || Number.isNaN(tb)) return TIME_WINDOW_DAYS;
  return Math.abs(ta - tb) / 86_400_000;
}

/** 从 extra_fields 取品类（itemType），归一化为小写去空白 */
function itemTypeOf(extraFields: string | null | undefined): string {
  try {
    const extra = JSON.parse(extraFields || '{}') as Record<string, unknown>;
    return String(extra.itemType || '').trim().toLowerCase();
  } catch {
    return '';
  }
}

/**
 * 构造特征向量并加权综合评分（0~100）。
 * 纯函数，便于单测与离线评测：不读库、不看时间。
 *
 * 权重自适应：当任一方缺少 itemType（Web 端表单不强制填写、老帖无此字段）时，
 * 品类特征无法判定，其权重按比例并入文本特征——否则此类候选理论上限只有
 * 0.25*1 + 0.15*1 = 40 分，无论多相似都永远进不了 60 分阈值。
 */
export function scoreCandidate(
  current: { title: string; content: string; extra_fields: string | null },
  candidate: { title: string; content: string; extra_fields: string | null; rank: number; created_at: string },
  referenceTime: string,
  queryTerms: string[] = []
): { score: number; reasons: string[] } {
  const reasons: string[] = [];

  // 0) 硬时间窗：超出 TIME_WINDOW_DAYS 直接判为不匹配。
  //    仅靠时间特征归零是不够的——品类+地点两项满分仍有 60 分，
  //    会让「30 天前丢的钥匙」匹配到「今天捡的钥匙」，属于噪声而非命中。
  const dayGap = daysBetween(candidate.created_at, referenceTime);
  if (dayGap >= TIME_WINDOW_DAYS) {
    return { score: 0, reasons: ['超出时间窗'] };
  }

  // 1) 品类：失物招领最强的可判别信号（两侧都有值时才可判定）
  const myItem = itemTypeOf(current.extra_fields);
  const cItem = itemTypeOf(candidate.extra_fields);
  const itemComparable = !!(myItem && cItem);
  const itemScore = itemComparable && myItem === cItem ? 1 : 0;
  if (itemScore === 1) reasons.push(`品类一致「${cItem}」`);
  else if (itemComparable) reasons.push('品类不同');

  // 2) 地点：结构化地点优先，缺省回退标题/正文正则
  const myLocations = postLocations(current);
  const cLocations = postLocations(candidate);
  const locHits = locationIntersection(myLocations, cLocations);
  const locScore = locHits.length > 0 ? 1 : 0;
  if (locScore === 1) reasons.push(`地点匹配「${locHits[0]}」`);

  // 3) 文本相关度：BM25 归一化 + 查询词项覆盖率（后者抵消小语料下的 IDF 塌缩）
  //    未显式传入 queryTerms 时从当前帖自动提取：生产调用方（findRadarMatches 之外的
  //    离线评测、单测）都不传该参数，缺省为空会让文本特征退化成近乎 0 的 BM25 值，
  //    导致「品类+地点都对」的候选只有 36 分、进不了阈值。
  const terms = queryTerms.length
    ? queryTerms
    : buildFtsQuery(`${current.title} ${current.content}`, 8)
        .split(' OR ')
        .map((t) => t.replace(/^"|"$/g, '').trim().toLowerCase())
        .filter(Boolean);
  const textScore = textFeature(
    candidate.rank,
    terms,
    `${candidate.title} ${candidate.content}`.toLowerCase()
  );
  if (textScore >= 0.6) reasons.push('关键信息高度吻合');

  // 4) 时间接近度：两个帖子的发布时差（不是候选帖到现在的时差）
  const timeScore = timeFeature(daysBetween(candidate.created_at, referenceTime));

  // 权重自适应：品类不可判定时，其权重并入文本相关度
  const wItem = itemComparable ? FEATURE_WEIGHTS.item : 0;
  const wText = FEATURE_WEIGHTS.text + (itemComparable ? 0 : FEATURE_WEIGHTS.item);
  const totalWeight = wItem + FEATURE_WEIGHTS.location + wText + FEATURE_WEIGHTS.time;

  const raw =
    wItem * itemScore +
    FEATURE_WEIGHTS.location * locScore +
    wText * textScore +
    FEATURE_WEIGHTS.time * timeScore;

  const score = Math.round((100 * raw) / totalWeight);

  // 品类与地点双缺失时，仅靠文本+时间不应进入候选（噪声控制）
  if (!itemComparable && locScore === 0) reasons.push('仅文本相似');

  return { score, reasons };
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
  //    时间窗以「当前帖发布时间」为基准向后取，而不是相对 now——否则一篇 29 天前的帖
  //    永远找不到同期候选，此时差衰减也才有意义。
  const ftsQuery = buildFtsQuery(current.title + ' ' + current.content);
  const candidates = db
    .prepare(
      `SELECT p.id, p.title, p.content, p.extra_fields, p.created_at,
              bm25(posts_fts, 5.0, 1.0, 2.0) AS rank
       FROM posts_fts
       JOIN posts p ON p.id = posts_fts.rowid
       WHERE posts_fts MATCH ?
         AND p.id != ?
         AND p.section_id = ?
         AND json_extract(p.extra_fields, '$.direction') = ?
         AND p.status = 'published'
         AND p.created_at >= datetime(?, '-' || ? || ' days')
         AND p.created_at <= datetime(?, '+' || ? || ' days')
       ORDER BY rank
       LIMIT 12`
    )
    .all(
      ftsQuery,
      postId,
      sectionId,
      opposite,
      current.created_at,
      TIME_WINDOW_DAYS,
      current.created_at,
      TIME_WINDOW_DAYS
    ) as (PostRow & { rank: number })[];

  if (candidates.length === 0) return [];

  // 查询词项（去掉 FTS 引号与 OR），供词项覆盖率计算
  const queryTerms = ftsQuery
    .split(' OR ')
    .map((t) => t.replace(/^"|"$/g, '').trim().toLowerCase())
    .filter(Boolean);

  // 4. 复合评分（纯函数，见 scoreCandidate）
  const scored: RadarMatch[] = [];
  for (const c of candidates) {
    const { score, reasons } = scoreCandidate(current, c, current.created_at, queryTerms);
    if (score < MATCH_THRESHOLD) continue;
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
