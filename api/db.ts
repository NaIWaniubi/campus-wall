/**
 * SQLite 数据库初始化与连接
 */
import Database from 'better-sqlite3';
import type BetterSqlite3 from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 数据库路径可通过环境变量配置；默认存放在 api/data.db
const dbPath = process.env.DB_PATH
  ? (path.isAbsolute(process.env.DB_PATH) ? process.env.DB_PATH : path.join(process.cwd(), process.env.DB_PATH))
  : path.join(__dirname, 'data.db');

// 确保目录存在
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

export const db: BetterSqlite3.Database = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

/**
 * CJK 二元分词自定义函数（供 FTS5 触发器使用）：
 * unicode61 分词器不切分中文（连续汉字成单 token，无法子串匹配），
 * 这里把文本预切为「ASCII 词块 + 中文 2 字滑窗」空格分隔的 token 串再入索引。
 * 与 utils/matching.ts 的 buildFtsQuery 查询侧滑窗一一对应。
 */
db.function('cjk_bigrams', (text: unknown): string => {
  if (typeof text !== 'string' || !text) return '';
  const ascii = text.match(/[a-zA-Z0-9]{2,}/g)?.map((w) => w.toLowerCase()) || [];
  const chinese = text.replace(/[\s，。！？、；：,.!?;:~～"'‘’（）()\[\]{}#*a-zA-Z0-9]/g, '');
  const bigrams: string[] = [];
  for (let i = 0; i + 2 <= chinese.length; i++) {
    bigrams.push(chinese.slice(i, i + 2));
  }
  return [...ascii, ...bigrams].join(' ');
});

/**
 * 初始化数据库表结构与初始数据
 */
export function initDatabase() {
  // 用户表
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      nickname TEXT NOT NULL,
      avatar TEXT DEFAULT '',
      college TEXT DEFAULT '',
      grade TEXT DEFAULT '',
      signature TEXT DEFAULT '',
      credit_score INTEGER DEFAULT 100,
      role TEXT DEFAULT 'user',
      status TEXT DEFAULT 'active',
      ban_reason TEXT DEFAULT '',
      ban_until TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 板块表
  db.exec(`
    CREATE TABLE IF NOT EXISTS sections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      icon TEXT DEFAULT '',
      sort INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      force_anonymous INTEGER DEFAULT 0,
      need_audit INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 帖子表
  db.exec(`
    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      section_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      images TEXT DEFAULT '[]',
      is_anonymous INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending',
      is_top INTEGER DEFAULT 0,
      top_type TEXT DEFAULT 'none',
      reject_reason TEXT DEFAULT '',
      view_count INTEGER DEFAULT 0,
      like_count INTEGER DEFAULT 0,
      comment_count INTEGER DEFAULT 0,
      favorite_count INTEGER DEFAULT 0,
      extra_fields TEXT DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (section_id) REFERENCES sections(id)
    );
  `);

  // 评论表
  db.exec(`
    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      parent_id INTEGER DEFAULT NULL,
      content TEXT NOT NULL,
      is_anonymous INTEGER DEFAULT 0,
      like_count INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (post_id) REFERENCES posts(id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (parent_id) REFERENCES comments(id)
    );
  `);

  // 点赞表
  db.exec(`
    CREATE TABLE IF NOT EXISTS likes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      target_type TEXT NOT NULL,
      target_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, target_type, target_id)
    );
  `);

  // 收藏表
  db.exec(`
    CREATE TABLE IF NOT EXISTS favorites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      post_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, post_id)
    );
  `);

  // 消息表
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      related_id INTEGER DEFAULT NULL,
      is_read INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);

  // 举报表
  db.exec(`
    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reporter_id INTEGER NOT NULL,
      target_type TEXT NOT NULL,
      target_id INTEGER NOT NULL,
      reason TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      priority TEXT DEFAULT 'normal',
      handler_id INTEGER DEFAULT NULL,
      handle_result TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (reporter_id) REFERENCES users(id)
    );
  `);

  // 草稿表
  db.exec(`
    CREATE TABLE IF NOT EXISTS drafts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      section_id INTEGER DEFAULT NULL,
      title TEXT DEFAULT '',
      content TEXT DEFAULT '',
      images TEXT DEFAULT '[]',
      is_anonymous INTEGER DEFAULT 0,
      extra_fields TEXT DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);

  // 公告表
  db.exec(`
    CREATE TABLE IF NOT EXISTS announcements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      target_user_id INTEGER DEFAULT NULL,
      expires_at DATETIME DEFAULT NULL,
      is_active INTEGER DEFAULT 1,
      created_by INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id)
    );
  `);

  // 公告确认表
  db.exec(`
    CREATE TABLE IF NOT EXISTS announcement_acks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      announcement_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      acked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(announcement_id, user_id)
    );
  `);

  // 键值配置表（AI 模型等运行时设置）
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 常用复合索引（CREATE INDEX IF NOT EXISTS 保证幂等，重复执行无副作用）
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_posts_status_section_created ON posts (status, section_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_posts_user_created ON posts (user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_posts_user_status ON posts (user_id, status);
    CREATE INDEX IF NOT EXISTS idx_comments_post_created ON comments (post_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_comments_user_created ON comments (user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_comments_post_parent ON comments (post_id, parent_id);
    CREATE INDEX IF NOT EXISTS idx_messages_user_read ON messages (user_id, is_read);
    CREATE INDEX IF NOT EXISTS idx_reports_status_priority ON reports (status, priority, created_at);
    CREATE INDEX IF NOT EXISTS idx_favorites_user_created ON favorites (user_id, created_at);
  `);
  // likes 的 (user_id, target_type, target_id) 已被 UNIQUE 约束隐式覆盖，无需单独建索引
  // favorites 的 (user_id, post_id) 已被 UNIQUE 约束隐式覆盖，无需单独建索引

  // ---------- FTS5 全文检索虚拟表（毫秒级分词搜索，替代 LIKE 全表扫描） ----------
  // 独立表（非 external content）：入索引前经 cjk_bigrams 预切词，避免 external content
  // 「列名必须与原表一致」与 unicode61 不切分中文两个坑
  // 老库升级：若存在旧版 external content 定义的 posts_fts（查询会报 no such column），先删后重建
  const ftsDdl = (db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'posts_fts'").get() as any)?.sql || '';
  if (ftsDdl.includes("content='posts'")) {
    db.exec('DROP TABLE IF EXISTS posts_fts;');
  }
  // 老库升级：旧版触发器按 external content 'delete' 命令写入，与独立表不兼容（SQL logic error），先删后重建
  db.exec(`
    DROP TRIGGER IF EXISTS posts_fts_insert;
    DROP TRIGGER IF EXISTS posts_fts_update;
    DROP TRIGGER IF EXISTS posts_fts_delete;
  `);
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS posts_fts USING fts5(
      title,
      content,
      extra_text,
      tokenize='unicode61'
    );
  `);
  // 双向同步触发器：业务写 posts 时 FTS 倒排索引由 SQLite 底层原子同步，业务层零心智负担
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS posts_fts_insert AFTER INSERT ON posts BEGIN
      INSERT INTO posts_fts(rowid, title, content, extra_text)
      VALUES (NEW.id, cjk_bigrams(NEW.title), cjk_bigrams(NEW.content), cjk_bigrams(NEW.extra_fields));
    END;
  `);
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS posts_fts_update AFTER UPDATE ON posts BEGIN
      DELETE FROM posts_fts WHERE rowid = OLD.id;
      INSERT INTO posts_fts(rowid, title, content, extra_text)
      VALUES (NEW.id, cjk_bigrams(NEW.title), cjk_bigrams(NEW.content), cjk_bigrams(NEW.extra_fields));
    END;
  `);
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS posts_fts_delete AFTER DELETE ON posts BEGIN
      DELETE FROM posts_fts WHERE rowid = OLD.id;
    END;
  `);
  // 存量数据回填：FTS 为空且 posts 有数据时一次性灌入（幂等，重复执行无副作用）
  const ftsHasRow = db.prepare('SELECT rowid FROM posts_fts LIMIT 1').get();
  const postsCount = (db.prepare('SELECT COUNT(*) as count FROM posts').get() as { count: number }).count;
  if (!ftsHasRow && postsCount > 0) {
    db.exec(`
      INSERT INTO posts_fts(rowid, title, content, extra_text)
      SELECT id, cjk_bigrams(title), cjk_bigrams(content), cjk_bigrams(extra_fields) FROM posts;
    `);
  }

  // ---------- 二手意向出价表（闪电意向撮合闭环） ----------
  db.exec(`
    CREATE TABLE IF NOT EXISTS trade_offers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL,
      buyer_id INTEGER NOT NULL,
      seller_id INTEGER NOT NULL,
      offer_price REAL NOT NULL,
      message TEXT DEFAULT '',
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (post_id) REFERENCES posts(id),
      FOREIGN KEY (buyer_id) REFERENCES users(id),
      FOREIGN KEY (seller_id) REFERENCES users(id)
    );
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_trade_offers_post_status ON trade_offers (post_id, status);
    CREATE INDEX IF NOT EXISTS idx_trade_offers_buyer ON trade_offers (buyer_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_trade_offers_seller ON trade_offers (seller_id, created_at);
  `);

  // 初始板块数据
  const sectionCount = db.prepare('SELECT COUNT(*) as count FROM sections').get() as { count: number };
  if (sectionCount.count === 0) {
    const insertSection = db.prepare('INSERT INTO sections (name, icon, sort, is_active, force_anonymous, need_audit) VALUES (?, ?, ?, ?, ?, ?)');
    const sections: [string, string, number, number, number, number][] = [
      ['二手交易', 'shopping-bag', 1, 1, 0, 1],
      ['失物招领', 'search', 2, 1, 0, 0],
      ['表白墙', 'heart', 3, 1, 0, 0],
      ['吐槽树洞', 'message-circle', 4, 1, 1, 0],
      ['互助问答', 'help-circle', 5, 1, 0, 0],
      ['校园活动', 'calendar', 6, 1, 0, 0],
    ];
    const insertMany = db.transaction((items: [string, string, number, number, number, number][]) => {
      for (const item of items) insertSection.run(...item);
    });
    insertMany(sections);
  }

  // 板块幂等补种（老库升级自动获得新板块）：按名称查重，重复执行无副作用
  const ensureSection = db.prepare(`
    INSERT INTO sections (name, icon, sort, is_active, force_anonymous, need_audit)
    SELECT ?, ?, ?, 1, 0, ?
    WHERE NOT EXISTS (SELECT 1 FROM sections WHERE name = ?)
  `);
  ensureSection.run('拼车', 'car', 7, 0, '拼车');
  ensureSection.run('组队', 'users', 8, 0, '组队');

  // 初始管理员账号
  const adminCount = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'super_admin'").get() as { count: number };
  if (adminCount.count === 0) {
    const hashedPassword = bcrypt.hashSync('admin123', 10);
    db.prepare('INSERT INTO users (student_id, password, nickname, college, grade, role, status, credit_score) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
      'admin', hashedPassword, '超级管理员', '信息学院', '2024', 'super_admin', 'active', 120
    );
  }
}

initDatabase();

/**
 * 运行时设置读写（settings 表）
 */
export function getSetting(key: string): string | null {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row ? row.value : null;
}

export function setSetting(key: string, value: string): void {
  db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`
  ).run(key, value);
}

