/**
 * 爬虫静态面单测（V5）：buildSitemapXml 纯函数 + robots/sitemap 处理器。
 * 用假 app 捕获路由 handler，直接调用验证输出，不真起 express。
 */
import { describe, it, expect, vi } from 'vitest';

const fakeAll = vi.fn();
vi.mock('../../db.js', () => ({
  db: { prepare: () => ({ all: (...a: any[]) => fakeAll(...a), get: () => undefined }) },
}));
vi.mock('../../utils/cache.js', () => ({
  cacheGet: () => undefined,
  cacheSet: () => {},
  cacheInvalidate: () => 0,
}));

import { buildSitemapXml, buildRssXml, registerCrawlEndpoints, type SitemapEntry, type RssItem } from '../../utils/seo.js';
import * as seoMod from '../../utils/seo.js';
// 临时：让 catch 里的错误可见
const origRegister = seoMod.registerCrawlEndpoints; void origRegister;

function fakeRes() {
  const res: any = {
    statusCode: 200, body: '', headers: {},
    type(_t: string) { return res },
    set(k: string, v: string) { res.headers[k] = v; return res },
    send(b: string) { res.body = b; return res },
    status(c: number) { res.statusCode = c; return res },
  };
  return res;
}
function fakeReq() {
  return { method: 'GET', path: '/sitemap.xml', protocol: 'https', headers: { host: 'wall.example.edu' }, get(h: string) { return this.headers[h.toLowerCase()] } } as any;
}

/** 假 express app：按 path 捕获 GET handler */
function fakeApp() {
  const routes = new Map<string, (req: any, res: any) => void>();
  return {
    get(path: string | RegExp, h: any) { if (typeof path === 'string') routes.set(path, h); },
    invoke(path: string, req: any, res: any) { routes.get(path)!(req, res); },
    has(path: string) { return routes.has(path); },
  };
}

describe('buildSitemapXml', () => {
  it('拼出合法 urlset，转义 loc、带上 lastmod/priority', () => {
    const entries: SitemapEntry[] = [
      { loc: 'https://x/', priority: '1.0' },
      { loc: 'https://x/post/5', lastmod: '2026-01-02', priority: '0.8' },
    ];
    const xml = buildSitemapXml(entries);
    expect(xml).toContain('<urlset');
    expect(xml).toContain('<loc>https://x/</loc>');
    expect(xml).toContain('<lastmod>2026-01-02</lastmod>');
    expect(xml).toContain('<priority>1.0</priority>');
  });

  it('特殊字符被转义（防 XML 注入）', () => {
    const xml = buildSitemapXml([{ loc: 'https://x/a&b<c>' }]);
    expect(xml).toContain('&amp;');
    expect(xml).toContain('&lt;');
    expect(xml).not.toContain('<loc>https://x/a&b<c>');
  });
});

