/**
 * 分享卡片图路由集成测（V5）：
 * published → 200 image/png + 缓存头；pending/不存在/非法 id → 404；二次请求命中缓存（字节一致）。
 * 注：CI 无 CJK 字体时 sharp 仍出图（字形降级），这里只断言契约不验字形。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../app.js';
import { db } from '../../db.js';

const TAG = `sharecard_${Date.now()}`;
let userId = 0;
let publishedId = 0;
let pendingId = 0;

beforeAll(() => {
  userId = Number(
    db.prepare("INSERT INTO users (student_id, password, nickname, role, status, credit_score) VALUES (?, 'x', '卡片测试', 'user', 'active', 100)").run(TAG).lastInsertRowid
  );
  const mk = (status: string) => Number(
    db.prepare("INSERT INTO posts (user_id, section_id, title, content, status) VALUES (?, 1, ?, ?, ?)").run(userId, `${TAG} 出闲置键盘`, `${TAG} 正文内容，至少十个字`, status).lastInsertRowid
  );
  publishedId = mk('published');
  pendingId = mk('pending_review');
});

afterAll(() => {
  db.prepare('DELETE FROM posts WHERE id IN (?, ?)').run(publishedId, pendingId);
  db.prepare('DELETE FROM users WHERE id = ?').run(userId);
});

describe('GET /api/posts/:id/share-card.png', () => {
  it('published 帖出 PNG，带 10min 缓存头', async () => {
    const res = await request(app).get(`/api/posts/${publishedId}/share-card.png`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('image/png');
    expect(res.headers['cache-control']).toContain('max-age=600');
    // PNG magic number
    expect(res.body[0]).toBe(0x89);
    expect(res.body[1]).toBe(0x50);
    expect(res.body.length).toBeGreaterThan(1000);
  });

  it('二次请求命中缓存：字节完全一致', async () => {
    const a = await request(app).get(`/api/posts/${publishedId}/share-card.png`);
    const b = await request(app).get(`/api/posts/${publishedId}/share-card.png`);
    expect(Buffer.compare(a.body, b.body)).toBe(0);
  });

  it('待审帖/不存在/非法 id 一律 404（未过审内容不外露）', async () => {
    for (const id of [pendingId, 99999999, 'abc', 0, -1]) {
      const res = await request(app).get(`/api/posts/${id}/share-card.png`);
      expect(res.status, `id=${id}`).toBe(404);
    }
  });
});
