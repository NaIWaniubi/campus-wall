/**
 * t5 临时实例种子：独立 DB（outputs/t5-test.db），不触碰真实数据库。
 * 建库（复用 api/db.ts 的 initDatabase）+ 播种 section_admin / 反馈 / 已发布帖。
 */
process.env.DB_PATH = 'E:/校园墙/outputs/t5-test.db'
const { db } = await import('../api/db.js')
const bcrypt = (await import('bcryptjs')).default

// section_admin 测试账号
db.prepare("DELETE FROM users WHERE student_id = 'sec_admin'").run()
db.prepare(
  'INSERT INTO users (student_id, password, nickname, college, grade, role, status, credit_score) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
).run('sec_admin', bcrypt.hashSync('sec123456', 10), '板块管理员测试', '信息学院', '2024', 'section_admin', 'active', 100)

// 一条待处理反馈（id 自增）
db.prepare('INSERT INTO feedback (user_id, content, contact, status) VALUES (?, ?, ?, ?)')
  .run(1, 't5-测试反馈内容', 'qq:123456', 'open')

// 一个已发布帖子（供审核/置顶矩阵探测）
const exists = db.prepare('SELECT id FROM posts WHERE title = ?').get('t5-matrix-post')
if (!exists) {
  const sec = db.prepare('SELECT id FROM sections ORDER BY id LIMIT 1').get()
  db.prepare(
    "INSERT INTO posts (user_id, section_id, title, content, status, is_anonymous, is_top, top_type, view_count, like_count, comment_count) VALUES (?, ?, 't5-matrix-post', 'matrix test body', 'published', 0, 0, 'none', 0, 0, 0)"
  ).run(1, sec.id)
}

console.log('SEED_OK admin=sec_admin/sec123456 super=admin/admin123')
