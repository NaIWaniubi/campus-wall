/**
 * 后台控制台 V4 实拍（超管登录）：明/暗两套，逐页看外壳、看板、表格
 * 用法：node scripts/capture-admin.mjs [--base=http://127.0.0.1:3901]
 */
import { chromium } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const arg = (n, d) => { const h = process.argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d }
const BASE = arg('base', 'http://127.0.0.1:3901')
const OUT = path.resolve('captures/admin')
fs.mkdirSync(OUT, { recursive: true })

const CANDIDATES = ['F:/ms-playwright/chromium-1223/chrome-win64/chrome.exe','F:/ms-playwright/chromium-1161/chrome-win64/chrome.exe']
let browser
for (const exe of CANDIDATES) if (fs.existsSync(exe)) { browser = await chromium.launch({ executablePath: exe }); break }
if (!browser) browser = await chromium.launch({ channel: 'chrome' })

const problems = []
const watch = (page, tag) => {
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`[${tag}] ${m.text().slice(0, 160)}`) })
  page.on('pageerror', (e) => problems.push(`[${tag}] pageerror: ${String(e.message).slice(0, 160)}`))
}
async function shoot(page, name, wait = 1600) {
  await page.waitForTimeout(wait)
  await page.screenshot({ path: path.join(OUT, `${name}.png`) })
  console.log('  ·', name)
}

const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()
watch(page, 'admin')

// 超管登录（前端 login store 走 /admin/login）
await page.goto(`${BASE}/admin/login`, { waitUntil: 'domcontentloaded' })
await shoot(page, 'login', 900)
await page.getByPlaceholder('请输入管理员账号').fill('admin')
await page.getByPlaceholder('请输入密码').fill('admin123')
await page.getByRole('button', { name: '登录', exact: true }).click()
await page.waitForURL((u) => u.pathname.startsWith('/admin') && u.pathname !== '/admin/login', { timeout: 20000 })

// 明色：外壳 + 各页
await shoot(page, 'dashboard', 2600)
await page.goto(`${BASE}/admin/posts`, { waitUntil: 'domcontentloaded' }); await shoot(page, 'posts')
await page.goto(`${BASE}/admin/users`, { waitUntil: 'domcontentloaded' }); await shoot(page, 'users')
await page.goto(`${BASE}/admin/ai`, { waitUntil: 'domcontentloaded' }); await shoot(page, 'ai', 1800)

// 暗色：用 localStorage 直接翻主题再刷后台
await page.evaluate(() => localStorage.setItem('app:theme', 'dark'))
await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' }); await shoot(page, 'dashboard-dark', 2600)
await page.goto(`${BASE}/admin/posts`, { waitUntil: 'domcontentloaded' }); await shoot(page, 'posts-dark')

await ctx.close(); await browser.close()
console.log(`\n=== errors: ${problems.length} ===`)
for (const p of problems) console.log('  x', p)
if (problems.length) process.exit(2)
console.log('screenshots ->', OUT)
