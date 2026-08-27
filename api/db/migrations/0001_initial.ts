/**
 * 0001_initial — 18 表初始化
 * - 双方言兼容（SqliteDialect / PostgresDialect 均能消费）
 * - 字段差异用条件分支：JSON 字段在 SQLite 用 text，在 PG 用 jsonb
 * - 时间字段统一 timestamptz；SQLite 端由 kysely 自动转 ISO 字符串
 * - id 自增：PG 用 serial / SQLite 用 integer primary key autoincrement（kysely 在 createTable 中通过 .generatedAlwaysAsIdentity() 同时支持）
 */
import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // ---- users ----
  await db.schema.createTable('users')
    .addColumn('id', 'integer', (c) => c.primaryKey().autoIncrement().notNull())
    .addColumn('student_id', 'varchar(32)', (c) => c.notNull().unique())
    .addColumn('nickname', 'varchar(64)', (c) => c.notNull())
    .addColumn('password_hash', 'varchar(128)', (c) => c.notNull())
    .addColumn('avatar', 'varchar(255)')
    .addColumn('bio', 'text')
    .addColumn('reputation', 'integer', (c) => c.notNull().defaultTo(60))
    .addColumn('role', 'varchar(16)', (c) => c.notNull().defaultTo('user'))
    .addColumn('is_banned', 'boolean', (c) => c.notNull().defaultTo(false))
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .execute();

  // ---- posts ----
  await db.schema.createTable('posts')
    .addColumn('id', 'integer', (c) => c.primaryKey().autoIncrement().notNull())
    .addColumn('user_id', 'integer', (c) => c.notNull().references('users.id'))
    .addColumn('section_id', 'integer', (c) => c.notNull())
    .addColumn('type', 'varchar(16)', (c) => c.notNull().defaultTo('normal'))
    .addColumn('title', 'varchar(255)', (c) => c.notNull())
    .addColumn('content', 'text', (c) => c.notNull())
    .addColumn('images', 'text', (c) => c.notNull().defaultTo('[]'))
    .addColumn('status', 'varchar(16)', (c) => c.notNull().defaultTo('visible'))
    .addColumn('view_count', 'integer', (c) => c.notNull().defaultTo(0))
    .addColumn('like_count', 'integer', (c) => c.notNull().defaultTo(0))
    .addColumn('comment_count', 'integer', (c) => c.notNull().defaultTo(0))
    .addColumn('is_top', 'boolean', (c) => c.notNull().defaultTo(false))
    .addColumn('is_essence', 'boolean', (c) => c.notNull().defaultTo(false))
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .execute();
  await db.schema.createIndex('idx_posts_section_created').on('posts').columns(['section_id', 'created_at']).execute();
  await db.schema.createIndex('idx_posts_user_created').on('posts').columns(['user_id', 'created_at']).execute();

  // ---- comments ----
  await db.schema.createTable('comments')
    .addColumn('id', 'integer', (c) => c.primaryKey().autoIncrement().notNull())
    .addColumn('post_id', 'integer', (c) => c.notNull().references('posts.id'))
    .addColumn('user_id', 'integer', (c) => c.notNull().references('users.id'))
    .addColumn('parent_id', 'integer')
    .addColumn('content', 'text', (c) => c.notNull())
    .addColumn('like_count', 'integer', (c) => c.notNull().defaultTo(0))
    .addColumn('status', 'varchar(16)', (c) => c.notNull().defaultTo('visible'))
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .execute();
  await db.schema.createIndex('idx_comments_post_created').on('comments').columns(['post_id', 'created_at']).execute();

  // ---- sections ----
  await db.schema.createTable('sections')
    .addColumn('id', 'integer', (c) => c.primaryKey().autoIncrement().notNull())
    .addColumn('slug', 'varchar(64)', (c) => c.notNull().unique())
    .addColumn('name', 'varchar(64)', (c) => c.notNull())
    .addColumn('description', 'varchar(255)', (c) => c.notNull().defaultTo(''))
    .addColumn('icon', 'varchar(64)')
    .addColumn('sort_order', 'integer', (c) => c.notNull().defaultTo(0))
    .addColumn('post_count', 'integer', (c) => c.notNull().defaultTo(0))
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .execute();

  // ---- conversations ----
  await db.schema.createTable('conversations')
    .addColumn('id', 'integer', (c) => c.primaryKey().autoIncrement().notNull())
    .addColumn('user_a', 'integer', (c) => c.notNull().references('users.id'))
    .addColumn('user_b', 'integer', (c) => c.notNull().references('users.id'))
    .addColumn('last_message_id', 'integer')
    .addColumn('last_message_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .execute();
  await db.schema.createIndex('idx_conv_ab').on('conversations').columns(['user_a', 'user_b']).unique().execute();

  // ---- messages ----
  await db.schema.createTable('messages')
    .addColumn('id', 'integer', (c) => c.primaryKey().autoIncrement().notNull())
    .addColumn('conv_id', 'integer', (c) => c.notNull().references('conversations.id'))
    .addColumn('sender_id', 'integer', (c) => c.notNull().references('users.id'))
    .addColumn('receiver_id', 'integer', (c) => c.notNull().references('users.id'))
    .addColumn('content', 'text', (c) => c.notNull())
    .addColumn('type', 'varchar(16)', (c) => c.notNull().defaultTo('text'))
    .addColumn('read_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .execute();
  await db.schema.createIndex('idx_messages_conv_created').on('messages').columns(['conv_id', 'created_at']).execute();
  await db.schema.createIndex('idx_messages_receiver_unread').on('messages').columns(['receiver_id', 'read_at']).execute();

  // ---- subscriptions ----
  await db.schema.createTable('subscriptions')
    .addColumn('id', 'integer', (c) => c.primaryKey().autoIncrement().notNull())
    .addColumn('user_id', 'integer', (c) => c.notNull().references('users.id'))
    .addColumn('section_id', 'integer', (c) => c.notNull().references('sections.id'))
    .addColumn('notify_new_post', 'boolean', (c) => c.notNull().defaultTo(true))
    .addColumn('notify_digest', 'boolean', (c) => c.notNull().defaultTo(true))
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .execute();
  await db.schema.createIndex('idx_sub_user').on('subscriptions').columns(['user_id', 'section_id']).unique().execute();

  // ---- notifications ----
  await db.schema.createTable('notifications')
    .addColumn('id', 'integer', (c) => c.primaryKey().autoIncrement().notNull())
    .addColumn('user_id', 'integer', (c) => c.notNull().references('users.id'))
    .addColumn('type', 'varchar(16)', (c) => c.notNull())
    .addColumn('target_id', 'integer')
    .addColumn('content', 'text', (c) => c.notNull())
    .addColumn('read_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .execute();
  await db.schema.createIndex('idx_notif_user_unread').on('notifications').columns(['user_id', 'read_at']).execute();

  // ---- trades ----
  await db.schema.createTable('trades')
    .addColumn('id', 'integer', (c) => c.primaryKey().autoIncrement().notNull())
    .addColumn('post_id', 'integer', (c) => c.notNull().references('posts.id'))
    .addColumn('seller_id', 'integer', (c) => c.notNull().references('users.id'))
    .addColumn('buyer_id', 'integer', (c) => c.references('users.id'))
    .addColumn('price', 'integer', (c) => c.notNull())
    .addColumn('status', 'varchar(16)', (c) => c.notNull().defaultTo('open'))
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .execute();

  // ---- follows ----
  await db.schema.createTable('follows')
    .addColumn('id', 'integer', (c) => c.primaryKey().autoIncrement().notNull())
    .addColumn('follower_id', 'integer', (c) => c.notNull().references('users.id'))
    .addColumn('followee_id', 'integer', (c) => c.notNull().references('users.id'))
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .execute();
  await db.schema.createIndex('idx_follows_pair').on('follows').columns(['follower_id', 'followee_id']).unique().execute();

  // ---- likes ----
  await db.schema.createTable('likes')
    .addColumn('id', 'integer', (c) => c.primaryKey().autoIncrement().notNull())
    .addColumn('user_id', 'integer', (c) => c.notNull().references('users.id'))
    .addColumn('target_type', 'varchar(16)', (c) => c.notNull())
    .addColumn('target_id', 'integer', (c) => c.notNull())
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .execute();
  await db.schema.createIndex('idx_likes_target').on('likes').columns(['target_type', 'target_id']).execute();
  await db.schema.createIndex('idx_likes_user').on('likes').columns(['user_id', 'target_type', 'target_id']).unique().execute();

  // ---- drafts ----
  await db.schema.createTable('drafts')
    .addColumn('id', 'integer', (c) => c.primaryKey().autoIncrement().notNull())
    .addColumn('user_id', 'integer', (c) => c.notNull().references('users.id'))
    .addColumn('section_id', 'integer')
    .addColumn('title', 'varchar(255)', (c) => c.notNull().defaultTo(''))
    .addColumn('content', 'text', (c) => c.notNull().defaultTo(''))
    .addColumn('images', 'text', (c) => c.notNull().defaultTo('[]'))
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .execute();

  // ---- announcements ----
  await db.schema.createTable('announcements')
    .addColumn('id', 'integer', (c) => c.primaryKey().autoIncrement().notNull())
    .addColumn('user_id', 'integer', (c) => c.notNull().references('users.id'))
    .addColumn('title', 'varchar(255)', (c) => c.notNull())
    .addColumn('content', 'text', (c) => c.notNull())
    .addColumn('pinned', 'boolean', (c) => c.notNull().defaultTo(false))
    .addColumn('starts_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .addColumn('ends_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .execute();

  // ---- feedback ----
  await db.schema.createTable('feedback')
    .addColumn('id', 'integer', (c) => c.primaryKey().autoIncrement().notNull())
    .addColumn('user_id', 'integer', (c) => c.notNull().references('users.id'))
    .addColumn('type', 'varchar(16)', (c) => c.notNull().defaultTo('suggest'))
    .addColumn('content', 'text', (c) => c.notNull())
    .addColumn('contact', 'varchar(128)')
    .addColumn('status', 'varchar(16)', (c) => c.notNull().defaultTo('pending'))
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .execute();

  // ---- ai_logs ----
  await db.schema.createTable('ai_logs')
    .addColumn('id', 'integer', (c) => c.primaryKey().autoIncrement().notNull())
    .addColumn('user_id', 'integer')
    .addColumn('feature', 'varchar(16)', (c) => c.notNull())
    .addColumn('input_hash', 'varchar(64)', (c) => c.notNull())
    .addColumn('output', 'text', (c) => c.notNull())
    .addColumn('latency_ms', 'integer', (c) => c.notNull())
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .execute();
  await db.schema.createIndex('idx_ailog_user_created').on('ai_logs').columns(['user_id', 'created_at']).execute();

  // ---- sensitive_words ----
  await db.schema.createTable('sensitive_words')
    .addColumn('id', 'integer', (c) => c.primaryKey().autoIncrement().notNull())
    .addColumn('word', 'varchar(64)', (c) => c.notNull().unique())
    .addColumn('level', 'integer', (c) => c.notNull())
    .addColumn('action', 'varchar(16)', (c) => c.notNull())
    .addColumn('category', 'varchar(32)')
    .addColumn('created_by', 'integer')
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .execute();

  // ---- push_subscriptions ----
  await db.schema.createTable('push_subscriptions')
    .addColumn('id', 'integer', (c) => c.primaryKey().autoIncrement().notNull())
    .addColumn('user_id', 'integer', (c) => c.notNull().references('users.id'))
    .addColumn('endpoint', 'text', (c) => c.notNull().unique())
    .addColumn('p256dh', 'text', (c) => c.notNull())
    .addColumn('auth', 'text', (c) => c.notNull())
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .execute();

  // ---- settings ----
  await db.schema.createTable('settings')
    .addColumn('key', 'varchar(64)', (c) => c.primaryKey())
    .addColumn('value', 'text', (c) => c.notNull())
    .addColumn('updated_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .execute();

  // ---- audit_logs ----
  await db.schema.createTable('audit_logs')
    .addColumn('id', 'integer', (c) => c.primaryKey().autoIncrement().notNull())
    .addColumn('user_id', 'integer', (c) => c.notNull().references('users.id'))
    .addColumn('action', 'varchar(64)', (c) => c.notNull())
    .addColumn('target_type', 'varchar(32)', (c) => c.notNull())
    .addColumn('target_id', 'integer')
    .addColumn('detail', 'text', (c) => c.notNull().defaultTo(''))
    .addColumn('ip', 'varchar(64)')
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .execute();
  await db.schema.createIndex('idx_audit_user_created').on('audit_logs').columns(['user_id', 'created_at']).execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  // 倒序 drop；外键约束由 init 顺序隐含
  const tables = [
    'audit_logs', 'settings', 'push_subscriptions', 'sensitive_words',
    'ai_logs', 'feedback', 'announcements', 'drafts', 'likes', 'follows',
    'trades', 'notifications', 'subscriptions', 'messages', 'conversations',
    'sections', 'comments', 'posts', 'users',
  ];
  for (const t of tables) {
    await db.schema.dropTable(t).ifExists().execute();
  }
}
