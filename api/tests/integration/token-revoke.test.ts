/**
 * Token 吊销回归：
 * 1. 改密后旧 token 立即失效，新 token 可用
 * 2. 封禁后旧 token 立即失效
 * 3. 升级前签发的无 ver 字段旧 token 仍可被识别（兼容性）
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../app.js';
import { db } from '../../db.js';
import { generateToken } from '../../utils/jwt.js';

// 学号需满足后端 8 位数字校验，故用时间戳后 8 位
const SID = String(Date.now()).slice(-8);
const TAG = SID;
let uid = 0;

beforeAll(() => {
  uid = Number(
    db
      .prepare(
        "INSERT INTO users (student_id, password, nickname, role, status, credit_score) VALUES (?, 'x', '吊销测试', 'user', 'active', 100)"
      )
      .run(TAG).lastInsertRowid
  );
});

afterAll(() => {
  db.prepare('DELETE FROM events WHERE user_id = ?').run(uid);
  db.prepare('DELETE FROM users WHERE id = ?').run(uid);
});

describe('token 吊销', () => {
  it('改密后旧 token 失效，响应返回新 token', async () => {
    // 用真实密码流程：先设置密码，再登录拿 token
    const bcrypt = (await import('bcryptjs')).default;
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(bcrypt.hashSync('oldpass123', 10), uid);

    const login = await request(app)
      .post('/api/auth/login')
      .send({ studentId: TAG, password: 'oldpass123' });
    expect(login.body.code).toBe(200);
    const oldToken = login.body.data.token;

    // 旧 token 可用
    const before = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${oldToken}`);
    expect(before.body.code).toBe(200);

    // 改密
    const change = await request(app)
      .put('/api/auth/password')
      .set('Authorization', `Bearer ${oldToken}`)
      .send({ oldPassword: 'oldpass123', newPassword: 'newpass456' });
    expect(change.body.code).toBe(200);
    expect(change.body.data?.token).toBeTruthy();

    // 旧 token 立即失效
    const after = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${oldToken}`);
    expect(after.status).toBe(401);
    expect(after.body.code).toBe(401);

    // 新 token 可用
    const fresh = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${change.body.data.token}`);
    expect(fresh.body.code).toBe(200);
  });

  it('封禁后旧 token 立即失效（即使 token 未过期）', async () => {
    // 重置为干净状态：上一个用例改密已把版本推到 1
    db.prepare("UPDATE users SET status = 'active', token_version = 0 WHERE id = ?").run(uid);
    const token = generateToken({ id: uid, studentId: TAG, role: 'user', ver: 0 });

    const ok = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(ok.body.code).toBe(200);

    // 模拟管理端封禁：递增 token_version（与 admin.ts 封禁分支一致）
    db.prepare("UPDATE users SET status = 'banned', ban_until = '', token_version = token_version + 1 WHERE id = ?").run(uid);

    const blocked = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(blocked.status).toBe(401);
  });

  it('升级前的旧 token（无 ver 字段）在 token_version=0 时仍可用（兼容）', async () => {
    db.prepare("UPDATE users SET status = 'active', token_version = 0 WHERE id = ?").run(uid);
    // generateToken 不传 ver 时默认 0，等价于升级前的签发形态
    const legacy = generateToken({ id: uid, studentId: TAG, role: 'user' });
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${legacy}`);
    expect(res.body.code).toBe(200);
  });
});
