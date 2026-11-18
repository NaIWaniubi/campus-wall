/**
 * 小程序会话代际守卫（静态断言 + 行为等价验证）
 *
 * 场景：用户在 refresh 请求在飞时点「退出登录」——
 * 若续期响应回来后仍写回 token，用户以为已退出、实际仍是登录态（退出等于没退）。
 * 守卫：会话代际（epoch）在清会话时递增，在飞的续期响应比对代际后丢弃。
 *
 * 小程序源码是 CommonJS（微信运行时），而本仓库 package.json 是 ESM，
 * 因此这里对源文件做结构断言（与 static.test.ts 同风格），并用等价逻辑验证判定语义。
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const MINI = path.join(ROOT, 'miniprogram');
const read = (p: string) => fs.readFileSync(path.join(MINI, p), 'utf-8');

const requestSrc = read('utils/request.js');
const authSrc = read('utils/auth.js');

describe('小程序会话代际守卫', () => {
  it('request.js 维护单一会话代际并在清会话时递增', () => {
    expect(requestSrc).toMatch(/let sessionEpoch = 0/);
    // clearTokens 内递增
    expect(requestSrc).toMatch(/function clearTokens\(\)[\s\S]{0,200}sessionEpoch \+= 1/);
    // handleUnauthorized（401 掉登录）也递增
    expect(requestSrc).toMatch(/function handleUnauthorized\(\)[\s\S]{0,300}sessionEpoch \+= 1/);
  });

  it('续期发起时记录代际、响应回来后比对并丢弃', () => {
    expect(requestSrc).toMatch(/const epochAtStart = sessionEpoch/);
    expect(requestSrc).toMatch(/if \(epochAtStart !== sessionEpoch\)\s*\{\s*resolve\(false\);\s*return/);
  });

  it('登出路径（auth.clearSession）走 request.clearTokens，避免两处 epoch 失配', () => {
    expect(authSrc).toMatch(/require\('\.\/request'\)/);
    expect(authSrc).toMatch(/clearTokens/);
    // clearSession 内调用 clearTokens（放宽行距：函数体可能超过 300 字符）
    expect(authSrc).toMatch(/function clearSession\(\)[\s\S]*?clearTokens\(\)/);
    // auth.js 不再自己维护第二套 epoch
    expect(authSrc).not.toMatch(/let sessionEpoch/);
  });

  it('等价语义：代际变化时续期结果必须丢弃且不写回', () => {
    // 用与源码相同的两步判定，验证语义（代际变化 → 丢弃 → 不写回）
    const store = new Map<string, string>();
    let sessionEpoch = 0;
    const saveTokens = (t: string, r: string) => { store.set('token', t); store.set('refreshToken', r); };
    const clearTokens = () => { sessionEpoch += 1; store.delete('token'); store.delete('refreshToken'); };

    store.set('token', 'old-access');
    store.set('refreshToken', 'rt-live');
    const epochAtStart = sessionEpoch;

    clearTokens(); // 用户登出

    // 续期响应此刻回来
    let ok = false;
    if (epochAtStart !== sessionEpoch) ok = false;
    else { saveTokens('new-access', 'rt-new'); ok = true; }

    expect(ok).toBe(false);
    expect(store.get('token')).toBeUndefined();
    expect(store.get('refreshToken')).toBeUndefined();
  });
});
