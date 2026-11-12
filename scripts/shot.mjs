/**
 * 单页截图（验收用）：登录 → 打开指定路径 → 截图，并打印 console/pageerror。
 * 用法：node scripts/shot.mjs --path=/ --out=captures/v4/m-home.png --w=390 --h=844 [--full]
 */
import { chromium } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const arg = (n, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${n}=`))
  return hit ? hit.slice(n.length + 3) : d
}
const BASE = arg('base', 'http://127.0.0.1:3901')
// Git Bash/MSYS 会把 --path=/api/x 改写成 C:/Program Files/Git/api/x，这里还原
const PAGE = arg('path', '/').replace(/^[A-Za-z]:[\/].*?[\/]Git[\/]/, '/')
const OUT = arg('out', 'captures/v4/shot.png')
const W = Number(arg('w', 390))
const H = Number(arg('h', 844))
const FULL = process.argv.includes('--full')
const DPR = Number(arg('dpr', 2))

const CANDIDATES = [
  'F:/ms-playwright/chromium-1223/chrome-win64/chrome.exe',
  'F:/ms-playwright/chromium-1161/chrome-win64/chrome.exe',
]
let browser
for (const exe of CANDIDATES) {
  if (fs.existsSync(exe)) { browser = await chromium.launch({ executablePath: exe }); break }
}
if (!browser) browser = await chromium.launch({ channel: 'chrome' })

const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR })
const page = await ctx.newPage()
const problems = []
page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text().slice(0, 180)) })
page.on('pageerror', (e) => problems.push('pageerror: ' + String(e.message).slice(0, 180)))

// 登录（演示号）
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
await page.getByPlaceholder('请输入学号').fill('23770001')
await page.getByPlaceholder('请输入密码').fill('demo1234')
await page.getByRole('button', { name: '登录', exact: true }).click()
await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 20000 })

await page.goto(BASE + PAGE, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2200)
fs.mkdirSync(path.dirname(OUT), { recursive: true })
await page.screenshot({ path: OUT, fullPage: FULL })
console.log(`${OUT}  (${W}x${H}${FULL ? ' full' : ''})  errors=${problems.length}`)
for (const p of problems) console.log('  x', p)
await browser.close()
