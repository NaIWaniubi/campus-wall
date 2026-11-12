/**
 * 失物招领智能匹配工具：
 * 发布帖子时，检索失物/招领类板块下近 N 天的相似候选帖（关键词 LIKE 打分，无外部依赖），
 * 达到阈值则通过站内通知双向告知双方。
 */
import { db } from '../db.js';
import { upsertNotification } from './notification.js';

// 匹配窗口：只检索近 30 天内发布的候选帖
const MATCH_WINDOW_DAYS = 30;
// 最低命中得分（标题命中权重 2、正文命中权重 1），达到才算疑似匹配
const MIN_MATCH_SCORE = 2;
// 最多返回/通知的匹配条数
const MAX_MATCHES = 5;

/**
 * 从文本提取匹配关键词（与 ai.ts 同思路）：
 * 英文/数字取连续词块；中文按 2 字滑窗切分（无分词依赖，靠命中数排序去噪）
 */
function extractKeywords(text: string): string[] {
  const cleaned = text.replace(/[\s，。！？、；：,.!?;:~～"'"'（）()\[\]{}]/g, '');
  const words = new Set<string>();

  // ASCII 词块
  for (const w of text.match(/[a-zA-Z0-9]{2,}/g) || []) {
    if (w.length <= 20) words.add(w.toLowerCase());
  }

  // 中文 2 字滑窗
  const chinese = cleaned.replace(/[a-zA-Z0-9]/g, '');
  for (let i = 0; i + 2 <= chinese.length; i++) {
    words.add(chinese.slice(i, i + 2));
    if (words.size >= 12) break;
  }

  return Array.from(words).slice(0, 12);
}

/**
 * 判断板块名是否属于失物招领类（失物/拾物两个方向都算，含未来拆分的对向板块）
 */
export function isLostFoundSection(name: string): boolean {
  return /失物|招领|拾|寻物/.test(name || '');
}

/**
 * 为一篇帖子查找失物招领板块下的相似候选帖（排除自身与非本人帖），
 * 按关键词命中得分降序返回前 MAX_MATCHES 条
 */
export function findLostFoundMatches(
  post: { id: number; user_id: number; title: string; content: string; extra_fields?: string | null }
) {
  // 失物招领类板块下近 N 天已发布的候选帖
  const rows = db.prepare(`
    SELECT p.id, p.user_id, p.title, p.content, p.is_anonymous, p.created_at, p.extra_fields,
           s.name AS section_name, u.nickname AS author_nickname, u.avatar AS author_avatar
    FROM posts p
    JOIN sections s ON s.id = p.section_id
    JOIN users u ON u.id = p.user_id
    WHERE p.status = 'published' AND u.status != 'banned'
      AND p.id != ? AND p.user_id != ?
      AND p.created_at >= datetime('now', '-' || ? || ' days')
      AND (s.name LIKE '%失物%' OR s.name LIKE '%招领%' OR s.name LIKE '%拾%' OR s.name LIKE '%寻物%')
  `).all(post.id, post.user_id, MATCH_WINDOW_DAYS) as any[];

  const keywords = extractKeywords(`${post.title} ${post.content}`);
  if (!keywords.length) return [];

  // 方向必须相反：寻物帖只该匹配招领帖。早期只看板块不看 direction，
  // 会导致「先丢了伞」的通知里出现「另一个人也丢了伞」。
  const readExtra = (raw: string | null | undefined): Record<string, string> => {
    try { return JSON.parse(raw || '{}') || {}; } catch { return {}; }
  };
  const myExtra = readExtra(post.extra_fields);
  const myDirection = String(myExtra.direction || '');
  const myItem = String(myExtra.itemType || '').trim().toLowerCase();

  // 打分：标题命中权重 2、正文命中权重 1
  const scored: any[] = [];
  for (const row of rows) {
    const extra = readExtra(row.extra_fields);
    const dir = String(extra.direction || '');
    // 双方都有方向时必须相反；候选缺方向则放行（兼容老数据）
    if (myDirection && dir && dir === myDirection) continue;

    // 品类是失物场景最强的判别信号：双方都有 itemType 且不同，直接排除。
    // 否则「校园卡」会因为共用「捡到/丢失」二字匹配到「钥匙」。
    const item = String(extra.itemType || '').trim().toLowerCase();
    if (myItem && item && item !== myItem) continue;

    let score = 0;
    for (const kw of keywords) {
      if (row.title.includes(kw)) score += 2;
      if (row.content.includes(kw)) score += 1;
    }
    if (score >= MIN_MATCH_SCORE) scored.push({ ...row, score });
  }

  scored.sort((a, b) => b.score - a.score || b.created_at.localeCompare(a.created_at));
  return scored.slice(0, MAX_MATCHES);
}

/**
 * 匹配命中后的双向站内通知：
 * 发布者收到一条汇总通知（related_id 指向最相似的候选帖），
 * 每个被匹配帖子的作者收到一条指向新帖的通知（均走 upsertNotification 去重）
 */
export function notifyLostFoundMatch(
  newPost: { id: number; user_id: number; title: string },
  matches: any[]
): void {
  if (!matches.length) return;

  // 通知发布者
  upsertNotification(
    newPost.user_id,
    'match',
    `发现 ${matches.length} 条可能与你相关的帖子，如「${matches[0].title}」`,
    matches[0].id
  );

  // 通知被匹配帖子的作者
  for (const m of matches) {
    if (m.user_id === newPost.user_id) continue;
    upsertNotification(
      m.user_id,
      'match',
      `有新帖「${newPost.title}」可能与你的帖子「${m.title}」相关`,
      newPost.id
    );
  }
}

/**
 * 格式化单条匹配结果（供接口返回给前端"可能相关"卡片）
 */
export function formatMatch(m: any) {
  return {
    id: m.id,
    title: m.title,
    excerpt: m.content.length > 60 ? m.content.slice(0, 60) + '…' : m.content,
    section: m.section_name,
    isAnonymous: !!m.is_anonymous,
    author: m.is_anonymous ? '匿名用户' : m.author_nickname,
    score: m.score,
    createdAt: m.created_at ? new Date(m.created_at).toISOString() : m.created_at,
  };
}
