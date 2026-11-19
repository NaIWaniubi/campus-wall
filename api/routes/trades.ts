/**
 * 二手交易路由：交易完成标记 + 双向互评 + 评分计入信誉分
 */
import { Router } from 'express';
import { db } from '../db.js';
import { authRequired, authOptional } from '../middleware/auth.js';
import { success, fail, forbidden } from '../utils/response.js';
import { upsertNotification } from '../utils/notification.js';
import { cacheInvalidate } from '../utils/cache.js';
import { trackEvent, touchActive } from '../utils/events.js';

const router = Router();

// 信誉分调整规则：好评(4-5星)+2，差评(1-2星)-3，中评(3星)不变；钳制 0-120
const CREDIT_MIN = 0;
const CREDIT_MAX = 120;

function creditDelta(rating: number): number {
  if (rating >= 4) return 2;
  if (rating <= 2) return -3;
  return 0;
}

function getPost(id: number): any {
  return db.prepare(
    `SELECT p.id, p.user_id, p.title, p.status, p.extra_fields, s.name AS section_name
     FROM posts p LEFT JOIN sections s ON s.id = p.section_id
     WHERE p.id = ? AND p.status != 'deleted'`
  ).get(id);
}

/** 交易闭环只对二手交易类板块开放：否则任何帖子都能被"标记成交"，进而给任意用户打星刷/扣信誉分 */
function isTradeSection(sectionName: string | null | undefined): boolean {
  return /二手|交易|闲置|出售|转让/.test(sectionName || '');
}

// 标记交易完成（仅帖子作者；posts.extra_fields 写入 soldAt 与可选 soldTo 买家）
router.post('/trades/:postId/complete', authRequired, (req, res) => {
  const postId = Number(req.params.postId);
  const post = getPost(postId);
  if (!post) return fail(res, '帖子不存在', 404, 404);
  if (post.user_id !== req.currentUser!.id) return forbidden(res, '只有发布者可以标记交易完成');
  if (!isTradeSection(post.section_name)) {
    return fail(res, '仅二手交易板块的帖子可以成交并互评');
  }
  // R3 审查 P2：getPost 只排除 deleted，pending_review/rejected 帖可被标成交 → 审核门被绕过。
  // offers 端点显式要求 published，这里对齐同一门槛。
  if (post.status !== 'published') return fail(res, '帖子不可见或未过审，无法成交', 404, 404);

  const extra = JSON.parse(post.extra_fields || '{}');
  if (extra.soldAt) return fail(res, '该交易已标记完成');
  extra.soldAt = new Date().toISOString();

  // 可选登记买家（供作者后续定向互评）
  const buyerId = Number(req.body?.buyerId);
  if (buyerId) {
    const buyer = db.prepare('SELECT id FROM users WHERE id = ?').get(buyerId);
    if (!buyer) return fail(res, '买家用户不存在', 404, 404);
    if (buyerId === req.currentUser!.id) return fail(res, '买家不能是自己');
    extra.soldTo = buyerId;
  }

  db.prepare('UPDATE posts SET extra_fields = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(
    JSON.stringify(extra), postId
  );
  cacheInvalidate('posts'); // extra_fields 影响列表价格排序与筛选

  // 已锁定的意向出价同步置为已完成（撮合闭环收口）
  db.prepare(
    "UPDATE trade_offers SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE post_id = ? AND status = 'accepted'"
  ).run(postId);

  trackEvent(req.currentUser!.id, 'trade_complete', postId, { soldTo: extra.soldTo ?? null });
  touchActive(req.currentUser!.id);
  success(res, { postId, soldAt: extra.soldAt, soldTo: extra.soldTo ?? null }, '交易已完成');
});

// 当前登录用户对某帖的交易评价状态：是否已评 / 卖家登记的买家
router.get('/trades/:postId/my-rating', authRequired, (req, res) => {
  const postId = Number(req.params.postId);
  const post = getPost(postId);
  if (!post) return fail(res, '帖子不存在', 404, 404);

  const row = db.prepare('SELECT rating FROM trade_ratings WHERE post_id = ? AND rater_id = ?').get(
    postId, req.currentUser!.id
  ) as any;
  const extra = JSON.parse(post.extra_fields || '{}');

  success(res, {
    hasRated: !!row,
    rating: row?.rating ?? null,
    isSold: !!extra.soldAt,
    soldTo: extra.soldTo ?? null,
    isSeller: post.user_id === req.currentUser!.id,
  });
});

