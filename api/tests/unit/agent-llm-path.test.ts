/**
 * Agent LLM 路径实测（第二轮工作流审查 P0）：
 *
 * planner.ts 与 compose.ts 原先给 chatWithAI 传第三参 []（空模型链），
 * for 循环零次迭代 → 恒抛「无可用模型」→ LLM 规划/合成路径从未触网，
 * 实测 plan.mode 恒为 'rule'、compose.mode 恒为 'card'。
 *
 * 这里 mock 模型层，断言：
 * - 传空模型链 → 走降级（记录旧行为，作为对照）
 * - 传 buildModelChain() → 真的调用模型层，mode 为 llm
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const chatSpy = vi.hoisted(() => vi.fn());

vi.mock('../../utils/ai.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/ai.js')>();
  return {
    ...actual,
    chatWithAI: chatSpy,
  };
});

import { plan } from '../../agent/planner.js';
import { composeAnswer } from '../../agent/compose.js';

beforeEach(() => {
  chatSpy.mockReset();
});

describe('Agent LLM 路径（修复：模型链为空导致路径从未触网）', () => {
  it('planner：可用时走 LLM 规划而不是恒定降级 rule', async () => {
    chatSpy.mockResolvedValue(
      JSON.stringify({ steps: [{ tool: 'getCampusStats', args: {} }, { tool: 'searchPosts', args: { keyword: '失物' } }] }),
    );
    const p = await plan('最近校园有什么动态', true);
    expect(chatSpy).toHaveBeenCalled();
    // 第三参必须是真实模型链，不能是空数组
    const modelsArg = chatSpy.mock.calls[0]?.[2];
    expect(Array.isArray(modelsArg)).toBe(true);
    expect((modelsArg as unknown[]).length).toBeGreaterThan(0);
    expect(p.mode).toBe('llm');
    expect(p.steps.length).toBeGreaterThan(0);
  });

  it('compose：可用时走 LLM 合成而不是恒定降级 card', async () => {
    chatSpy.mockResolvedValue('根据检索结果，校园卡挂失请前往失物招领板块登记。');
    const r = await composeAnswer(
      '校园卡丢了怎么办',
      [{ tool: 'searchPosts', summary: '搜到 1 条校园卡相关帖', data: { items: [{ title: '校园卡挂失', content: '请到失物招领板块登记' }] } }],
      true,
    );
    expect(chatSpy).toHaveBeenCalled();
    const modelsArg = chatSpy.mock.calls[0]?.[2];
    expect((modelsArg as unknown[]).length).toBeGreaterThan(0);
    expect(r.mode).toBe('llm');
    expect(r.text.length).toBeGreaterThan(0);
  });

  it('模型层失败时降级不报错（保留规则/卡片兜底）', async () => {
    chatSpy.mockRejectedValue(new Error('gateway down'));
    const p = await plan('最近校园有什么动态', true);
    expect(p.mode).toBe('rule');
    expect(p.steps.length).toBeGreaterThan(0);

    const r = await composeAnswer(
      '校园卡丢了怎么办',
      [{ tool: 'searchPosts', summary: '搜到 1 条', data: { items: [{ title: 'x', content: 'y' }] } }],
      true,
    );
    expect(r.mode).toBe('card');
  });
});
