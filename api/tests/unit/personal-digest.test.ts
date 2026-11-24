/**
 * V3-P3 个性化日报规则聚合回归：
 *
 * 1. 订阅板块新帖/评论聚合正确，其他板块与封禁作者内容不混入
 * 2. 最近点赞/评论互动进入个性化摘要与热帖 fallback
 * 3. 空订阅用户回退全站规则版，但保留 personal 标识与引导文案
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../../db.js';
import { ruleDigest, rulePersonalDigest, clearPersonalDigestCacheForTest, getPersonalDigest } from '../../routes/ai.js';

const TAG = `pdigest${Date.now()}`;
let userId = 0;
let emptyUserId = 0;
let bannedUserId = 0;
let sectionId = 0;
let otherSectionId = 0;
let subscribedPostId = 0;
let otherPostId = 0;
let bannedPostId = 0;
let pendingPostId = 0;
let extraPostId = 0;
let commentId = 0;
let likeId = 0;

function insertUser(suffix: string, status = 'active'): number {
  return Number(
    db
      .prepare("INSERT INTO users (student_id, password, nickname, role, status) VALUES (?, 'x', ?, 'user', ?)")
      .run(`${TAG}_${suffix}`, `日报测试${suffix}`, status).lastInsertRowid,
  );
}

function insertSection(name: string): number {
  return Number(
    db
      .prepare("INSERT INTO sections (name, icon, sort, is_active, need_audit) VALUES (?, '📌', 99, 1, 0)")
      .run(name).lastInsertRowid,
  );
}

function insertPost(userId: number, sectionId: number, title: string, status = 'published', likeCount = 0): number {
  return Number(
    db
      .prepare('INSERT INTO posts (user_id, section_id, title, content, status, like_count) VALUES (?, ?, ?, ?, ?, ?)')
      .run(userId, sectionId, title, '这是个性化日报聚合测试内容，用于验证订阅与互动统计。', status, likeCount).lastInsertRowid,
  );
}

beforeAll(() => {
  userId = insertUser('user');
  emptyUserId = insertUser('empty');
  bannedUserId = insertUser('banned', 'banned');
  sectionId = insertSection(`订阅板块${TAG}`);
  otherSectionId = insertSection(`其他板块${TAG}`);
  db.prepare('INSERT INTO subscriptions (user_id, section_id) VALUES (?, ?)').run(userId, sectionId);

  subscribedPostId = insertPost(userId, sectionId, `订阅板块新帖${TAG}`, 'published', 5);
  otherPostId = insertPost(userId, otherSectionId, `其他板块热帖${TAG}`, 'published', 100);
  bannedPostId = insertPost(bannedUserId, sectionId, `封禁作者帖子${TAG}`, 'published', 999);
  pendingPostId = insertPost(userId, sectionId, `待审帖子${TAG}`, 'pending', 999);

  commentId = Number(
    db.prepare("INSERT INTO comments (post_id, user_id, content, status) VALUES (?, ?, ?, 'active')")
      .run(subscribedPostId, userId, `我的互动评论${TAG}`).lastInsertRowid,
  );
  likeId = Number(
    db.prepare("INSERT INTO likes (user_id, target_type, target_id) VALUES (?, 'post', ?)")
      .run(userId, otherPostId).lastInsertRowid,
  );
});

afterAll(() => {
  clearPersonalDigestCacheForTest();
  if (likeId) db.prepare('DELETE FROM likes WHERE id = ?').run(likeId);
  if (commentId) db.prepare('DELETE FROM comments WHERE id = ?').run(commentId);
  if (userId) db.prepare('DELETE FROM subscriptions WHERE user_id = ?').run(userId);
  const postIds = [subscribedPostId, otherPostId, bannedPostId, pendingPostId, extraPostId].filter(Boolean);
  if (postIds.length) db.prepare(`DELETE FROM posts WHERE id IN (${postIds.map(() => '?').join(',')})`).run(...postIds);
  if (sectionId) db.prepare('DELETE FROM sections WHERE id = ?').run(sectionId);
  if (otherSectionId) db.prepare('DELETE FROM sections WHERE id = ?').run(otherSectionId);
  for (const id of [userId, emptyUserId, bannedUserId]) {
    if (id) db.prepare('DELETE FROM users WHERE id = ?').run(id);
  }
});

describe('V3-P3 个性化日报规则聚合', () => {
  it('只统计订阅板块的已发布内容，封禁作者与待审帖不混入', () => {
    const digest = rulePersonalDigest(userId);
    expect(digest.scope).toBe('personal');
    expect(digest.stats).toEqual({ posts: 1, comments: 1 });
    expect(digest.sections).toEqual([{ name: `订阅板块${TAG}`, n: 1 }]);
    expect(digest.hot?.id).toBe(subscribedPostId);
    expect(digest.summary).toContain('你订阅的板块');
    expect(digest.summary).toContain('最近互动过');
  });

  it('缓存过期后按最新订阅与互动重算，不无限续期旧数据', () => {
    clearPersonalDigestCacheForTest();
    const now = Date.now();
    const first = getPersonalDigest(userId, now, false);
    expect(first.stats.posts).toBe(1);

    extraPostId = insertPost(userId, sectionId, `缓存过期新帖${TAG}`, 'published', 1);
    const second = getPersonalDigest(userId, now + 61_000, false);
    expect(second.stats.posts).toBe(2);
    expect(second).not.toBe(first);
  });

  it('空订阅用户回退全站规则版，并给出订阅引导', () => {
    const digest = rulePersonalDigest(emptyUserId);
    const global = ruleDigest();
    expect(digest.scope).toBe('personal');
    expect(digest.stats).toEqual(global.stats);
    expect(digest.summary).toContain('还没有订阅板块');
  });
});
