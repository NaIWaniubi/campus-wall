/**
 * 双 token 静默续期回归（P0 安全加固）：
 * 1. 登录/注册同时返回 access(2h) + refresh(7d)
 * 2. /auth/refresh 用 refresh 换发新 token 对（轮换），新 access 可访问业务接口
 * 3. access token 不能当 refresh 用（type 区分）；refresh 混入 Authorization 也不被接受
 * 4. 缺失/伪造 refresh → 401
 * 5. 改密（token_version+1）后旧 refresh 立即失效
 * 6. 封禁用户持有效 refresh 也被拒绝
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../app.js';
import { db } from '../../db.js';
import { generateToken, generateRefreshToken } from '../../utils/jwt.js';

const SID = String(Date.now() + 1).slice(-8);
let uid = 0;

beforeAll(async () => {
  const bcrypt = (await import('bcryptjs')).default;
  uid = Number(
    db
      .prepare(
        "INSERT INTO users (student_id, password, nickname, role, status, credit_score) VALUES (?, ?, '续期测试', 'user', 'active', 100)"
      )
      .run(SID, bcrypt.hashSync('pass12345', 10)).lastInsertRowid
  );
});

afterAll(() => {
  db.prepare('DELETE FROM events WHERE user_id = ?').run(uid);
  db.prepare('DELETE FROM users WHERE id = ?').run(uid);
});

describe('双 token 静默续期', () => {
  it('登录同时返回 access + refresh，且两者不同', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ studentId: SID, password: 'pass12345' });
    expect(login.body.code).toBe(200);
    expect(login.body.data.token).toBeTruthy();
    expect(login.body.data.refreshToken).toBeTruthy();
    expect(login.body.data.token).not.toBe(login.body.data.refreshToken);

    // access token 可访问业务接口
    const me = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${login.body.data.token}`);
    expect(me.body.code).toBe(200);
  });

  it('refresh token 不能用于业务接口（中间件只认 access）', async () => {
    const refresh = generateRefreshToken({ id: uid, studentId: SID, role: 'user', ver: 0 });
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${refresh}`);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe(401);

    // WS 通道同样拒绝 refresh token 建连
    const { authJwt } = await import('../../ws/auth.js');
    expect(() => authJwt(refresh)).toThrow();

    // 对照：access token 两个通道都可用
    const access = generateToken({ id: uid, studentId: SID, role: 'user', ver: 0 });
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${access}`);
    expect(me.body.code).toBe(200);
    expect(authJwt(access).id).toBe(uid);
  });

  it('/auth/refresh 用 body 里的 refresh 换发新 token 对（轮换）', async () => {
    const oldRefresh = generateRefreshToken({ id: uid, studentId: SID, role: 'user', ver: 0 });
    const res = await request(app).post('/api/auth/refresh').send({ refreshToken: oldRefresh });
    expect(res.body.code).toBe(200);
    expect(res.body.data.token).toBeTruthy();
    expect(res.body.data.refreshToken).toBeTruthy();
    expect(res.body.data.token).not.toBe(res.body.data.refreshToken);
    // 真正的轮换：换发的 refresh 与旧的不同（jti 保证同秒也不同）
    expect(res.body.data.refreshToken).not.toBe(oldRefresh);

    // 新 access 可访问业务接口
    const me = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${res.body.data.token}`);
    expect(me.body.code).toBe(200);
  });

  it('/auth/refresh 也接受 x-refresh-token 头', async () => {
    const refresh = generateRefreshToken({ id: uid, studentId: SID, role: 'user', ver: 0 });
    const res = await request(app).post('/api/auth/refresh').set('x-refresh-token', refresh);
    expect(res.body.code).toBe(200);
    expect(res.body.data.token).toBeTruthy();
  });

  it('access token 调 /auth/refresh 被拒（type 区分）', async () => {
    const access = generateToken({ id: uid, studentId: SID, role: 'user', ver: 0 });
    const res = await request(app).post('/api/auth/refresh').send({ refreshToken: access });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe(401);
  });

  it('旧 refresh 换发后再次使用被拒（jti 单次消费 / 重放检测）', async () => {
    const refresh = generateRefreshToken({ id: uid, studentId: SID, role: 'user', ver: 0 });

    const first = await request(app).post('/api/auth/refresh').send({ refreshToken: refresh });
    expect(first.body.code).toBe(200);

    // 同一 refresh 再用一次：视为泄漏重放，必须拒绝
    const replay = await request(app).post('/api/auth/refresh').send({ refreshToken: refresh });
    expect(replay.status).toBe(401);
    expect(replay.body.code).toBe(401);

    // 但这次换发出的新 refresh 仍可用（正常链条不被打断）
    const next = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: first.body.data.refreshToken });
    expect(next.body.code).toBe(200);
  });

  it('缺失 / 伪造 refresh → 401', async () => {
    const missing = await request(app).post('/api/auth/refresh').send({});
    expect(missing.status).toBe(401);

    const forged = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: 'not.a.valid.token' });
    expect(forged.status).toBe(401);
  });

  it('改密后旧 refresh 立即失效（token_version 不匹配）', async () => {
    // 重新同步：改密前签发 refresh（ver = 当前版本）
    const row = db.prepare('SELECT token_version FROM users WHERE id = ?').get(uid) as any;
    const refresh = generateRefreshToken({
      id: uid,
      studentId: SID,
      role: 'user',
      ver: Number(row?.token_version ?? 0),
    });

    db.prepare('UPDATE users SET token_version = token_version + 1 WHERE id = ?').run(uid);

    const res = await request(app).post('/api/auth/refresh').send({ refreshToken: refresh });
    expect(res.status).toBe(401);
  });

  it('封禁用户持有效 refresh 被拒（403）', async () => {
    db.prepare("UPDATE users SET status = 'banned', token_version = 0 WHERE id = ?").run(uid);
    const refresh = generateRefreshToken({ id: uid, studentId: SID, role: 'user', ver: 0 });
    const res = await request(app).post('/api/auth/refresh').send({ refreshToken: refresh });
    expect(res.status).toBe(403);
    // 复原，避免污染后续用例
    db.prepare("UPDATE users SET status = 'active' WHERE id = ?").run(uid);
  });
});
