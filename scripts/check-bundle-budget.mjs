/**
 * 构建产物体积预算门（V5）
 * 读 dist/assets 计算 gzip 体积，超预算即 exit 1 —— 防止「随手 import 把重依赖带进首屏」这类无声回归。
 * 用法：node scripts/check-bundle-budget.mjs（CI 在 build 之后跑）
 */
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const ASSETS = path.resolve('dist/assets')
// 预算（gzip KB）。阈值 = 现值上浮 ~30%，收紧不放宽；调整需在 PR 里说明原因。
const RULES = [
  { name: /^vendor-echarts/, budget: 210, why: '图表库必须独立 chunk 且仅管理端懒加载' },
  { name: /^vendor/, budget: 75, why: '框架运行时' },
  { name: /^index/, budget: 100, why: '首屏主包（路由入口懒加载后应远小于此）' },
]
const DEFAULT_BUDGET = 60 // 任意懒加载路由块

const files = fs.readdirSync(ASSETS).filter((f) => /\.(js|css)$/.test(f))
const rows = files
  .map((f) => {
    const gz = zlib.gzipSync(fs.readFileSync(path.join(ASSETS, f))).length
    return { f, kb: gz / 1024 }
  })
  .sort((a, b) => b.kb - a.kb)

let fail = 0
const worst = []
for (const { f, kb } of rows) {
  const base = f.replace(/-[A-Za-z0-9_-]{8}\.(js|css)$/, '')
  const rule = RULES.find((r) => r.name.test(base))
  const budget = rule ? rule.budget : DEFAULT_BUDGET
  const over = kb > budget
  if (over) { fail++; worst.push(`${f}: ${kb.toFixed(1)}KB > ${budget}KB（${rule?.why ?? '懒加载块'}）`) }
  console.log(`${over ? '✗' : '·'} ${f.padEnd(42)} ${kb.toFixed(1).padStart(7)} KB gz  (≤${budget})`)
}

const total = rows.reduce((s, r) => s + r.kb, 0)
console.log(`\n合计 gzip: ${total.toFixed(1)} KB | 违规: ${fail}`)
if (fail) {
  console.error('\n预算超支清单:\n' + worst.join('\n'))
  console.error('\n处置：把重依赖改为动态 import / 路由懒加载；确属必要的增长请携数据调整 scripts/check-bundle-budget.mjs 阈值。')
  process.exit(1)
}
