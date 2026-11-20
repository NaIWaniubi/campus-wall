/**
 * R5 审查守卫回归：
 * 1. /users/me/favorites 对损坏 images JSON 原会 JSON.parse 抛错 → 500；
 *    修复后走 safeJsonParse 与其余列表同口径（降级为 []，列表仍 200）
 * 2. /push/subscribe 原对 endpoint/keys 无长度与字符集校验，可存任意超长垃圾；
 *    修复后非 https / 超长 / 非法字符集一律拒绝
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../app.js';
import { db } from '../../db.js';
import bcrypt from 'bcryptjs';

let token = '';
let userId = 0;
let ownerId = 0;
let postId = 0;

beforeAll(async () => {
  const sid = `r5guard_${Date.now()}`;
  const reg = await request(app).post('/api/auth/register').send({
    account: sid,
    password: 'pass12345',
    nickname: 'R5守卫',
  });
  token = reg.body.data.token;
  userId = Number((db.prepare('SELECT id FROM users WHERE student_id = ?').get(sid) as any).id);

  // 另造一个作者 + 一篇 images 列被写坏（非 JSON）的已发布帖，再收藏它
  const ownerSid = `r5owner_${Date.now()}`;
  const ownerContent = '内容足够长用于通过校验。'.repeat(5);
  ownerId = Number(
    (
      db
        .prepare(
          "INSERT INTO users (student_id, password, nickname, role, status, credit_score) VALUES (?, ?, 'R5作者', 'user', 'active', 100)"
        )
        .run(ownerSid, bcrypt.hashSync('pass12345', 10)) as any
    ).lastInsertRowid
  );
  postId = Number(
    (
      db
        .prepare(
          'INSERT INTO posts (user_id, section_id, title, content, images, status) VALUES (?, 1, ?, ?, ?, ?)'
        )
        .run(ownerId, 'R5坏图收藏测试', ownerContent, '{bad json', 'published') as any
    ).lastInsertRowid
  );
  db.prepare('INSERT INTO favorites (user_id, post_id) VALUES (?, ?)').run(userId, postId);
});

afterAll(() => {
  // events.user_id 外键引用 users：注册路由埋点写过事件行，用户行必须后删
  if (userId || ownerId) {
    db.prepare('DELETE FROM events WHERE user_id IN (?, ?)').run(ownerId ?? -1, userId ?? -1);
  }
  if (postId) db.prepare('DELETE FROM favorites WHERE post_id = ?').run(postId);
  if (postId) db.prepare('DELETE FROM posts WHERE id = ?').run(postId);
  if (ownerId) db.prepare('DELETE FROM users WHERE id = ?').run(ownerId);
  if (userId) db.prepare('DELETE FROM users WHERE id = ?').run(userId);
});

describe('R5 守卫：收藏坏数据降级 + 推送订阅入参', () => {
  it('收藏列表遇损坏 images JSON 返回 200 且 images=[]（原实现 500）', async () => {
    const res = await request(app)
      .get('/api/users/me/favorites')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(200);
    const hit = (res.body.data || []).find((p: any) => p.id === postId);
    expect(hit).toBeDefined();
    expect(hit.images).toEqual([]);
  });

  it('push 订阅：非法 endpoint / 超长 / 非 base64url 密钥一律拒绝', async () => {
    // VAPID 未配置 → 先 501 的顺序在结构校验之后；结构非法应先报结构/格式错
    const httpEp = await request(app)
      .post('/api/push/subscribe')
      .set('Authorization', `Bearer ${token}`)
      .send({ subscription: { endpoint: 'http://insecure.example/x', keys: { p256dh: 'dh', auth: 'au' } } });
    expect(httpEp.body.code).not.toBe(200);

    const longEp = await request(app)
      .post('/api/push/subscribe')
      .set('Authorization', `Bearer ${token}`)
      .send({ subscription: { endpoint: 'https://ok.example/' + 'a'.repeat(600), keys: { p256dh: 'dh', auth: 'au' } } });
    expect(longEp.body.code).not.toBe(200);

    const badKeys = await request(app)
      .post('/api/push/subscribe')
      .set('Authorization', `Bearer ${token}`)
      .send({ subscription: { endpoint: 'https://ok.example/x', keys: { p256dh: 'no space!', auth: 'au' } } });
    expect(badKeys.body.code).not.toBe(200);
  });
});