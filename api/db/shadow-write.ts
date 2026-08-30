/**
 * 影子写工具（双写期协调）
 *
 * 用法：
 *   const result = await shadowWrite('posts', async (primaryDb) => {
 *     return primaryDb.insertInto('posts').values({...}).execute();
 *   });
 *
 * 行为：
 *   - 主库（DB_DRIVER）执行 fn
 *   - 影子库（SHADOW_SECONDARY，独立 kysely 实例）异步执行同一 fn
 *   - 影子失败不阻塞主调用；仅记录日志
 *
 * 关闭：SHADOW_WRITE=0
 */
import { Kysely, SqliteDialect, PostgresDialect } from 'kysely';
import Database from 'better-sqlite3';
import { Pool } from 'pg';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Database as DB } from './types.js';

let _shadow: Kysely<DB> | null = null;

function getShadow(): Kysely<DB> {
  if (_shadow) return _shadow;
  const driver = (process.env.SHADOW_SECONDARY ?? 'postgres').toLowerCase();
  if (driver === 'sqlite') {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const shadowPath = process.env.SHADOW_SQLITE_PATH ?? path.join(__dirname, '..', 'data-shadow.db');
    const dbDir = path.dirname(shadowPath);
    if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
    _shadow = new Kysely<DB>({
      dialect: new SqliteDialect({ database: new Database(shadowPath) }),
    });
  } else {
    const conn = process.env.SHADOW_DATABASE_URL ?? process.env.DATABASE_URL;
    if (!conn) throw new Error('影子写需要 SHADOW_DATABASE_URL 或 DATABASE_URL');
    _shadow = new Kysely<DB>({
      dialect: new PostgresDialect({ pool: new Pool({ connectionString: conn, max: 5 }) }),
    });
  }
  return _shadow;
}

export async function shadowWrite<T>(
  table: string,
  fn: (db: Kysely<DB>) => Promise<T>,
  primary: Kysely<DB>,
): Promise<T> {
  if (process.env.SHADOW_WRITE === '0') return fn(primary);
  const result = await fn(primary);
  // 异步：失败仅记录
  const sh = getShadow();
  fn(sh).catch((e: any) => {

    console.error(`[shadow-write] ${table} failed:`, e?.message ?? e);
  });
  return result;
}

export async function closeShadow(): Promise<void> {
  if (_shadow) { await _shadow.destroy(); _shadow = null; }
}