/**
 * 板块订阅表（幂等追加：CREATE TABLE IF NOT EXISTS，重复执行无副作用）
 */
db.exec(`
  CREATE TABLE IF NOT EXISTS subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    section_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, section_id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (section_id) REFERENCES sections(id)
  );
`);
// (user_id, section_id) 已被 UNIQUE 约束隐式覆盖；摘要任务按板块遍历，补 section_id 索引
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_subscriptions_section ON subscriptions (section_id);
`);

/**
 * 二手交易互评表（幂等追加：CREATE TABLE IF NOT EXISTS，重复执行无副作用）
 * 每个交易帖每人只能评价一次（UNIQUE(post_id, rater_id)），支持买卖双方互评
 */
db.exec(`
  CREATE TABLE IF NOT EXISTS trade_ratings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    rater_id INTEGER NOT NULL,
    ratee_id INTEGER NOT NULL,
    rating INTEGER CHECK(rating BETWEEN 1 AND 5),
    comment TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(post_id, rater_id),
    FOREIGN KEY (post_id) REFERENCES posts(id),
    FOREIGN KEY (rater_id) REFERENCES users(id),
    FOREIGN KEY (ratee_id) REFERENCES users(id)
  );
`);
// 个人主页按被评人查互评记录
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_trade_ratings_ratee ON trade_ratings (ratee_id, created_at);
`);
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_trade_ratings_post ON trade_ratings (post_id);
`);

/**
 * 意见反馈表（幂等追加：CREATE TABLE IF NOT EXISTS，重复执行无副作用）
 */
db.exec(`
  CREATE TABLE IF NOT EXISTS feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    contact TEXT DEFAULT '',
    status TEXT DEFAULT 'open',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);
