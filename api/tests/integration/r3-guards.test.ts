/**
 * 第三轮审查守卫回归（R3 审计批次）：
 *
 * 1. PUT /admin/reports/:id 状态守卫：已处理工单重复处理回 409（原实现可无限次重放，
 *    评论计数漂移 + 重复封禁通知）
 * 2. PUT /messages/read/:id 语义对齐：不存在/越权回 404（原实现无条件 success）
 * 3. POST /trades/:id/complete 状态门：pending_review 帖不可成交（原实现绕过审核门）
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../app.js';
import { db } from '../../db.js';

let adminToken = '';
let userToken = '';
let userId = 0;
let postId = 0;
let reportId = 0;

beforeAll(async () => {
  const login = await request(app).post('/api/auth/login').send({ account: 'admin', password: 'admin123' });
  adminToken = login.body.data.token;

  const sid = `r3guard_${Date.now()}`;
  const reg = await request(app).post('/api/auth/register').send({
    account: sid,
    password: 'pass12345',
    nickname: 'R3守卫用户',
  });
  userToken = reg.body.data.token;
  userId = Number((db.prepare('SELECT id FROM users WHERE student_id = ?').get(sid) as any).id);

  // 直接造一个待人工审核的帖子（不走发布流程，隔离出状态门本身）
  const guardContent = '内容足够长用于通过校验。'.repeat(5);
  db.prepare(
    "INSERT INTO posts (user_id, section_id, title, content, status) VALUES (?, 1, 'R3守卫待审帖', ?, 'pending_review')"
  ).run(userId, guardContent);
  postId = Number(
    (db.prepare("SELECT id FROM posts WHERE user_id = ? AND title = 'R3守卫待审帖' ORDER BY id DESC LIMIT 1").get(userId) as any).id
  );

  db.prepare("INSERT INTO reports (reporter_id, target_type, target_id, reason, status) VALUES (?, 'post', ?, '回归测试举报', 'pending')").run(userId, postId);
  reportId = Number(
    (db.prepare("SELECT id FROM reports WHERE target_id = ? ORDER BY id DESC LIMIT 1").get(postId) as any).id
  );
});

afterAll(() => {
  if (reportId) db.prepare('DELETE FROM reports WHERE id = ?').run(reportId);
  if (postId) db.prepare('DELETE FROM posts WHERE id = ?').run(postId);
});

describe('R3 守卫：工单/已读/成交状态门', () => {
  it('已处理工单重复处理回 409（CAS 状态守卫）', async () => {
    const first = await request(app)
      .put(`/api/admin/reports/${reportId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'dismiss', result: '误报' });
    expect(first.status).toBe(200);
    expect(first.body.code).toBe(200);

    const second = await request(app)
      .put(`/api/admin/reports/${reportId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'dismiss', result: '再次处理' });
    expect(second.status).toBe(409);
    expect(second.body.code).toBe(409);
    expect(String(second.body.message)).toContain('已处理');
  });

  it('PUT /messages/read 不存在消息回 404（不再无条件成功）', async () => {
    const res = await request(app)
      .put('/api/messages/read/99999999')
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(404);
    expect(String(res.body.message)).toContain('不存在');
  });

  it('未过审帖子不可成交（pending_review 被状态门拦截）', async () => {
    const res = await request(app)
      .post(`/api/trades/${postId}/complete`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({});
    expect(res.status).toBe(404);
    expect(String(res.body.message)).toContain('未过审');
  });
});