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

import { buildSitemapXml, registerCrawlEndpoints, type SitemapEntry } from '../../utils/seo.js';
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
  it('注册 robots.txt 与 sitemap.xml 两条路由', () => {
    const app = fakeApp();
    registerCrawlEndpoints(app as any);
    expect(app.has('/robots.txt')).toBe(true);
    expect(app.has('/sitemap.xml')).toBe(true);
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
});
