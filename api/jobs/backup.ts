/**
 * SQLite 定时在线备份任务：
 * 用 better-sqlite3 的 db.backup(dest) 在线备份 API（基于 WAL 快照，不锁库），
 * 输出 backups/campus-wall-YYYYMMDD-HHmmss.db，
 * 每次备份后轮换只保留最近 BACKUP_KEEP 份（默认 7）。零新依赖。
 * 由 server.ts 的 setInterval 定时调用；失败由调用方捕获，不影响主服务。
 */
import { db } from '../db.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const backupDir = path.join(__dirname, '..', 'backups');
const BACKUP_FILE_RE = /^campus-wall-\d{8}-\d{6}\.db$/;

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * 执行一次在线备份并轮换旧备份。
 * @returns 备份文件绝对路径
 */
export async function runBackup(): Promise<string> {
  fs.mkdirSync(backupDir, { recursive: true });
  const now = new Date();
  const stamp = `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}-${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(now.getSeconds())}`;
  const destPath = path.join(backupDir, `campus-wall-${stamp}.db`);
  await db.backup(destPath);
  rotateBackups();
  console.log(`[backup] 已生成备份: ${destPath}`);
  return destPath;
}

/**
 * 轮换：按文件名时间戳排序，超出 BACKUP_KEEP 的最旧备份删除。
 */
export function rotateBackups(): void {
  const keep = (() => {
    const k = Number.parseInt(process.env.BACKUP_KEEP ?? '7', 10);
    return Number.isInteger(k) && k > 0 ? k : 7;
  })();
  const files = fs
    .readdirSync(backupDir)
    .filter((f) => BACKUP_FILE_RE.test(f))
    .sort()
    .reverse();
  for (const stale of files.slice(keep)) {
    try {
      fs.unlinkSync(path.join(backupDir, stale));
      console.log(`[backup] 轮换删除旧备份: ${stale}`);
    } catch (err) {
      console.error(`[backup] 删除旧备份失败: ${stale}`, err);
    }
  }
}

/**
 * 当前已有备份份数（用于启动时判断是否需要基线备份）。
 */
export function countBackups(): number {
  if (!fs.existsSync(backupDir)) return 0;
  return fs.readdirSync(backupDir).filter((f) => BACKUP_FILE_RE.test(f)).length;
}
