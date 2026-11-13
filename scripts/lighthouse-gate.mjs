/**
 * Lighthouse 性能门（V5）：对生产构建真测四类分数，低于阈值 exit 1。
 *
 * 用法：BASE=http://127.0.0.1:3901 node scripts/lighthouse-gate.mjs
 * CI：ubuntu-latest 自带 google-chrome（CHROME_PATH 指定）；本地自动探测 ms-playwright chromium。
 *
 * 取 3 次中位数（LHCI 同款纪律）：移动端模拟单次波动实测可达 ±15（冷缓存/机器负载），
 * 单跑门必 flaky；中位数抹平离群值，仍对真实回归敏感。LH_RUNS 可调。
 *
 * 阈值 = 实测留噪声余量。优化史：67 → 78（marked/dompurify 懒加载、命令面板懒挂载、
 * 首屏 pageSize 20→12、卡片 contain 隔离）。72 是回归地板：无 SSR 的 Vue SPA 移动端
 * 实测中位 75-78，再往上需 prerender，属另一个工程面。收紧不放宽；调整需 PR 说明。
 */
import fs from 'node:fs'
import lighthouse from 'lighthouse'
import * as chromeLauncher from 'chrome-launcher'

const BASE = process.env.BASE || 'http://127.0.0.1:3901'
const RUNS = Math.max(1, Number(process.env.LH_RUNS || 3))
const THRESHOLDS = {
  performance: Number(process.env.LH_PERF || 0.72),
  accessibility: Number(process.env.LH_A11Y || 0.9),
  'best-practices': Number(process.env.LH_BP || 0.9),
  seo: Number(process.env.LH_SEO || 0.9),
}

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH
  const candidates = [
    'F:/ms-playwright/chromium-1223/chrome-win64/chrome.exe',
    'F:/ms-playwright/chromium-1161/chrome-win64/chrome.exe',
  ]
  return candidates.find((p) => fs.existsSync(p))
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

const chrome = await chromeLauncher.launch({
  chromePath: findChrome(),
  chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
})

try {
  const runs = {}
  let lastMetrics = {}
  for (let i = 0; i < RUNS; i++) {
    const result = await lighthouse(`${BASE}/`, {
      port: chrome.port,
      output: 'json',
      logLevel: 'error',
      onlyCategories: Object.keys(THRESHOLDS),
    })
    const cats = result.lhr.categories
    const line = Object.keys(THRESHOLDS)
      .map((k) => {
        const score = cats[k]?.score ?? 0
        ;(runs[k] ??= []).push(score)
        return `${k}=${Math.round(score * 100)}`
      })
      .join(' ')
    console.log(`run ${i + 1}/${RUNS}: ${line}`)
    const a = result.lhr.audits
    lastMetrics = Object.fromEntries(
      ['first-contentful-paint', 'largest-contentful-paint', 'total-blocking-time', 'cumulative-layout-shift', 'speed-index']
        .map((k) => [k, a[k]?.displayValue ?? 'n/a'])
    )
  }

  let fail = 0
  console.log(`\n=== Lighthouse 门 · ${BASE}/ （${RUNS} 次中位数）===`)
  for (const [key, min] of Object.entries(THRESHOLDS)) {
    const score = median(runs[key] ?? [0])
    const ok = score >= min
    if (!ok) fail++
    console.log(`${ok ? '✓' : '✗'} ${key.padEnd(16)} ${String(Math.round(score * 100)).padStart(3)} / ≥${Math.round(min * 100)}`)
  }
  for (const [k, v] of Object.entries(lastMetrics)) console.log(`  ${k}: ${v}`)
  if (fail) {
    console.error(`\nFAIL — ${fail} 类中位数低于阈值`)
    process.exit(1)
  }
  console.log('\nPASS — Lighthouse 四类中位数在预算内')
} finally {
  await chrome.kill()
}
