/**
 * 演示截图脚本（D-DEMO-1）
 * - 前置：npm run build && npm run start（生产模式同端口托管前后端，避免 Vite 代理的 IPv4/IPv6 漂移问题）
 * - 用法：node scripts/capture-demo.mjs [--out=captures]
 * - 产出：captures/*.png（README "演示截图" 段逐张嵌入）
 * - 需要：演示账号 admin/admin123、23770001/demo1234；数据见 npm run seed
 */
import { chromium, devices } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const projRoot = path.resolve(here, '..')
const argOut = process.argv.find((a) => a.startsWith('--out='))
const outDir = argOut ? path.resolve(argOut.slice('--out='.length)) : path.join(projRoot, 'captures')

fs.mkdirSync(outDir, { recursive: true })

const BASE = 'http://localhost:3001'

async function readySignal() {
  try {
    await fetch(`${BASE}/`, { method: 'GET' })
    await fetch(`${BASE}/api/health`, { method: 'GET' })
    return true
  } catch {
    return false
  }
}

async function login(page, studentId = '23770001', password = 'demo1234') {
  await page.goto(`${BASE}/login`)
  await page.getByPlaceholder('请输入学号').fill(studentId)
  await page.getByPlaceholder('请输入密码').fill(password)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 15_000 })
}

async function adminLogin(page) {
  await page.goto(`${BASE}/admin/login`)
  await page.getByPlaceholder('请输入学号').fill('admin')
  await page.getByPlaceholder('请输入密码').fill('admin123')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.waitForURL((u) => u.pathname.startsWith('/admin') && !u.pathname.includes('/login'), {
    timeout: 15_000,
  })
  await page.getByText('待审内容').first().waitFor({ timeout: 15_000 })
}

async function stubAnnouncements(page) {
  // 屏蔽公告弹窗：overlay 会拦截全页点击与首屏稳定；直接 mock 空数据
  await page.route('**/api/announcements**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 200, message: 'ok', data: null }),
    })
  )
}

async function shot(page, name, options = {}) {
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
  await page.screenshot({ path: path.join(outDir, name), fullPage: false, ...options })
  console.log(`  ✔ ${name}`)
}

async function main() {
  if (!(await readySignal())) {
    console.error('✘ dev 服务不可用，请先运行 `npm run dev` 再重试 node scripts/capture-demo.mjs')
    process.exit(1)
  }

  console.log(`→ 输出目录：${outDir}`)
  const browser = await chromium.launch()
  const iPhone = devices['iPhone 13']

  // ---- 匿名访问（guest）----
  {
    const ctx = await browser.newContext({ ...iPhone, locale: 'zh-CN' })
    const page = await ctx.newPage()
    await stubAnnouncements(page)
    await page.goto(`${BASE}/`)
    await page.locator('.cursor-pointer').first().waitFor({ timeout: 20_000 })
    await shot(page, '01-home.png')

    // Search
    await page.goto(`${BASE}/search`)
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
    await shot(page, '02-search.png')
    await ctx.close()
  }

  // ---- 演示账号（user）----
  {
    const ctx = await browser.newContext({ ...iPhone, locale: 'zh-CN' })
    const page = await ctx.newPage()
    await stubAnnouncements(page)
    await login(page)

    // Post detail: 动态挑一条互动最多的失物帖（有评论/点赞才有「有人在用」的说服力）
    let detailId = 1
    try {
      const resp = await fetch(`${BASE}/api/posts?sectionId=2&pageSize=20`)
      const json = await resp.json()
      const list = (json && json.data && json.data.list) || []
      const best = list
        .filter((p) => !p.isAnonymous)
        .sort((a, b) => (b.commentCount + b.likeCount) - (a.commentCount + a.likeCount))[0]
      if (best) detailId = best.id
    } catch { /* 回退到 1 */ }
    await page.goto(`${BASE}/post/${detailId}`)
    await page.waitForTimeout(2500)
    await shot(page, '03-post-detail.png')

    // AI assistant: floating bot appears after login
    await page.goto(`${BASE}/`)
    await page.locator('.cursor-pointer').first().waitFor({ timeout: 20_000 }).catch(() => {})
    const botBtn = page.locator('button.fixed.bg-emerald-500')
    await botBtn.waitFor({ timeout: 20_000 })
    await botBtn.click()
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})
    await shot(page, '04-ai-assistant.png')

    // Conversation center
    await page.goto(`${BASE}/message`)
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
    await shot(page, '05-conversation.png')

    // Profile (shows reputation)
    await page.goto(`${BASE}/profile`)
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
    await shot(page, '06-profile.png')

    await ctx.close()
  }

  // ---- 管理员（admin）----
  {
    const ctx = await browser.newContext({ ...iPhone, locale: 'zh-CN' })
    const page = await ctx.newPage()
    await stubAnnouncements(page)
    await adminLogin(page)

    // Dashboard
    await page.goto(`${BASE}/admin`)
    await shot(page, '07-admin-dashboard.png')

    // AI settings
    await page.goto(`${BASE}/admin/ai`)
    await shot(page, '08-admin-ai.png')

    await ctx.close()
  }

  await browser.close()
  console.log('✔ 完成 8 张演示截图。')
}

await main().catch((err) => {
  console.error('✘ 截图失败：', err.message || err)
  process.exit(1)
})
