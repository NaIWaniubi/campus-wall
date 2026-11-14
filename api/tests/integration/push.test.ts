/**
 * Web Push 订阅链路集成测（V5 收尾）
 *
 * 此前整条推送链（sw.js 接收器 → /api/push 路由 → notification 扇出）只有代码没有测试，
 * 且 demo 从未真正开启过 VAPID。这里锁死对外契约：
 *   - public-key 未配置时 enabled=false（前端据此隐藏入口）
 *   - subscribe/unsubscribe 鉴权 + 结构校验 + 未开启 501
 *   - VAPID 配置后 订阅落库 / 同 endpoint 换主刷新 / 退订删行
 * 不触真实推送服务：sendPushToUser 不在本测路径内。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../app.js';
import { db } from '../../db.js';
import { generateToken } from '../../utils/jwt.js';

const TAG = `push_${Date.now()}`;
let userId = 0;
let userId2 = 0;
const endpoint = `https://push.example.test/endpoints/${TAG}`;
const goodSub = { endpoint, keys: { p256dh: 'BP-dh-' + TAG, auth: 'auth-' + TAG } };

const token = (id: number) => `Bearer ${generateToken({ id, studentId: `s${id}`, role: 'user' })}`;
const subRow = (ep: string) => db.prepare('SELECT user_id, p256dh, auth FROM push_subscriptions WHERE endpoint = ?').get(ep) as any;

beforeAll(() => {
  const mk = (n: string) => Number(db.prepare("INSERT INTO users (student_id, password, nickname, role, status, credit_score) VALUES (?, 'x', ?, 'user', 'active', 100)").run(`${TAG}_${n}`, n).lastInsertRowid);
  userId = mk('u1');
  userId2 = mk('u2');
});

afterAll(() => {
  db.prepare('DELETE FROM push_subscriptions WHERE endpoint LIKE ?').run(`%${TAG}%`);
  db.prepare('DELETE FROM users WHERE student_id LIKE ?').run(`${TAG}%`);
  for (const k of ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT']) delete process.env[k];
});

describe('/api/push/public-key（匿名可查）', () => {
  it('未配置 VAPID：publicKey=null 且 enabled=false', async () => {
    const res = await request(app).get('/api/push/public-key');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ publicKey: null, enabled: false });
  });

  it('配置 VAPID 后回吐公钥（前端据此渲染开启入口）', async () => {
    process.env.VAPID_PUBLIC_KEY = 'BK-testpub' + TAG;
    process.env.VAPID_PRIVATE_KEY = 'testpriv';
    process.env.VAPID_SUBJECT = 'mailto:demo@campus-wall.local';
    const res = await request(app).get('/api/push/public-key');
    expect(res.body.data.publicKey).toBe('BK-testpub' + TAG);
    expect(res.body.data.enabled).toBe(true);
  });
});

describe('/api/push/subscribe', () => {
  it('匿名调用 401', async () => {
    const res = await request(app).post('/api/push/subscribe').send({ subscription: goodSub });
    expect(res.status).toBe(401);
  });

  it('结构不完整先报结构错（endpoint/keys 缺一即拒）', async () => {
    const bad = [{ endpoint: '' }, { endpoint, keys: { p256dh: 'x' } }, { keys: { p256dh: 'x', auth: 'y' } }, {}];
    for (const body of bad) {
      const res = await request(app).post('/api/push/subscribe').set('Authorization', token(userId)).send(body as any);
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(400);
    }
  });

  it('VAPID 未配置时合法结构回 501（未开启不骗订阅）', async () => {
    delete process.env.VAPID_PUBLIC_KEY;
    const res = await request(app).post('/api/push/subscribe').set('Authorization', token(userId)).send({ subscription: goodSub });
    expect(res.status).toBe(501);
    expect(res.body.code).toBe(501);
    expect(subRow(endpoint)).toBeUndefined();
  });

  it('VAPID 配置后：订阅落库 → 归属锁定（他人不可抢主）→ 本人换 keys 刷新 → 本人退订删行', async () => {
    process.env.VAPID_PUBLIC_KEY = 'BK-testpub' + TAG;
    const ok = await request(app).post('/api/push/subscribe').set('Authorization', token(userId)).send({ subscription: goodSub });
    expect(ok.body.code).toBe(200);
    expect(subRow(endpoint)?.user_id).toBe(userId);

    // 同一浏览器 endpoint 被另一账号授权：归属不得改绑（审计 R1 修复9），
    // keys 也不得被他人覆盖——否则原用户的离线通知发到攻击者可控的会话
    const moved = await request(app).post('/api/push/subscribe').set('Authorization', token(userId2)).send({
      subscription: { ...goodSub, keys: { p256dh: 'BP-new-' + TAG, auth: 'auth2-' + TAG } },
    });
    expect(moved.body.code).toBe(200);
    const row = subRow(endpoint);
    expect(row?.user_id).toBe(userId);
    expect(row?.p256dh).toBe(goodSub.keys.p256dh);

    // 越权退订：无效果
    const steal = await request(app).post('/api/push/unsubscribe').set('Authorization', token(userId2)).send({ endpoint });
    expect(steal.body.code).toBe(200);
    expect(subRow(endpoint)).toBeTruthy();

    // 本人重授权刷新 keys → 本人退订删行
    const refresh = await request(app).post('/api/push/subscribe').set('Authorization', token(userId)).send({
      subscription: { ...goodSub, keys: { p256dh: 'BP-owner-' + TAG, auth: 'auth1-' + TAG } },
    });
    expect(refresh.body.code).toBe(200);
    expect(subRow(endpoint)?.p256dh).toBe('BP-owner-' + TAG);
    const off = await request(app).post('/api/push/unsubscribe').set('Authorization', token(userId)).send({ endpoint });
    expect(off.body.code).toBe(200);
    expect(subRow(endpoint)).toBeUndefined();
  });
});

describe('/api/push/unsubscribe', () => {
  it('缺 endpoint 报 400；匿名 401', async () => {
    const bad = await request(app).post('/api/push/unsubscribe').set('Authorization', token(userId)).send({});
    expect(bad.body.code).toBe(400);
    const anon = await request(app).post('/api/push/unsubscribe').send({ endpoint });
    expect(anon.status).toBe(401);
  });
});