// 老库升级： interim 版本建的表缺 status 列时补齐（幂等）
const feedbackHasStatus = (db.prepare('PRAGMA table_info(feedback)').all() as { name: string }[])
  .some((c) => c.name === 'status');
if (!feedbackHasStatus) {
  db.exec(`ALTER TABLE feedback ADD COLUMN status TEXT DEFAULT 'open'`);
}
// 管理端反馈列表按时间倒序分页
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback (created_at);
`);

/**
 * 私信会话表（幂等追加：CREATE TABLE IF NOT EXISTS，重复执行无副作用）
 * 双方约定 user_a_id < user_b_id 存储，配合 UNIQUE 防止同一对用户产生两条会话
 */
db.exec(`
  CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_a_id INTEGER NOT NULL,
    user_b_id INTEGER NOT NULL,
    last_message TEXT DEFAULT '',
    last_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    unread_a INTEGER DEFAULT 0,
    unread_b INTEGER DEFAULT 0,
    UNIQUE (user_a_id, user_b_id),
    CHECK (user_a_id < user_b_id),
    FOREIGN KEY (user_a_id) REFERENCES users(id),
    FOREIGN KEY (user_b_id) REFERENCES users(id)
  );
`);

/**
 * 私信消息表：按会话存储，升序读取；is_read 供单条已读回执扩展
 */
db.exec(`
  CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL,
    sender_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    is_read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
    FOREIGN KEY (sender_id) REFERENCES users(id)
  );
