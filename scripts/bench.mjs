/**
 * 接口性能基准（零新依赖）
 *
 * 为什么需要它：答辩时「性能如何」不能只说「用了 WAL + 索引」，
 * 要有 p50/p95/p99 与 QPS 的可复现实测数据。
 *
 * 用法：
 *   npm run bench                 # 默认 1000 请求/端点，并发 20
 *   npm run bench -- --n=2000 --c=50
 *   npm run bench -- --json       # 机器可读，便于贴进文档
 *
 * 实现：
 * - 用临时数据库（bench-data.db）启动一份独立服务，不污染开发库
 * - 先跑 seed 生成接近真实的 20 帖数据
 * - 预热后按指定并发打满，统计分位延迟与吞吐
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? Number(hit.split('=')[1]) : fallback;
};
const N = arg('n', 1000);
const C = arg('c', 20);
const PORT = arg('port', 3999);
const BASE = `http://127.0.0.1:${PORT}`;
const DB_FILE = path.join(ROOT, 'bench-data.db');
const asJson = process.argv.includes('--json');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitHealthy(timeoutMs = 30_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return true;
    } catch {
      /* not ready */
    }
    await sleep(300);
  }
  throw new Error('服务启动超时');
}

/**
 * 用 process.execPath 直接跑 node（配合 --import tsx），不经过 shell。
 * Windows 上 shell:true 会多一层 cmd.exe，kill 只杀 shell、留下僵尸 node，
 * 后续压测就会打到旧进程（表现为「明明关了限流却一直 429」）。
 */
function run(args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: ROOT,
      env: { ...process.env, ...env },
      stdio: 'ignore',
    });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`node exit ${code}`))));
    child.on('error', reject);
  });
}

/** 并发打点：C 个 worker 轮流从总请求数里取活 */
async function bench(label, url, headers = {}) {
  // 预热：避免把 JIT / 连接建立算进延迟
  for (let i = 0; i < Math.min(50, C * 2); i++) {
    await fetch(url, { headers });
  }

  const latencies = [];
  let errors = 0;
  let firstError = '';
  let cursor = 0;

  const worker = async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= N) return;
      const t0 = process.hrtime.bigint();
      try {
        const res = await fetch(url, { headers });
        if (!res.ok) {
          errors++;
          if (!firstError) firstError = `HTTP ${res.status}`;
        }
        await res.arrayBuffer();
      } catch (e) {
        errors++;
        if (!firstError) firstError = String(e?.message || e);
      }
      latencies.push(Number(process.hrtime.bigint() - t0) / 1e6);
    }
  };

  const started = process.hrtime.bigint();
  await Promise.all(Array.from({ length: C }, worker));
  const totalMs = Number(process.hrtime.bigint() - started) / 1e6;

  latencies.sort((a, b) => a - b);
  const q = (p) => latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * p))] ?? 0;

  return {
    label,
    url,
    n: N,
    concurrency: C,
    errors,
    rps: Math.round((N / totalMs) * 1000),
    p50: Number(q(0.5).toFixed(1)),
    p95: Number(q(0.95).toFixed(1)),
    p99: Number(q(0.99).toFixed(1)),
    max: Number(latencies[latencies.length - 1].toFixed(1)),
    firstError,
  };
}

async function main() {
  // 清理旧的基准库
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(DB_FILE + suffix); } catch { /* ignore */ }
  }

  const env = { PORT: String(PORT), DB_PATH: DB_FILE, NODE_ENV: 'test', JWT_SECRET: 'bench-secret', WS_ENABLED: '0', ADMIN_INITIAL_PASSWORD: 'bench-admin-pass', RATE_LIMIT_ENABLED: '0' };

  if (!asJson) console.log('准备基准数据…');
  await run(['--import', 'tsx', 'api/seed-demo.ts'], env);

  if (!asJson) console.log('启动独立服务…');
  const server = spawn(process.execPath, ['--import', 'tsx', 'api/server.ts'], {
    cwd: ROOT,
    env: { ...process.env, ...env },
    stdio: 'ignore',
  });

  try {
    await waitHealthy();

    // 取一个真实帖子 id
    const list = await (await fetch(`${BASE}/api/posts?page=1&pageSize=5`)).json();
    const postId = list?.data?.list?.[0]?.id ?? 1;

    const results = [];
    results.push(await bench('信息流列表（热度排序 + LRU 缓存）', `${BASE}/api/posts?page=1&pageSize=20`));
    results.push(await bench('帖子详情（含浏览量自增）', `${BASE}/api/posts/${postId}`));
    results.push(await bench('全文搜索（FTS5）', `${BASE}/api/posts?keyword=${encodeURIComponent('校园')}&page=1`));
    results.push(await bench('板块列表（前端启动必调）', `${BASE}/api/sections`));
    results.push(await bench('健康检查', `${BASE}/api/health`));

    if (asJson) {
      console.log(JSON.stringify({ n: N, concurrency: C, results }, null, 2));
    } else {
      console.log(`\n基准结果（N=${N}/端点，并发 ${C}）`);
      console.log('端点'.padEnd(38) + 'QPS'.padStart(8) + 'p50'.padStart(8) + 'p95'.padStart(8) + 'p99'.padStart(8) + 'err'.padStart(6));
      for (const r of results) {
        console.log(
          r.label.padEnd(34) +
          String(r.rps).padStart(8) +
          `${r.p50}ms`.padStart(8) +
          `${r.p95}ms`.padStart(8) +
          `${r.p99}ms`.padStart(8) +
          String(r.errors).padStart(6) +
          (r.errors ? `  ${r.firstError}` : '')
        );
      }
      console.log('\n说明：单机单进程 SQLite（WAL），数据量 20 帖；真实校园规模下读多写少，');
      console.log('信息流与详情走缓存，p95 主要反映本机回环与 JSON 序列化开销。');
    }
  } finally {
    try { server.kill(); } catch { /* ignore */ }
    await sleep(500);
    for (const suffix of ['', '-wal', '-shm']) {
      try { fs.unlinkSync(DB_FILE + suffix); } catch { /* ignore */ }
    }
  }
}

main().catch((e) => {
  console.error('基准失败：', e?.message || e);
  process.exit(1);
});
