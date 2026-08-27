/**
 * 0002_admin_logs — 管理操作审计日志
 * - 与 kysely types.ts 中 AuditLogTable 字段对齐（user_id 即 actor）
 * - 双方言兼容：SQLite 端用 text/INTEGER，PG 端用 varchar/timestamptz
 * - 老库升级：CREATE TABLE IF NOT EXISTS 幂等；当前 SQLite 实际表已在 db.ts 同步创建
 * - 入参 action 为动词短语（如 'ban_user' / 'reset_password'），target_type 标记对象类型，detail 存 JSON 字符串
 */
import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.createTable('admin_logs')
    .addColumn('id', 'integer', (c) => c.primaryKey().autoIncrement().notNull())
    .addColumn('actor_id', 'integer', (c) => c.notNull())
    .addColumn('action', 'varchar(32)', (c) => c.notNull())
    .addColumn('target_type', 'varchar(16)', (c) => c.notNull())
    .addColumn('target_id', 'integer')
    .addColumn('detail', 'text', (c) => c.notNull().defaultTo(''))
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .execute();
  // 查「某管理员最近做了什么」+「某用户被谁动过」
  await db.schema.createIndex('idx_admin_logs_actor_created').on('admin_logs').columns(['actor_id', 'created_at']).execute();
  await db.schema.createIndex('idx_admin_logs_target').on('admin_logs').columns(['target_type', 'target_id']).execute();
}
