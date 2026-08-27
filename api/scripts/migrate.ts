/**
 * 简版 migrate 入口：直接执行 api/db/migrations/0001_initial.ts 的 up()
 * - 不走 Migrator 框架（避免 kysely 主包与子包在 ESM 下的导入差异）
 * - 幂等：buildDb 时 createTable 加 ifNotExists（kysely schema.createTable 默认会检查）
 * - 失败立即退出
 *
 * 用法：DB_DRIVER=sqlite npm run db:migrate
 *      DB_DRIVER=postgres DATABASE_URL=... npm run db:migrate
 */
import { Kysely, SqliteDialect, PostgresDialect } from 'kysely';
import Database from 'better-sqlite3';
import { Pool } from 'pg';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import type { Database as DB } from '../db/types.js';
import { up } from '../db/migrations/0001_initial.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function buildDb(): Kysely<DB> {
  const driver = (process.env.DB_DRIVER ?? 'sqlite').toLowerCase();
  if (driver === 'sqlite') {
    const dbPath = process.env.SQLITE_PATH
      ? (path.isAbsolute(process.env.SQLITE_PATH) ? process.env.SQLITE_PATH : path.join(process.cwd(), process.env.SQLITE_PATH))
      : path.join(__dirname, '..', 'data.db');
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
    return new Kysely<DB>({ dialect: new SqliteDialect({ database: new Database(dbPath) }) });
  }
  const conn = process.env.DATABASE_URL;
  if (!conn) throw new Error('DB_DRIVER=postgres 但未配置 DATABASE_URL');
  return new Kysely<DB>({ dialect: new PostgresDialect({ pool: new Pool({ connectionString: conn }) }) });
}

async function main() {
  const db = buildDb();
  try {
    await up(db);
    console.log('[migrate] up ok');
  } finally {
    await db.destroy();
  }
}

main().catch((e) => { console.error('[migrate] error:', e); process.exit(1); });
