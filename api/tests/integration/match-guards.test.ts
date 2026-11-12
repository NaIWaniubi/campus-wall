/**
 * 失物关键词匹配器 · 方向与品类守卫回归
 *
 * 历史问题：「捡到校园卡」的「可能相关」里出现了「捡到一串钥匙」——
 * 同方向（都是招领）且不同品类，只因为共用「捡到」二字就被匹配上。
 * 这类噪声会让用户觉得「智能匹配」是假的，必须有回归守住。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../../db.js';
import { findLostFoundMatches } from '../../utils/match.js';

const TAG = `match_${Date.now()}`;
let sectionId = 0;
let userId = 0;
let otherUserId = 0;
const postIds: number[] = [];

function mkPost(title: string, content: string, direction: string, itemType: string, owner?: number): number {
  const id = Number(
    db
      .prepare(
        "INSERT INTO posts (user_id, section_id, title, content, status, extra_fields) VALUES (?, ?, ?, ?, 'published', ?)"
      )
      .run(owner ?? otherUserId, sectionId, title, content, JSON.stringify({ direction, itemType })).lastInsertRowid
  );
  postIds.push(id);
  return id;
}

beforeAll(() => {
  sectionId = (db.prepare("SELECT id FROM sections WHERE name LIKE '%失物%'").get() as any).id;
  userId = Number(
    db
      .prepare(
        "INSERT INTO users (student_id, password, nickname, role, status, credit_score) VALUES (?, 'x', '匹配守卫', 'user', 'active', 100)"
      )
      .run(TAG).lastInsertRowid
  );
  // 候选帖必须来自他人：匹配器会排除「本人的帖子」
  otherUserId = Number(
    db
      .prepare(
        "INSERT INTO users (student_id, password, nickname, role, status, credit_score) VALUES (?, 'x', '匹配候选', 'user', 'active', 100)"
      )
      .run(`${TAG}_other`).lastInsertRowid
  );
});

afterAll(() => {
  for (const id of postIds) db.prepare('DELETE FROM posts WHERE id = ?').run(id);
  db.prepare('DELETE FROM events WHERE user_id IN (?, ?)').run(userId, otherUserId);
  db.prepare('DELETE FROM users WHERE id IN (?, ?)').run(userId, otherUserId);
});

describe('findLostFoundMatches 守卫', () => {
  it('只匹配反方向 + 同品类的帖子', () => {
    const query = mkPost('捡到一张校园卡', '一食堂捡到校园卡', 'found', '校园卡', userId);
    const good = mkPost('丢失校园卡急寻', '图书馆丢了校园卡', 'lost', '校园卡');
    mkPost('在体育馆捡到一串钥匙', '体育馆捡到钥匙', 'found', '钥匙'); // 同方向 + 异品类
    mkPost('丢失雨伞一把', '教学楼丢了雨伞', 'lost', '雨伞'); // 反方向但异品类（不共用关键词则不命中）

    const matches = findLostFoundMatches({
      id: query,
      user_id: userId,
      title: '捡到一张校园卡',
      content: '一食堂捡到校园卡',
      extra_fields: JSON.stringify({ direction: 'found', itemType: '校园卡' }),
    });

    const ids = matches.map((m: any) => m.id);
    expect(ids).toContain(good);
    expect(ids).not.toContain(postIds[2]); // 同方向的钥匙
  });
});
