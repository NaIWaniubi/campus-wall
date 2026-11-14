import { defineConfig } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

/**
 * E2E 配置（spec-D T4/T5 裁剪版：5 条核心流）
 * - 后端：独立隔离库 api/e2e-test.db（global-setup 删库重灌 seed），端口 3001（前端代理目标，不可改）
 * - 前端：vite dev 5173（代理 /api、/uploads、/ws 到 3001）
 * - 跑 E2E 前请停掉本地 dev（concurrently 起的那套），端口被占会直接报错不静默复用
 * 注：root 用 process.cwd()——playwright 总在项目根运行，import.meta.url 在配置转译后不可靠
 *
 * 浏览器可执行文件：本地 ms-playwright 目录里的 chromium 修订号常落后于 @playwright/test
 * 内置默认（报 "Executable doesn't exist at ...-1234"），故优先用 PW_EXECUTABLE 环境变量，
 * 其次回落到本机常见安装路径；CI 不设这些时自然走 playwright 自带浏览器（见 ci.yml e2e job）。
 */
const root = process.cwd()

function resolveChromium(): string | undefined {
  if (process.env.PW_EXECUTABLE) return process.env.PW_EXECUTABLE
  if (process.env.CI) return undefined
  const candidates = [
    'F:/ms-playwright/chromium-1223/chrome-win64/chrome.exe',
    'F:/ms-playwright/chromium-1161/chrome-win64/chrome.exe',
  ]
  return candidates.find((p) => fs.existsSync(p))
}
const chromiumExecutable = resolveChromium()

export default defineConfig({
  testDir: path.join(root, 'tests', 'e2e'),
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    locale: 'zh-CN',
    launchOptions: chromiumExecutable ? { executablePath: chromiumExecutable } : {},
  },
  webServer: [
    {
      // 单入口：重置隔离库 → 灌种子 → 起服务（顺序保证无文件锁冲突）
      // E2E_PORT：本机 3001 被其它服务占用时换端口（与 vite proxy、e2e-backend.mjs 同名变量）
      command: 'node scripts/e2e-backend.mjs',
      url: `http://localhost:${process.env.E2E_PORT || 3001}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: 'npx vite --port 5173',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
})
