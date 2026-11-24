/**
 * V3-P3 个性化日报缓存/降级/路由契约回归。
 * 模型层被 mock，确保整库测试不触网关；缓存与规则聚合使用真实 SQLite。
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';

const aiState = vi.hoisted(() => ({ usable: false, chat: vi.fn() }));

vi.mock('../../utils/ai.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/ai.js')>();
  return {
    ...actual,
    chatWithAI: aiState.chat,
    isAiUsable: () => aiState.usable,
  };
});

import app from '../../app.js';
import { db } from '../../db.js';
import { generateToken } from '../../utils/jwt.js';
import {
  clearPersonalDigestCacheForTest,
  getPersonalDigest,
  refreshPersonalDigest,
} from '../../routes/ai.js';

const TAG = `pdcache${Date.now()}`;
let userId = 0;
let token = '';

beforeAll(() => {
  userId = Number(
    db
      .prepare("INSERT INTO users (student_id, password, nickname, role, status) VALUES (?, 'x', '日报缓存测试', 'user', 'active')")
      .run(`${TAG}_user`).lastInsertRowid,
  );
  token = generateToken({ id: userId, studentId: `${TAG}_user`, role: 'user' });
});

beforeEach(() => {
  clearPersonalDigestCacheForTest();
  aiState.usable = false;
  aiState.chat.mockReset();
  aiState.chat.mockResolvedValue('');
});

afterAll(() => {
  clearPersonalDigestCacheForTest();
  if (userId) db.prepare('DELETE FROM users WHERE id = ?').run(userId);
});

describe('V3-P3 个性化日报缓存与降级', () => {
  it('同一用户 60s 内命中同一缓存对象，不同用户互不串数据', () => {
    const first = getPersonalDigest(userId);
    const second = getPersonalDigest(userId);
    expect(second).toBe(first);

    const other = getPersonalDigest(userId + 1_000_000);
    expect(other).not.toBe(first);
    expect(other.scope).toBe('personal');
  });

  it('过期重算后，旧 LLM 请求不得覆盖新规则版', async () => {
    const now = Date.now();
    getPersonalDigest(userId, now, false);
    let resolveOld!: (value: string) => void;
    aiState.usable = true;
    aiState.chat.mockImplementation(() => new Promise<string>((resolve) => { resolveOld = resolve; }));

    const pending = refreshPersonalDigest(userId);
    const fresh = getPersonalDigest(userId, now + 61_000, false);
    resolveOld('这是一条已经过期的旧摘要内容');
    await pending;

    const after = getPersonalDigest(userId, now + 61_000, false);
    expect(after.summary).toBe(fresh.summary);
    expect(after.summary).not.toBe('这是一条已经过期的旧摘要内容');
  });

  it('LLM 失败时保留模板摘要与 offline=true', async () => {
    const base = getPersonalDigest(userId);
    aiState.usable = true;
    aiState.chat.mockRejectedValue(new Error('gateway down'));

    await refreshPersonalDigest(userId);
    const after = getPersonalDigest(userId);
    expect(after.summary).toBe(base.summary);
    expect(after.offline).toBe(true);
  });

  it('LLM 成功时只替换 summary，并标记 AI 生成', async () => {
    getPersonalDigest(userId);
    aiState.usable = true;
    aiState.chat.mockResolvedValue('你订阅的校园动态已经整理好啦，快去看看吧。');

    await refreshPersonalDigest(userId);
    const after = getPersonalDigest(userId);
    expect(after.summary).toBe('你订阅的校园动态已经整理好啦，快去看看吧。');
    expect(after.offline).toBe(false);
  });
});

describe('V3-P3 个性化日报 HTTP 契约', () => {
  it('personal 必须登录，默认公开简报仍匿名可用且不新增 scope 字段', async () => {
    const denied = await request(app).get('/api/ai/digest?scope=personal');
    expect(denied.status).toBe(401);
    expect(denied.body.code).toBe(401);

    const publicDigest = await request(app).get('/api/ai/digest');
    expect(publicDigest.body.code).toBe(200);
    expect(publicDigest.body.data.scope).toBeUndefined();

    const personal = await request(app)
      .get('/api/ai/digest?scope=personal')
      .set('Authorization', `Bearer ${token}`);
    expect(personal.body.code).toBe(200);
    expect(personal.body.data.scope).toBe('personal');
  });
});
