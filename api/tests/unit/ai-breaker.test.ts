/**
 * 熔断语义回归（第二轮工作流审查 P1）：
 *
 * 原问题：
 * 1. chatWithAIStream 不认 opts.ignoreBreaker → 后台任务走流式时撞熔断窗口直接抛错
 * 2. ignoreBreaker 的后台任务失败后仍然 tripBreaker → 后台失败把前台在线用户掐死 5 分钟
 * 3. 并发闸缺失：N 个并发请求各自跑完整模型链，放大上游压力与排队延迟
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';

const originalEnv = { ...process.env };
const origFetch = globalThis.fetch;

beforeAll(() => {
  process.env = { ...originalEnv };
  process.env.AI_BASE_URL = 'https://gw.test/v1';
  process.env.AI_API_KEY = 'gwkey_abc123456';
  process.env.OPENROUTER_API_KEY = 'orkey_xyz789';
});

afterEach(() => {
  globalThis.fetch = origFetch;
});

describe('熔断：后台失败不掐前台', () => {
  it('前台全链失败 → 熔断开启 → 后台（ignoreBreaker）仍可尝试且成功后复位', async () => {
    const { chatWithAI, aiReachable, resetBreakerForTest } = await import('../../utils/ai.js');
    resetBreakerForTest?.();

    let fail = true;
    globalThis.fetch = (async () =>
      fail
        ? new Response(JSON.stringify({ error: { message: 'no capacity' } }), { status: 503 })
        : new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200 })
    ) as any;

    // 前台失败（开启熔断）
    await expect(chatWithAI([{ role: 'user', content: 'hi' }])).rejects.toThrow();
    expect(aiReachable()).toBe(false);

    // 后台无视熔断窗口照常尝试；成功后复位熔断（前台恢复可用）
    fail = false;
    const out = await chatWithAI([{ role: 'user', content: 'hi' }], 64, undefined, { ignoreBreaker: true });
    expect(out).toBe('ok');
    expect(aiReachable()).toBe(true);
  });

  it('后台（ignoreBreaker）全链失败 → 不 tripBreaker（前台不受影响）', async () => {
    const { chatWithAI, aiReachable, resetBreakerForTest } = await import('../../utils/ai.js');
    resetBreakerForTest?.();

    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: { message: 'no capacity' } }), { status: 503 })
    ) as any;

    await expect(
      chatWithAI([{ role: 'user', content: 'hi' }], 64, undefined, { ignoreBreaker: true })
    ).rejects.toThrow('no capacity');
    // 关键断言：后台失败不开启熔断，前台用户仍可尝试
    expect(aiReachable()).toBe(true);

    // 对照组：前台失败则熔断开启
    await expect(chatWithAI([{ role: 'user', content: 'hi' }])).rejects.toThrow();
    expect(aiReachable()).toBe(false);
  });

  it('chatWithAIStream 认 ignoreBreaker（原实现恒拒后台流式）', async () => {
    const { chatWithAIStream, chatWithAI, aiReachable, resetBreakerForTest } = await import('../../utils/ai.js');
    resetBreakerForTest?.();

    // 先用前台失败制造熔断窗口
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: { message: 'no capacity' } }), { status: 503 })
    ) as any;
    await expect(chatWithAI([{ role: 'user', content: 'hi' }])).rejects.toThrow();
    expect(aiReachable()).toBe(false);

    // 熔断窗口内：不带 ignoreBreaker 的流式调用被拒（预期行为）
    await expect(
      chatWithAIStream([{ role: 'user', content: 'hi' }], () => {}, 64, undefined, {})
    ).rejects.toThrow('熔断窗口');

    // 带 ignoreBreaker 的后台流式调用可以照常尝试
    globalThis.fetch = (async () =>
      new Response(
        'data: {"choices":[{"delta":{"content":"后台"}}]}\n\ndata: {"choices":[{"delta":{"content":"流式"}}]}\n\ndata: [DONE]\n\n',
        { status: 200, headers: { 'content-type': 'text/event-stream' } }
      )
    ) as any;
    let received = '';
    const out = await chatWithAIStream(
      [{ role: 'user', content: 'hi' }],
      (t) => {
        received += t;
      },
      64,
      undefined,
      { ignoreBreaker: true }
    );
    expect(received).toContain('后台');
    expect(out).toContain('流式');
    // 成功复位熔断
    expect(aiReachable()).toBe(true);
  });
});

describe('并发闸', () => {
  it('超出 MAX_CONCURRENT 的请求在预算内排队等待，成功请求释放闸位', async () => {
    const { chatWithAI, chainQueueDepth, resetBreakerForTest } = await import('../../utils/ai.js');
    resetBreakerForTest?.();

    // 上游慢响应（150ms），闸位默认 4
    globalThis.fetch = (async () => {
      await new Promise((r) => setTimeout(r, 150));
      return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200 });
    }) as any;

    // 发 6 个并发请求：前 4 个抢到闸位，后 2 个排队
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () => chatWithAI([{ role: 'user', content: 'hi' }], 64))
    );
    // 预算 30s 足够等待，6 个全部成功（排队者等闸位释放后执行）
    const ok = results.filter((r) => r.status === 'fulfilled');
    expect(ok.length).toBe(6);
    expect(chainQueueDepth()).toBe(0);
  });

  it('排队超预算（budgetMs 太短）→ 抛「并发闸满」交给兜底', async () => {
    const { chatWithAI, resetBreakerForTest } = await import('../../utils/ai.js');
    resetBreakerForTest?.();

    // 上游极慢（2s），预算 1200ms（足以进入链但不足以等上游）：后进者排队超时
    globalThis.fetch = (async () => {
      await new Promise((r) => setTimeout(r, 2000));
      return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200 });
    }) as any;

    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () =>
        chatWithAI([{ role: 'user', content: 'hi' }], 64, undefined, { budgetMs: 1200 })
      )
    );
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(rejected.length).toBeGreaterThan(0);
    expect(rejected.some((r) => String(r.reason?.message).includes('并发闸满'))).toBe(true);
  });
});
