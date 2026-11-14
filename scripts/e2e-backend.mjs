/**
 * E2E 后端入口（仅 Playwright webServer 使用）：
 * 1. 删除隔离库 api/e2e-test.db（此时后端尚未启动，无文件锁）
 * 2. 灌种子（seed-demo：admin/admin123 + 演示用户 + 演示帖 + 待审帖）
 * 3. 启动 API 服务（默认 PORT=3001，前端 vite 代理目标）
 * 3001 被本机其它服务占用时：E2E_PORT=3301 npm run e2e（vite 代理读同名变量）
 */
import { execSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const port = process.env.E2E_PORT || '3001'
const dbFile = path.join(root, 'api', 'e2e-test.db')
// ADMIN_INITIAL_PASSWORD：db.ts 的生产加固要求首启必须显式口令（与演示站一致 admin123）；
// 本地 .env 若带 NODE_ENV=production，缺它会直接崩在 seed 之前的模块加载。
const env = { ...process.env, DB_PATH: 'api/e2e-test.db', PORT: port, ADMIN_INITIAL_PASSWORD: process.env.ADMIN_INITIAL_PASSWORD || 'admin123', JWT_SECRET: process.env.JWT_SECRET || 'e2e-local-secret-0123456789abcdef0123456789abcdef' }

for (const suffix of ['', '-shm', '-wal']) {
  fs.rmSync(dbFile + suffix, { force: true })
}

execSync('npx tsx api/seed-demo.ts', { cwd: root, stdio: 'inherit', env })

const child = spawn('npx', ['tsx', 'api/server.ts'], { cwd: root, stdio: 'inherit', env, shell: true })
child.on('exit', (code) => process.exit(code ?? 0))

// 透传 Ctrl-C 等信号，保证 playwright 结束时后端被回收
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => child.kill(sig))
}
