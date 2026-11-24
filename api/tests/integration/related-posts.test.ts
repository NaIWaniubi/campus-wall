/**
 * V3-P2 详情页相关推荐集成回归：
 *
 * 1. 高相似帖优先，同板块帖子兜底；返回最小字段集且按相关度降序
 * 2. 自身、待审、删除、封禁作者、低相关跨板块帖均不得出现在推荐中
 * 3. 源帖可见性与详情接口一致：待审帖仅作者/管理员可见
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../app.js';
import { db } from '../../db.js';
import { generateToken } from '../../utils/jwt.js';
import { recentPublishedCandidates } from '../../utils/similarity.js';

const TAG = `related${Date.now()}`;
let authorId = 0;
let bannedId = 0;
let token = '';
let sourceId = 0;
let nearId = 0;
let sameSectionId = 0;
let crossSectionId = 0;
let pendingId = 0;
let deletedId = 0;
let bannedPostId = 0;
let unrelatedId = 0;
let pendingSourceId = 0;
let candidateSectionId = 0;
let candidateSame1Id = 0;
let candidateSame2Id = 0;

function insertPost(
  userId: number,
  sectionId: number,
  title: string,
  content: string,
  status = 'published',
  likeCount = 0,
): number {
  return Number(
    (
      db
        .prepare(
          `INSERT INTO posts (user_id, section_id, title, content, status, like_count)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(userId, sectionId, title, content, status, likeCount) as any
    ).lastInsertRowid,
  );
}

beforeAll(() => {
  authorId = Number(
    db
      .prepare("INSERT INTO users (student_id, password, nickname, role, status) VALUES (?, 'x', ?, 'user', 'active')")
      .run(`${TAG}_author`, '相关推荐作者').lastInsertRowid,
  );
  bannedId = Number(
    db
      .prepare("INSERT INTO users (student_id, password, nickname, role, status) VALUES (?, 'x', ?, 'user', 'banned')")
      .run(`${TAG}_banned`, '封禁作者').lastInsertRowid,
  );
  token = generateToken({ id: authorId, studentId: `${TAG}_author`, role: 'user' });

  const sourceTitle = `出九成新 iPad Air 五代 ${TAG}`;
  const sourceContent = '出九成新 iPad Air，五代，64G，1450 元，可小刀，当面交易自取。';
  sourceId = insertPost(authorId, 5, sourceTitle, sourceContent, 'published', 3);
  nearId = insertPost(authorId, 5, `${sourceTitle} 同款`, `${sourceContent} 同上。`, 'published', 9);
  sameSectionId = insertPost(authorId, 5, `出售闲置显示器 ${TAG}`, '24 寸显示器，无磕碰，价格可面议。', 'published', 2);
  crossSectionId = insertPost(authorId, 3, `${sourceTitle} 跨板块`, sourceContent, 'published', 20);
  pendingId = insertPost(authorId, 5, sourceTitle, sourceContent, 'pending', 0);
  deletedId = insertPost(authorId, 5, sourceTitle, sourceContent, 'deleted', 0);
  bannedPostId = insertPost(bannedId, 5, sourceTitle, sourceContent, 'published', 99);
  unrelatedId = insertPost(authorId, 3, `周五拼车回市区 ${TAG}`, '周五下午拼车回万达，平摊高速费。', 'published', 50);
  pendingSourceId = insertPost(authorId, 5, `待审源帖 ${TAG}`, '这是一篇尚未通过审核的源帖。', 'pending', 0);
  // 匿名只改变作者输出，不改变真实 user_id 的归属权限。
  db.prepare('UPDATE posts SET is_anonymous = 1 WHERE id = ?').run(pendingSourceId);

  candidateSectionId = Number(
    db.prepare("INSERT INTO sections (name, icon, sort, is_active, need_audit) VALUES (?, '🧪', 99, 1, 0)")
      .run(`候选板块${TAG}`).lastInsertRowid,
  );
  candidateSame1Id = insertPost(authorId, candidateSectionId, `同板块候选一${TAG}`, '同板块候选一内容', 'published', 1);
  candidateSame2Id = insertPost(authorId, candidateSectionId, `同板块候选二${TAG}`, '同板块候选二内容', 'published', 2);
});

afterAll(() => {
  const ids = [sourceId, nearId, sameSectionId, crossSectionId, pendingId, deletedId, bannedPostId, unrelatedId, pendingSourceId, candidateSame1Id, candidateSame2Id].filter(Boolean);
  if (ids.length) db.prepare(`DELETE FROM posts WHERE id IN (${ids.map(() => '?').join(',')})`).run(...ids);
  if (candidateSectionId) db.prepare('DELETE FROM sections WHERE id = ?').run(candidateSectionId);
  if (authorId) db.prepare('DELETE FROM users WHERE id = ?').run(authorId);
  if (bannedId) db.prepare('DELETE FROM users WHERE id = ?').run(bannedId);
});

describe('V3-P2 详情页相关推荐', () => {
  it('高相似优先、同板块兜底，返回最小字段且排除不可见候选', async () => {
    const res = await request(app).get(`/api/posts/${sourceId}/similars`);
    expect(res.body.code).toBe(200);
    const list = res.body.data as Array<Record<string, unknown>>;
    const ids = list.map((item) => Number(item.id));

    expect(ids[0]).toBe(nearId);
    expect(ids).toContain(sameSectionId);
    expect(ids).toContain(crossSectionId);
    expect(ids).not.toContain(sourceId);
    expect(ids).not.toContain(pendingId);
    expect(ids).not.toContain(deletedId);
    expect(ids).not.toContain(bannedPostId);
    expect(ids).not.toContain(unrelatedId);
    expect(list.length).toBeLessThanOrEqual(6);
    for (const item of list) {
      expect(Object.keys(item).sort()).toEqual(['id', 'likeCount', 'sectionName', 'title']);
    }
  });

  it('待审源帖对陌生人 404，作者可读取推荐', async () => {
    const anonymous = await request(app).get(`/api/posts/${pendingSourceId}/similars`);
    expect(anonymous.body.code).toBe(404);

    const own = await request(app)
      .get(`/api/posts/${pendingSourceId}/similars`)
      .set('Authorization', `Bearer ${token}`);
    expect(own.body.code).toBe(200);
    expect(Array.isArray(own.body.data)).toBe(true);
  });

  it('候选查询先同板块最近帖，不足时再全库兜底', () => {
    const list = recentPublishedCandidates(0, 3, candidateSectionId);
    expect(list.slice(0, 2).map((item) => item.id)).toEqual([candidateSame2Id, candidateSame1Id]);
    expect(list).toHaveLength(3);
    expect(list[2]?.sectionId).not.toBe(candidateSectionId);
  });

  it('非法 id 返回 404，不抛 500', async () => {
    const res = await request(app).get('/api/posts/0/similars');
    expect(res.body.code).toBe(404);
  });
});
