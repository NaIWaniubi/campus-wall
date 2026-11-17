/**
 * E2E 预热：在第一个用例前把重型路由（admin / publish / 首页）先打一遍，
 * 让 vite 完成对应 chunk 的首次编译。
 *
 * 背景：Windows + 中文路径下 vite 冷编译 admin 路由 chunk 实测可超 60s；
 * Playwright 的 webServer 只等 http://localhost:5173 可访问，不代表按需 chunk 已编译，
 * 于是「admin.spec 第一个跑」必然超时假红。预热后单页加载 <2s。
 */
import type { FullConfig } from '@playwright/test'

const BASE = 'http://localhost:5173'
const ROUTES = ['/', '/admin/login', '/publish', '/topics', '/search', '/login', '/legal/privacyPolicy']

export default async function globalSetup(_config: FullConfig) {
  for (const path of ROUTES) {
    const url = BASE + path
    const started = Date.now()
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(90_000) })
      const body = await resp.text()
      // 只取首屏即可（vite 收到请求就会编译；SSR 不适用这里，SPA 返回 index.html）
      console.log(`[e2e-prewarm] ${path} ${resp.status} ${body.length}B ${Date.now() - started}ms`)
    } catch (e: any) {
      console.warn(`[e2e-prewarm] ${path} 预热失败（不阻塞测试）: ${e?.message}`)
    }
  }
}