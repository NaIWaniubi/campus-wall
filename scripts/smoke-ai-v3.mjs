/**
 * V3 AI 产品层冒烟：登录 → draft / summarize / digest 三个端点真实调用。
 * 用法：node scripts/smoke-ai-v3.mjs [baseUrl]
 * 只读 + 只调用 AI 端点，不写库（draft/summarize 不落库）。
 */
const BASE = process.argv[2] || 'http://127.0.0.1:3901';

async function req(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

const login = await req('/api/auth/login', {
  method: 'POST',
  body: { studentId: '23770001', password: 'demo1234' },
});
const token = login.json?.data?.token;
console.log('login:', login.status, token ? 'token ok' : JSON.stringify(login.json)?.slice(0, 200));
if (!token) process.exit(1);

const draft = await req('/api/ai/draft', {
  method: 'POST',
  token,
  body: { raw: '出一个九成新 iPad Air，1500 元，可小刀，东门当面交易' },
});
console.log('\n[draft]', draft.status, JSON.stringify(draft.json?.data, null, 1));

const list = await req('/api/posts?page=1&pageSize=1');
const postId = list.json?.data?.list?.[0]?.id;
console.log('\nfirst post id:', postId);

const sum = await req('/api/ai/summarize', { method: 'POST', token, body: { postId } });
console.log('\n[summarize]', sum.status, JSON.stringify(sum.json?.data, null, 1));

const risky = await req('/api/ai/summarize', {
  method: 'POST',
  token,
  body: { title: '低价出二手手机', content: '先交押金 200 元锁定名额，加微信扫码转账，马上发货' },
});
console.log('\n[summarize/risk]', risky.status, JSON.stringify(risky.json?.data, null, 1));

const digest = await req('/api/ai/digest');
console.log('\n[digest]', digest.status, JSON.stringify(digest.json?.data, null, 1));