// 互评：作者可对指定用户评分一次；其他用户只能对该帖作者评分一次（每人每帖限一次）
router.post('/trades/:postId/rate', authRequired, (req, res) => {
  const postId = Number(req.params.postId);
  const { targetUserId, rating, comment } = req.body;

  const post = getPost(postId);
  if (!post) return fail(res, '帖子不存在', 404, 404);
  if (!isTradeSection(post.section_name)) return fail(res, '仅二手交易板块支持互评');

  // 仅已标记完成的交易可评价
  const extra = JSON.parse(post.extra_fields || '{}');
  if (!extra.soldAt) return fail(res, '交易完成后才能评价');

  // 评价对象必须是交易对手方：卖家只能评登记的买家，买家只能评卖家。
  // 未登记的第三方既不能评卖家（否则可批量扣分），也不能被卖家指定（否则可互刷信誉分）。
  const isAuthor = post.user_id === req.currentUser!.id;

  // 成交买家：唯一权威来源是 trade_offers 的 accepted/completed 记录。
  // extra_fields.soldTo（/complete 写入）仅作提示展示——创建路径白名单修复前的历史数据
  // 可能被客户端预置污染，信任它等于「指定任意人扣信誉分」的刷分通道
  let buyerId = 0;
  const accepted = db.prepare(
    "SELECT buyer_id FROM trade_offers WHERE post_id = ? AND status IN ('accepted','completed') ORDER BY updated_at DESC LIMIT 1"
  ).get(postId) as any;
  buyerId = Number(accepted?.buyer_id) || 0;
  if (!buyerId) return fail(res, '该交易未登记买家，无法评价');
  if (buyerId === post.user_id) return fail(res, '买家与卖家不能是同一人');

  let rateeId: number;
  if (isAuthor) {
    // 卖家评买家：targetUserId 若传入必须与登记买家一致，防止指定任意人刷分
    if (targetUserId !== undefined && Number(targetUserId) !== buyerId) {
      return forbidden(res, '只能评价本单登记的买家');
    }
    rateeId = buyerId;
  } else {
    // 非卖家只有登记买家本人才有评价资格
    if (req.currentUser!.id !== buyerId) return forbidden(res, '只有交易双方可以互评');
    rateeId = post.user_id;
  }
  if (rateeId === req.currentUser!.id) return fail(res, '不能评价自己');

  const score = Number(rating);
  if (!Number.isInteger(score) || score < 1 || score > 5) return fail(res, '评分需为 1-5 的整数星');

  const ratee = db.prepare('SELECT id FROM users WHERE id = ?').get(rateeId) as any;
  if (!ratee) return fail(res, '被评价的用户不存在', 404, 404);

  const commentText = typeof comment === 'string' ? comment.slice(0, 200) : '';

  // R3 审查 P2：INSERT 与 credit UPDATE 必须同一事务——原来两者各自 autocommit，
  // 中途失败会出现「有评分无分数」或「有分数无评分」的账目不一致。
  const delta = creditDelta(score);
  let newScore: number;
  try {
    newScore = db.transaction(() => {
      db.prepare(`
        INSERT INTO trade_ratings (post_id, rater_id, ratee_id, rating, comment)
        VALUES (?, ?, ?, ?, ?)
      `).run(postId, req.currentUser!.id, rateeId, score, commentText);
      let updated: number = (db.prepare('SELECT credit_score FROM users WHERE id = ?').get(rateeId) as any).credit_score;
      if (delta !== 0) {
        db.prepare('UPDATE users SET credit_score = MAX(?, MIN(?, credit_score + ?)) WHERE id = ?').run(
          CREDIT_MIN, CREDIT_MAX, delta, rateeId
        );
        updated = (db.prepare('SELECT credit_score FROM users WHERE id = ?').get(rateeId) as any).credit_score;
      }
      return updated;
    })();
  } catch (err: any) {
    if (String(err?.message || '').includes('UNIQUE')) return fail(res, '您已评价过该交易');
    throw err;
  }

  // 通知被评人（事务外：通知失败不应回滚已落库的 trade_ratings / credit_score）
  upsertNotification(
    rateeId,
    'system',
    `您在「${post.title}」的交易中获得 ${score} 星评价${delta > 0 ? '，信誉分 +2' : delta < 0 ? '，信誉分 -3' : ''}`,
    postId
  );

  success(res, { postId, rateeId, rating: score, creditDelta: delta, creditScore: newScore }, '评价成功');
});

