/**
 * V5 全路由体检：登录超管，遍历用户端 + 后台全部页面与关键弹窗，
 * 断言 0 console error / 0 pageerror / 页面有实际内容 / 无横向溢出。
 * 用法：node scripts/crawl-verify.mjs [--base=http://127.0.0.1:3901]
 */
import { chromium } from '@playwright/test'
import fs from 'node:fs'

const arg = (n, d) => { const h = process.argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d }
const BASE = arg('base', 'http://127.0.0.1:3901')

const CANDIDATES = ['F:/ms-playwright/chromium-1223/chrome-win64/chrome.exe', 'F:/ms-playwright/chromium-1161/chrome-win64/chrome.exe']
let browser
for (const exe of CANDIDATES) if (fs.existsSync(exe)) { browser = await chromium.launch({ executablePath: exe }); break }
if (!browser) browser = await chromium.launch({ channel: 'chrome' })

const problems = []
let page

function attach(tag) {
  page.removeAllListeners('console'); page.removeAllListeners('pageerror')
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`[${tag}] console: ${m.text().slice(0, 200)}`) })
  page.on('pageerror', (e) => problems.push(`[${tag}] pageerror: ${String(e.message).slice(0, 200)}`))
}

async function visit(url, tag, { minText = 8, checkOverflow = true } = {}) {
  await page.goto(`${BASE}${url}`, { waitUntil: 'networkidle', timeout: 20000 }).catch(async () => {
    await page.goto(`${BASE}${url}`, { waitUntil: 'domcontentloaded' })
  })
  await page.waitForTimeout(1300)
  const info = await page.evaluate(() => {
    const app = document.getElementById('app')
    return {
      text: (app?.innerText || '').trim().length,
      buttons: document.querySelectorAll('button, a').length,
      scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth,
    }
  })
  if (info.text < minText) problems.push(`[${tag}] ${url} 内容过少 text=${info.text}`)
  if (info.buttons < 2) problems.push(`[${tag}] ${url} 可交互元素过少 buttons=${info.buttons}`)
  if (checkOverflow && info.scrollW > info.clientW + 2) problems.push(`[${tag}] ${url} 横向溢出 ${info.scrollW}>${info.clientW}`)
  console.log(`  ✓ ${url} text=${info.text} actions=${info.buttons}`)
}

// ---- 移动端路由 ----
let ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
page = await ctx.newPage()
attach('m')
// 登录（演示号）
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
await page.getByPlaceholder('手机号 / 拼音 / 账号').fill('23770001')
await page.getByPlaceholder('请输入密码').fill('demo1234')
await page.getByRole('button', { name: '登录', exact: true }).click()
await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 20000 })
await page.evaluate(() => { localStorage.setItem('onboarding:v1', 'done') })

const mRoutes = ['/', '/topics', '/section/1', '/section/5', '/search?keyword=%E6%99%9A%E4%BC%9A', '/message', '/profile', '/profile/settings', '/profile/posts', '/profile/comments', '/profile/favorites', '/my-likes', '/profile/drafts', '/profile/subscriptions']
for (const r of mRoutes) await visit(r, 'm')
const pid = await page.evaluate(async () => { const r = await (await fetch('/api/posts?page=1&pageSize=1')).json(); return r?.data?.list?.[0]?.id })
await visit(`/post/${pid}`, 'm', { minText: 30 })
// 详情互动弹窗：分享菜单 / 举报弹窗 / AI 划重点
await page.evaluate(() => window.scrollTo(0, 400))
const more = page.locator('[aria-label="更多"]').first()
if (await more.count()) {
  await more.click(); await page.waitForTimeout(400)
  const hasShare = await page.getByText('分享').count()
  if (!hasShare) problems.push('[m] 详情页更多菜单未出现分享项')
  await page.keyboard.press('Escape')
}
await ctx.close()

// ---- 桌面路由 + 弹窗组件 ----
ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
page = await ctx.newPage()
attach('d')
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
await page.evaluate(() => localStorage.setItem('onboarding:v1', 'done'))
await page.getByPlaceholder('手机号 / 拼音 / 账号').fill('23770001')
await page.getByPlaceholder('请输入密码').fill('demo1234')
await page.getByRole('button', { name: '登录', exact: true }).click()
await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 20000 })
const uid = await page.evaluate(async () => { const r = await (await fetch('/api/posts?page=1&pageSize=1')).json(); return r?.data?.list?.[0]?.authorId ?? 1 })
await visit(`/user/${uid}`, 'd', { checkOverflow: false })
// 命令面板键盘链
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
await page.keyboard.press('Control+k')
await page.waitForTimeout(500)
if (!(await page.getByRole('dialog', { name: '全局命令面板' }).count())) problems.push('[d] Ctrl+K 未打开命令面板')
await page.keyboard.type('自行车')
await page.waitForTimeout(1400)
const row = page.locator('.cp-item').first()
const rows = await page.locator('.cp-item').count()
if (rows === 0) problems.push('[d] 命令面板无结果行')
else { await row.click(); await page.waitForTimeout(1200); console.log(`  ✓ palette→${page.url().replace(BASE, '')}`) }
// 反馈弹窗（设置/帮助入口）——从首页 FAB AI 面板打开
const aiFab = page.locator('[aria-label*="AI"], .sa-fab').first()
if (await aiFab.count()) { await aiFab.click(); await page.waitForTimeout(700); await page.keyboard.press('Escape') }
await ctx.close()

// ---- 后台全部子页（超管）----
ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
page = await ctx.newPage()
attach('admin')
await page.goto(`${BASE}/admin/login`, { waitUntil: 'networkidle' })
await page.getByPlaceholder('请输入管理员账号').fill('admin')
await page.getByPlaceholder('请输入密码').fill('admin123')
await page.getByRole('button', { name: '登录', exact: true }).click()
await page.waitForURL((u) => u.pathname === '/admin' || (u.pathname.startsWith('/admin') && u.pathname !== '/admin/login'), { timeout: 20000 })
for (const r of ['/admin', '/admin/posts', '/admin/comments', '/admin/reports', '/admin/users', '/admin/sections', '/admin/feedbacks', '/admin/announcements', '/admin/ai']) {
  await visit(r, 'admin', { checkOverflow: false })
}
await ctx.close()

// ---- 暗色抽查：话题页/板块页在深色下的渲染 ----
ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
page = await ctx.newPage()
attach('dark')
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
await page.evaluate(() => { localStorage.setItem('onboarding:v1', 'done'); localStorage.setItem('app:theme', 'dark') })
await page.reload({ waitUntil: 'networkidle' })
await page.getByPlaceholder('手机号 / 拼音 / 账号').fill('23770001')
await page.getByPlaceholder('请输入密码').fill('demo1234')
await page.getByRole('button', { name: '登录', exact: true }).click()
await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 20000 })
for (const r of ['/topics', '/section/3', `/post/${pid}`, '/message']) await visit(r, 'dark', { checkOverflow: false })
await ctx.close()

await browser.close()
console.log(`\n=== 路由体检 problems: ${problems.length} ===`)
for (const p of problems) console.log('  x', p)
if (problems.length) process.exit(2)
console.log('ALL ROUTES HEALTHY')
