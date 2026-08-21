/**
 * SQLite 数据库初始化与连接
 */
import Database from 'better-sqlite3';
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

export const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

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

  // 常用复合索引（CREATE INDEX IF NOT EXISTS 保证幂等，重复执行无副作用）
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_posts_status_section_created ON posts (status, section_id, created_at);
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_comments_post_created ON comments (post_id, created_at);
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_messages_user_read ON messages (user_id, is_read);
  `);
  // likes 的 (user_id, target_type, target_id) 已被 UNIQUE 约束隐式覆盖，无需单独建索引
  // favorites 的 (user_id, post_id) 已被 UNIQUE 约束隐式覆盖，无需单独建索引

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
