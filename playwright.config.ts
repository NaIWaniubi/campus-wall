import { defineConfig } from '@playwright/test'
import path from 'node:path'

/**
 * E2E 配置（spec-D T4/T5 裁剪版：5 条核心流）
 * - 后端：独立隔离库 api/e2e-test.db（global-setup 删库重灌 seed），端口 3001（前端代理目标，不可改）
 * - 前端：vite dev 5173（代理 /api、/uploads、/ws 到 3001）
 * - 跑 E2E 前请停掉本地 dev（concurrently 起的那套），端口被占会直接报错不静默复用
 * 注：root 用 process.cwd()——playwright 总在项目根运行，import.meta.url 在配置转译后不可靠
 */
const root = process.cwd()

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
  },
  webServer: [
    {
      // 单入口：重置隔离库 → 灌种子 → 起服务（顺序保证无文件锁冲突）
      command: 'node scripts/e2e-backend.mjs',
      url: 'http://localhost:3001/api/health',
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: 'npx vite --port 5173',
      url: 'http://localhost:5173',
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
})
