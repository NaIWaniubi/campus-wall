/**
 * 撮合引擎与意向出价闭环 · 集成测试
 * 直接读写测试数据（带唯一前缀，测试完成后清理），验证：
 * - FTS5 触发器同步与全文搜索端点
 * - 智能雷达相似帖匹配
 * - 出价创建/接受排他锁定/拒绝/取消/交易完成收口
 */
import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../app.js';
import { db } from '../../db.js';
import { generateToken } from '../../utils/jwt.js';

const TAG = `ztest_${Date.now()}`;
const createdUserIds: number[] = [];
const createdPostIds: number[] = [];

function createUser(nickname: string, role = 'user'): number {
  const result = db.prepare(`
    INSERT INTO users (student_id, password, nickname, role, status, credit_score)
    VALUES (?, 'x', ?, ?, 'active', 100)
  `).run(`${TAG}_${nickname}`, nickname, role);
  const id = result.lastInsertRowid as number;
  createdUserIds.push(id);
  return id;
}

function createPost(userId: number, sectionId: number, title: string, content: string, direction?: string): number {
  const extra = direction ? JSON.stringify({ direction }) : '{}';
  const result = db.prepare(`
    INSERT INTO posts (user_id, section_id, title, content, status, extra_fields)
    VALUES (?, ?, ?, ?, 'published', ?)
  `).run(userId, sectionId, title, content, extra);
  const id = result.lastInsertRowid as number;
  createdPostIds.push(id);
  return id;
}

function auth(userId: number): string {
  return `Bearer ${generateToken({ id: userId, studentId: String(userId), role: 'user' })}`;
}

afterAll(() => {
  // 清理测试数据（FTS 触发器同步删除倒排索引）
  // 先删引用 posts 的子表（trade_ratings / trade_offers / messages），否则外键约束失败
  for (const id of createdPostIds) {
    db.prepare('DELETE FROM trade_ratings WHERE post_id = ?').run(id);
    db.prepare('DELETE FROM trade_offers WHERE post_id = ?').run(id);
    db.prepare('DELETE FROM messages WHERE related_id = ?').run(id);
    db.prepare('DELETE FROM posts WHERE id = ?').run(id);
  }
  for (const id of createdUserIds) {
    db.prepare('DELETE FROM trade_ratings WHERE rater_id = ? OR ratee_id = ?').run(id, id);
    db.prepare('DELETE FROM events WHERE user_id = ?').run(id);
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
  }
});

