/**
 * 通用滑动窗口限流单测：
 * 1. 窗口内达到 max 后 429，响应格式统一 { code: 429 }
 * 2. 窗口滚动后额度恢复（滑动窗口语义）
 * 3. 维度 key 隔离：不同 IP 互不影响；同 IP 不同学号互不影响
 */
import { describe, it, expect } from 'vitest';
import { createRateLimiter } from '../../middleware/rateLimit.js';
import type { Request, Response, NextFunction } from 'express';

function mockReq(overrides: Partial<{ ip: string; ua: string; studentId: string }> = {}): Request {
  return {
    ip: overrides.ip ?? '1.2.3.4',
    socket: { remoteAddress: overrides.ip ?? '1.2.3.4' },
    headers: { 'user-agent': overrides.ua ?? 'test-agent' },
    body: overrides.studentId ? { studentId: overrides.studentId } : {},
  } as unknown as Request;
}

/** 跑一次中间件：返回是否放行 + 被拦截时的响应体 */
function run(mw: ReturnType<typeof createRateLimiter>, req: Request) {
  let status = 0;
  let payload: any = null;
  let passed = false;
  const res = {
    status(code: number) {
      status = code;
      return {
        json(p: any) {
          payload = p;
        },
      };
    },
  } as unknown as Response;
  mw(req, res, (() => {
    passed = true;
  }) as NextFunction);
  return { passed, status, payload };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('createRateLimiter 滑动窗口限流', () => {
  const limiter = createRateLimiter({ windowMs: 60, max: 3, name: 'test' });

  it('窗口内超过 max 次后返回 429 与统一响应格式', () => {
    const req = mockReq();
    expect(run(limiter, req).passed).toBe(true);
    expect(run(limiter, req).passed).toBe(true);
    expect(run(limiter, req).passed).toBe(true);
    const blocked = run(limiter, req);
    expect(blocked.passed).toBe(false);
    expect(blocked.status).toBe(429);
    expect(blocked.payload).toMatchObject({ code: 429 });
    expect(String(blocked.payload.message)).toContain('频繁');
  });

  it('窗口滚动后额度恢复（滑动窗口语义）', async () => {
    const limiter = createRateLimiter({ windowMs: 30, max: 1, name: 'slide' });
    const req = mockReq();
    expect(run(limiter, req).passed).toBe(true);
    expect(run(limiter, req).passed).toBe(false);
    await sleep(40); // 越过窗口：首个时间戳滑出
    expect(run(limiter, req).passed).toBe(true);
  });

  it('维度 key 隔离：不同 IP / 不同学号互不共享额度', () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 1, name: 'dims' });
    expect(run(limiter, mockReq({ ip: '1.1.1.1' })).passed).toBe(true);
    expect(run(limiter, mockReq({ ip: '1.1.1.1' })).passed).toBe(false); // 同 IP 第 2 次 → 拦
    expect(run(limiter, mockReq({ ip: '2.2.2.2' })).passed).toBe(true);  // 换 IP → 独立额度
    expect(run(limiter, mockReq({ ip: '2.2.2.2', studentId: '20230001' })).passed).toBe(true); // 换学号 → 独立额度
  });
});
