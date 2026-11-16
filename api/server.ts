/**
 * local server entry file, for local development
 */
// 必须置于其他 import 之前：ESM 先求值整个 import 图，晚加载会让业务模块读不到 .env
import './env.js';
import { initObservability, captureError } from './observability.js';
import app, { reportBackup } from './app.js';
import { runDailyDigest } from './jobs/dailyDigest.js';
import { runBackup, countBackups } from './jobs/backup.js';
import { attachWebSocket } from './ws/server.js';
import { db } from './db.js';
import { logger } from './utils/logger.js';

// Sentry 等可观测性：SENTRY_DSN 未配置时 no-op，需尽量早执行
initObservability();

/**
 * 未捕获异常策略：
 * Node 明确指出 uncaughtException 之后进程状态不可信，长期带病运行会积累脏状态；
 * 但演示场景又不能因一条偶发异常直接挂掉。折中方案：
 * - 记录 + 上报（保留可观测性）
 * - 60s 内累计超过 3 次判定为系统性故障，走优雅退出交给进程管理器拉起
 * - 低于阈值时继续服务
 */
let uncaughtCount = 0;
let uncaughtWindowStart = Date.now();
const UNCAUGHT_LIMIT = 3;
const UNCAUGHT_WINDOW_MS = 60_000;

process.on('uncaughtException', (err) => {
  logger.error('未捕获的异常', { error: err.message, stack: err.stack });
  captureError(err);

  const now = Date.now();
  if (now - uncaughtWindowStart > UNCAUGHT_WINDOW_MS) {
    uncaughtWindowStart = now;
    uncaughtCount = 0;
  }
  uncaughtCount++;

  if (uncaughtCount > UNCAUGHT_LIMIT) {
    logger.error('未捕获异常过于频繁，判定为系统性故障，准备退出', { count: uncaughtCount });
    gracefulShutdown('uncaughtException', 1);
  }
});
process.on('unhandledRejection', (err) => {
  logger.error('未处理的 Promise 拒绝', { error: err instanceof Error ? err.message : String(err) });
  captureError(err as Error);
});

/**
 * start server with port
 */
const PORT = process.env.PORT || 3001;

// 生产环境部署安全兜底：CORS_ORIGIN 未显式设置则只放行 localhost，生产域名会被拦截
if (process.env.NODE_ENV === 'production' && !process.env.CORS_ORIGIN) {
  logger.warn('CORS_ORIGIN 未设置，仅允许 localhost 跨域；生产域名请求将被 CORS 拒绝，请尽快配置环境变量');
}

// 显式绑定 0.0.0.0：云平台健康检查从容器外访问，绑 127.0.0.1 会直接 502
const server = app.listen(Number(PORT), '0.0.0.0', () => {
  logger.info('服务器启动成功', { port: PORT, env: process.env.NODE_ENV });
});

// RAG 索引增量刷新：异步后台跑一次（hash 未变的块自动跳过），失败仅记日志不阻塞启动
import { refreshIndex } from './rag/retrieve.js';
refreshIndex()
  .then((r) => logger.info('RAG 索引刷新完成', r))
  .catch((e: any) => logger.warn('RAG 索引刷新失败（不影响服务）', { error: e?.message }));

// 挂 WebSocket（路径 /ws）；REST 路由不受影响
let wss: ReturnType<typeof attachWebSocket> | null = null;
if (process.env.WS_ENABLED !== '0') {
  wss = attachWebSocket(server);
}

/**
 * 每日板块摘要定时触发：
 * 每 60s 检查一次是否到达每日时刻（DIGEST_HOUR，默认 20 点），
 * 用「上次运行日期」标记防止同一天重复发送。零新依赖。
 */
const DIGEST_HOUR = (() => {
  const h = Number.parseInt(process.env.DIGEST_HOUR ?? '20', 10);
  return Number.isInteger(h) && h >= 0 && h <= 23 ? h : 20;
})();
let lastDigestDate = '';

setInterval(() => {
  const now = new Date();
  if (now.getHours() !== DIGEST_HOUR) return;
  const today = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
  if (lastDigestDate === today) return;
  lastDigestDate = today;
  try {
    const count = runDailyDigest();
    logger.info('每日摘要发送完成', { date: today, subscriberCount: count });
  } catch (err) {
    logger.error('每日摘要执行失败', { error: err instanceof Error ? err.message : String(err) });
  }
}, 60_000);

// 调试用：DIGEST_NOW=1 启动时立即手动执行一次摘要（不等每日时刻）
if (process.env.DIGEST_NOW === '1') {
  try {
    const count = runDailyDigest();
    logger.info('每日摘要手动执行完成', { subscriberCount: count });
  } catch (err) {
    logger.error('每日摘要手动执行失败', { error: err instanceof Error ? err.message : String(err) });
  }
}

/**
 * SQLite 定时在线备份：
 * 每 BACKUP_INTERVAL_HOURS 小时（默认 24）做一次在线备份（WAL 安全，不锁库），
 * 每次轮换保留最近 BACKUP_KEEP 份（默认 7）；启动时若 backups/ 为空立即做一份基线。
 * 失败仅打印错误，不影响主服务。零新依赖。
 */
const BACKUP_INTERVAL_HOURS = (() => {
  const h = Number.parseInt(process.env.BACKUP_INTERVAL_HOURS ?? '24', 10);
  return Number.isInteger(h) && h > 0 ? h : 24;
})();

setInterval(() => {
  runBackup()
    .then(() => reportBackup(true))
    .catch((err) => { 
      reportBackup(false, err); 
      logger.error('定时备份失败', { error: err instanceof Error ? err.message : String(err) });
    });
}, BACKUP_INTERVAL_HOURS * 3_600_000);

// 启动基线：backups/ 为空（首次运行）时立即补一份
if (countBackups() === 0) {
  runBackup()
    .then(() => reportBackup(true))
    .catch((err) => { 
      reportBackup(false, err); 
      logger.error('启动基线备份失败', { error: err instanceof Error ? err.message : String(err) });
    });
}

// 调试用：BACKUP_NOW=1 启动时立即手动执行一次备份（不等定时时刻）
if (process.env.BACKUP_NOW === '1') {
  runBackup()
    .then(() => reportBackup(true))
    .catch((err) => { 
      reportBackup(false, err); 
      logger.error('手动备份失败', { error: err instanceof Error ? err.message : String(err) });
    });
}

/**
 * 优雅退出：
 * 1. 停止接受新连接（server.close）
 * 2. 关闭所有 WebSocket（否则 keep-alive 连接会让 close 永远等不到）
 * 3. 做一次 WAL checkpoint，把 -wal 合并回主库（否则下次启动要回放，且备份可能漏数据）
 * 4. 关闭数据库句柄
 */
let shuttingDown = false;
function gracefulShutdown(sig: string, exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info('收到关闭信号，准备关闭服务器', { signal: sig });

  try {
    if (wss) {
      for (const client of wss.clients) {
        try { client.terminate(); } catch { /* noop */ }
      }
      wss.close();
    }
  } catch (e: any) {
    logger.warn('关闭 WebSocket 失败', { error: e?.message });
  }

  server.close(() => {
    try {
      db.pragma('wal_checkpoint(TRUNCATE)');
      db.close();
      logger.info('数据库已 checkpoint 并关闭');
    } catch (e: any) {
      logger.warn('关闭数据库失败', { error: e?.message });
    }
    logger.info('服务器已关闭');
    process.exit(exitCode);
  });

  // 兜底：10s 内没关干净就强退（避免部署卡在 stopping）
  setTimeout(() => process.exit(exitCode || 1), 10_000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export default app;