describe('撮合引擎与意向出价闭环 · 集成', () => {
  // 种子数据：失物招领板块，买家/卖家/第三方三个用户
  const lfSection = db.prepare("SELECT id FROM sections WHERE name LIKE '%失物%'").get() as any;
  const sectionId = lfSection.id;

  const seller = createUser('卖家甲');
  const buyerA = createUser('买家乙');
  const buyerB = createUser('买家丙');

  const lostPost = createPost(buyerA, sectionId, `一教B栋丢了蓝牙耳机 ${TAG}`, `昨天下午在一教B栋203教室丢了黑色蓝牙耳机一副，${TAG}`, 'lost');
  const foundPost = createPost(seller, sectionId, `一教B栋捡到蓝牙耳机 ${TAG}`, `今天在一教B栋203教室捡到黑色蓝牙耳机，${TAG}`, 'found');

  it('FTS5 触发器同步：发布的帖子可被全文搜索命中', async () => {
    const res = await request(app).get(`/api/posts?keyword=${TAG}&pageSize=10`);
    expect(res.status).toBe(200);
    const titles: string[] = res.body.data.list.map((p: any) => p.title);
    expect(titles.some((t) => t.includes('丢了蓝牙耳机'))).toBe(true);
    expect(titles.some((t) => t.includes('捡到蓝牙耳机'))).toBe(true);
  });

  it('FTS5 触发器同步：软删除/更新帖子后索引同步（更新标题后可搜新标题）', async () => {
    db.prepare('UPDATE posts SET title = ? WHERE id = ?').run(`一教B栋丢失黑色耳机 ${TAG}`, lostPost);
    const res = await request(app).get(`/api/posts?keyword=丢失黑色耳机&pageSize=10`);
    expect(res.status).toBe(200);
    const titles: string[] = res.body.data.list.map((p: any) => p.title);
    expect(titles.some((t) => t.includes('丢失黑色耳机'))).toBe(true);
  });

  it('智能雷达：寻物帖能匹配到反向方向的高相似招领帖', async () => {
    const res = await request(app).get(`/api/posts/${lostPost}/radar`);
    expect(res.status).toBe(200);
    expect(res.body.data.threshold).toBe(60);
    const matchIds: number[] = res.body.data.matches.map((m: any) => m.postId);
    expect(matchIds).toContain(foundPost);
  });

  it('买家发起出价 → 卖家接受 → 排他锁定（其他 pending 自动拒绝）', async () => {
    // 二手交易板块种子帖
    const tradeSection = db.prepare("SELECT id FROM sections WHERE name LIKE '%二手%'").get() as any;
    const salePost = createPost(seller, tradeSection.id, `出一辆二手自行车 ${TAG}`, `9成新，${TAG}，标价300`);

    // 买家A、买家B先后出价
    const offerA = await request(app)
      .post(`/api/trades/${salePost}/offers`)
      .set('Authorization', auth(buyerA))
      .send({ offerPrice: 260, message: '可一教自提' });
    expect(offerA.status).toBe(200);
    expect(offerA.body.code).toBe(200);
    expect(offerA.body.data.status).toBe('pending');

    const offerB = await request(app)
      .post(`/api/trades/${salePost}/offers`)
      .set('Authorization', auth(buyerB))
      .send({ offerPrice: 280 });
    expect(offerB.status).toBe(200);

    // 重复出价被拒
    const dup = await request(app)
      .post(`/api/trades/${salePost}/offers`)
      .set('Authorization', auth(buyerA))
      .send({ offerPrice: 270 });
    expect(dup.body.code).toBe(400);

    // 非卖家不能接受
    const notSeller = await request(app)
      .post(`/api/trades/offers/${offerA.body.data.id}/accept`)
      .set('Authorization', auth(buyerA));
    expect(notSeller.body.code).toBe(403);

    // 卖家接受买家B的出价
    const accept = await request(app)
      .post(`/api/trades/offers/${offerB.body.data.id}/accept`)
      .set('Authorization', auth(seller));
    expect(accept.status).toBe(200);
    expect(accept.body.data.status).toBe('accepted');

    // 排他锁定：买家A 的 pending 出价被自动拒绝
    const list = await request(app)
      .get(`/api/trades/${salePost}/offers`)
      .set('Authorization', auth(seller));
    const statuses = Object.fromEntries(list.body.data.offers.map((o: any) => [o.id, o.status]));
    expect(statuses[offerA.body.data.id]).toBe('rejected');
    expect(statuses[offerB.body.data.id]).toBe('accepted');

    // 接受后其他买家不能再出价
    const blocked = await request(app)
      .post(`/api/trades/${salePost}/offers`)
      .set('Authorization', auth(buyerA))
      .send({ offerPrice: 290 });
    expect(blocked.body.code).toBe(400);

    // 标记交易完成 → 已锁定出价收口为 completed
    const complete = await request(app)
      .post(`/api/trades/${salePost}/complete`)
      .set('Authorization', auth(seller))
      .send({ buyerId: buyerB });
    expect(complete.status).toBe(200);

    const after = await request(app)
      .get(`/api/trades/${salePost}/offers`)
      .set('Authorization', auth(seller));
    const finalStatuses = Object.fromEntries(after.body.data.offers.map((o: any) => [o.id, o.status]));
    expect(finalStatuses[offerB.body.data.id]).toBe('completed');
  });

  it('买家可取消待确认出价，卖家可拒绝出价', async () => {
    const tradeSection = db.prepare("SELECT id FROM sections WHERE name LIKE '%二手%'").get() as any;
    const post1 = createPost(seller, tradeSection.id, `出一本考研数学 ${TAG}`, `${TAG}，标价20`);
    const post2 = createPost(seller, tradeSection.id, `出一把宿舍雨伞 ${TAG}`, `${TAG}，标价10`);

    const offer1 = await request(app)
      .post(`/api/trades/${post1}/offers`)
      .set('Authorization', auth(buyerA))
      .send({ offerPrice: 15 });
    const cancel = await request(app)
      .post(`/api/trades/offers/${offer1.body.data.id}/cancel`)
      .set('Authorization', auth(buyerA));
    expect(cancel.status).toBe(200);
    expect(cancel.body.data.status).toBe('cancelled');

    const offer2 = await request(app)
      .post(`/api/trades/${post2}/offers`)
      .set('Authorization', auth(buyerB))
      .send({ offerPrice: 8 });
    const reject = await request(app)
      .post(`/api/trades/offers/${offer2.body.data.id}/reject`)
      .set('Authorization', auth(seller));
    expect(reject.status).toBe(200);
    expect(reject.body.data.status).toBe('rejected');
  });

  it('互评权限：交易第三方不能评卖家，卖家不能指定任意用户（防刷信誉分）', async () => {
    const tradeSection = db.prepare("SELECT id FROM sections WHERE name LIKE '%二手%'").get() as any;
    const post = createPost(seller, tradeSection.id, `出一台显示器 ${TAG}`, `${TAG}，标价300`);

    const offer = await request(app)
      .post(`/api/trades/${post}/offers`)
      .set('Authorization', auth(buyerA))
      .send({ offerPrice: 260 });
    await request(app)
      .post(`/api/trades/offers/${offer.body.data.id}/accept`)
      .set('Authorization', auth(seller));
    await request(app)
      .post(`/api/trades/${post}/complete`)
      .set('Authorization', auth(seller))
      .send({});

    // 未参与交易的第三方评卖家 → 403
    const byThird = await request(app)
      .post(`/api/trades/${post}/rate`)
      .set('Authorization', auth(buyerB))
      .send({ rating: 1, comment: '恶意差评' });
    expect(byThird.status).toBe(403);

    // 卖家指定任意第三方为被评人 → 403
    const bySeller = await request(app)
      .post(`/api/trades/${post}/rate`)
      .set('Authorization', auth(seller))
      .send({ targetUserId: buyerB, rating: 5 });
    expect(bySeller.status).toBe(403);

    // 合法双向互评可用
    const buyerRates = await request(app)
      .post(`/api/trades/${post}/rate`)
      .set('Authorization', auth(buyerA))
      .send({ rating: 5, comment: '交易顺利' });
    expect(buyerRates.body.code).toBe(200);

    const sellerRates = await request(app)
      .post(`/api/trades/${post}/rate`)
      .set('Authorization', auth(seller))
      .send({ rating: 5 });
    expect(sellerRates.body.code).toBe(200);
  });

  it('并发接受同一出价只生效一次（CAS 条件更新）', async () => {
    const tradeSection = db.prepare("SELECT id FROM sections WHERE name LIKE '%二手%'").get() as any;
    const post = createPost(seller, tradeSection.id, `出一台旧相机 ${TAG}`, `${TAG}，标价500`);
    const offer = await request(app)
      .post(`/api/trades/${post}/offers`)
      .set('Authorization', auth(buyerA))
      .send({ offerPrice: 420 });

    const offerId = offer.body.data.id;
    const results = await Promise.all([
      request(app).post(`/api/trades/offers/${offerId}/accept`).set('Authorization', auth(seller)),
      request(app).post(`/api/trades/offers/${offerId}/accept`).set('Authorization', auth(seller)),
    ]);
    const succeeded = results.filter((r) => r.body.code === 200);
    const rejected = results.filter((r) => r.body.code !== 200);
    expect(succeeded.length).toBe(1);
    expect(rejected.length).toBe(1);
  });
});
