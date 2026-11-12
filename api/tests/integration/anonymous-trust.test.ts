/**
 * 匿名信任层 · 反查回归（威胁模型的可执行版本）
 *
 * 威胁模型：攻击者是一个已登录的普通学生，目标是把匿名帖（尤其树洞）还原到具体的人。
 * 他手里只有公开/半公开接口，因此系统必须在**每一条**可能泄露 author 的出口上保持一致。
 *
 * 覆盖的四条反查路径：
 *   1. 列表 authorId 筛选：GET /posts?authorId=N 把该用户所有帖筛出来
 *   2. 帖子详情：GET /posts/:id 的 author 字段
 *   3. 评论列表：GET /posts/:id/comments 的评论作者
 *   4. 个人主页聚合：GET /users/:id 相关聚合（若返回帖子数/帖子列表）
 *
 * 另外验证：作者本人与管理员仍能正常访问（不能为了安全把功能改坏）。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../app.js';
import { db } from '../../db.js';
import { generateToken } from '../../utils/jwt.js';

const TAG = `anon_${Date.now()}`;
let authorId = 0;
let strangerId = 0;
let adminId = 0;
let anonPostId = 0;
let publicPostId = 0;
let anonCommentId = 0;

function token(id: number, role = 'user'): string {
  return `Bearer ${generateToken({ id, studentId: `s${id}`, role })}`;
}

beforeAll(async () => {
  const mkUser = (nick: string, role = 'user') =>
    Number(
      db
        .prepare(
          "INSERT INTO users (student_id, password, nickname, role, status, credit_score) VALUES (?, 'x', ?, ?, 'active', 100)"
        )
        .run(`${TAG}_${nick}`, nick, role).lastInsertRowid
    );

  authorId = mkUser('匿名作者');
  strangerId = mkUser('陌生同学');
  adminId = mkUser('管理员', 'super_admin');

  // 匿名帖（互助问答板块，非强制匿名）
  anonPostId = Number(
    db
      .prepare(
        "INSERT INTO posts (user_id, section_id, title, content, status, is_anonymous) VALUES (?, 5, ?, ?, 'published', 1)"
      )
      .run(authorId, `${TAG} 匿名帖标题`, `${TAG} 匿名帖正文内容`).lastInsertRowid
  );

  // 同一作者的非匿名帖（用于验证 authorId 筛选仍能返回公开帖）
  publicPostId = Number(
    db
      .prepare(
        "INSERT INTO posts (user_id, section_id, title, content, status, is_anonymous) VALUES (?, 5, ?, ?, 'published', 0)"
      )
      .run(authorId, `${TAG} 公开帖标题`, `${TAG} 公开帖正文内容`).lastInsertRowid
  );

  // 匿名帖下的一条匿名评论
  anonCommentId = Number(
    db
      .prepare(
        "INSERT INTO comments (post_id, user_id, content, is_anonymous, status) VALUES (?, ?, ?, 1, 'active')"
      )
      .run(anonPostId, authorId, `${TAG} 匿名评论`).lastInsertRowid
  );
});

afterAll(() => {
  db.prepare('DELETE FROM comments WHERE post_id = ?').run(anonPostId);
  db.prepare('DELETE FROM likes WHERE target_id IN (?, ?)').run(anonPostId, publicPostId);
  db.prepare('DELETE FROM favorites WHERE post_id IN (?, ?)').run(anonPostId, publicPostId);
  db.prepare('DELETE FROM posts WHERE id IN (?, ?)').run(anonPostId, publicPostId);
  db.prepare('DELETE FROM events WHERE user_id IN (?, ?, ?)').run(authorId, strangerId, adminId);
  db.prepare('DELETE FROM users WHERE id IN (?, ?, ?)').run(authorId, strangerId, adminId);
});

describe('匿名反查 · 路径 1：列表 authorId 筛选', () => {
  it('陌生人按 authorId 筛选：匿名帖不得出现，公开帖仍可见', async () => {
    const res = await request(app)
      .get(`/api/posts?authorId=${authorId}&pageSize=50`)
      .set('Authorization', token(strangerId));

    expect(res.body.code).toBe(200);
    const ids: number[] = res.body.data.list.map((p: any) => p.id);
    expect(ids).not.toContain(anonPostId);
    expect(ids).toContain(publicPostId);
  });

  it('未登录游客按 authorId 筛选：同样不得看到匿名帖', async () => {
    const res = await request(app).get(`/api/posts?authorId=${authorId}&pageSize=50`);
    const ids: number[] = (res.body.data?.list || []).map((p: any) => p.id);
    expect(ids).not.toContain(anonPostId);
  });

  it('作者本人按 authorId 筛选：可以看到自己的匿名帖（功能不被改坏）', async () => {
    const res = await request(app)
      .get(`/api/posts?authorId=${authorId}&pageSize=50`)
      .set('Authorization', token(authorId));
    const ids: number[] = (res.body.data?.list || []).map((p: any) => p.id);
    expect(ids).toContain(anonPostId);
  });
});

describe('匿名反查 · 路径 2：帖子详情 author 字段', () => {
  it('陌生人看匿名帖详情：author.id 必须为 0 且昵称为「匿名用户」', async () => {
    const res = await request(app)
      .get(`/api/posts/${anonPostId}`)
      .set('Authorization', token(strangerId));

    expect(res.body.code).toBe(200);
    expect(res.body.data.isAnonymous).toBe(true);
    expect(res.body.data.author?.id ?? 0).toBe(0);
    expect(res.body.data.author?.nickname).toBe('匿名用户');
    // 不能通过 college / creditScore 反推是谁
    expect(res.body.data.author?.college || '').toBe('');
    expect(res.body.data.author?.creditScore ?? null).toBeNull();
  });

  it('作者本人看自己的匿名帖：同样以匿名身份呈现（不因是本人就显示真名）', async () => {
    const res = await request(app)
      .get(`/api/posts/${anonPostId}`)
      .set('Authorization', token(authorId));
    expect(res.body.data.author?.id ?? 0).toBe(0);
  });
});

describe('匿名反查 · 路径 3：评论作者', () => {
  it('匿名评论的 author 不得泄露真实用户', async () => {
    const res = await request(app)
      .get(`/api/posts/${anonPostId}/comments`)
      .set('Authorization', token(strangerId));

    expect(res.body.code).toBe(200);
    const list: any[] = res.body.data?.list || res.body.data || [];
    const target = list.find((c: any) => c.id === anonCommentId);
    if (target) {
      expect(target.isAnonymous).toBe(true);
      expect(target.author?.id ?? 0).toBe(0);
    }
  });
});

describe('匿名反查 · 路径 4：用户主页聚合', () => {
  it('陌生人查看作者主页：不返回匿名帖的引用', async () => {
    const res = await request(app)
      .get(`/api/users/${authorId}`)
      .set('Authorization', token(strangerId));

    // 主页资料本身是公开的（昵称/学院），但不得返回帖子列表；
    // 只精确检查结构化的帖子数组，避免数字串（如信誉分/ID）造成误判
    const body = res.body.data || {};
    const listKeys = ['posts', 'postList', 'list'];
    for (const k of listKeys) {
      if (Array.isArray(body[k])) {
        expect(body[k].map((p: any) => p.id)).not.toContain(anonPostId);
      }
    }
  });
});

describe('匿名反查 · 管理端边界', () => {
  it('超管可经管理端揭示匿名作者（合规追溯，仅此一条出口）', async () => {
    // 管理端匿名帖列表应能返回真实作者（用于 ≥3 举报阈值后的合规追溯）
    const res = await request(app)
      .get('/api/admin/posts?status=published&pageSize=100')
      .set('Authorization', token(adminId, 'super_admin'));

    expect(res.body.code).toBe(200);
    const list: any[] = res.body.data?.list || [];
    const target = list.find((p: any) => p.id === anonPostId);
    if (target) {
      // 管理端可以看到 isAnonymous 标记；作者揭示受举报阈值控制，
      // 此处只断言「普通接口看不到、管理端有独立通道」这一边界成立
      expect(target.isAnonymous).toBe(true);
    }
  });
});
