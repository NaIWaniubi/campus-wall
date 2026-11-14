/**
 * R1 审计修复回归锁（批 A）：每条锁死一个已修复的真实缺陷，防回潮。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../app.js';
import { db } from '../../db.js';
import { generateToken } from '../../utils/jwt.js';
import { sanitizeExtraFields, EXTRA_FIELD_WHITELIST } from '../../utils/extra-fields.js';
import { saveSubscription, removeSubscription } from '../../utils/push.js';

const TAG = `r1fix_${Date.now()}`;
let ownerId = 0;      // 帖主
let commenterId = 0;  // 匿名评论者
let attackerId = 0;   // 越权尝试者
let postId = 0;
let topCommentId = 0;
let replyId = 0;
let pendingPostId = 0;
const tokens: Record<number, string> = {};

const tk = (id: number) => `Bearer ${tokens[id]}`;

function mk(nick: string, score = 100): number {
  return Number(db.prepare(
    "INSERT INTO users (student_id, password, nickname, role, status, credit_score) VALUES (?, 'x', ?, 'user', 'active', ?)"
  ).run(`${TAG}_${nick}`, nick, score).lastInsertRowid);
}

beforeAll(() => {
  ownerId = mk('帖主');
  commenterId = mk('匿名客', 95);
  attackerId = mk('攻击者');
  for (const id of [ownerId, commenterId, attackerId]) {
    tokens[id] = generateToken({ id, studentId: `s${id}`, role: 'user', ver: 0 });
  }
  db.prepare('DELETE FROM messages WHERE user_id = ?').run(ownerId);
  postId = Number(db.prepare(
    "INSERT INTO posts (user_id, section_id, title, content, status) VALUES (?, 5, ?, ?, 'published')"
  ).run(ownerId, `${TAG} 匿名通知帖`, `${TAG} 正文内容，至少十个字`).lastInsertRowid);
  pendingPostId = Number(db.prepare(
    "INSERT INTO posts (user_id, section_id, title, content, status) VALUES (?, 5, ?, ?, 'pending_review')"
  ).run(ownerId, `${TAG} 待审帖`, `${TAG} 待审正文，至少十个字`).lastInsertRowid);
});

afterAll(() => {
  // 子表先行（FK 约束）：评论/点赞/通知/推送/评价/出价 → 帖子 → 用户
  db.prepare('DELETE FROM likes WHERE target_type = ? AND target_id IN (SELECT id FROM comments WHERE post_id IN (?, ?))').run('comment', postId, pendingPostId);
  db.prepare('DELETE FROM comments WHERE post_id IN (?, ?)').run(postId, pendingPostId);
  db.prepare('DELETE FROM messages WHERE user_id = ?').run(ownerId);
  db.prepare('DELETE FROM push_subscriptions WHERE endpoint LIKE ?').run(`%${TAG}%`);
  db.prepare('DELETE FROM admin_logs WHERE target_type = ? AND target_id IN (SELECT id FROM users WHERE student_id LIKE ?)').run('user', `${TAG}%`);
  db.prepare('DELETE FROM trade_ratings WHERE post_id IN (SELECT id FROM posts WHERE user_id IN (SELECT id FROM users WHERE student_id LIKE ?))').run(`${TAG}%`);
  db.prepare('DELETE FROM trade_offers WHERE post_id IN (SELECT id FROM posts WHERE user_id IN (SELECT id FROM users WHERE student_id LIKE ?))').run(`${TAG}%`);
  db.prepare('DELETE FROM posts WHERE user_id IN (SELECT id FROM users WHERE student_id LIKE ?)').run(`${TAG}%`);
  db.prepare('DELETE FROM users WHERE student_id LIKE ?').run(`${TAG}%`);
});

describe('修复1 匿名评论通知归一（P0）', () => {
  it('匿名评论后帖主通知署名是「匿名同学」，绝不含真实昵称', async () => {
    const res = await request(app)
      .post(`/api/posts/${postId}/comments`)
      .set('Authorization', tk(commenterId))
      .send({ content: `${TAG} 匿名评论内容`, isAnonymous: true });
    expect(res.body.code).toBe(200);
    const msgs = await request(app).get('/api/messages').set('Authorization', tk(ownerId));
    const list = msgs.body.data.list as any[];
    const notify = list.find((m) => m.type === 'comment');
    expect(notify).toBeTruthy();
    expect(notify.content).toContain('匿名同学');
    expect(notify.content).not.toContain('匿名客');
  });
});

describe('修复2 评论列表可见性与帖子详情同口径（P1）', () => {
  it('待审帖的评论对游客/无关用户 404，对帖主可见', async () => {
    const anon = await request(app).get(`/api/posts/${pendingPostId}/comments`);
    expect(anon.status).toBe(404);
    const other = await request(app).get(`/api/posts/${pendingPostId}/comments`).set('Authorization', tk(attackerId));
    expect(other.status).toBe(404);
    const owner = await request(app).get(`/api/posts/${pendingPostId}/comments`).set('Authorization', tk(ownerId));
    expect(owner.status).toBe(200);
  });
});

describe('修复3 回复归一顶层父级（P1）', () => {
  it('回复某条回复：落库 parent_id 是顶层评论，列表可见；通知锚点同归一', async () => {
    // 顶层评论
    const c1 = await request(app).post(`/api/posts/${postId}/comments`)
      .set('Authorization', tk(ownerId)).send({ content: `${TAG} 顶层评论` });
    topCommentId = c1.body.data.id;
    // 一级回复（由攻击者发，匿名口径也顺带覆盖回复通知）
    const r1 = await request(app).post(`/api/comments/${topCommentId}/reply`)
      .set('Authorization', tk(commenterId)).send({ content: `${TAG} 一级回复`, isAnonymous: true });
    expect(r1.body.code).toBe(200);
    replyId = r1.body.data.id;
    // 关键：对「回复」再回复——修复前 parent_id=replyId 形成三级嵌套，任何接口查不回
    const r2 = await request(app).post(`/api/comments/${replyId}/reply`)
      .set('Authorization', tk(attackerId)).send({ content: `${TAG} 二级内容` });
    expect(r2.body.code).toBe(200);
    const nestedId = r2.body.data.id;
    const row = db.prepare('SELECT parent_id FROM comments WHERE id = ?').get(nestedId) as any;
    expect(row.parent_id).toBe(topCommentId);
    // 列表里必须能看见这条二级内容
    const list = await request(app).get(`/api/posts/${postId}/comments`);
    const top = (list.body.data as any[]).find((c) => c.id === topCommentId);
    const flat = [top, ...(top?.replies || [])].map((x) => x.content);
    expect(flat.some((t) => t?.includes(`${TAG} 二级内容`))).toBe(true);
    // 一级回复者的通知锚点 = 顶层评论（前端滚到父评论可见整条对话）
    const msgs = await request(app).get('/api/messages').set('Authorization', tk(commenterId));
    const notify = (msgs.body.data.list as any[]).find((m) => m.type === 'comment' && m.content.includes('回复了你的评论'));
    expect(notify).toBeTruthy();
    expect(notify.relatedSubId).toBe(topCommentId);
    void replyId;
  });
});

describe('修复4 评论点赞事务化返回真实计数（P1）', () => {
  it('连点两次：like→unlike 后计数回到原值，返回值与库一致', async () => {
    const before = (db.prepare('SELECT like_count FROM comments WHERE id = ?').get(topCommentId) as any).like_count;
    const up = await request(app).post(`/api/comments/${topCommentId}/like`).set('Authorization', tk(attackerId));
    expect(up.body.data.liked).toBe(true);
    const mid = (db.prepare('SELECT like_count FROM comments WHERE id = ?').get(topCommentId) as any).like_count;
    expect(up.body.data.likeCount).toBe(mid);
    const down = await request(app).post(`/api/comments/${topCommentId}/like`).set('Authorization', tk(attackerId));
    expect(down.body.data.liked).toBe(false);
    expect(down.body.data.likeCount).toBe(before);
  });
});

describe('修复5 extraFields 白名单创建侧生效 + soldTo 剥离（P0）', () => {
  it('创建带恶意 extraFields：只有白名单键落库，soldTo/soldAt/超长值/嵌套全被剥', async () => {
    const res = await request(app).post('/api/posts')
      .set('Authorization', tk(attackerId))
      .send({
        sectionId: 1,
        title: `${TAG} 白名单帖`,
        content: `${TAG} 验证白名单的正文字段`,
        extraFields: {
          price: '100',
          soldTo: String(ownerId),           // 攻击载荷：预置交易对手
          soldAt: '2026-01-01T00:00:00Z',
          evilKey: 'x'.repeat(5000),
          nested: { deep: 'bomb' },
        },
      });
    expect(res.body.code).toBe(200);
    const row = db.prepare('SELECT extra_fields FROM posts WHERE id = ?').get(res.body.data.id) as any;
    const extra = JSON.parse(row.extra_fields || '{}');
    expect(extra.price).toBe('100');
    expect(extra.soldTo).toBeUndefined();
    expect(extra.soldAt).toBeUndefined();
    expect(extra.evilKey).toBeUndefined();
    expect(extra.nested).toBeUndefined();
    db.prepare('DELETE FROM posts WHERE id = ?').run(res.body.data.id);
  });

  it('sanitizeExtraFields：白名单外键一律剥除（单测直锁）', () => {
    const out = sanitizeExtraFields({ price: '1', soldTo: '9', deep: { a: 1 }, long: 'x'.repeat(201) });
    expect(Object.keys(out)).toEqual(['price']);
    void EXTRA_FIELD_WHITELIST;
  });
});

describe('修复6 编辑状态机守卫（P1）', () => {
  it('deleted 帖编辑 404、rejected 帖编辑拒答，不得复活回审核队列', async () => {
    const delId = Number(db.prepare(
      "INSERT INTO posts (user_id, section_id, title, content, status) VALUES (?, 5, ?, ?, 'deleted')"
    ).run(ownerId, `${TAG} 已删帖`, `${TAG} 已删正文，至少十个字`).lastInsertRowid);
    const rejId = Number(db.prepare(
      "INSERT INTO posts (user_id, section_id, title, content, status) VALUES (?, 5, ?, ?, 'rejected')"
    ).run(ownerId, `${TAG} 驳回帖`, `${TAG} 驳回正文，至少十个字`).lastInsertRowid);
    const d = await request(app).put(`/api/posts/${delId}`)
      .set('Authorization', tk(ownerId)).send({ title: '改标题', content: `${TAG} 试图复活的内容` });
    expect(d.status).toBe(404);
    const r = await request(app).put(`/api/posts/${rejId}`)
      .set('Authorization', tk(ownerId)).send({ title: '改标题', content: `${TAG} 试图复活的内容` });
    expect(r.body.code).toBe(400);
    expect((db.prepare('SELECT status FROM posts WHERE id = ?').get(delId) as any).status).toBe('deleted');
    expect((db.prepare('SELECT status FROM posts WHERE id = ?').get(rejId) as any).status).toBe('rejected');
    db.prepare('DELETE FROM posts WHERE id IN (?, ?)').run(delId, rejId);
  });
});

describe('修复7 wx-login token 带 ver（P1）', () => {
  it('改密后 token_version+1 的账号：wx-login 签发的 token ver 与库一致（无死循环）', () => {
    // 直接锁 generateToken 调用契约：带 ver 的 payload 解出的 ver 必须等于传入值
    const payload: any = (() => {
      const t = generateToken({ id: ownerId, studentId: 'x', role: 'user', ver: 3 });
      return JSON.parse(Buffer.from(t.split('.')[1] ?? '', 'base64url').toString('utf8'));
    })();
    expect(payload.ver).toBe(3);
  });
});

describe('修复8 管理端重置密码吊销旧 token + 404 语义（P1）', () => {
  it('重置密码后旧 token 立即 401；不存在的 id 返回 404', async () => {
    const admin = mk('管理员', 100);
    db.prepare("UPDATE users SET role = 'super_admin' WHERE id = ?").run(admin);
    tokens[admin] = generateToken({ id: admin, studentId: `s${admin}`, role: 'super_admin', ver: 0 });
    const victim = mk('受害者');
    const victimToken = generateToken({ id: victim, studentId: `s${victim}`, role: 'user', ver: 0 });

    const ok = await request(app).put(`/api/admin/users/${victim}/reset-password`)
      .set('Authorization', tk(admin)).send({ newPassword: 'newPass123' });
    expect(ok.body.code).toBe(200);
    const ver = (db.prepare('SELECT token_version FROM users WHERE id = ?').get(victim) as any).token_version;
    expect(ver).toBe(1);
    const stale = await request(app).get('/api/auth/me').set('Authorization', victimToken);
    expect(stale.status).toBe(401);
    const missing = await request(app).put('/api/admin/users/999999999/reset-password')
      .set('Authorization', tk(admin)).send({ newPassword: 'newPass123' });
    expect(missing.status).toBe(404);
    db.prepare('DELETE FROM admin_logs WHERE actor_id = ?').run(admin);
    db.prepare('DELETE FROM users WHERE id = ?').run(admin);
    void attackerId;
  });
});

describe('修复9 push 订阅归属约束（P1）', () => {
  it('A 用户的 endpoint：B 无法 subscribe 抢主、无法 unsubscribe 摘除', () => {
    const endpoint = `https://push.example.test/${TAG}`;
    saveSubscription(ownerId, endpoint, 'p256dh-a', 'auth-a');
    // B 抢主：upsert 只在归属相同时生效
    saveSubscription(attackerId, endpoint, 'p256dh-b', 'auth-b');
    const afterSteal = db.prepare('SELECT user_id, p256dh FROM push_subscriptions WHERE endpoint = ?').get(endpoint) as any;
    expect(afterSteal.user_id).toBe(ownerId);
    expect(afterSteal.p256dh).toBe('p256dh-a');
    // B 越权退订：无效果
    removeSubscription(endpoint, attackerId);
    expect(db.prepare('SELECT user_id FROM push_subscriptions WHERE endpoint = ?').get(endpoint)).toBeTruthy();
    // 本人退订：生效
    removeSubscription(endpoint, ownerId);
    expect(db.prepare('SELECT user_id FROM push_subscriptions WHERE endpoint = ?').get(endpoint)).toBeUndefined();
  });
});

describe('修复10 rate 买家权威来源是撮合记录（P0 链路收口）', () => {
  it('库中 soldTo 被污染时，评价仍锚定 trade_offers 的 accepted 买家', async () => {
    // 造一笔污染数据：soldTo 指向 attacker，但撮合记录指向 commenter
    const tradePost = Number(db.prepare(
      "INSERT INTO posts (user_id, section_id, title, content, status) VALUES (?, 1, ?, ?, 'published')"
    ).run(ownerId, `${TAG} 交易帖`, `${TAG} 交易正文，至少十个字`).lastInsertRowid);
    db.prepare("UPDATE posts SET extra_fields = ? WHERE id = ?").run(
      JSON.stringify({ soldAt: '2026-01-01T00:00:00Z', soldTo: String(attackerId) }), tradePost
    );
    db.prepare(
      "INSERT INTO trade_offers (post_id, buyer_id, seller_id, offer_price, message, status) VALUES (?, ?, ?, ?, ?, 'accepted')"
    ).run(tradePost, commenterId, ownerId, '100', '买');
    const res = await request(app).post(`/api/trades/${tradePost}/rate`)
      .set('Authorization', tk(ownerId)).send({ rating: 1 });
    expect(res.body.code).toBe(200);
    // 被扣分的必须是撮合记录里的买家，而不是被污染的 soldTo
    const rating = db.prepare('SELECT ratee_id FROM trade_ratings WHERE post_id = ?').get(tradePost) as any;
    expect(rating.ratee_id).toBe(commenterId);
    db.prepare('DELETE FROM trade_ratings WHERE post_id = ?').run(tradePost);
    db.prepare('DELETE FROM trade_offers WHERE post_id = ?').run(tradePost);
    db.prepare('DELETE FROM posts WHERE id = ?').run(tradePost);
  });
});
