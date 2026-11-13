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

import { escapeAttr, buildMetaTags, buildJsonLd, injectSeo, seoMetaForPath } from '../../utils/seo.js';

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

describe('buildJsonLd · schema.org 结构化数据', () => {
  const article = {
    title: '出九成新 iPad - 校园墙',
    description: '二手交易 · 数码小白：1500 元可小刀',
    image: `${BASE}/uploads/a.jpg`,
    url: `${BASE}/post/1`,
    type: 'article' as const,
    publishedAt: '2026-11-01T00:00:00.000Z',
    authorName: '数码小白',
  };

  it('website 型不输出 JSON-LD（首页没有可声明的正文实体）', () => {
    expect(buildJsonLd({ ...article, type: 'website' })).toBeNull();
  });

  it('article 型输出合法 SocialMediaPosting：headline 去站名后缀、isPartOf 指回根、带时间/作者/图', () => {
    const tag = buildJsonLd(article);
    expect(tag).toBeTruthy();
    const json = (tag as string).replace(/^<script type="application\/ld\+json">/, '').replace(/<\/script>$/, '');
    const ld = JSON.parse(json);
    expect(ld['@type']).toBe('SocialMediaPosting');
    expect(ld.headline).toBe('出九成新 iPad');
    expect(ld.url).toBe(`${BASE}/post/1`);
    expect(ld.datePublished).toBe('2026-11-01T00:00:00.000Z');
    expect(ld.author).toEqual({ '@type': 'Person', name: '数码小白' });
    expect(ld.image).toBe(`${BASE}/uploads/a.jpg`);
    expect(ld.isPartOf).toEqual({ '@type': 'WebSite', name: '校园墙', url: `${BASE}/` });
  });

  it('缺 publishedAt/authorName/image 时对应字段省略，JSON 依旧合法', () => {
    const tag = buildJsonLd({ ...article, publishedAt: undefined, authorName: undefined, image: null });
    const ld = JSON.parse((tag as string).replace(/^<script[^>]*>/, '').replace(/<\/script>$/, ''));
    expect(ld.datePublished).toBeUndefined();
    expect(ld.author).toBeUndefined();
    expect(ld.image).toBeUndefined();
  });

  it('内容里塞 </script> 被转成 \\u003c —— 不得提前闭合 script 标签', () => {
    const evil = { ...article, description: 'x</script><script>alert(1)</script>' };
    const tag = buildJsonLd(evil) as string;
    // 整个注入串里 </script> 只允许出现 1 次（就是自己那枚闭合）
    expect((tag.match(/<\/script>/g) || []).length).toBe(1);
    expect(tag).toContain('\\u003c');
    const ld = JSON.parse(tag.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, ''));
    expect(ld.description).toContain('</script>'); // 反转义后内容原样保留
  });

  it('injectSeo：article 页面 head 内同时有 OG 与 ld+json；website 页面只有 OG', () => {
    const tpl = '<html><head><title>t</title><meta name="description" content="d"></head><body></body></html>';
    const art = injectSeo(tpl, article, `${BASE}/i.png`);
    expect(art).toContain('application/ld+json');
    expect(art.indexOf('SocialMediaPosting')).toBeLessThan(art.indexOf('</head>'));
    const web = injectSeo(tpl, { ...article, type: 'website' }, `${BASE}/i.png`);
    expect(web).not.toContain('application/ld+json');
    expect(web).toContain('og:title');
  });

  it('模板预置的 ld+json 被清理，不出现两份结构化数据', () => {
    const tpl = '<html><head><title>t</title><script type="application/ld+json">{"@type":"WebSite"}</script></head><body></body></html>';
    const out = injectSeo(tpl, article, `${BASE}/i.png`);
    expect((out.match(/application\/ld\+json/g) || []).length).toBe(1);
    expect(out).not.toContain('"@type":"WebSite"}');
  });
});
