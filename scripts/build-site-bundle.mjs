/**
 * 部署包产物重建（Windows 开发机 → Linux 部署包）
 *   1. esbuild 把 api/server.ts / api/seed-demo.ts 打成单文件 ESM，node:sqlite 兼容层内联
 *   2. 同步 dist / 演示图 / 知识库到 .zcode-site/stage
 * 用法：node scripts/build-site-bundle.mjs
 * 说明：只产出文件，不启动服务；产物 = .zcode-site/stage（ZCode Sites / Render / Docker 共用）
 */
import esbuild from 'esbuild'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const stage = path.join(root, '.zcode-site', 'stage')

/** 部署包只需运行时依赖：sharp（缩略图，可选）。server/seed 已打成单文件。 */
const STAGE_PACKAGE = {
  name: 'campus-wall',
  version: '1.0.0',
  private: true,
  type: 'module',
  dependencies: { sharp: '0.35.3' },
}

/**
 * 启动脚本由本脚本生成（单一来源，避免 stage 被 gitignore 后在全新检出里缺文件）。
 * 必须是 LF 换行，否则 Linux 上 bash 会报 $'\r': command not found。
 */
const START_SH = `#!/usr/bin/env bash
# ZCode Sites / Render / 任意容器：前台运行，绑定 0.0.0.0:\${PORT:-3000}
set -euo pipefail
cd "$(dirname "\${BASH_SOURCE[0]}")"

export NODE_ENV=production
export PORT="\${PORT:-3000}"
export HOST=0.0.0.0 HOSTNAME=0.0.0.0
export NODE_OPTIONS="\${NODE_OPTIONS:---max-old-space-size=384}"

# 可写但临时的数据目录（实例回收后数据会丢，首次启动自动重建种子）
export DATA_DIR="\${DATA_DIR:-$PWD/data}"
mkdir -p "$DATA_DIR/uploads" "$DATA_DIR/backups"

export DB_PATH="$DATA_DIR/campus.db"
export UPLOAD_DIR="$DATA_DIR/uploads"
export STORAGE_LOCAL_ROOT="$DATA_DIR/uploads"
export STORAGE_DRIVER=local
export BACKUP_DIR="$DATA_DIR/backups"

# 演示站固定密钥（非生产机密；正式环境请改成自己的值）
export JWT_SECRET="\${JWT_SECRET:-campus-wall-zcode-sites-demo-secret-2026-rotate-me}"
# 超管首启口令：演示包用演示值开箱即用；正式部署必须经环境变量覆盖为强口令
export ADMIN_INITIAL_PASSWORD="\${ADMIN_INITIAL_PASSWORD:-demo-admin-2026}"

# 平台在前面终止 TLS 并转发，信任一层代理才能拿到真实客户端 IP
export TRUST_PROXY=1
export WS_ENABLED=1
export LOG_TO_FILE=0
export CORS_ORIGIN="\${CORS_ORIGIN:-http://localhost:\${PORT}}"

# 首次启动：建库 + 灌演示数据（幂等；已有库则跳过）
if [ ! -s "$DB_PATH" ]; then
  node api/seed.mjs
fi

exec node api/server.mjs
`

function rel(p) {
  return path.relative(root, p).split(path.sep).join('/')
}

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true })
}

function copyDir(src, dest) {
  rmrf(dest)
  fs.mkdirSync(dest, { recursive: true })
  fs.cpSync(src, dest, { recursive: true })
}

async function bundle(entry, outfile) {
  await esbuild.build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    // better-sqlite3 用 node:sqlite 兼容实现替换（云上无原生编译）
    alias: { 'better-sqlite3': path.join(root, '.zcode-site', 'build', 'sqlite-compat.ts') },
    // 原生/可选依赖保持外部，运行时按需 dynamic import
    external: ['sharp', 'fsevents', 'bufferutil', 'utf-8-validate'],
    // CJS 依赖（prom-client 等）里的 require('util') 在 ESM 产物中要靠这句兜住，
    // 否则运行时报 "Dynamic require of \"util\" is not supported"
    banner: {
      js: "import { createRequire as __cjsCreateRequire } from 'node:module'; const require = __cjsCreateRequire(import.meta.url);",
    },
    legalComments: 'none',
    logLevel: 'warning',
  })
  const kb = (fs.statSync(outfile).size / 1024 / 1024).toFixed(2)
  console.log(`  · ${rel(outfile)}  ${kb} MB`)
}

console.log('1) bundle api')
await bundle(path.join(root, 'api', 'server.ts'), path.join(root, 'api', 'server.bundle.mjs'))
await bundle(path.join(root, 'api', 'seed-demo.ts'), path.join(root, 'api', 'seed.bundle.mjs'))
// build/ 保留一份中间产物，便于 diff 排查
fs.mkdirSync(path.join(root, '.zcode-site', 'build'), { recursive: true })
fs.copyFileSync(path.join(root, 'api', 'server.bundle.mjs'), path.join(root, '.zcode-site', 'build', 'server.mjs'))
fs.copyFileSync(path.join(root, 'api', 'seed.bundle.mjs'), path.join(root, '.zcode-site', 'build', 'seed.mjs'))

console.log('2) sync stage')
fs.mkdirSync(stage, { recursive: true })
copyDir(path.join(root, 'dist'), path.join(stage, 'dist'))
fs.mkdirSync(path.join(stage, 'api'), { recursive: true })
fs.copyFileSync(path.join(root, 'api', 'server.bundle.mjs'), path.join(stage, 'api', 'server.mjs'))
fs.copyFileSync(path.join(root, 'api', 'seed.bundle.mjs'), path.join(stage, 'api', 'seed.mjs'))
copyDir(path.join(root, 'api', 'demo-assets'), path.join(stage, 'api', 'demo-assets'))
copyDir(path.join(root, 'api', 'knowledge'), path.join(stage, 'api', 'knowledge'))
fs.writeFileSync(path.join(stage, 'package.json'), JSON.stringify(STAGE_PACKAGE, null, 2) + '\n', 'utf-8')
// start.sh 由脚本生成（LF），保证全新检出也有启动脚本
fs.writeFileSync(path.join(stage, 'start.sh'), START_SH.replace(/\r\n/g, '\n'), 'utf-8')
fs.chmodSync(path.join(stage, 'start.sh'), 0o755)
console.log('  · start.sh (LF, +x)')

// 3) 统计
let files = 0
let bytes = 0
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p)
    else {
      files++
      bytes += fs.statSync(p).size
    }
  }
}
walk(stage)
console.log(`3) stage: ${files} files, ${(bytes / 1024 / 1024).toFixed(1)} MB unpacked`)
