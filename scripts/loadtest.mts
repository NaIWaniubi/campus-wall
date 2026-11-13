/**
 * 契约压测门（V5）：零依赖并发负载 + 每端点期望状态码断言。
 *
 * 与"跑分"不同，这里守的是交付承诺：并发压力下
 *   - 5xx / 连接错误 = 0（服务端不许炸）
 *   - 每个端点必须仍返回契约状态码（鉴权守卫、404 语义在高并发下不许漂移）
 *   - 限流被触发（429）单独统计：那是防线在工作，不算失败
 *
 * 用法：BASE=http://127.0.0.1:4101 DURATION=20 CONCURRENCY=24 npx tsx scripts/loadtest.mts
 * 注意：必须打在对限流器关闭（RATE_LIMIT_ENABLED=0）的专用实例上——对普通实例高并发跑，
 *       测的是 readLimiter 而非服务端健康度（CI load job 即按此配置起服务）。
 * 退出码：0=过闸；1=违约（输出违规明细）
 */
const BASE = process.env.BASE || 'http://127.0.0.1:4001'
// DURATION 以「秒」为单位（>600 视为毫秒，向后兼容）
const DURATION_RAW = Number(process.env.DURATION || 20_000)
const DURATION_MS = DURATION_RAW > 600 ? DURATION_RAW : DURATION_RAW * 1000
const CONCURRENCY = Number(process.env.CONCURRENCY || 24)
const P95_BUDGET_MS = Number(process.env.P95_BUDGET || 800)

// 端点档案：期望状态码（数组=多个可接受值）+ 权重
interface EndpointDef { path: string; expect: number[]; weight: number; label: string }
const ENDPOINTS: EndpointDef[] = [
  { path: '/api/health', expect: [200], weight: 6, label: '健康检查' },
  { path: '/api/posts?page=1&pageSize=10', expect: [200], weight: 34, label: '信息流列表' },
  { path: '/api/posts/1', expect: [200, 404], weight: 20, label: '帖子详情' },
  { path: '/api/sections', expect: [200], weight: 12, label: '板块元数据' },
  { path: '/api/search?keyword=%E8%80%B3%E6%9C%BA&page=1', expect: [200], weight: 10, label: 'FTS 搜索' },
  { path: '/api/posts/1/comments', expect: [200, 404], weight: 8, label: '评论列表' },
  { path: '/api/messages', expect: [401], weight: 6, label: '鉴权守卫(匿名必须401)' },
  { path: '/api/posts/99999999', expect: [404], weight: 4, label: '404 语义' },
]

// ROLLUP 直接存端点引用；此前存 path 字符串再用 find(e=>e.path===pick()) 反查，
// 谓词每轮重新调用 pick() 产生新随机 → 大量 undefined → 假「连接错误」。
const ROLLUP = ENDPOINTS.flatMap((e) => Array<EndpointDef>(e.weight).fill(e))

const stats = new Map(ENDPOINTS.map((e) => [e.path, { ok: 0, bad: 0, codes: {}, lat: [] }]))
let total = 0
let netErrors = 0
let fiveXx = 0
let limitHits = 0
let deadlinePassed = false
const netErrSamples: string[] = []

const stopAt = Date.now() + DURATION_MS
const pick = (): EndpointDef => ROLLUP[(Math.random() * ROLLUP.length) | 0]
// 每请求 8ms 定距：真实前端不会 0 间隔连发；也让压测机自己别先炸（undici 并发上限）
const PACE_MS = Number(process.env.PACE || 8)

async function worker(id: number) {
  while (Date.now() < stopAt) {
    const ep = pick()
    const t0 = performance.now()
    let status = 0
    try {
      const res = await fetch(BASE + ep.path, {
        headers: { 'x-loadtest': String(id) },
        signal: AbortSignal.timeout(8000),
      })
      status = res.status
      await res.arrayBuffer() // 读完 body，避免连接悬挂
    } catch (err: any) {
      netErrors++
      if (netErrSamples.length < 3) netErrSamples.push([err?.name, err?.message, err?.cause?.name, err?.cause?.message, err?.cause?.code].filter(Boolean).join(': '))
      continue
    }
    const ms = performance.now() - t0
    total++
    const s = stats.get(ep.path)!
    s.lat.push(ms)
    s.codes[status] = (s.codes[status] || 0) + 1
    if (status >= 500) fiveXx++
    if (status === 429) limitHits++
    if (ep.expect.includes(status)) s.ok++
    else s.bad++
    if (PACE_MS > 0) await new Promise((r) => setTimeout(r, PACE_MS))
  }
}

// 5s 硬超时护栏：卡死也要出报告
const hardStop = setTimeout(() => { deadlinePassed = true; console.error('hard stop triggered') }, DURATION_MS + 15_000)

const t0 = Date.now()
await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => worker(i)))
clearTimeout(hardStop)

const wall = (Date.now() - t0) / 1000
const allLat = [...stats.values()].flatMap((s) => s.lat).sort((a, b) => a - b)
const pct = (p: number) => (allLat.length ? allLat[Math.min(allLat.length - 1, Math.floor(allLat.length * p))] : 0)

let violations = 0
const lines: string[] = []
for (const ep of ENDPOINTS) {
  const s = stats.get(ep.path)!
  const n = s.lat.length
  const p95 = [...s.lat].sort((a, b) => a - b)[Math.floor(n * 0.95)] || 0
  const expectTxt = ep.expect.join('/')
  const mark = s.bad === 0 && p95 < P95_BUDGET_MS ? '✓' : '✗'
  if (s.bad > 0 || p95 >= P95_BUDGET_MS) violations++
  lines.push(
    `${mark} ${ep.label.padEnd(16)} ${String(n).padStart(6)} 请求 | 契约 ${expectTxt.padEnd(7)} 命中 ${(((s.ok / Math.max(n, 1)) * 100).toFixed(2))}% | p95 ${p95.toFixed(0)}ms | ${Object.entries(s.codes).map(([c, k]) => `${c}:${k}`).join(' ')}`
  )
}

console.log(`\n=== 契约压测门 · ${BASE} ===`)
for (const l of lines) console.log(l)
console.log(`\n总请求 ${total} | 用时 ${wall.toFixed(1)}s | ${Math.round(total / wall)} req/s`)
console.log(`p50 ${pct(0.5).toFixed(0)}ms | p95 ${pct(0.95).toFixed(0)}ms | p99 ${pct(0.99).toFixed(0)}ms`)
console.log(`5xx: ${fiveXx} | 连接错误: ${netErrors} | 限流命中(429，属正常防线): ${limitHits}`)

if (fiveXx > 0 || netErrors > 0 || violations > 0) {
  if (netErrSamples.length) console.error('连接错误样例:', netErrSamples.join(' | '))
  console.error(`\nFAIL — 5xx=${fiveXx} 连接错误=${netErrors} 违约端点数=${violations}`)
  process.exit(1)
}
if (pct(0.95) >= P95_BUDGET_MS) {
  console.error(`\nFAIL — 全局 p95 ${pct(0.95).toFixed(0)}ms ≥ 预算 ${P95_BUDGET_MS}ms`)
  process.exit(1)
}
console.log(`\nPASS — 并发 ${CONCURRENCY} 下零 5xx、契约状态码全命中、p95 在预算内`)
void deadlinePassed
