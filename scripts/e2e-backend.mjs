/**
 * E2E 后端入口（仅 Playwright webServer 使用）：
 * 1. 删除隔离库 api/e2e-test.db（此时后端尚未启动，无文件锁）
 * 2. 灌种子（seed-demo：admin/admin123 + 演示用户 + 演示帖 + 待审帖）
 * 3. 启动 API 服务（PORT=3001，前端 vite 代理目标）
 */
import { execSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const dbFile = path.join(root, 'api', 'e2e-test.db')
const env = { ...process.env, DB_PATH: 'api/e2e-test.db', PORT: '3001' }

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
