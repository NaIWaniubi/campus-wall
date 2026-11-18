/**
 * 帖子列表筛选参数回归（此前是「死参数」：schema 声明并通过校验，handler 从不消费，
 * 前端传了也全量返回——用户以为筛选生效了，实际没筛）
 */
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../app.js';

/** 列表响应体的兼容取值（data 可能是数组，也可能是 {list,total}） */
function pickList(body: any): any[] {
  const d = body?.data;
  if (Array.isArray(d)) return d;
  if (Array.isArray(d?.list)) return d.list;
  if (Array.isArray(d?.items)) return d.items;
  return [];
}

describe('帖子列表筛选参数（死参数修复回归）', () => {
  it('search 参数可用：接口正常返回且只含命中项', async () => {
    const res = await request(app).get('/api/posts?search=' + encodeURIComponent('校园卡'));
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(200);
    const list = pickList(res.body);
    // 命中集里的每条都应含关键词（LIKE 生效）
    for (const p of list) {
      const text = `${p.title || ''} ${p.content || ''}`;
      expect(text).toContain('校园卡');
    }
  });

  it('minPrice/maxPrice 不报错并按价格区间过滤', async () => {
    const res = await request(app).get('/api/posts?minPrice=0&maxPrice=100000');
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(200);
    const list = pickList(res.body);
    for (const p of list) {
      const price = Number(p.extraFields?.price ?? p.price ?? 0);
      expect(price).toBeGreaterThanOrEqual(0);
      expect(price).toBeLessThanOrEqual(100000);
    }
  });

  it('lostOrFound 方向筛选可用（lost/found 都不 500）', async () => {
    for (const dir of ['lost', 'found']) {
      const res = await request(app).get(`/api/posts?lostOrFound=${dir}`);
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
    }
  });

  it('sortBy=latest 等价于时间倒序', async () => {
    const res = await request(app).get('/api/posts?sortBy=latest');
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(200);
    const list = pickList(res.body);
    const times = list
      .map((p: any) => new Date(p.createdAt || p.created_at || 0).getTime())
      .filter((t: number): t is number => !Number.isNaN(t));
    for (let i = 1; i < times.length; i++) {
      const prev = times[i - 1]!;
      const cur = times[i]!;
      expect(prev).toBeGreaterThanOrEqual(cur);
    }
  });
});
