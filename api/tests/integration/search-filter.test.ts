/**
 * 搜索筛选器集成回归（第二轮工作流审查 P1）：
 *
 * 原问题：GET /api/search 只解析 keyword/page，
 * 前端 SearchPage 传的 sectionId（板块筛选）与 sort（最新/热门）是死参数，
 * SQL 恒按 created_at DESC 返回全部板块结果 → 筛选器是摆设。
 *
 * 修复后：sectionId>0 过滤板块；sort=hot 按热度分（HN 公式）排序。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../app.js';
import { db } from '../../db.js';
import bcrypt from 'bcryptjs';

let uid = 0;
let secA = 0;
let secB = 0;
let hotPostId = 0;
let coldPostId = 0;
const KW = 'xyqfilter';

beforeAll(() => {
  const sid = 'sfilter' + String(Date.now()).slice(-6);
  uid = Number(
    db
      .prepare(
        "INSERT INTO users (student_id, password, nickname, role, status, credit_score) VALUES (?, ?, '筛选测试用户', 'user', 'active', 100)"
      )
      .run(sid, bcrypt.hashSync('pass12345', 10)).lastInsertRowid
  );
  secA = Number(
    db.prepare("INSERT INTO sections (name, icon, sort, is_active) VALUES ('筛选板块A', 'book', 90, 1)").run().lastInsertRowid
  );
  secB = Number(
    db.prepare("INSERT INTO sections (name, icon, sort, is_active) VALUES ('筛选板块B', 'book', 91, 1)").run().lastInsertRowid
  );
  hotPostId = Number(
    db
      .prepare(
        "INSERT INTO posts (user_id, section_id, title, content, status, is_anonymous, like_count, comment_count, created_at) VALUES (?, ?, ?, ?, 'published', 0, 50, 30, datetime('now', '-2 hours'))"
      )
      .run(uid, secA, `${KW} 热帖`, '热度最高的测试帖', ).lastInsertRowid
  );
  coldPostId = Number(
    db
      .prepare(
        "INSERT INTO posts (user_id, section_id, title, content, status, is_anonymous, like_count, comment_count, created_at) VALUES (?, ?, ?, ?, 'published', 0, 0, 0, datetime('now', '-40 days'))"
      )
      .run(uid, secB, `${KW} 冷帖`, '很久之前的测试帖').lastInsertRowid
  );
});

afterAll(() => {
  db.prepare('DELETE FROM posts WHERE id IN (?, ?)').run(hotPostId, coldPostId);
  db.prepare('DELETE FROM sections WHERE id IN (?, ?)').run(secA, secB);
  db.prepare('DELETE FROM users WHERE id = ?').run(uid);
});

describe('GET /api/search 筛选器（sectionId + sort）', () => {
  it('不带筛选：两个板块的帖都能搜到', async () => {
    const res = await request(app).get('/api/search').query({ keyword: KW });
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(200);
    const ids = (res.body.data.list as any[]).map((p) => p.id);
    expect(ids).toContain(hotPostId);
    expect(ids).toContain(coldPostId);
  });

  it('sectionId 过滤：只返回目标板块的帖子', async () => {
    const res = await request(app)
      .get('/api/search')
      .query({ keyword: KW, sectionId: secA });
    expect(res.status).toBe(200);
    const ids = (res.body.data.list as any[]).map((p) => p.id);
    expect(ids).toContain(hotPostId);
    expect(ids).not.toContain(coldPostId);
    // total 也应随过滤收窄
    expect(res.body.data.total).toBe(1);
  });

  it('sort=hot：热度高的帖子排在前（而非时间倒序）', async () => {
    const res = await request(app).get('/api/search').query({ keyword: KW, sort: 'hot' });
    expect(res.status).toBe(200);
    const ids = (res.body.data.list as any[]).map((p) => p.id);
    // hotPost 2 小时前发布且 50 赞 30 评；coldPost 40 天前 0 赞 → 热度分远高
    expect(ids.indexOf(hotPostId)).toBeLessThan(ids.indexOf(coldPostId));
  });

  it('sort=new（默认）：时间倒序不变', async () => {
    const res = await request(app).get('/api/search').query({ keyword: KW, sort: 'new' });
    expect(res.status).toBe(200);
    const ids = (res.body.data.list as any[]).map((p) => p.id);
    expect(ids.indexOf(hotPostId)).toBeLessThan(ids.indexOf(coldPostId));
  });

  it('sectionId + hot 组合过滤生效', async () => {
    const res = await request(app)
      .get('/api/search')
      .query({ keyword: KW, sectionId: secB, sort: 'hot' });
    expect(res.status).toBe(200);
    const ids = (res.body.data.list as any[]).map((p) => p.id);
    expect(ids).toEqual([coldPostId]);
  });

  it('sectionId=0 / 缺省等价于全部板块', async () => {
    const r0 = await request(app).get('/api/search').query({ keyword: KW, sectionId: 0 });
    expect(r0.status).toBe(200);
    const ids = (r0.body.data.list as any[]).map((p) => p.id);
    expect(ids).toContain(hotPostId);
    expect(ids).toContain(coldPostId);
  });
});