`);
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_chat_messages_conv ON chat_messages (conversation_id, id);
`);

/**
 * 关注表：follower 关注 following，主键天然防重，CHECK 禁止自我关注
 */
db.exec(`
  CREATE TABLE IF NOT EXISTS follows (
    follower_id INTEGER NOT NULL,
    following_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (follower_id, following_id),
    CHECK (follower_id <> following_id),
    FOREIGN KEY (follower_id) REFERENCES users(id),
    FOREIGN KEY (following_id) REFERENCES users(id)
  );
`);
// 粉丝列表按被关注人查询；关注列表走主键前缀
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_follows_following ON follows (following_id, created_at);
`);

// 微信登录：users 表幂等补列 openid（PRAGMA 检测 + ALTER）
const userCols = db.prepare('PRAGMA table_info(users)').all() as { name: string }[];
if (!userCols.some((c) => c.name === 'openid')) {
  db.exec('ALTER TABLE users ADD COLUMN openid TEXT');
}
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_users_openid ON users (openid);
`);

/**
 * 管理操作审计日志表（admin-security P2-12）
 * - 字段对齐 kysely types.ts 的 AuditLogTable（DB 抽象层用）
 * - 同步建在 kysely migration 0002_admin_logs.ts，供 PG 路径使用
 * - detail 存 JSON 字符串（action 相关上下文：reason / duration / score 等）
 */
db.exec(`
  CREATE TABLE IF NOT EXISTS admin_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id INTEGER,
    detail TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (actor_id) REFERENCES users(id)
  );
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_admin_logs_actor_created ON admin_logs (actor_id, created_at);`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_admin_logs_target ON admin_logs (target_type, target_id);`);

/**
 * Web Push 订阅表（spec-C T9 预埋）：
 * - VAPID 凭据（VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY）未配置时发送逻辑静默关闭，本表只是闲置
 * - endpoint UNIQUE：同一浏览器重复授权走 INSERT OR REPLACE 刷新 keys
 */
db.exec(`
  CREATE TABLE IF NOT EXISTS push_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_push_subs_user ON push_subscriptions (user_id);`);
