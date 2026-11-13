/**
 * 分享卡片图单测（V5）：版式纯函数 + 安全口径。
 * 路由级（published/404/缓存头）在 integration/share-card.test.ts。
 */
import { describe, it, expect } from 'vitest';
import { wrapCJK, buildShareCardSvg, type ShareCardMeta } from '../../utils/shareCard.js';

const meta: ShareCardMeta = {
  id: 35,
  title: '出九成新 iPad Air 5 蓝色 64G',
  excerpt: '1500 元可小刀，当面交易',
  sectionName: '二手交易',
  sectionColor: '#F59E0B',
};

describe('wrapCJK', () => {
  it('按字数折行，超行截断加省略号', () => {
    expect(wrapCJK('一二三四五六', 3, 2)).toEqual(['一二三', '四五六']);
    expect(wrapCJK('一二三四五六七', 3, 2)).toEqual(['一二三', '四五…']);
  });

  it('空白归一、空串给单空行（SVG 不炸）', () => {
    expect(wrapCJK('  a   b  ', 10, 2)).toEqual(['a b']);
    expect(wrapCJK('', 10, 2)).toEqual(['']);
  });

  it('emoji/生僻字按码点切，不切半 surrogate', () => {
    const lines = wrapCJK('🎉🎉🎉', 2, 2);
    expect(lines[0]).toBe('🎉🎉');
    expect(lines[1]).toBe('🎉');
  });
});

describe('buildShareCardSvg', () => {
  it('750×600 微信 5:4 版式，板块色/标题/品牌条齐全', () => {
    const svg = buildShareCardSvg(meta);
    expect(svg).toContain('width="750" height="600"');
    expect(svg).toContain('#F59E0B');
    expect(svg).toContain('二手交易');
    expect(svg).toContain('CAMPUS WALL');
    expect(svg).toContain('NO.35');
    expect(svg).toContain('校园墙 · 让校园生活更有温度');
  });

  it('标题/摘要里的 XML 特殊字符被转义（防 SVG 注入）', () => {
    const svg = buildShareCardSvg({ ...meta, title: '<script>&"x', excerpt: '</text><rect fill="red"/>' });
    expect(svg).toContain('&lt;script&gt;');
    expect(svg).not.toContain('<script>');
    expect(svg).not.toContain('<rect fill="red"/>');
  });

  it('卡面不含任何作者字段（匿名零泄露的版式级保证）', () => {
    const svg = buildShareCardSvg(meta);
    expect(svg).not.toContain('nickname');
    expect(svg).not.toContain('author');
    expect(svg).not.toContain('匿名');
  });

  it('长标题两行封顶，不溢出画布', () => {
    const svg = buildShareCardSvg({ ...meta, title: '超长标题'.repeat(20) });
    const titleTexts = svg.match(/font-size="44"/g) || [];
    expect(titleTexts.length).toBe(2);
    expect(svg).toContain('…');
  });
});