// 某用户的互评记录与均分（公开可查）
router.get('/users/:id/trade-ratings', authOptional, (req, res) => {
  const userId = Number(req.params.id);
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) return fail(res, '用户不存在', 404, 404);

  const rows = db.prepare(`
    SELECT t.id, t.post_id, t.rater_id, t.ratee_id, t.rating, t.comment, t.created_at,
           u.nickname as rater_nickname, u.avatar as rater_avatar,
           p.title as post_title
    FROM trade_ratings t
    LEFT JOIN users u ON t.rater_id = u.id
    LEFT JOIN posts p ON t.post_id = p.id
    WHERE t.ratee_id = ?
    ORDER BY t.created_at DESC
    LIMIT 50
  `).all(userId) as any[];

  const stat = db.prepare('SELECT AVG(rating) as avg, COUNT(*) as total FROM trade_ratings WHERE ratee_id = ?').get(userId) as any;

  const list = rows.map((r) => ({
    id: r.id,
    postId: r.post_id,
    postTitle: r.post_title,
    rating: r.rating,
    comment: r.comment,
    createdAt: r.created_at ? new Date(r.created_at).toISOString() : r.created_at,
    rater: r.rater_nickname
      ? { id: r.rater_id, nickname: r.rater_nickname, avatar: r.rater_avatar }
      : null,
  }));

  success(res, {
    total: stat.total,
    avg: stat.avg != null ? Math.round(stat.avg * 10) / 10 : null,
    list,
  });
});

// ---------- 意向出价（闪电意向撮合闭环） ----------

function getOffer(id: number): any {
  return db.prepare('SELECT * FROM trade_offers WHERE id = ?').get(id);
}

function formatOffer(o: any): any {
  return {
    id: o.id,
    postId: o.post_id,
    buyerId: o.buyer_id,
    sellerId: o.seller_id,
    offerPrice: o.offer_price,
    message: o.message || '',
    status: o.status,
    createdAt: o.created_at ? new Date(o.created_at).toISOString() : o.created_at,
  };
}

// 买家发起意向出价（仅非作者；帖子已发布、未售出且无已锁定出价）
router.post('/trades/:postId/offers', authRequired, (req, res) => {
  const postId = Number(req.params.postId);
  const post = getPost(postId);
  if (!post) return fail(res, '帖子不存在', 404, 404);
  if (post.status !== 'published') return fail(res, '帖子不可见，无法出价', 404, 404);
  if (post.user_id === req.currentUser!.id) return fail(res, '不能对自己的帖子出价');
  if (!isTradeSection(post.section_name)) return fail(res, '仅二手交易板块支持意向出价');

  const extra = JSON.parse(post.extra_fields || '{}');
  if (extra.soldAt) return fail(res, '该物品已售出');

  const price = Number(req.body?.offerPrice);
  if (!Number.isFinite(price) || price <= 0 || price > 1_000_000) {
    return fail(res, '请输入有效的出价金额');
  }
  const message = typeof req.body?.message === 'string' ? req.body.message.slice(0, 100) : '';

  const accepted = db.prepare(
    "SELECT id FROM trade_offers WHERE post_id = ? AND status = 'accepted'"
  ).get(postId);
  if (accepted) return fail(res, '卖家已与其他买家达成交易，暂时无法出价');

  const myPending = db.prepare(
    "SELECT id FROM trade_offers WHERE post_id = ? AND buyer_id = ? AND status = 'pending'"
  ).get(postId, req.currentUser!.id);
  if (myPending) return fail(res, '您已有一条待确认的出价，请等待卖家处理');

  const result = db.prepare(`
    INSERT INTO trade_offers (post_id, buyer_id, seller_id, offer_price, message)
    VALUES (?, ?, ?, ?, ?)
  `).run(postId, req.currentUser!.id, post.user_id, price, message);

  // 通知卖家（失败不影响出价落库）
  upsertNotification(
    post.user_id,
    'system',
    `您的帖子「${post.title}」收到新出价 ¥${price}`,
    postId
  );

  trackEvent(req.currentUser!.id, 'offer_create', postId, { offerPrice: price });
  const offer = getOffer(result.lastInsertRowid as number);
  success(res, formatOffer(offer), '出价已发送，等待卖家确认');
});

