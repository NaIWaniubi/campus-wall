/**
 * 评论通知直达 · 回归（V5）
 * 断言 messages.related_id=帖子、related_sub_id=顶层评论：
 *   - 直接评论 → 锚到新评论自身
 *   - 楼中楼回复 → 锚到父评论（滚到父评论才看得见整条对话）
 * 通知去重按 (type, related_id, related_sub_id)：同帖不同评论不能互相吞掉。
 */
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../../app.js';
import { db } from '../../db.js';
import { generateToken } from '../../utils/jwt.js';

const TAG = `deeplink_${Date.now()}`;
let authorId = 0;   // 帖主
let commenterId = 0; // 评论者
let thirdId = 0;    // 第三人
let postId = 0;

function token(id: number): string {
  return `Bearer ${generateToken({ id, studentId: `s${id}`, role: 'user' })}`;
}

function mk(nick: string): number {
  return Number(
    db.prepare(
      "INSERT INTO users (student_id, password, nickname, role, status, credit_score) VALUES (?, 'x', ?, 'user', 'active', 100)"
    ).run(`${TAG}_${nick}`, nick).lastInsertRowid
  );
}

beforeAll(() => {
  authorId = mk('帖主');
  commenterId = mk('评论者');
  thirdId = mk('第三人');
  postId = Number(
    db.prepare(
      "INSERT INTO posts (user_id, section_id, title, content, status) VALUES (?, 5, ?, ?, 'published')"
    ).run(authorId, `${TAG} 直达测试帖`, `${TAG} 正文内容，至少十个字`).lastInsertRowid
  );
  db.prepare('DELETE FROM messages WHERE user_id IN (?, ?, ?)').run(authorId, commenterId, thirdId);
});

async function commentBox(userId: number) {
  const res = await request(app).get('/api/messages').set('Authorization', token(userId));
  expect(res.status).toBe(200);
  return res.body.data.list as any[];
}

describe('评论通知直达具体评论', () => {
  let firstCommentId = 0;

  it('直接评论：帖主收到通知，related_id=帖子、relatedSubId=新评论', async () => {
    const res = await request(app)
      .post(`/api/posts/${postId}/comments`)
      .set('Authorization', token(commenterId))
      .send({ content: `${TAG} 这是第一条直接评论` });
    expect(res.status).toBe(200);
    firstCommentId = res.body.data.id;
    expect(firstCommentId).toBeGreaterThan(0);

    const msg = (await commentBox(authorId)).find((m) => m.type === 'comment');
    expect(msg).toBeTruthy();
    expect(msg.postId).toBe(postId);
    expect(msg.relatedSubId).toBe(firstCommentId);
  });

  it('楼中楼回复：父评论作者的锚点是父评论（不是回复本身）', async () => {
    // 帖主先评论一次 → thirdId 回复它 → 帖主应收到 relatedSubId=帖主评论 id
    const mine = await request(app)
      .post(`/api/posts/${postId}/comments`)
      .set('Authorization', token(authorId))
      .send({ content: `${TAG} 帖主自己的评论` });
    expect(mine.status).toBe(200);
    const myCommentId = mine.body.data.id;

    await request(app)
      .post(`/api/comments/${myCommentId}/reply`)
      .set('Authorization', token(thirdId))
      .send({ content: `${TAG} 第三人回复帖主` })
      .expect(200);

    const msg = (await commentBox(authorId)).find((m) => String(m.content).includes('回复了你的评论'));
    expect(msg).toBeTruthy();
    expect(msg.postId).toBe(postId);
    expect(msg.relatedSubId).toBe(myCommentId);
  });

  it('两个不同人评论同一帖 → 两条独立通知（去重按 sub 分键，非按 post）', async () => {
    // 同一用户 10s 内有评论频控，所以用两个评论者；重点验证不同 related_sub_id 不被合并
    const freshPost = Number(
      db.prepare(
        "INSERT INTO posts (user_id, section_id, title, content, status) VALUES (?, 5, ?, ?, 'published')"
      ).run(authorId, `${TAG} 去重测试帖`, `${TAG} 去重帖正文内容`).lastInsertRowid
    );
    db.prepare('DELETE FROM messages WHERE user_id = ? AND related_id = ?').run(authorId, freshPost);

    const r1 = await request(app).post(`/api/posts/${freshPost}/comments`).set('Authorization', token(commenterId))
      .send({ content: `${TAG} 甲的第一条评论` }).expect(200);
    const r2 = await request(app).post(`/api/posts/${freshPost}/comments`).set('Authorization', token(thirdId))
      .send({ content: `${TAG} 乙的第一条评论` }).expect(200);
    expect(r1.body.data.id).toBeTypeOf('number');
    expect(r2.body.data.id).toBeTypeOf('number');

    const mine = (await commentBox(authorId)).filter((m) => m.postId === freshPost && m.type === 'comment');
    expect(mine.length).toBe(2);
    expect(mine[0]!.relatedSubId).not.toBe(mine[1]!.relatedSubId);
  });
});
