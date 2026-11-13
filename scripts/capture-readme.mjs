/**
 * README 橱窗图重制（V5）：按原命名输出 8 张 1440×900 桌面图，
 * 覆盖首页 / 搜索 / 详情 / AI 助手 / 私信 / 我的 / 后台看板 / 后台 AI。
 * 用法：node scripts/capture-readme.mjs [--base=http://127.0.0.1:3901]
 */
import { chromium } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const arg = (n, d) => { const h = process.argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d }
const BASE = arg('base', 'http://127.0.0.1:3901')
const OUT = path.resolve('captures')
fs.mkdirSync(OUT, { recursive: true })

const CANDIDATES = ['F:/ms-playwright/chromium-1223/chrome-win64/chrome.exe', 'F:/ms-playwright/chromium-1161/chrome-win64/chrome.exe']
let browser
for (const exe of CANDIDATES) if (fs.existsSync(exe)) { browser = await chromium.launch({ executablePath: exe }); break }
if (!browser) browser = await chromium.launch({ channel: 'chrome' })

const problems = []
function watch(page, tag) {
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`[${tag}] ${m.text().slice(0, 140)}`) })
  page.on('pageerror', (e) => problems.push(`[${tag}] ${String(e.message).slice(0, 140)}`))
}
async function shot(page, name, wait = 2200) {
  await page.waitForTimeout(wait)
  await page.screenshot({ path: path.join(OUT, name) })
  console.log('  ·', name)
}

async function loginStudent(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await page.evaluate(() => localStorage.setItem('onboarding:v1', 'done'))
  await page.getByPlaceholder('手机号 / 拼音 / 账号').fill('23770001')
  await page.getByPlaceholder('请输入密码').fill('demo1234')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 20000 })
}

const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()
watch(page, 'readme')

await loginStudent(page)
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' }); await shot(page, '01-home.png', 3000)

await page.goto(`${BASE}/search?keyword=%E8%80%B3%E6%9C%BA`, { waitUntil: 'networkidle' })
await page.getByRole('button', { name: /搜索/ }).first().click().catch(() => {})
await shot(page, '02-search.png', 2400)

const pid = await page.evaluate(async () => { const r = await (await fetch('/api/posts?page=1&pageSize=1&sort=hot')).json(); return r?.data?.list?.[0]?.id ?? 35 })
await page.goto(`${BASE}/post/${pid}`, { waitUntil: 'networkidle' }); await shot(page, '03-post-detail.png', 2800)

// AI 助手面板（桌面右下角贴纸按钮）
const aiBtn = page.locator('.sa-fab, [aria-label*="AI 助手"], [aria-label*="打开 AI"]').first()
if (await aiBtn.count()) { await aiBtn.click(); await page.waitForTimeout(600) }
await page.keyboard.type('丢了一个耳机怎么办')
await page.keyboard.press('Enter')
await shot(page, '04-ai-assistant.png', 4200)
await page.keyboard.press('Escape')

await page.goto(`${BASE}/message`, { waitUntil: 'networkidle' }); await shot(page, '05-conversation.png', 2200)
await page.goto(`${BASE}/profile`, { waitUntil: 'networkidle' }); await shot(page, '06-profile.png', 2400)

// 后台：直接走超管登录 UI（比注入 localStorage 稳）
await page.goto(`${BASE}/admin/login`, { waitUntil: 'networkidle' })
await page.getByPlaceholder('请输入管理员账号').fill('admin')
await page.getByPlaceholder('请输入密码').fill('admin123')
await page.getByRole('button', { name: '登录', exact: true }).click()
await page.waitForURL((u) => u.pathname === '/admin' || (u.pathname.startsWith('/admin') && u.pathname !== '/admin/login'), { timeout: 20000 })
await shot(page, '07-admin-dashboard.png', 3200)
await page.goto(`${BASE}/admin/ai`, { waitUntil: 'networkidle' }); await shot(page, '08-admin-ai.png', 2600)

await ctx.close()
await browser.close()
console.log(`\n=== errors: ${problems.length} ===`)
for (const p of problems) console.log('  x', p)
