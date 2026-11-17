/**
 * V6 增量截图：本轮新增/变更的页面（法律文本页、注册协议勾选、401 续期后的正常态）
 * 复用 v5 的启动约定：先起 dev server（默认 3901），再 node scripts/capture-v6-delta.mjs
 * 用法：node scripts/capture-v6-delta.mjs [--base=http://127.0.0.1:3901]
 */
import { chromium } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const arg = (n, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${n}=`))
  return hit ? hit.slice(n.length + 3) : d
}
const BASE = arg('base', 'http://127.0.0.1:3901')
const OUT = path.resolve('captures/v6')
fs.mkdirSync(OUT, { recursive: true })

const CANDIDATES = [
  'F:/ms-playwright/chromium-1223/chrome-win64/chrome.exe',
  'F:/ms-playwright/chromium-1161/chrome-win64/chrome.exe',
]
let browser
for (const exe of CANDIDATES) if (fs.existsSync(exe)) { browser = await chromium.launch({ executablePath: exe }); break }
if (!browser) browser = await chromium.launch({ channel: 'chrome' })

const problems = []
const watch = (page, tag) => {
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`[${tag}] console: ${m.text().slice(0, 160)}`) })
  page.on('pageerror', (e) => problems.push(`[${tag}] pageerror: ${String(e.message).slice(0, 160)}`))
}

async function shoot(page, name, wait = 1200) {
  await page.waitForTimeout(wait)
  await page.screenshot({ path: path.join(OUT, `${name}.png`) })
  console.log('  ·', name)
}

// ---------- 手机：法律页 + 注册协议 ----------
let ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
let page = await ctx.newPage()
watch(page, 'm')

await page.goto(`${BASE}/legal/privacyPolicy`, { waitUntil: 'domcontentloaded' })
await shoot(page, 'm-legal-privacy', 1600)

await page.goto(`${BASE}/legal/userAgreement`, { waitUntil: 'domcontentloaded' })
await shoot(page, 'm-legal-terms', 1200)

await page.goto(`${BASE}/register`, { waitUntil: 'domcontentloaded' })
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
await shoot(page, 'm-register-agreement', 1200)

// ---------- 桌面：法律页 ----------
await ctx.close()
ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
page = await ctx.newPage()
watch(page, 'd')

await page.goto(`${BASE}/legal/privacyPolicy`, { waitUntil: 'domcontentloaded' })
await shoot(page, 'd-legal-privacy', 1600)

await browser.close()

if (problems.length) {
  console.error('\n发现控制台错误：')
  problems.slice(0, 10).forEach((p) => console.error(' -', p))
  process.exit(2)
}
console.log('\n[ok] 截图完成，0 console/pageerror')
