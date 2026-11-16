/**
 * Agent 工具层单测：schema 校验通过/拒绝、工具超时兜底、规则 planner 三分支、
 * executor trace 结构、轮数上限。全部离线：不触网，LLM 相关仅测降级路径
 * （usable=false 走规则 planner；LLM 路径由 agent-stream 集成测试 stub planner 覆盖）。
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  TOOLS,
  runTool,
  validateArgs,
  ArgsValidationError,
  extractQuestionKeywords,
} from '../../agent/tools.js';
import { rulePlan, plan } from '../../agent/planner.js';
import { executePlan, summarizeResult, MAX_TOOL_ROUNDS } from '../../agent/executor.js';
import type { AgentPlan } from '../../agent/planner.js';

afterEach(() => {
  vi.restoreAllMocks();
});

/* ==========================================================================
 * schema 校验
 * ========================================================================== */
describe('agent tools · validateArgs', () => {
  const schema = TOOLS.searchPosts!.schema;

  it('通过：合法入参', () => {
    expect(() => validateArgs(schema, { query: '社团' })).not.toThrow();
    expect(() => validateArgs(schema, { query: '社团', section: '活动', limit: 3 })).not.toThrow();
  });

  it('拒绝：缺必填 query', () => {
    expect(() => validateArgs(schema, {})).toThrow(ArgsValidationError);
    expect(() => validateArgs(schema, {})).toThrow(/query/);
  });

  it('拒绝：类型不符', () => {
    expect(() => validateArgs(schema, { query: 123 })).toThrow(/字符串/);
    expect(() => validateArgs(schema, { query: 'ok', limit: 'many' })).toThrow(/数字/);
    expect(() => validateArgs(TOOLS.matchLostFound!.schema, { keywords: '伞' })).toThrow(/数组/);
    expect(() => validateArgs(TOOLS.matchLostFound!.schema, { keywords: [1, 2] })).toThrow(/字符串数组/);
  });

  it('拒绝：非对象入参', () => {
    expect(() => validateArgs(schema, [] as any)).toThrow(/对象/);
    expect(() => validateArgs(schema, null as any)).toThrow(/对象/);
  });

  it('可选字段缺省放行', () => {
    expect(() => validateArgs(schema, { query: 'x' })).not.toThrow();
  });
});

/* ==========================================================================
 * 工具执行（runTool：校验失败/超时兜底为 ok=false）
 * ========================================================================== */
describe('agent tools · runTool 兜底', () => {
  it('未知工具 → ok=false', async () => {
    const out = await runTool('noSuchTool', {});
    expect(out.ok).toBe(false);
    expect(String(out.result)).toMatch(/未知工具/);
  });

  it('校验失败不抛异常，包成 ok=false', async () => {
    const out = await runTool('searchPosts', {});
    expect(out.ok).toBe(false);
    expect(String(out.result)).toMatch(/参数校验失败/);
  });

  it('工具超时 3s 兜底：卡死工具被 Promise.race 打断并返回 ok=false', async () => {
    vi.useFakeTimers();
    // 临时注入一个永不返回的工具
    const stuck = {
      name: 'stuckTool',
      description: 'test',
      schema: { type: 'object' as const, properties: {} },
      run: () => new Promise(() => {}),
    };
    (TOOLS as any).stuckTool = stuck;
    try {
      const p = runTool('stuckTool', {});
      const assertion = expect(p).resolves.toMatchObject({
        ok: false,
        result: expect.stringMatching(/超时/),
      });
      await vi.advanceTimersByTimeAsync(3_100);
      await assertion;
    } finally {
      delete (TOOLS as any).stuckTool;
      vi.useRealTimers();
    }
  }, 10_000);

  it('searchPosts 真实执行（离线 SQLite）：返回数组且条数 ≤ limit', async () => {
    const out = await runTool('searchPosts', { query: '校园', limit: 2 });
    expect(out.ok).toBe(true);
    expect(Array.isArray(out.result)).toBe(true);
    expect((out.result as any[]).length).toBeLessThanOrEqual(2);
  });

  it('getCampusStats 返回统计结构', async () => {
    const out = await runTool('getCampusStats', {});
    expect(out.ok).toBe(true);
    const r: any = out.result;
    expect(r).toHaveProperty('totalPosts');
    expect(Array.isArray(r.topSections)).toBe(true);
  });

  it('matchLostFound：合法关键词返回数组；空数组被拒', async () => {
    const okOut = await runTool('matchLostFound', { keywords: ['伞'] });
    expect(okOut.ok).toBe(true);
    expect(Array.isArray(okOut.result)).toBe(true);

    const badOut = await runTool('matchLostFound', { keywords: [] });
    expect(badOut.ok).toBe(false);
  });

  it('queryPost：不存在帖子返回 found=false（不抛错）', async () => {
    const out = await runTool('queryPost', { postId: 999999999 });
    expect(out.ok).toBe(true);
    expect((out.result as any).found).toBe(false);
  });

  it('extractQuestionKeywords：中文滑窗 + 英文词块', () => {
    const kws = extractQuestionKeywords('我在图书馆丢了校园卡 campus-card');
    expect(kws.length).toBeGreaterThan(0);
    expect(kws).toContain('campus');
  });
});