// 出价列表（卖家看全部待处理，买家看自己的；返回锁定状态供前端展示）
router.get('/trades/:postId/offers', authRequired, (req, res) => {
  const postId = Number(req.params.postId);
  const post = getPost(postId);
  if (!post) return fail(res, '帖子不存在', 404, 404);

  const isSeller = post.user_id === req.currentUser!.id;
  const rows = db.prepare(`
    SELECT o.*, u.nickname AS buyer_nickname, u.avatar AS buyer_avatar, u.credit_score AS buyer_credit
    FROM trade_offers o
    JOIN users u ON u.id = o.buyer_id
    WHERE o.post_id = ?
    ORDER BY CASE o.status WHEN 'pending' THEN 0 WHEN 'accepted' THEN 1 ELSE 2 END, o.offer_price DESC, o.created_at DESC
  `).all(postId) as any[];

  const visible = isSeller ? rows : rows.filter((r) => r.buyer_id === req.currentUser!.id || r.status === 'accepted');
  const hasAccepted = rows.some((r) => r.status === 'accepted');
  const myOffer = rows.find((r) => r.buyer_id === req.currentUser!.id && r.status === 'pending');

  success(res, {
    isSeller,
    hasAccepted,
    myOffer: myOffer ? formatOffer(myOffer) : null,
    offers: visible.map((r) => ({
      ...formatOffer(r),
      buyer: isSeller || r.buyer_id === req.currentUser!.id
        ? { id: r.buyer_id, nickname: r.buyer_nickname, avatar: r.buyer_avatar, creditScore: r.buyer_credit }
        : undefined,
    })),
  });
});

// 卖家接受出价：排他锁定（同帖其他 pending 出价自动拒绝）
router.post('/trades/offers/:offerId/accept', authRequired, (req, res) => {
  const offer = getOffer(Number(req.params.offerId));
  if (!offer) return fail(res, '出价不存在', 404, 404);
  if (offer.seller_id !== req.currentUser!.id) return forbidden(res, '只有卖家可以接受出价');
  if (offer.status !== 'pending') return fail(res, '该出价已处理');

  // 条件更新做 CAS：并发双接受时只有第一条 pending→accepted 生效，
  // 先查后改在单/多实例下都会让同一出价被接受两次（changes 为 0 说明已被抢先）。
  const claimed = db.transaction(() => {
    const r = db.prepare(
      "UPDATE trade_offers SET status = 'accepted', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'"
    ).run(offer.id);
    if (r.changes === 0) return false;
    db.prepare(
      "UPDATE trade_offers SET status = 'rejected', updated_at = CURRENT_TIMESTAMP WHERE post_id = ? AND status = 'pending' AND id != ?"
    ).run(offer.post_id, offer.id);
    return true;
  })();

  if (!claimed) return fail(res, '该出价已处理');

  upsertNotification(
    offer.buyer_id,
    'system',
    '您的出价已被卖家接受，请尽快联系卖家完成交易',
    offer.post_id
  );

  success(res, formatOffer(getOffer(offer.id)), '已接受出价，交易锁定');
});

// 卖家拒绝出价
router.post('/trades/offers/:offerId/reject', authRequired, (req, res) => {
  const offer = getOffer(Number(req.params.offerId));
  if (!offer) return fail(res, '出价不存在', 404, 404);
  if (offer.seller_id !== req.currentUser!.id) return forbidden(res, '只有卖家可以拒绝出价');
  if (offer.status !== 'pending') return fail(res, '该出价已处理');

  db.prepare("UPDATE trade_offers SET status = 'rejected', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(offer.id);
  success(res, formatOffer(getOffer(offer.id)), '已拒绝该出价');
});

// 买家取消自己的待确认出价
router.post('/trades/offers/:offerId/cancel', authRequired, (req, res) => {
  const offer = getOffer(Number(req.params.offerId));
  if (!offer) return fail(res, '出价不存在', 404, 404);
  if (offer.buyer_id !== req.currentUser!.id) return forbidden(res, '只有出价人可以取消');
  if (offer.status !== 'pending') return fail(res, '该出价已处理，无法取消');

  db.prepare("UPDATE trade_offers SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(offer.id);
  success(res, formatOffer(getOffer(offer.id)), '已取消出价');
});

export default router;
