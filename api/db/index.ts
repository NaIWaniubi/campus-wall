/**
 * DB 抽象层：kysely 实例工厂
 * - DB_DRIVER=sqlite    → SqliteDialect + better-sqlite3（默认，兼容现网）
 * - DB_DRIVER=postgres  → PostgresDialect + pg pool
 * 注：双写期（task 3）期间，DB_DRIVER 控制"主"读路径，影子写由 shadow-write.ts 负责
 */
import { Kysely, SqliteDialect, PostgresDialect } from 'kysely';
import Database from 'better-sqlite3';
import { Pool } from 'pg';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Database as DB } from './types.js';

let _db: Kysely<DB> | null = null;

export type DbDriver = 'sqlite' | 'postgres';

export function getDb(): Kysely<DB> {
  if (_db) return _db;
  const driver = (process.env.DB_DRIVER ?? 'sqlite').toLowerCase() as DbDriver;
  if (driver === 'sqlite') {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const defaultPath = path.join(__dirname, '..', 'data.db');
    const dbPath = process.env.SQLITE_PATH
      ? (path.isAbsolute(process.env.SQLITE_PATH) ? process.env.SQLITE_PATH : path.join(process.cwd(), process.env.SQLITE_PATH))
      : defaultPath;
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
    _db = new Kysely<DB>({
      dialect: new SqliteDialect({
        database: new Database(dbPath),
      }),
    });
  } else if (driver === 'postgres') {
    const conn = process.env.DATABASE_URL;
    if (!conn) throw new Error('DB_DRIVER=postgres 但未配置 DATABASE_URL');
    _db = new Kysely<DB>({
      dialect: new PostgresDialect({
        // R3 审查 P2：无超时的池在网络分区/failover 下会永久占满所有连接，
        // 所有查询无限等待无失败信号 → API 静默挂死。给 fail-fast 三件套。
        pool: new Pool({ connectionString: conn, max: 10, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30_000 }),
      }),
    });
  } else {
    throw new Error(`unknown DB_DRIVER: ${driver}`);
  }
  return _db;
}

export async function closeDb(): Promise<void> {
  if (_db) { await _db.destroy(); _db = null; }
}

export function resetDbForTest(): void {
  _db = null;
}
