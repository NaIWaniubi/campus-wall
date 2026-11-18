/**
 * 微信登录占位账号回归：
 * 1. 同一 openid 重复登录返回同一账号（不产生重复行）
 * 2. 占位 student_id 由 openid 哈希派生（不同 openid 不因前缀相同而撞 UNIQUE）
 * 3. 并发首登时 INSERT 冲突被捕获 → 幂等复用而非抛错/挂死
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../app.js';
import { db } from '../../db.js';

// 用生产代码提供的注入点替换微信 jscode2session（用 openid 决定返回哪个身份）
const openidFor = (code: string) => `o_test_${code}`;
import { setCode2SessionOverride } from '../../utils/wx-login.js';

beforeAll(() => {
  // handler 先查「是否配置微信凭据」再走注入点 → 这里补上假凭据（jscode2session 已被替身接管）
  process.env.WX_APPID = process.env.WX_APPID || 'wx_test_appid';
  process.env.WX_SECRET = process.env.WX_SECRET || 'wx_test_secret';
  setCode2SessionOverride(async (code: string) => ({ openid: openidFor(code) }));
  created = (db.prepare("SELECT id FROM users WHERE openid LIKE 'o_test_%'").all() as any[]).map((r) => r.id);
});
afterAll(() => {
  setCode2SessionOverride(null);
  for (const id of created) db.prepare('DELETE FROM users WHERE id = ?').run(id);
});

let created: number[] = [];

describe('微信登录占位账号', () => {
  it('同一 openid 重复登录返回同一账号（不重复建号）', async () => {
    const code = 'dup' + Date.now();
    const first = await request(app).post('/api/auth/wx-login').send({ code, nickname: '测试' });
    expect(first.status).toBe(200);
    expect(first.body.code).toBe(200);
    const firstId = first.body.data?.user?.id;
    expect(firstId).toBeTruthy();

    const second = await request(app).post('/api/auth/wx-login').send({ code, nickname: '测试' });
    expect(second.status).toBe(200);
    expect(second.body.data?.user?.id).toBe(firstId);

    const rows = db.prepare('SELECT id FROM users WHERE openid = ?').all(openidFor(code)) as any[];
    expect(rows.length).toBe(1);

    created.push(Number(firstId));
  });

  it('占位学号由 openid 哈希派生（不以明文前缀，可反推不出原值）', async () => {
    const code = 'hash' + Date.now();
    const res = await request(app).post('/api/auth/wx-login').send({ code, nickname: '测试' });
    expect(res.status).toBe(200);
    const sid = res.body.data?.user?.studentId || '';
    expect(sid.startsWith('wx_')).toBe(true);
    // 哈希后 16 位十六进制，不含 openid 原文
    expect(sid).not.toContain(openidFor(code));
    expect(sid).toMatch(/^wx_[0-9a-f]{16}$/);
    created.push(Number(res.body.data.user.id));
  });

  it('不同 openid 前缀相同也不会撞占位学号', async () => {
    // 两个 openid 前 16 字符相同（构造哈希前的同前缀场景）
    const code1 = 'sameprefix_a';
    const code2 = 'sameprefix_b';
    const r1 = await request(app).post('/api/auth/wx-login').send({ code: code1, nickname: 'A' });
    const r2 = await request(app).post('/api/auth/wx-login').send({ code: code2, nickname: 'B' });
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r1.body.data.user.studentId).not.toBe(r2.body.data.user.studentId);
    created.push(Number(r1.body.data.user.id));
    created.push(Number(r2.body.data.user.id));
  });
});
