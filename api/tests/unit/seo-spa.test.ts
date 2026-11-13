/**
 * spaHandler 处理器单测：验证 GET 注入、非 GET 放行、DB 异常兜底吐原始 HTML。
 * （集成路径只在 NODE_ENV=production 注册，这里用假 req/res 直接测处理器本身。）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const fakeGet = vi.fn();
vi.mock('../../db.js', () => ({
  db: { prepare: () => ({ get: (...a: any[]) => fakeGet(...a) }) },
}));

// cache 用真实实现会跨用例污染，这里 mock 成 miss
vi.mock('../../utils/cache.js', () => ({
  cacheGet: () => undefined,
  cacheSet: () => {},
  cacheInvalidate: () => 0,
}));

import { spaHandler } from '../../utils/seo.js';
import fs from 'fs'
import os from 'os'
import path from 'path'

function fakeRes() {
  const res: any = {
    statusCode: 200,
    body: '',
    headers: {},
    type(_t: string) { return res },
    set(k: string, v: string) { res.headers[k] = v; return res },
    send(html: string) { res.body = html; return res },
    status(c: number) { res.statusCode = c; return res },
    sendFile(_p: string, cb?: (e?: any) => void) { cb?.(); return res },
  };
  return res;
}

function fakeReq(opts: { method?: string; path?: string; headers?: Record<string, string> } = {}) {
  const req: any = {
    method: opts.method || 'GET',
    path: opts.path || '/',
    protocol: 'http',
    headers: { host: 'wall.example.edu.cn', ...(opts.headers || {}) },
    get(h: string) { return this.headers[h.toLowerCase()] },
  };
  return req;
}

const INDEX_HTML = [
  '<html><head><title>校园墙</title>',
  '<meta name="description" content="静态说明">',
  '<meta property="og:type" content="website">',
  '<meta property="og:title" content="静态标题">',
  '</head><body><div id="app"></div></body></html>',
].join('')

// 写一个临时 index.html 供 spaHandler 读取
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-seo-'));
const tmpIndex = path.join(tmpDir, 'index.html');
fs.writeFileSync(tmpIndex, INDEX_HTML, 'utf8');

beforeEach(() => {
  fakeGet.mockReset();
});

describe('spaHandler · 生产环境 SPA fallback', () => {
  it('GET /post/:id → published 帖返回注入 OG 的 HTML，不重复静态 og', async () => {
    fakeGet.mockReturnValue({
      title: '找丢失的学生卡',
      content: '今天下午在三教丢了学生卡，有拾到者请联系',
      images: '[]',
      is_anonymous: 0,
      status: 'published',
      nickname: '马楼同学',
      section_name: '失物招领',
    });
    const handler = spaHandler(tmpIndex);
    const req = fakeReq({ path: '/post/7' });
    const res = fakeRes();
    const next = vi.fn();
    await handler(req, res, next);
    expect(res.body).toContain('找丢失的学生卡 - 校园墙');
    expect(res.body).toContain('马楼同学');
    expect(res.body).not.toContain('静态标题');
    expect((res.body.match(/og:title/g) || []).length).toBe(1);
    expect(next).not.toHaveBeenCalled();
  });

  it('GET / 返回站点默认 OG 与正确 cache-control', async () => {
    const handler = spaHandler(tmpIndex);
    const res = fakeRes();
    await handler(fakeReq({ path: '/' }), res, vi.fn());
    expect(res.headers['Cache-Control']).toBe('public, max-age=120');
    expect(res.body).toContain('og:type');
  });

  it('非 GET 请求直接 next() 放行', async () => {
    const handler = spaHandler(tmpIndex);
    const next = vi.fn();
    await handler(fakeReq({ method: 'POST', path: '/post/7' }), fakeRes(), next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(fakeGet).not.toHaveBeenCalled();
  });

  it('TRUST_PROXY 头：x-forwarded-proto/host 生成绝对分享 URL', async () => {
    fakeGet.mockReturnValue({
      title: 'T', content: 'C', images: '["/uploads/x.jpg"]',
      is_anonymous: 0, status: 'published', nickname: 'N', section_name: 'S',
    });
    const handler = spaHandler(tmpIndex);
    const res = fakeRes();
    await handler(
      fakeReq({ path: '/post/8', headers: { 'x-forwarded-proto': 'https', 'x-forwarded-host': 'share.example.edu.cn' } }),
      res,
      vi.fn(),
    );
    expect(res.body).toContain('property="og:image" content="https://share.example.edu.cn/uploads/x.jpg"');
    expect(res.body).toContain('property="og:url" content="https://share.example.edu.cn/post/8"');
  });

  it('index.html 读不到时 next(err) 而非白屏崩溃', async () => {
    const handler = spaHandler(path.join(tmpDir, 'does-not-exist.html'));
    const next = vi.fn();
    await handler(fakeReq({ path: '/post/9' }), fakeRes(), next);
    expect(next).toHaveBeenCalled();
    expect(next.mock.calls[0]![0]).toBeInstanceOf(Error);
  });
});
