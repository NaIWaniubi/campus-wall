/**
 * V3-P1 发布时相似帖检测集成回归：
 *
 * 1. 作者发与已有帖高相似的帖 → 收到一条 type=system 的相似提醒（含对方帖标题）
 * 2. 作者发无关新帖 → 不产生相似提醒（发布自身的「已通过审核」系统消息不算）
 * 3. 重复发布成功本身不受影响（响应体形状不变）
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../app.js';
import { db } from '../../db.js';

const TAG = `simguard${Date.now()}`;
let authorToken = '';
let authorId = 0;
let victimPostId = 0;

beforeAll(async () => {
  const reg = await request(app).post('/api/auth/register').send({
    account: `${TAG}_author`,
    password: 'pass12345',
    nickname: '相似作者',
  });
  authorToken = reg.body.data.token;
  authorId = Number((db.prepare('SELECT id FROM users WHERE student_id = ?').get(`${TAG}_author`) as any).id);

  // 直接灌一篇「受害者」帖（模拟已被发布的旧帖），作者随后走真实发布链路
  victimPostId = Number(
    (
      db
        .prepare(
          'INSERT INTO posts (user_id, section_id, title, content, status) VALUES (?, 5, ?, ?, ?)'
        )
        .run(authorId, `出九成新 iPad Air ${TAG}`, `出九成新 iPad Air，五代，64G，1450 元，可小刀，当面交易自取。`, 'published') as any
    ).lastInsertRowid
  );
});

afterAll(() => {
  // 外键序：messages（related_id/user_id）、events（user_id）先于用户行删除
  if (authorId) {
    db.prepare('DELETE FROM messages WHERE user_id = ? OR related_id IN (SELECT id FROM posts WHERE user_id = ?)').run(authorId, authorId);
    db.prepare('DELETE FROM events WHERE user_id = ?').run(authorId);
    db.prepare('DELETE FROM posts WHERE user_id = ?').run(authorId);
  }
  if (victimPostId) db.prepare('DELETE FROM posts WHERE id = ?').run(victimPostId);
  if (authorId) db.prepare('DELETE FROM users WHERE id = ?').run(authorId);
});

describe('V3-P1 发布时相似帖检测', () => {
  it('高相似发帖触发 system 相似提醒（含对方标题）', async () => {
    const res: any = await request(app)
      .post('/api/posts')
      .set('Authorization', `Bearer ${authorToken}`)
      .send({
        sectionId: 5,
        title: `出九成新 iPad Air ${TAG} 同款`,
        content: '出九成新 iPad Air，五代，64G，1450 元，可小刀，当面交易自取，同上。',
      });
    expect(res.body.code).toBe(200);

    const rows = db
      .prepare("SELECT content FROM messages WHERE user_id = ? AND type = 'system' ORDER BY id DESC LIMIT 5")
      .all(authorId) as { content: string }[];
    // 相似提醒文案含关键词「相似」+ 对方帖标题（受害者帖标题含 TAG）
    const hit = rows.find((r) => r.content.includes('相似') && r.content.includes(TAG));
    expect(hit).toBeDefined();
  });

  it('无关新帖不产生相似提醒，发布成功形状不变', async () => {
    const rowsBefore = (
      db
        .prepare("SELECT COUNT(*) c FROM messages WHERE user_id = ? AND type = 'system' AND content LIKE '%相似%'")
        .get(authorId) as any
    ).c;

    const res: any = await request(app)
      .post('/api/posts')
      .set('Authorization', `Bearer ${authorToken}`)
      .send({
        sectionId: 3,
        title: `${TAG} 完全无关的吐槽`,
        content: '今天食堂的米饭硬得像石头，希望改进一下打饭阿姨的手艺，谢谢。',
      });
    // 兼容矩阵：响应体形状不变
    expect(res.body.code).toBe(200);
    expect(res.body.data.id).toBeGreaterThan(0);
    expect(res.body.data.status).toBe('published');

    const rowsAfter = (
      db
        .prepare("SELECT COUNT(*) c FROM messages WHERE user_id = ? AND type = 'system' AND content LIKE '%相似%'")
        .get(authorId) as any
    ).c;
    expect(rowsAfter).toBe(rowsBefore);

    // 清理这条无关测试帖
    const createdId = Number(res.body.data.id);
    if (createdId) db.prepare('DELETE FROM posts WHERE id = ?').run(createdId);
  });
});