describe('registerCrawlEndpoints', () => {
  it('注册 robots.txt / sitemap.xml / rss.xml / feed 四条路由', () => {
    const app = fakeApp();
    registerCrawlEndpoints(app as any);
    expect(app.has('/robots.txt')).toBe(true);
    expect(app.has('/sitemap.xml')).toBe(true);
    expect(app.has('/rss.xml')).toBe(true);
    expect(app.has('/feed')).toBe(true);
  });

  it('robots.txt 指向绝对 Sitemap 且屏蔽 /admin /api', () => {
    const app = fakeApp();
    registerCrawlEndpoints(app as any);
    const res = fakeRes();
    app.invoke('/robots.txt', fakeReq(), res);
    expect(res.body).toContain('Disallow: /admin');
    expect(res.body).toContain('Disallow: /api');
    expect(res.body).toContain('Sitemap: https://wall.example.edu/sitemap.xml');
  });

  it('sitemap.xml 收录 published 帖与板块，类型 XML', () => {
    // db.prepare(...).all() 被调用两次：先 posts 后 sections
    fakeAll.mockImplementationOnce(() => [{ id: 35, created_at: '2026-11-01 08:00:00' }]);
    fakeAll.mockImplementationOnce(() => [{ id: 1 }, { id: 2 }]);
    const app = fakeApp();
    registerCrawlEndpoints(app as any);
    const res = fakeRes();
    app.invoke('/sitemap.xml', fakeReq(), res);
    expect(res.body).toContain('<loc>https://wall.example.edu/post/35</loc>');
    expect(res.body).toContain('<loc>https://wall.example.edu/section/1</loc>');
    expect(res.body).toContain('<loc>https://wall.example.edu/section/2</loc>');
    expect(res.body).toContain('<loc>https://wall.example.edu/</loc>');
    expect(res.body).toContain('<lastmod>2026-11-01</lastmod>');
    expect(res.headers['Cache-Control']).toContain('max-age=600');
  });

  it('/rss.xml 输出已发布帖，匿名归一且转义，带 RSS 类型与缓存头', () => {
    fakeAll.mockImplementationOnce(() => [
      { id: 42, created_at: 1762000000000, title: '出 <耳机>', content: '蓝牙款 & 九成新', is_anonymous: 1, nickname: '真实昵称' },
      { id: 41, created_at: 1761990000000, title: null, content: '找回校园卡一张', is_anonymous: 0, nickname: '热心同学' },
    ]);
    const app = fakeApp();
    registerCrawlEndpoints(app as any);
    const res = fakeRes();
    app.invoke('/rss.xml', fakeReq(), res);
    expect(res.headers['Cache-Control']).toContain('max-age=600');
    expect(res.body).toContain('<rss version="2.0"');
    expect(res.body).toContain('<guid isPermaLink="false">campus-wall:post:42</guid>');
    expect(res.body).toContain('<link>https://wall.example.edu/post/42</link>');
    expect(res.body).toContain('GMT');
    // 匿名：署名归一，真实昵称绝不出现在订阅流
    expect(res.body).toContain('<dc:creator>匿名同学</dc:creator>');
    expect(res.body).not.toContain('真实昵称');
    // XML 转义：标题里的尖括号与 & 不得破坏文档结构
    expect(res.body).toContain('出 &lt;耳机&gt;');
    expect(res.body).toContain('&amp; 九成新');
    // 无标题帖回退正文
    expect(res.body).toContain('找回校园卡一张');
    // /feed 别名同逻辑
    const res2 = fakeRes();
    fakeAll.mockImplementationOnce(() => []);
    app.invoke('/feed', fakeReq(), res2);
    expect(res2.body).toContain('</channel></rss>');
  });
});

describe('buildRssXml', () => {
  it('channel 元信息齐全，item 按序拼装', () => {
    const items: RssItem[] = [
      { title: 'A', link: 'https://x/post/2', guid: 'g2', pubDate: 'Mon, 02 Nov 2026 08:00:00 GMT', description: 'd2', author: '甲' },
      { title: 'B', link: 'https://x/post/1', guid: 'g1', pubDate: 'Sun, 01 Nov 2026 08:00:00 GMT', description: 'd1', author: '乙' },
    ];
    const xml = buildRssXml('https://x', items);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?><rss')).toBe(true);
    expect(xml).toContain('<title>校园墙</title>');
    expect(xml).toContain('<language>zh-CN</language>');
    expect(xml).toContain('<guid isPermaLink="false">g2</guid>');
    expect(xml.indexOf('g2')).toBeLessThan(xml.indexOf('g1'));
    expect(xml).toContain('<dc:creator>甲</dc:creator>');
  });

  it('恶意内容被 XML 转义，闭合标签不逃逸', () => {
    const xml = buildRssXml('https://x', [
      { title: '</title><item><title>注入', link: 'https://x/', guid: 'g', pubDate: 'x', description: '<description>偷渡', author: 'a&b' },
    ]);
    expect((xml.match(/<title>/g) || []).length).toBe(2); // channel 一份 + item 一份
    expect(xml).toContain('&lt;/title&gt;');
    expect(xml).toContain('a&amp;b');
  });
});
