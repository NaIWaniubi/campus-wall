/**
 * V5 功能与视觉验收：手机 390×844 + 桌面 1440×900
 * 覆盖新增：一键体验、命令面板（Ctrl+K）、新手引导、深色模式、设置页、粘贴上传区
 * console/pageerror 必须 0，否则 exit 2
 * 用法：node scripts/capture-v5.mjs [--base=http://127.0.0.1:3901]
 */
import { chromium } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const arg = (n, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${n}=`))
  return hit ? hit.slice(n.length + 3) : d
}
const BASE = arg('base', 'http://127.0.0.1:3901')
const OUT = path.resolve('captures/v5')
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

async function shoot(page, name, wait = 1500) {
  await page.waitForTimeout(wait)
  await page.screenshot({ path: path.join(OUT, `${name}.png`) })
  console.log('  ·', name)
}

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.getByPlaceholder('手机号 / 拼音 / 账号').fill('23770001')
  await page.getByPlaceholder('请输入密码').fill('demo1234')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 20000 })
}

// ---------- 手机 ----------
let ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
let page = await ctx.newPage()
watch(page, 'm')

// 1) 登录页 + 新手引导（全新访客：清 storage 后首页 1.2s 自动弹）
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
await shoot(page, 'm-login', 1200)

// 2) 一键体验：零输入直接进产品
await page.getByRole('button', { name: /一键体验/ }).click()
await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 20000 })
// 新手引导可能在任意时刻弹出，先拍它再关
const guide = page.getByRole('dialog', { name: '新手引导' })
await page.waitForTimeout(1400)
if (await guide.count()) await shoot(page, 'm-onboarding', 300)
await page.keyboard.press('Escape')
await page.evaluate(() => localStorage.setItem('onboarding:v1', 'done'))
await shoot(page, 'm-home', 2200)

// 3) 命令面板 Ctrl+K（移动端无键盘，走事件唤起同样路径）
await page.evaluate(() => window.dispatchEvent(new CustomEvent('cp:open')))
await shoot(page, 'm-palette', 400)
await page.keyboard.type('耳机')
await page.waitForTimeout(1200)
await shoot(page, 'm-palette-query', 300)
await page.keyboard.press('Escape')

await page.goto(`${BASE}/profile/settings`, { waitUntil: 'domcontentloaded' }); await shoot(page, 'm-settings')
await page.goto(`${BASE}/publish`, { waitUntil: 'domcontentloaded' }); await shoot(page, 'm-publish', 1800)
await ctx.close()

// ---------- 桌面 ----------
ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
page = await ctx.newPage()
watch(page, 'd')
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
await page.evaluate(() => localStorage.setItem('onboarding:v1', 'done'))
await login(page)

await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' }); await shoot(page, 'd-home', 2400)

// Ctrl+K 快捷键本身
await page.keyboard.press('Control+k')
await page.waitForTimeout(500)
await shoot(page, 'd-palette', 300)
await page.keyboard.press('Escape')

// 深色模式：点首页太阳/月亮按钮
const themeBtn = page.getByRole('button', { name: /切换到深色模式/ })
if (await themeBtn.count()) {
  await themeBtn.first().click()
  await shoot(page, 'd-home-dark', 700)
  await page.goto(`${BASE}/profile`, { waitUntil: 'domcontentloaded' }); await shoot(page, 'd-profile-dark')
  await page.goto(`${BASE}/profile/settings`, { waitUntil: 'domcontentloaded' }); await shoot(page, 'd-settings-dark')
  // 切回浅色再拍常规页
  await page.getByRole('button', { name: /切换到浅色模式/ }).first().click()
}
await page.goto(`${BASE}/topics`, { waitUntil: 'domcontentloaded' }); await shoot(page, 'd-topics')
const postId = await page.evaluate(async () => {
  const r = await fetch('/api/posts?page=1&pageSize=1').then((x) => x.json())
  return r?.data?.list?.[0]?.id ?? null
})
if (postId) { await page.goto(`${BASE}/post/${postId}`, { waitUntil: 'domcontentloaded' }); await shoot(page, 'd-post', 2000) }
await page.goto(`${BASE}/publish`, { waitUntil: 'domcontentloaded' }); await shoot(page, 'd-publish', 1800)
await ctx.close()
await browser.close()

console.log(`\n=== errors: ${problems.length} ===`)
for (const p of problems) console.log('  x', p)
if (problems.length) process.exit(2)
console.log('screenshots ->', OUT)
