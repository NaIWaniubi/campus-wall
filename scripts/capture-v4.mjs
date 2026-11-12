/**
 * V4 全站视觉验收：手机 390×844 + 桌面 1440×900，覆盖 10 个页面，
 * 自带 console/pageerror 断言（必须 0），失败时 exit 2。
 * 用法：node scripts/capture-v4.mjs [--base=http://127.0.0.1:3901]
 */
import { chromium } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const arg = (n, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${n}=`))
  return hit ? hit.slice(n.length + 3) : d
}
const BASE = arg('base', 'http://127.0.0.1:3901')
const OUT = path.resolve('captures/v4')
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

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.getByPlaceholder('请输入学号').fill('23770001')
  await page.getByPlaceholder('请输入密码').fill('demo1234')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 20000 })
}

async function shoot(page, name, wait = 1600) {
  await page.waitForTimeout(wait)
  await page.screenshot({ path: path.join(OUT, `${name}.png`) })
  console.log('  ·', name)
}

// ---------- 手机 ----------
let ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
let page = await ctx.newPage()
watch(page, 'm')

// 登录页（未登录先拍）
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
await shoot(page, 'm-login', 1200)

await login(page)
const postId = await page.evaluate(async () => {
  const r = await fetch('/api/posts?page=1&pageSize=1').then((x) => x.json())
  return r?.data?.list?.[0]?.id ?? null
})

await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' }); await shoot(page, 'm-home', 2400)
await page.goto(`${BASE}/topics`, { waitUntil: 'domcontentloaded' }); await shoot(page, 'm-topics')
await page.goto(`${BASE}/section/2`, { waitUntil: 'domcontentloaded' }); await shoot(page, 'm-section')
if (postId) {
  await page.goto(`${BASE}/post/${postId}`, { waitUntil: 'domcontentloaded' }); await shoot(page, 'm-post', 2000)
  const ai = page.getByRole('button', { name: /AI 划重点/ }).first()
  if (await ai.count()) { await ai.click(); await page.waitForTimeout(1500); await ai.scrollIntoViewIfNeeded(); await shoot(page, 'm-post-ai', 400) }
}
await page.goto(`${BASE}/publish`, { waitUntil: 'domcontentloaded' }); await shoot(page, 'm-publish', 1800)
await page.goto(`${BASE}/message`, { waitUntil: 'domcontentloaded' }); await shoot(page, 'm-message')
await page.goto(`${BASE}/profile`, { waitUntil: 'domcontentloaded' }); await shoot(page, 'm-profile')
await page.goto(`${BASE}/search`, { waitUntil: 'domcontentloaded' }); await shoot(page, 'm-search')
await ctx.close()

// ---------- 桌面 ----------
ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
page = await ctx.newPage()
watch(page, 'd')
await login(page)
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' }); await shoot(page, 'd-home', 2400)
await page.goto(`${BASE}/topics`, { waitUntil: 'domcontentloaded' }); await shoot(page, 'd-topics')
if (postId) { await page.goto(`${BASE}/post/${postId}`, { waitUntil: 'domcontentloaded' }); await shoot(page, 'd-post', 2000) }
await page.goto(`${BASE}/publish`, { waitUntil: 'domcontentloaded' }); await shoot(page, 'd-publish', 1800)
await ctx.close()
await browser.close()

console.log(`\n=== errors: ${problems.length} ===`)
for (const p of problems) console.log('  x', p)
if (problems.length) process.exit(2)
console.log('screenshots ->', OUT)
