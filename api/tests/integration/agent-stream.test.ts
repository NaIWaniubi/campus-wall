/**
 * Agent SSE 流集成测试：直接调用路由 handler（supertest 请求真实 app），
 * stub planner/executor/compose 为确定性输出来验证 SSE 事件序列
 * （plan → tool_call×N → answer → end）。全部离线 stub，不出网。
 *
 * 鉴权用 generateToken 签发真实 JWT（库里造对应测试用户），
 * 与 repo 其他集成测试同一套 supertest + db 口径。
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import app from '../../app.js';
import { db } from '../../db.js';
import { generateToken } from '../../utils/jwt.js';
import type { AgentPlan } from '../../agent/planner.js';
import type { ExecutionResult, TraceEntry } from '../../agent/executor.js';

// stub 注入点：vi.mock 替换 agent 三件套（路由 import 的是同一模块单例）
vi.mock('../../agent/planner.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../agent/planner.js')>();
  return {
    ...actual,
    plan: vi.fn(async (): Promise<AgentPlan> => ({
      mode: 'rule',
      steps: [
        { tool: 'searchPosts', args: { query: '测试问题' }, reason: 'stub 检索' },
        { tool: 'getCampusStats', args: {}, reason: 'stub 统计' },
      ],
    })),
  };
});

vi.mock('../../agent/executor.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../agent/executor.js')>();
  const trace: TraceEntry[] = [
    { step: 1, tool: 'searchPosts', args: { query: '测试问题' }, resultSummary: '共 1 条，首条: {"postId":1}', ms: 5 },
    { step: 2, tool: 'getCampusStats', args: {}, resultSummary: '{"totalPosts":3,"topSections":[]}', ms: 3 },
  ];
  const result: ExecutionResult = {
    trace,
    evidence: [
      { tool: 'searchPosts', summary: trace[0]!.resultSummary, data: [{ postId: 1, title: '测试帖' }] },
      { tool: 'getCampusStats', summary: trace[1]!.resultSummary, data: { totalPosts: 3 } },
    ],
    executed: 2,
    truncated: false,
  };
  return {
    ...actual,
    executePlan: vi.fn(async (_plan: AgentPlan, onStep?: (e: TraceEntry) => void) => {
      for (const t of trace) onStep?.(t);
      return result;
    }),
  };
});

vi.mock('../../agent/compose.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../agent/compose.js')>();
  return {
    ...actual,
    composeAnswer: vi.fn(async () => ({ text: '这是 stub 合成的回答', mode: 'card' as const })),
  };
});

const TAG = `agent_${Date.now()}`;
let token = '';
let userId = 0;

/** 解析 SSE 文本为事件数组 */
function parseSse(text: string): Array<{ event: string; data: any }> {
  const events: Array<{ event: string; data: any }> = [];
  for (const frame of text.split('\n\n')) {
    let event = '';
    let data = '';
    for (const line of frame.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data += line.slice(5).trim();
    }
    if (event && data) {
      try {
        events.push({ event, data: JSON.parse(data) });
      } catch {
        /* 忽略坏帧 */
      }
    }
  }
  return events;
}

beforeAll(() => {
  userId = Number(
    db
      .prepare(
        "INSERT INTO users (student_id, password, nickname, role, status, credit_score) VALUES (?, 'x', 'Agent流测试', 'user', 'active', 100)"
      )
      .run(TAG).lastInsertRowid
  );
  token = generateToken({ id: userId, studentId: TAG, role: 'user' });
});

afterAll(() => {
  db.prepare('DELETE FROM users WHERE id = ?').run(userId);
});

describe('POST /api/agent/assist/stream', () => {
  it('未登录返回 401 JSON（不进入 SSE）', async () => {
    const res = await request(app).post('/api/agent/assist/stream').send({ question: '你好' });
    expect(res.status).toBe(401);
  });

  it('空问题返回 JSON 校验错误', async () => {
    const res = await request(app)
      .post('/api/agent/assist/stream')
      .set('Authorization', `Bearer ${token}`)
      .send({ question: '' });
    expect(res.status).toBe(200);
    expect(res.body.code).not.toBe(200);
    expect(res.body.message).toMatch(/问题/);
  });

  it('敏感词拦截：reject 级问题返回 JSON 错误', async () => {
    const res = await request(app)
      .post('/api/agent/assist/stream')
      .set('Authorization', `Bearer ${token}`)
      .send({ question: '哪里能买到毒品' });
    expect(res.body.code).not.toBe(200);
    expect(res.body.message).toMatch(/敏感/);
  });

  it('SSE 事件序列完整：plan → tool_call×2 → answer → end，字段与模式正确', async () => {
    const res = await request(app)
      .post('/api/agent/assist/stream')
      .set('Authorization', `Bearer ${token}`)
      .send({ question: '最近校园有什么活动' })
      .set('Accept', 'text/event-stream')
      .buffer(true)
      .parse((res2, callback) => {
        // 收集完整 SSE 流（text/event-stream 不会被 supertest 默认按 JSON 解析）
        const chunks: Buffer[] = [];
        res2.on('data', (c: Buffer) => chunks.push(c));
        res2.on('end', () => callback(null, Buffer.concat(chunks)));
      });

    // 路由设置了 SSE 头
    expect(res.headers['content-type']).toMatch(/text\/event-stream/);
    const events = parseSse(String(res.body));

    const names = events.map((e) => e.event);
    expect(names[0]).toBe('plan');
    expect(names.filter((n) => n === 'tool_call')).toHaveLength(2);
    expect(names.indexOf('answer')).toBeGreaterThan(names.lastIndexOf('tool_call'));
    expect(names[names.length - 1]).toBe('end');

    // plan 事件
    const planEv = events.find((e) => e.event === 'plan');
    expect(planEv).toBeDefined();
    expect(planEv!.data.mode).toBe('rule');
    expect(planEv!.data.steps).toHaveLength(2);
    expect(planEv!.data.steps[0].tool).toBe('searchPosts');

    // tool_call 事件（逐步推送）
    const toolEvs = events.filter((e) => e.event === 'tool_call');
    expect(toolEvs[0]).toBeDefined();
    expect(toolEvs[0]!.data).toMatchObject({ step: 1, tool: 'searchPosts' });
    expect(toolEvs[0]!.data.ms).toBeGreaterThanOrEqual(0);
    expect(typeof toolEvs[0]!.data.summary).toBe('string');
    expect(toolEvs[1]!.data).toMatchObject({ step: 2, tool: 'getCampusStats' });

    // answer 事件
    const answerEv = events.find((e) => e.event === 'answer');
    expect(answerEv).toBeDefined();
    expect(answerEv!.data).toEqual({ text: '这是 stub 合成的回答', mode: 'card' });

    // end 事件
    const endEv = events.find((e) => e.event === 'end');
    expect(endEv).toBeDefined();
    expect(endEv!.data).toEqual({ ok: true });
  });
});
