/**
 * local server entry file, for local development
 */
import { initObservability } from './observability.js';
import app from './app.js';
import { runDailyDigest } from './jobs/dailyDigest.js';
import { runBackup, countBackups } from './jobs/backup.js';
import { attachWebSocket } from './ws/server.js';

// Sentry 等可观测性：SENTRY_DSN 未配置时 no-op，需尽量早执行
initObservability();

/**
 * start server with port
 */
const PORT = process.env.PORT || 3001;

const server = app.listen(PORT, () => {
  console.log(`Server ready on port ${PORT}`);
});

// 挂 WebSocket（路径 /ws）；REST 路由不受影响
if (process.env.WS_ENABLED !== '0') {
  attachWebSocket(server);
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
    console.log(`[dailyDigest] ${today} 摘要已发送给 ${count} 位订阅者`);
  } catch (err) {
    console.error('[dailyDigest] 执行失败:', err);
  }
}, 60_000);

// 调试用：DIGEST_NOW=1 启动时立即手动执行一次摘要（不等每日时刻）
if (process.env.DIGEST_NOW === '1') {
  try {
    const count = runDailyDigest();
    console.log(`[dailyDigest] 手动执行完成，发送给 ${count} 位订阅者`);
  } catch (err) {
    console.error('[dailyDigest] 手动执行失败:', err);
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
  runBackup().catch((err) => console.error('[backup] 定时备份失败:', err));
}, BACKUP_INTERVAL_HOURS * 3_600_000);

// 启动基线：backups/ 为空（首次运行）时立即补一份
if (countBackups() === 0) {
  runBackup().catch((err) => console.error('[backup] 启动基线备份失败:', err));
}

// 调试用：BACKUP_NOW=1 启动时立即手动执行一次备份（不等定时时刻）
if (process.env.BACKUP_NOW === '1') {
  runBackup().catch((err) => console.error('[backup] 手动执行失败:', err));
}

/**
 * close server
 */
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

export default app;