/* ==========================================================================
 * 规则 planner 三分支
 * ========================================================================== */
describe('agent planner · rulePlan 三分支', () => {
  it('失物招领意图 → matchLostFound + searchPosts', () => {
    const p = rulePlan('我在图书馆捡到一张校园卡，失物招领中心在哪');
    expect(p.mode).toBe('rule');
    expect(p.steps[0]!.tool).toBe('matchLostFound');
    expect(p.steps[1]!.tool).toBe('searchPosts');
    const kw = (p.steps[0]!.args as any).keywords;
    expect(Array.isArray(kw)).toBe(true);
    expect(kw.length).toBeGreaterThan(0);
  });

  it('丢失意图同样命中（含「丢」）', () => {
    const p = rulePlan('我的饭卡丢了怎么办');
    expect(p.steps[0]!.tool).toBe('matchLostFound');
  });

  it('简报意图 → getCampusStats + searchPosts', () => {
    const p = rulePlan('今天校园墙有什么热点动态？');
    expect(p.steps[0]!.tool).toBe('getCampusStats');
    expect(p.steps[1]!.tool).toBe('searchPosts');
  });

  it('其余问题 → 仅 searchPosts', () => {
    const p = rulePlan('社团招新什么时候开始');
    expect(p.mode).toBe('rule');
    expect(p.steps).toHaveLength(1);
    expect(p.steps[0]!.tool).toBe('searchPosts');
    expect(((p.steps[0]!.args as any).query as string).length).toBeGreaterThan(0);
  });

  it('plan(usable=false) 走规则降级（不触网）', async () => {
    const p = await plan('今天有什么热点', false);
    expect(p.mode).toBe('rule');
    expect(p.steps[0]!.tool).toBe('getCampusStats');
  });
});

/* ==========================================================================
 * executor：trace 结构 / 轮数上限 / 工具错误继续
 * ========================================================================== */
describe('agent executor', () => {
  it('正常执行产出 trace 与 evidence，结构完整', async () => {
    const p: AgentPlan = {
      mode: 'rule',
      steps: [
        { tool: 'getCampusStats', args: {}, reason: '拿统计' },
        { tool: 'searchPosts', args: { query: '校园' }, reason: '拿帖子' },
      ],
    };
    const r = await executePlan(p);
    expect(r.trace).toHaveLength(2);
    expect(r.executed).toBe(2);
    expect(r.truncated).toBe(false);
    for (const t of r.trace) {
      expect(t.step).toBeGreaterThan(0);
      expect(typeof t.tool).toBe('string');
      expect(typeof t.resultSummary).toBe('string');
      expect(t.resultSummary.length).toBeLessThanOrEqual(200);
      expect(t.ms).toBeGreaterThanOrEqual(0);
    }
    // getCampusStats 有真实结果 → evidence 有记录
    expect(r.evidence.length).toBeGreaterThan(0);
    expect(r.evidence[0]!.tool).toBe('getCampusStats');
  });

  it('工具错误不中断：未知工具步骤失败后下一步继续', async () => {
    const p: AgentPlan = {
      mode: 'rule',
      steps: [
        { tool: 'noSuchTool', args: {}, reason: '会失败' },
        { tool: 'getCampusStats', args: {}, reason: '仍会执行' },
      ],
    };
    const r = await executePlan(p);
    expect(r.trace).toHaveLength(2);
    expect(r.trace[0]!.resultSummary).toMatch(/失败/);
    expect(r.trace[1]!.resultSummary).not.toMatch(/失败/);
    expect(r.evidence).toHaveLength(1); // 失败步不进 evidence
  });

  it('轮数上限：超过 MAX_TOOL_ROUNDS 的步骤被截断', async () => {
    const steps = Array.from({ length: 7 }, (_, i) => ({
      tool: 'getCampusStats',
      args: {},
      reason: `step-${i}`,
    }));
    const r = await executePlan({ mode: 'rule', steps });
    expect(MAX_TOOL_ROUNDS).toBe(4);
    expect(r.trace).toHaveLength(MAX_TOOL_ROUNDS);
    expect(r.executed).toBe(MAX_TOOL_ROUNDS);
    expect(r.truncated).toBe(true);
  });

  it('onStep 回调逐步触发', async () => {
    const seen: number[] = [];
    const p: AgentPlan = {
      mode: 'rule',
      steps: [
        { tool: 'getCampusStats', args: {}, reason: 'a' },
        { tool: 'getCampusStats', args: {}, reason: 'b' },
      ],
    };
    await executePlan(p, (entry) => seen.push(entry.step));
    expect(seen).toEqual([1, 2]);
  });

  it('summarizeResult：数组/对象/长文本压缩到 ≤200 字', () => {
    expect(summarizeResult([1, 2, 3])).toMatch(/共 3 条/);
    expect(summarizeResult([])).toMatch(/空/);
    expect(summarizeResult('x'.repeat(500)).length).toBeLessThanOrEqual(200);
    expect(summarizeResult({ a: 1 })).toContain('"a":1');
  });
});
