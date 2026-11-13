/**
 * 帖子分享卡片图（V5）：GET /api/posts/:id/share-card.png
 *
 * 微信分享 imageUrl 必须是网络图；无图帖此前回退空串（微信截页面当封面，丑且不稳）。
 * 这里用 sharp 合成 750×600（微信推荐 5:4）V4 纸感卡：
 *   纸底 + 墨线框 + 硬投影 + 板块色贴纸 + 大字标题 + 摘要 + 柠色品牌条。
 * 安全口径：仅 published 帖出图；卡面不含任何作者信息（匿名零泄露）。
 * 缓存：进程内 10min，key 带 updated_at（编辑后立即换卡）；上限 256 条防内存膨胀。
 * 字体依赖：宿主需 CJK 字体（Windows 雅黑 / Linux fonts-noto-cjk，Dockerfile 与 render.yaml 已装）。
 */
import sharp from 'sharp';
import { db } from '../db.js';

const PAPER = '#F7F2E8';
const INK = '#14110F';
const INK_SOFT = '#4A443C';
const LIME = '#C8F04A';
const SKY = '#38D6F5';
const CORAL = '#FF4D2E';

/** 与 web src/utils/sections.ts 同源的八色板块轮 */
const SECTION_COLORS: Record<number, string> = {
  1: '#F59E0B', 2: '#06B6D4', 3: '#F43F5E', 4: '#8B5CF6',
  5: '#4F46E5', 6: '#3B82F6', 7: '#C026D3', 8: '#EC4899',
};

export interface ShareCardMeta {
  id: number;
  title: string;
  excerpt: string;
  sectionName: string;
  sectionColor: string;
}

function escapeXml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** CJK 逐字折行（SVG 无自动换行）；超行数截断加省略号 */
export function wrapCJK(text: string, perLine: number, maxLines: number): string[] {
  const chars = Array.from((text || '').replace(/\s+/g, ' ').trim());
  const lines: string[] = [];
  for (let i = 0; i < chars.length && lines.length < maxLines; i += perLine) {
    lines.push(chars.slice(i, i + perLine).join(''));
  }
  if (chars.length > perLine * maxLines && lines.length) {
    const last = lines[lines.length - 1] ?? '';
    lines[lines.length - 1] = last.slice(0, perLine - 1) + '…';
  }
  return lines.length ? lines : [''];
}

const FONT = `'Noto Sans CJK SC','Microsoft YaHei','PingFang SC',sans-serif`;

/** 纯函数：拼 750×600 卡片 SVG（独立出来便于单测锁版式与安全口径） */
export function buildShareCardSvg(meta: ShareCardMeta): string {
  const titleLines = wrapCJK(meta.title, 15, 2);
  const excerptLines = wrapCJK(meta.excerpt, 24, 2);
  const titleSvg = titleLines
    .map((l, i) => `<text x="48" y="${176 + i * 58}" font-family="${FONT}" font-size="44" font-weight="900" fill="${INK}">${escapeXml(l)}</text>`)
    .join('');
  const excerptSvg = excerptLines
    .map((l, i) => `<text x="48" y="${330 + i * 40}" font-family="${FONT}" font-size="26" fill="${INK_SOFT}">${escapeXml(l)}</text>`)
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="750" height="600" viewBox="0 0 750 600">
  <rect width="750" height="600" fill="${PAPER}"/>
  <rect x="26" y="26" width="714" height="564" fill="${INK}"/>
  <rect x="18" y="18" width="714" height="564" fill="${PAPER}" stroke="${INK}" stroke-width="3"/>
  <rect x="48" y="48" width="168" height="46" fill="${meta.sectionColor}" stroke="${INK}" stroke-width="3"/>
  <text x="132" y="80" text-anchor="middle" font-family="${FONT}" font-size="26" font-weight="900" fill="${INK}">${escapeXml(meta.sectionName.slice(0, 5))}</text>
  <text x="702" y="80" text-anchor="end" font-family="${FONT}" font-size="20" font-weight="900" letter-spacing="4" fill="${INK}">CAMPUS WALL</text>
  <rect x="640" y="112" width="14" height="14" fill="${SKY}"/>
  <rect x="662" y="112" width="14" height="14" fill="${CORAL}"/>
  <rect x="684" y="112" width="14" height="14" fill="${LIME}"/>
  ${titleSvg}
  ${excerptSvg}
  <line x1="48" y1="452" x2="702" y2="452" stroke="${INK}" stroke-width="2" stroke-dasharray="6 6"/>
  <rect x="56" y="486" width="654" height="60" fill="${INK}"/>
  <rect x="48" y="478" width="654" height="60" fill="${LIME}" stroke="${INK}" stroke-width="3"/>
  <text x="72" y="517" font-family="${FONT}" font-size="26" font-weight="900" fill="${INK}">校园墙 · 让校园生活更有温度</text>
  <text x="678" y="517" text-anchor="end" font-family="${FONT}" font-size="22" font-weight="900" fill="${INK}">NO.${meta.id}</text>
</svg>`;
}

interface CacheEntry { key: string; png: Buffer; at: number }
const cache = new Map<number, CacheEntry>();
const TTL = 600_000;
const MAX_ENTRIES = 256;

/** 查库 → 合成 → 缓存；非 published 返回 null（路由层 404） */
export async function getShareCardPng(id: number): Promise<Buffer | null> {
  const row = db
    .prepare(
      `SELECT p.id, p.title, p.content, p.status, p.updated_at, p.section_id, s.name AS section_name
       FROM posts p LEFT JOIN sections s ON s.id = p.section_id WHERE p.id = ?`
    )
    .get(id) as any;
  if (!row || row.status !== 'published') return null;

  const key = `${row.updated_at}:${row.title}`;
  const hit = cache.get(id);
  if (hit && hit.key === key && Date.now() - hit.at < TTL) return hit.png;

  const meta: ShareCardMeta = {
    id: row.id,
    title: row.title || row.content || '校园墙',
    excerpt: row.content || '',
    sectionName: row.section_name || '校园墙',
    sectionColor: SECTION_COLORS[row.section_id] || LIME,
  };
  const png = await sharp(Buffer.from(buildShareCardSvg(meta))).png().toBuffer();
  if (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(id, { key, png, at: Date.now() });
  return png;
}
