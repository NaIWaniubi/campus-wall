/**
 * V3 视觉验收截图：手机 390×844 + 桌面 1440×900
 * 覆盖：首页(AI 简报) / 话题 / 板块 / 详情(AI 划重点) / 发布(AI 一键成稿) / 登录
 * 同时收集 console error 与 pageerror，输出汇总（必须为 0）。
 * 用法：node scripts/capture-v3.mjs [--base=http://127.0.0.1:3901] [--out=captures/v3]
 */
import { chromium } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const argBase = process.argv.find((a) => a.startsWith('--base='))
const argOut = process.argv.find((a) => a.startsWith('--out='))
const BASE = argBase ? argBase.slice('--base='.length) : 'http://127.0.0.1:3901'
const OUT = path.resolve(argOut ? argOut.slice('--out='.length) : path.join(root, 'captures', 'v3'))
fs.mkdirSync(OUT, { recursive: true })

const problems = []
function watch(page, label) {
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`[${label}] console: ${m.text().slice(0, 220)}`)
  })
  page.on('pageerror', (e) => problems.push(`[${label}] pageerror: ${String(e.message).slice(0, 220)}`))
  page.on('requestfailed', (r) => {
    const u = r.url()
    if (u.includes('/api/') || u.includes('.js') || u.includes('.css')) {
      problems.push(`[${label}] requestfailed: ${u.slice(0, 160)}`)
    }
  })
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: false })
  console.log('  ·', name)
}

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.getByPlaceholder('请输入学号').fill('23770001')
  await page.getByPlaceholder('请输入密码').fill('demo1234')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 20_000 })
  await page.waitForTimeout(1200)
}

// 浏览器解析：优先本机已装的 Playwright chromium，其次系统 Chrome（离线环境不下载）
const CANDIDATES = [
  'F:/ms-playwright/chromium-1223/chrome-win64/chrome.exe',
  'F:/ms-playwright/chromium-1161/chrome-win64/chrome.exe',
]
let browser
for (const exe of CANDIDATES) {
  if (fs.existsSync(exe)) {
    browser = await chromium.launch({ executablePath: exe })
    console.log('launched chromium:', exe)
    break
  }
}
if (!browser) browser = await chromium.launch({ channel: 'chrome' })

// ---------- 手机端 390×844 ----------
console.log('mobile 390x844')
let ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
})
let page = await ctx.newPage()
watch(page, 'm')
await login(page)
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2500)
await shot(page, 'm-home')
// AI 简报卡（首页首屏第二块）
const digestCard = page.locator('section', { hasText: '今日校园' }).first()
if (await digestCard.count()) {
  await digestCard.scrollIntoViewIfNeeded()
  await page.waitForTimeout(400)
  await shot(page, 'm-home-digest')
}
await page.goto(`${BASE}/topics`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1500)
await shot(page, 'm-topics')
await page.goto(`${BASE}/section/2`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1500)
await shot(page, 'm-section')
// 详情页 + AI 划重点展开
const list = await page.evaluate(async () => {
  const r = await fetch('/api/posts?page=1&pageSize=1').then((x) => x.json())
  return r?.data?.list?.[0]?.id ?? null
})
if (list) {
  await page.goto(`${BASE}/post/${list}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1800)
  await shot(page, 'm-post')
  const aiBtn = page.getByRole('button', { name: /AI 划重点/ }).first()
  if (await aiBtn.count()) {
    await aiBtn.click()
    await page.waitForTimeout(2500)
    await aiBtn.scrollIntoViewIfNeeded()
    await page.waitForTimeout(300)
    await shot(page, 'm-post-ai')
  } else {
    problems.push('[m] AI 划重点 button not found on /post/:id')
  }
}
// 发布页 + AI 一键成稿
await page.goto(`${BASE}/publish`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1600)
await shot(page, 'm-publish')
const rawInput = page.getByPlaceholder(/一句话说清要点/)
if (await rawInput.count()) {
  await rawInput.fill('出九成新 iPad Air，1500 元，可小刀，东门当面')
  const genBtn = page.getByRole('button', { name: /生成/ }).first()
  await genBtn.click()
  await page.waitForTimeout(4000)
  const titleVal = await page.locator('input[placeholder="一句话概括"]').inputValue()
  const contentVal = await page.locator('textarea.post-content').inputValue()
  console.log('  · AI draft -> title:', JSON.stringify(titleVal), '| content:', JSON.stringify(contentVal.slice(0, 60)))
  if (!titleVal) problems.push('[m] AI 成稿没有写入标题')
  await page.locator('input[placeholder="一句话概括"]').scrollIntoViewIfNeeded()
  await page.waitForTimeout(300)
  await shot(page, 'm-publish-ai')
} else {
  problems.push('[m] AI 一键成稿 input not found')
}
await ctx.close()

// ---------- 桌面 1440×900 ----------
console.log('desktop 1440x900')
ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
page = await ctx.newPage()
watch(page, 'd')
await login(page)
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2500)
await shot(page, 'd-home')
await page.goto(`${BASE}/topics`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1500)
await shot(page, 'd-topics')
if (list) {
  await page.goto(`${BASE}/post/${list}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1800)
  const aiBtn = page.getByRole('button', { name: /AI 划重点/ }).first()
  if (await aiBtn.count()) {
    await aiBtn.click()
    await page.waitForTimeout(2500)
  }
  await shot(page, 'd-post')
}
await ctx.close()
await browser.close()

console.log('\n=== console/page errors:', problems.length, '===')
for (const p of problems) console.log('  x', p)
if (problems.length) process.exit(2)
console.log('screenshots ->', OUT)
