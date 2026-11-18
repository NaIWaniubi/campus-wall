/**
 * RAG 存活校验回归（第二轮工作流审查 P0）：
 *
 * 原问题：
 * 1. 索引查询不过滤封禁用户 → 封禁用户的帖子仍进检索库并被引用（封禁在 AI 通道失效）
 * 2. 索引只增不减 → 帖子被删/驳回后旧块永久留库，被检索并当成可信引用
 * 3. 检索期不校验来源存活 → 运行期删除的帖子仍在检索结果里
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../../db.js';
import { upsertChunks, deleteBySource, searchByVector } from '../../rag/store.js';
import { EMBED_DIM } from '../../rag/embedder.js';
import bcrypt from 'bcryptjs';

let uid = 0;
let livePostId = 0;
let deadPostId = 0;
let bannedPostId = 0;
let bannedUid = 0;

/** 生成一个确定性单位向量（用于写入测试块） */
function unitVec(seed: number): number[] {
  const v = new Array(EMBED_DIM).fill(0);
  v[seed % EMBED_DIM] = 1;
  return v;
}

beforeAll(() => {
  const sid = 'raglv' + String(Date.now()).slice(-6);
  uid = Number(
    db
      .prepare(
        "INSERT INTO users (student_id, password, nickname, role, status, credit_score) VALUES (?, ?, 'RAG存活测试', 'user', 'active', 100)"
      )
      .run(sid, bcrypt.hashSync('pass12345', 10)).lastInsertRowid
  );
  bannedUid = Number(
    db
      .prepare(
        "INSERT INTO users (student_id, password, nickname, role, status, credit_score, ban_until) VALUES (?, ?, '被封用户', 'user', 'banned', 100, '2099-01-01')"
      )
      .run(sid + 'x', bcrypt.hashSync('pass12345', 10)).lastInsertRowid
  );

  const mk = (owner: number, status: string) =>
    Number(
      db
        .prepare(
          "INSERT INTO posts (user_id, section_id, title, content, status, is_anonymous) VALUES (?, 2, 'RAG存活测试帖', '测试内容 RAG 存活校验', ?, 0)"
        )
        .run(owner, status).lastInsertRowid
    );
  livePostId = mk(uid, 'published');
  deadPostId = mk(uid, 'deleted');
  bannedPostId = mk(bannedUid, 'published');

  upsertChunks([
    { sourceType: 'post', sourceId: livePostId, title: '存活帖', content: '存活帖内容 RAG 存活校验', contentHash: 'h_live_rag_test', embedding: unitVec(1) },
    { sourceType: 'post', sourceId: deadPostId, title: '已删帖', content: '已删帖内容 RAG 存活校验', contentHash: 'h_dead_rag_test', embedding: unitVec(2) },
    { sourceType: 'post', sourceId: bannedPostId, title: '封禁用户帖', content: '封禁帖内容 RAG 存活校验', contentHash: 'h_banned_rag_test', embedding: unitVec(3) },
  ]);
});

afterAll(() => {
  for (const id of [livePostId, deadPostId, bannedPostId]) {
    deleteBySource('post', id);
    db.prepare('DELETE FROM posts WHERE id = ?').run(id);
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(uid);
  db.prepare('DELETE FROM users WHERE id = ?').run(bannedUid);
});

describe('RAG 检索期存活校验', () => {
  it('已删帖的块不进入检索结果', () => {
    const hits = searchByVector(unitVec(2), 10);
    expect(hits.some((h) => h.sourceId === deadPostId)).toBe(false);
  });

  it('封禁用户发的帖不进入检索结果', () => {
    const hits = searchByVector(unitVec(3), 10);
    expect(hits.some((h) => h.sourceId === bannedPostId)).toBe(false);
  });

  it('正常发布的帖仍可被检索到', () => {
    const hits = searchByVector(unitVec(1), 10);
    expect(hits.some((h) => h.sourceId === livePostId)).toBe(true);
  });

  it('帖子在检索前被删除 → 该帖立即从检索结果消失', () => {
    db.prepare("UPDATE posts SET status = 'deleted' WHERE id = ?").run(livePostId);
    const hits = searchByVector(unitVec(1), 10);
    expect(hits.some((h) => h.sourceId === livePostId)).toBe(false);
    // 还原（afterAll 会删）
    db.prepare("UPDATE posts SET status = 'published' WHERE id = ?").run(livePostId);
  });
});
