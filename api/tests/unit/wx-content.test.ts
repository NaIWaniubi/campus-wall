/**
 * 微信内容安全模块回归：
 * 1. 未配置凭据时整体禁用（本地敏感词兜底），任何调用不发起网络
 * 2. 配置凭据后：pass/review/risky 三种判定的映射正确
 * 3. 87014 错误码按 risky 处理；其他错误按 error 处理
 * 4. 网络异常默认 fail-open（error 且不拒绝），WX_CONTENT_FAIL_CLOSED=1 时改为拒绝
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

async function freshModule() {
  vi.resetModules();
  return await import('../../utils/wx-content.js');
}

const TOKEN_RESP = { access_token: 'mock-token-abc', expires_in: 7200 };

function mockFetchSequence(responses: Array<{ json: any } | Error>) {
  const calls: string[] = [];
  const fn = vi.fn(async (url: string | URL) => {
    calls.push(String(url));
    const next = responses.shift();
    if (!next) throw new Error('unexpected fetch call');
    if (next instanceof Error) throw next;
    return { json: async () => next.json } as any;
  });
  vi.stubGlobal('fetch', fn);
  return calls;
}

describe('wx-content 未配置凭据', () => {
  const savedAppid = process.env.WX_APPID;
  const savedSecret = process.env.WX_SECRET;

  beforeEach(() => {
    delete process.env.WX_APPID;
    delete process.env.WX_SECRET;
  });
  afterEach(() => {
    if (savedAppid !== undefined) process.env.WX_APPID = savedAppid;
    if (savedSecret !== undefined) process.env.WX_SECRET = savedSecret;
    vi.unstubAllGlobals();
  });

  it('isWxContentEnabled 为 false，checkText 返回 disabled 且不发起网络', async () => {
    const calls = mockFetchSequence([]);
    const mod = await freshModule();
    expect(mod.isWxContentEnabled()).toBe(false);

    const r1 = await mod.checkText('openid-x', '随便写点内容');
    expect(r1.verdict).toBe('disabled');
    const r2 = await mod.checkText(null, '无 openid 的 Web 用户');
    expect(r2.verdict).toBe('disabled');
    expect(calls).toHaveLength(0);
  });

  it('submitImageCheck 在未配置时返回 ok:false 且不发起网络', async () => {
    const calls = mockFetchSequence([]);
    const mod = await freshModule();
    const r = await mod.submitImageCheck('openid-x', 'https://example.com/a.jpg');
    expect(r.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });
});

describe('wx-content 已配置凭据（mock fetch）', () => {
  const savedAppid = process.env.WX_APPID;
  const savedSecret = process.env.WX_SECRET;
  const savedFailClosed = process.env.WX_CONTENT_FAIL_CLOSED;

  beforeEach(() => {
    process.env.WX_APPID = 'wx_test_appid';
    process.env.WX_SECRET = 'wx_test_secret';
    delete process.env.WX_CONTENT_FAIL_CLOSED;
  });
  afterEach(() => {
    if (savedAppid !== undefined) process.env.WX_APPID = savedAppid;
    else delete process.env.WX_APPID;
    if (savedSecret !== undefined) process.env.WX_SECRET = savedSecret;
    else delete process.env.WX_SECRET;
    if (savedFailClosed !== undefined) process.env.WX_CONTENT_FAIL_CLOSED = savedFailClosed;
    else delete process.env.WX_CONTENT_FAIL_CLOSED;
    vi.unstubAllGlobals();
  });

  it('suggest=pass → pass，并命中正确的两个端点', async () => {
    const calls = mockFetchSequence([
      { json: TOKEN_RESP },
      { json: { errcode: 0, result: { suggest: 'pass', label: 100 } } },
    ]);
    const mod = await freshModule();
    expect(mod.isWxContentEnabled()).toBe(true);

    const r = await mod.checkText('openid-x', '正常内容');
    expect(r).toEqual({ verdict: 'pass', label: 100 });
    expect(calls[0]).toContain('cgi-bin/token');
    expect(calls[1]).toContain('wxa/msg_sec_check');
  });

  it('suggest=review → review；suggest=risky → risky', async () => {
    mockFetchSequence([
      { json: TOKEN_RESP },
      { json: { errcode: 0, result: { suggest: 'review', label: 20001 } } },
    ]);
    const mod1 = await freshModule();
    expect((await mod1.checkText('openid-x', '待审')).verdict).toBe('review');

    mockFetchSequence([
      { json: TOKEN_RESP },
      { json: { errcode: 0, result: { suggest: 'risky', label: 20002 } } },
    ]);
    const mod2 = await freshModule();
    expect((await mod2.checkText('openid-x', '违规')).verdict).toBe('risky');
  });

  it('errcode=87014（违法违规）按 risky 处理', async () => {
    mockFetchSequence([
      { json: TOKEN_RESP },
      { json: { errcode: 87014, errmsg: 'risky content' } },
    ]);
    const mod = await freshModule();
    const r = await mod.checkText('openid-x', '违禁信息');
    expect(r.verdict).toBe('risky');
    expect(r.errcode).toBe(87014);
  });

  it('网络异常 fail-open：verdict=error 且 shouldRejectOnCheckError=false', async () => {
    mockFetchSequence([new Error('ECONNRESET')]);
    const mod = await freshModule();
    const r = await mod.checkText('openid-x', '内容');
    expect(r.verdict).toBe('error');
    expect(mod.shouldRejectOnCheckError()).toBe(false);
  });

  it('WX_CONTENT_FAIL_CLOSED=1 时应当拒绝（shouldReject=true）', async () => {
    process.env.WX_CONTENT_FAIL_CLOSED = '1';
    mockFetchSequence([new Error('timeout')]);
    const mod = await freshModule();
    expect(mod.shouldRejectOnCheckError()).toBe(true);
  });

  it('openid 为空（Web 用户）时短路为 disabled，不发请求', async () => {
    const calls = mockFetchSequence([]);
    const mod = await freshModule();
    const r = await mod.checkText(null, 'Web 用户内容');
    expect(r.verdict).toBe('disabled');
    expect(calls).toHaveLength(0);
  });
});
