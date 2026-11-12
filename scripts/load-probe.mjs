/**
 * 并发压测（零依赖）：按目标 QPS 打满一个端点，给出 p50/p95/p99、RPS、错误分布。
 * 与 scripts/bench.mjs 的区别：
 *   bench 走同一 IP，会被服务端 readLimiter（300 次/分钟/IP）拦成 429；
 *   本脚本给每个请求带唯一 X-Forwarded-For（服务端 TRUST_PROXY=1 时生效），
 *   从而测的是「真实业务吞吐」而不是限流器。
 * 用法：node scripts/load-probe.mjs [--base=http://127.0.0.1:3901] [--path=/api/posts] [--n=600] [--c=20] [--token=xxx]
 */
const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : fallback
}
const BASE = arg('base', 'http://127.0.0.1:3901')
// Git Bash / MSYS 会把 `--path=/api/health` 里的 /api/health 转成 C:/Program Files/Git/api/health，
// 这里做一次兜底还原；同时建议调用时加 MSYS_NO_PATHCONV=1。
const RAW_PATH = arg('path', '/api/posts?page=1&pageSize=20')
const PATH = RAW_PATH.replace(/^[A-Za-z]:[\\/].*?[\\/]Git[\\/]/, '/')
const N = Number(arg('n', 600))
const C = Number(arg('c', 20))
const TOKEN = arg('token', '')

const lat = []
let errors = 0
const errorKinds = new Map()

function pct(sorted, p) {
  const i = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))
  return sorted[i]
}

async function one(i) {
  const t0 = performance.now()
  try {
    const res = await fetch(BASE + PATH, {
      headers: {
        // 每个请求一个「不同客户端 IP」：绕过单 IP 限流，测真实吞吐
        'X-Forwarded-For': `10.${(i >> 16) & 255}.${(i >> 8) & 255}.${i & 255}`,
        ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
      },
    })
    const body = res.headers.get('content-type')?.includes('json') ? await res.json().catch(() => null) : null
    if (!res.ok) {
      errors++
      const kind = `HTTP ${res.status}${body?.message ? ' · ' + String(body.message).slice(0, 40) : ''}`
      errorKinds.set(kind, (errorKinds.get(kind) ?? 0) + 1)
    }
  } catch (e) {
    errors++
    const kind = 'fetch: ' + String(e.message).slice(0, 40)
    errorKinds.set(kind, (errorKinds.get(kind) ?? 0) + 1)
  }
  lat.push(performance.now() - t0)
}

const started = performance.now()
let next = 0
await Promise.all(
  Array.from({ length: C }, async () => {
    while (next < N) {
      const i = next++
      await one(i)
    }
  })
)
const total = (performance.now() - started) / 1000
lat.sort((a, b) => a - b)

console.log(JSON.stringify({
  base: BASE,
  path: PATH,
  n: N,
  concurrency: C,
  seconds: Number(total.toFixed(2)),
  rps: Math.round(N / total),
  errors,
  errorKinds: Object.fromEntries(errorKinds),
  latencyMs: {
    p50: Number(pct(lat, 50).toFixed(1)),
    p90: Number(pct(lat, 90).toFixed(1)),
    p95: Number(pct(lat, 95).toFixed(1)),
    p99: Number(pct(lat, 99).toFixed(1)),
    max: Number(lat[lat.length - 1].toFixed(1)),
  },
}, null, 2))
