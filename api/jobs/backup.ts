/**
 * SQLite 定时在线备份任务：
 * 用 better-sqlite3 的 db.backup(dest) 在线备份 API（基于 WAL 快照，不锁库），
 * 输出 backups/campus-wall-YYYYMMDD-HHmmss.db，每次备份后轮换只保留最近 BACKUP_KEEP 份（默认 7）。零新依赖。
 * 可选加密（C-T12）：设置 BACKUP_ENCRYPTION_KEY（64 位 hex = 32 字节）时，备份落盘为
 * 同名 .db.enc（AES-256-GCM，每文件随机 IV），明文中转文件即删；
 * 解密用 api/scripts/decrypt-backup.mjs。未配置 key 时行为与原版一致（明文 .db）。
 * 由 server.ts 的 setInterval 定时调用；失败由调用方捕获，不影响主服务。
 */
import { db } from '../db.js';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'node:url';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const backupDir = path.join(__dirname, '..', 'backups');
const BACKUP_FILE_RE = /^campus-wall-\d{8}-\d{6}\.db(\.enc)?$/;
/** 密文文件头：标识版本 + 随机 IV（12B）+ authTag（16B）+ 密文体 */
const ENC_MAGIC = 'CWBK1';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** 读取并校验加密 key；未配置返回 null，配置非法直接抛错（防静默存明文） */
function getEncryptionKey(): Buffer | null {
  const hex = process.env.BACKUP_ENCRYPTION_KEY?.trim();
  if (!hex) return null;
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error('BACKUP_ENCRYPTION_KEY 必须是 64 位 hex（32 字节，AES-256）');
  }
  return Buffer.from(hex, 'hex');
}

/** AES-256-GCM 加密文件（明文路径 → .enc 路径），完成后删除明文 */
function encryptFile(plainPath: string, encPath: string, key: Buffer): void {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = fs.readFileSync(plainPath);
  const sealed = Buffer.concat([cipher.update(data), cipher.final()]);
  fs.writeFileSync(
    encPath,
    Buffer.concat([Buffer.from(ENC_MAGIC, 'utf-8'), iv, cipher.getAuthTag(), sealed])
  );
  fs.unlinkSync(plainPath);
}

/**
 * 执行一次在线备份并轮换旧备份。
 * @returns 备份文件绝对路径（配置加密时为 .db.enc）
 */
export async function runBackup(): Promise<string> {
  fs.mkdirSync(backupDir, { recursive: true });
  const now = new Date();
  const stamp = `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}-${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(now.getSeconds())}`;
  const destPath = path.join(backupDir, `campus-wall-${stamp}.db`);

  const key = getEncryptionKey();
  await db.backup(destPath);
  if (key) {
    encryptFile(destPath, `${destPath}.enc`, key);
    logger.info('已生成加密备份', { path: `${destPath}.enc` });
    rotateBackups();
    return `${destPath}.enc`;
  }

  rotateBackups();
  logger.info('已生成备份', { path: destPath });
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
      logger.info('轮换删除旧备份', { file: stale });
    } catch (err) {
      logger.error('删除旧备份失败', { file: stale, error: err instanceof Error ? err.message : String(err) });
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
