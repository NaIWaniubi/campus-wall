/**
 * V5 社交分享卡片（SEO）单测：
 * 微信/QQ 群里裸链接能不能出卡片，取决于这里的字符串拼装 —— 纯逻辑，必须锁死。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// 注入假 DB：seoMetaForPath 只用到 prepare().get()
const fakeGet = vi.fn();
vi.mock('../../db.js', () => ({
  db: { prepare: () => ({ get: (...args: any[]) => fakeGet(...args) }) },
}));
vi.mock('../../utils/cache.js', () => ({
  cacheGet: () => undefined,
  cacheSet: () => {},
}));

import { escapeAttr, buildMetaTags, injectSeo, seoMetaForPath } from '../../utils/seo.js';

const BASE = 'https://wall.example.edu.cn';

beforeEach(() => fakeGet.mockReset());

describe('escapeAttr / buildMetaTags', () => {
  it('引号和尖括号被转义，不会破坏 head', () => {
    expect(escapeAttr('a"b<c>&d')).toBe('a&quot;b&lt;c&gt;&amp;d');
  });

  it('有首图用首图，没首图回退站点默认图', () => {
    const withImg = buildMetaTags(
      { title: 'T', description: 'D', image: 'https://x/i.png', url: `${BASE}/post/1`, type: 'article' },
      `${BASE}/icons/icon-512.png`,
    );
    expect(withImg).toContain('og:image" content="https://x/i.png');
    const noImg = buildMetaTags(
      { title: 'T', description: 'D', image: null, url: `${BASE}/post/1`, type: 'article' },
      `${BASE}/icons/icon-512.png`,
    );
    expect(noImg).toContain('og:image" content="https://wall.example.edu.cn/icons/icon-512.png');
  });
});

describe('injectSeo', () => {
  const tpl = '<html><head><title>校园墙</title><meta name="description" content="旧">\n    <meta property="og:type" content="website" />\n    <meta property="og:title" content="静态标题" />\n  </head><body></body></html>';

  it('替换 title 与 description，并在 </head> 前注入 OG', () => {
    const out = injectSeo(tpl, { title: '新标题', description: '新摘要', image: null, url: `${BASE}/post/9`, type: 'article' }, `${BASE}/icons/icon-512.png`);
    expect(out).toContain('<title>新标题</title>');
    expect(out).toContain('content="新摘要"');
    expect(out).toContain('property="og:title"');
    expect(out.indexOf('og:title')).toBeLessThan(out.indexOf('</head>'));
  });

  it('模板里预置的静态 og 标签被清掉，只留注入的那一份', () => {
    const out = injectSeo(tpl, { title: '新标题', description: 'D', image: null, url: `${BASE}/post/9`, type: 'article' }, `${BASE}/icons/icon-512.png`);
    expect(out).not.toContain('静态标题');
    expect((out.match(/og:title/g) || []).length).toBe(1);
    expect((out.match(/og:type/g) || []).length).toBe(1);
    expect(out).toContain('content="article"');
  });

  it('模板缺 description 时也能补上 meta 和 OG', () => {
    const bare = '<html><head><title>x</title></head><body></body></html>';
    const out = injectSeo(bare, { title: 'T2', description: 'D2', image: null, url: BASE, type: 'website' }, `${BASE}/i.png`);
    expect(out).toContain('<meta name="description" content="D2">');
    expect(out).toContain('og:title');
  });
});

describe('seoMetaForPath · 帖子页', () => {
  const published = {
    title: '出九成新 iPad',
    content: '1500 元可小刀，当面交易',
    images: JSON.stringify(['/uploads/a.jpg']),
    is_anonymous: 0,
    status: 'published',
    nickname: '数码小白',
    section_name: '二手交易',
  };

  it('published 帖子：标题带站名、摘要带板块、首图转绝对地址', () => {
    fakeGet.mockReturnValue(published);
    const meta = seoMetaForPath('/post/1', BASE);
    expect(meta.type).toBe('article');
    expect(meta.title).toContain('出九成新 iPad');
    expect(meta.title).toContain('校园墙');
    expect(meta.description).toContain('二手交易');
    expect(meta.description).toContain('数码小白');
    expect(meta.image).toBe(`${BASE}/uploads/a.jpg`);
    expect(meta.url).toBe(`${BASE}/post/1`);
  });

  it('匿名帖不暴露昵称', () => {
    fakeGet.mockReturnValue({ ...published, is_anonymous: 1 });
    const meta = seoMetaForPath('/post/2', BASE);
    expect(meta.description).toContain('匿名同学');
    expect(meta.description).not.toContain('数码小白');
  });

  it('审核中/已删除/不存在 → 回退站点默认，不外泄内容', () => {
    for (const row of [{ ...published, status: 'pending_review' }, { ...published, status: 'deleted' }, undefined, null]) {
      fakeGet.mockReturnValue(row);
      const meta = seoMetaForPath('/post/3', BASE);
      expect(meta.type).toBe('website');
      expect(meta.title).toBe('校园墙');
      expect(meta.description).not.toContain('iPad');
    }
  });

  it('images 脏数据（非法 JSON）不影响出卡片', () => {
    fakeGet.mockReturnValue({ ...published, images: '{bad json' });
    const meta = seoMetaForPath('/post/4', BASE);
    expect(meta.image).toBeNull();
  });

  it('非帖子路径直接给站点默认', () => {
    const meta = seoMetaForPath('/', BASE);
    expect(fakeGet).not.toHaveBeenCalled();
    expect(meta.title).toContain('校园墙');
    expect(meta.url).toBe(`${BASE}/`);
  });
});
