/**
 * 演示数据种子脚本：为全部 8 个板块注入符合各自差异化字段的演示内容，
 * 并让智能匹配 / 风险审核 / 举报曝光 / 交易互评 / 信誉徽章 / 热度排序都有可见效果。
 *
 * 用法：
 *   npm run seed            —— 幂等执行（已种子化则跳过）
 *   npm run seed -- --force —— 清除旧演示数据后重新种入
 *
 * 演示账号学号统一 2377xxx 段、密码 demo1234，与真实账号隔离。
 */
import bcrypt from 'bcryptjs';
import { db } from './db.js';
import { logger } from './utils/logger.js';

const DEMO_SEED_KEY = 'demo_seeded';
const DEMO_SID_LIKE = '2377%';

// 相对天数 → SQLite DATETIME 字符串（UTC，与 CURRENT_TIMESTAMP 一致）
const ago = (days: number): string =>
  new Date(Date.now() - days * 864e5).toISOString().replace('T', ' ').slice(0, 19);

function isForced(): boolean {
  return process.argv.includes('--force');
}

/** 清除旧演示数据（--force 时调用）：按学号段圈定用户，级联清理其所有从属数据。
 *  清理期间临时关闭外键约束：跨用户的楼中楼（他人回复演示用户的评论）会因 parent_id 外键阻塞逐户删除。 */
function cleanupDemoData(): void {
  db.pragma('foreign_keys = OFF');
  try {
  const users = db.prepare(`SELECT id FROM users WHERE student_id LIKE ?`).all(DEMO_SID_LIKE) as { id: number }[];
  const ids = users.map((u) => u.id);
  for (const id of ids) {
    db.prepare('DELETE FROM messages WHERE user_id=?').run(id);
    db.prepare('DELETE FROM reports WHERE reporter_id=?').run(id);
    db.prepare('DELETE FROM likes WHERE user_id=?').run(id);
    db.prepare('DELETE FROM favorites WHERE user_id=?').run(id);
    db.prepare('DELETE FROM subscriptions WHERE user_id=?').run(id);
    db.prepare('DELETE FROM trade_ratings WHERE rater_id=? OR ratee_id=?').run(id, id);
    db.prepare('DELETE FROM drafts WHERE user_id=?').run(id);
    // 私信会话（先删会话内消息再删会话）与关注关系
    const convs = db.prepare('SELECT id FROM conversations WHERE user_a_id=? OR user_b_id=?').all(id, id) as { id: number }[];
    for (const c of convs) db.prepare('DELETE FROM chat_messages WHERE conversation_id=?').run(c.id);
    db.prepare('DELETE FROM conversations WHERE user_a_id=? OR user_b_id=?').run(id, id);
    db.prepare('DELETE FROM follows WHERE follower_id=? OR following_id=?').run(id, id);
    // 其帖子下的评论/点赞/收藏/举报
    const posts = db.prepare('SELECT id FROM posts WHERE user_id=?').all(id) as { id: number }[];
    for (const p of posts) {
      db.prepare('DELETE FROM comments WHERE post_id=?').run(p.id);
      db.prepare('DELETE FROM likes WHERE target_type=? AND target_id=?').run('post', p.id);
      db.prepare('DELETE FROM favorites WHERE post_id=?').run(p.id);
      db.prepare('DELETE FROM reports WHERE target_type=? AND target_id=?').run('post', p.id);
      db.prepare('DELETE FROM trade_ratings WHERE post_id=?').run(p.id);
      db.prepare('DELETE FROM trade_offers WHERE post_id=?').run(p.id);
    }
    // 用户作为买家/卖家的意向出价
    db.prepare('DELETE FROM trade_offers WHERE buyer_id=? OR seller_id=?').run(id, id);
    db.prepare('DELETE FROM posts WHERE user_id=?').run(id);
    db.prepare('DELETE FROM comments WHERE user_id=?').run(id);
    db.prepare('DELETE FROM users WHERE id=?').run(id);
  }
  // 管理员发布的演示公告
  db.prepare(`DELETE FROM announcements WHERE title LIKE '【演示】%'`).run();
  } finally {
    db.pragma('foreign_keys = ON');
  }
}

function main(): void {
  const seeded = db.prepare('SELECT value FROM settings WHERE key=?').get(DEMO_SEED_KEY);
  if (seeded && !isForced()) {
    logger.info('演示数据已存在，跳过。如需重种：npm run seed -- --force');
    return;
  }
  if (isForced()) {
    logger.info('--force：清除旧演示数据');
    cleanupDemoData();
    db.prepare('DELETE FROM settings WHERE key=?').run(DEMO_SEED_KEY);
  }

  const hash = bcrypt.hashSync('demo1234', 10);
  const insUser = db.prepare(`
    INSERT INTO users (student_id, password, nickname, college, grade, role, status, credit_score, created_at)
    VALUES (?, ?, ?, ?, ?, 'user', 'active', ?, ?)`);

  // ── 演示用户 ×5：信誉分覆盖徽章四档（55 待改进 / 75 诚信新人 / 92 可靠达人 / 105、120 信誉之星由管理员补齐）──
  const u = [
    { sid: '23770001', name: '陈小北', college: '计算机学院', grade: '2023', credit: 92 },
    { sid: '23770002', name: '林晚晴', college: '外国语学院', grade: '2024', credit: 105 },
    { sid: '23770003', name: '王大力', college: '机械学院', grade: '2022', credit: 75 },
    { sid: '23770004', name: '苏沐橙', college: '经济管理学院', grade: '2023', credit: 120 },
    { sid: '23770005', name: '赵小满', college: '文学院', grade: '2024', credit: 55 },
  ];
  const uid: number[] = [];
  for (const x of u) {
    const r = insUser.run(x.sid, hash, x.name, x.college, x.grade, x.credit, ago(30));
    uid.push(Number(r.lastInsertRowid));
  }

  const insPost = db.prepare(`
    INSERT INTO posts (user_id, section_id, title, content, images, is_anonymous, status, is_top, top_type,
                       view_count, like_count, comment_count, extra_fields, created_at, updated_at)
    VALUES (?, ?, ?, ?, '[]', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  interface PostSpec {
    author: number; section: number; title: string; content: string;
    anonymous?: number; status?: string; top?: number; topType?: string;
    views?: number; days: number; extra?: Record<string, unknown>; likesFrom?: number[];
  }
  const specs: PostSpec[] = [
    // 二手交易（差异化字段：price/condition/contact/tradeType）
    { author: 0, section: 1, title: '出九成新 iPad Air 5 蓝色 64G', content: '大一冲动购入，基本吃灰，无划痕无磕碰，带原装壳和充电头。可当面验机，校内面交。', days: 1.5, views: 210,
      extra: { price: '2899', condition: '九成新', contact: 'wx: chenxiaobei9527', tradeType: '出售' }, likesFrom: [1, 2, 3, 4] },
    { author: 2, section: 1, title: '毕业出捷安特通勤自行车', content: '骑了两学年，车况良好，刹车刚换的皮。毕业带不走，低价出，附送车锁。', days: 2.2, views: 88,
      extra: { price: '260', condition: '八成新', contact: 'qq: 23770303', tradeType: '出售' }, likesFrom: [0] },
    { author: 3, section: 1, title: '考研数学全套资料含真题解析', content: '去年备考用的，张宇+李永乐全套，笔记齐全。已上岸用不上了，便宜转给学弟学妹。', days: 0.15, views: 15,
      extra: { price: '45', condition: '九成新', contact: 'wx: sumucheng04', tradeType: '出售' } },
    // 失物招领（location/time/itemType/direction）——前两篇构成「丢卡↔捡卡」匹配对
    { author: 1, section: 2, title: '捡到一张校园卡', content: '一食堂二楼打饭窗口捡到一张校园卡，卡面姓名已打码。失主看到请带着学生证来认领。', days: 0.5, views: 60,
      extra: { location: '一食堂二楼', time: '今天中午', itemType: '校园卡', direction: 'found' } },
    { author: 2, section: 2, title: '丢失校园卡急寻', content: '昨天下午在图书馆三楼自习区丢了一张校园卡，大概率落在座位附近，有捡到的同学万分感谢！', days: 1, views: 45,
      extra: { location: '图书馆三楼', time: '昨天下午', itemType: '校园卡', direction: 'lost' } },
    { author: 4, section: 2, title: '在体育馆捡到一串钥匙', content: '周三晚上打完球在体育馆副馆看台捡到一串钥匙，带一个小熊挂件。', days: 3, views: 30,
      extra: { location: '体育馆副馆', time: '周三晚上', itemType: '钥匙', direction: 'found' } },
    // 表白墙
    { author: 1, section: 3, title: '表白图书馆三楼靠窗的男生', content: '每天都坐在同一个位置安静看书，上周我水杯倒了是你默默递过来的纸巾。想认识你，可以吗？', days: 2, views: 320, likesFrom: [0, 2, 3, 4] },
    { author: 3, section: 3, title: '匿名想说谢谢', content: '谢谢那天暴雨里把伞塞给我的室友，自己淋着回宿舍还骗我说不顺路。这样的朋友请给我来一打。', days: 4, anonymous: 1, views: 150 },
    // 吐槽树洞（force_anonymous 板块）
    { author: 0, section: 4, title: '选课系统能不能争点气', content: '开抢三秒钟就崩，修好之后想选的全没了。年年如此，年年道歉，明年还这样吗？', days: 5, anonymous: 1, views: 400, likesFrom: [1, 2, 3, 4] },
    { author: 2, section: 4, title: '食堂新窗口测评', content: '二楼新开的麻辣香锅称重计价，味道在线但勺子抖得像帕金森，两勺肉没了十五块。', days: 6, anonymous: 1, views: 260 },
    { author: 4, section: 4, title: '【审核队列演示】校外兼职小广告', content: '日结三百，轻松躺赚，加微信详聊，名额有限。', days: 0.08, anonymous: 1, status: 'pending_review', views: 0 },
    // 互助问答
    { author: 3, section: 5, title: '高数期末怎么复习才高效', content: '下周期末考，极限和中值定理这块完全没底。求过来人分享复习路线和重点章节。', days: 1, views: 120, likesFrom: [0, 1] },
    { author: 4, section: 5, title: '抢课有什么技巧吗', content: '公选课手速 always 慢一步，请问大家用什么姿势抢课成功率高？', days: 3, views: 95, likesFrom: [2] },
    // 校园活动（time/location/organizer）
    { author: 1, section: 6, title: '迎新晚会暨十佳歌手决赛', content: '一年一度最盛大的舞台！本届十强选手将带来全新编曲，另有神秘嘉宾压轴。凭学生证免费入场。', days: 0.8, views: 520, top: 1, topType: 'global',
      extra: { time: '下周五 19:00', location: '大礼堂', organizer: '校学生会' }, likesFrom: [0, 2, 3] },
    { author: 0, section: 6, title: '动漫社秋季招新啦', content: '无论你是考斯党、画师还是纯追番党，都欢迎加入！招新摊位有免费吧唧相送。', days: 2.5, views: 180,
      extra: { time: '本周末 10:00-16:00', location: '中心广场', organizer: '动漫社' }, likesFrom: [1] },
    // 拼车（time/location 承载出发时间与集合点，费用分摊写进 content）
    { author: 3, section: 7, title: '周六下午回家顺风车，空 2 座', content: '本人周六下午自驾回家，市区方向顺路带 2 位同学，费用 AA 每人 30 元，行李多的提前说一声。', days: 0.6, views: 75,
      extra: { time: '周六 14:00', location: '东门集合' }, likesFrom: [0, 4] },
    { author: 1, section: 7, title: '周日上午求拼车去高铁站', content: '周日早上高铁返校，找同路同学一起拼车去站，人均约 15 元比打车省一半。', days: 1.8, views: 40,
      extra: { time: '周日 08:30', location: '南门集合' }, likesFrom: [2] },
    // 组队
    { author: 0, section: 8, title: '蓝桥杯组队冲省一，缺 2 人', content: '已有算法手一名，还缺前端和后端各一名，每周固定刷题两次，目标省一，有奖状加学分。', days: 1.2, views: 130,
      extra: { time: '每周三 19:00', location: '实训楼 A305' }, likesFrom: [2, 3] },
    { author: 4, section: 8, title: '考研自习室找长期搭子', content: '图书馆四楼自习区找固定座位搭子，作息早八晚十，能互相监督打卡、资料共享的来。', days: 2.6, views: 66,
      extra: { time: '每天 08:00', location: '图书馆四楼' }, likesFrom: [1] },
    // 失物招领对向补充：丢失雨伞（direction:lost），让 lost/found 双向都有数据
    { author: 0, section: 2, title: '丢失雨伞一把', content: '昨天傍晚在教学楼 B 栋 201 上完课把一把黑色长柄雨伞落在了座位下面，伞柄有校运会纪念挂饰。有同学捡到请联系我，感谢！', days: 2.8, views: 35,
      extra: { location: '教学楼 B 栋', time: '昨天傍晚', itemType: '雨伞', direction: 'lost' } },
  ];

  const pid: number[] = [];
  for (const s of specs) {
    const likes = s.likesFrom?.length ?? 0;
    const r = insPost.run(
      uid[s.author], s.section, s.title, s.content, s.anonymous ?? 0,
      s.status ?? 'published', s.top ?? 0, s.topType ?? 'none',
      s.views ?? 20, likes, 0, JSON.stringify(s.extra ?? {}), ago(s.days), ago(s.days)
    );
    pid.push(Number(r.lastInsertRowid));
    for (const likerIdx of s.likesFrom ?? []) {
      db.prepare(`INSERT OR IGNORE INTO likes (user_id, target_type, target_id, created_at) VALUES (?, 'post', ?, ?)`)
        .run(uid[likerIdx], Number(r.lastInsertRowid), ago(s.days));
    }
  }

  // ── 二手交易闭环：iPad 帖标记已完成 + 双向互评（u1 卖给 u2）──
  db.prepare(`UPDATE posts SET extra_fields = json_set(extra_fields, '$.soldAt', ?) WHERE id=?`)
    .run(ago(0.6), pid[0]);
  const insRating = db.prepare(
    'INSERT INTO trade_ratings (post_id, rater_id, ratee_id, rating, comment, created_at) VALUES (?, ?, ?, ?, ?, ?)');
  insRating.run(pid[0], uid[1], uid[0], 5, '卖家爽快，机器和描述一致，好评！', ago(0.5));
  insRating.run(pid[0], uid[0], uid[1], 5, '买家很守时，校内面交秒到账。', ago(0.5));

  // ── 评论（含楼中楼）──
  const insComment = db.prepare(
    'INSERT INTO comments (post_id, user_id, parent_id, content, like_count, status, created_at) VALUES (?, ?, ?, ?, 0, ?, ?)');
  const addComment = (pIdx: number, userIdx: number, parent: number | null, content: string, days: number): number => {
    const r = insComment.run(pid[pIdx], uid[userIdx], parent, content, 'active', ago(days));
    return Number(r.lastInsertRowid);
  };
  addComment(0, 1, null, '想要！晚上可以面交吗', 1.2);
  const c2 = addComment(0, 0, null, '可以私聊我微信，随时在', 1.1);
  addComment(0, 3, c2, '插眼，如果前面没成交叫我', 1.0);
  addComment(11, 0, null, '把课本例题过一遍，近五年真题刷两轮，及格线以上稳了', 0.8);
  const ca = addComment(11, 1, null, '推荐B站宋浩老师突击串讲，两天救一命', 0.7);
  addComment(11, 3, ca, '同推，当年就是靠他过的', 0.6);
  addComment(12, 0, null, '开抢前五分钟登进去候着，网速比手速重要', 2.5);

  // 同步评论计数
  for (let i = 0; i < specs.length; i++) {
    const c = db.prepare(`SELECT COUNT(*) as count FROM comments WHERE post_id=? AND status='active'`).get(pid[i]) as { count: number };
    db.prepare('UPDATE posts SET comment_count=? WHERE id=?').run(c.count, pid[i]);
  }

  // ── 树洞帖举报 ×3（触发管理员侧匿名身份曝光阈值）──
  const insReport = db.prepare(
    `INSERT INTO reports (reporter_id, target_type, target_id, reason, status, priority, created_at)
     VALUES (?, 'post', ?, ?, 'pending', 'high', ?)`);
  [1, 2, 3].forEach((reporterIdx, k) => {
    insReport.run(uid[reporterIdx], pid[8], '疑似广告骚扰', ago(4 - k * 0.1));
  });

  // ── 失物配对通知（模拟 match.ts 发布时生成的双向通知）──
  const insMsg = db.prepare('INSERT INTO messages (user_id, type, content, related_id, is_read, created_at) VALUES (?, ?, ?, ?, 0, ?)');
  insMsg.run(uid[1], 'match', '发现 1 条可能与你相关的帖子，如「丢失校园卡急寻」', pid[4], ago(0.4));
  insMsg.run(uid[2], 'match', '有新帖「捡到一张校园卡」可能与你的帖子「丢失校园卡急寻」相关', pid[3], ago(0.4));

  // ── 收藏 / 订阅 / 公告 ──
  const insFav = db.prepare('INSERT INTO favorites (user_id, post_id, created_at) VALUES (?, ?, ?)');
  insFav.run(uid[1], pid[0], ago(1));
  insFav.run(uid[4], pid[13], ago(0.5));
  const insSub = db.prepare('INSERT OR IGNORE INTO subscriptions (user_id, section_id) VALUES (?, ?)');
  insSub.run(uid[0], 2); // 陈小北订阅失物招领
  insSub.run(uid[1], 1); // 林晚晴订阅二手交易

  const admin = db.prepare(`SELECT id FROM users WHERE role='super_admin' LIMIT 1`).get() as { id: number };
  db.prepare(
    'INSERT INTO announcements (title, content, target_user_id, expires_at, is_active, created_by, created_at) VALUES (?, ?, NULL, NULL, 1, ?, ?)'
  ).run('【演示】开学季校园墙使用须知', '发帖请遵守社区规范；二手交易请校内面交；匿名发言同样受信誉分体系约束。祝新学期愉快！', admin.id, ago(7));

  db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`
  ).run(DEMO_SEED_KEY, new Date().toISOString());

  // ── 统计输出 ──
  const stat = (label: string, sql: string): void => {
    const row = db.prepare(sql).get() as { count: number };
    logger.info(`种子数据统计: ${label}`, { count: row.count });
  };
  stat('演示用户', `SELECT COUNT(*) as count FROM users WHERE student_id LIKE '${DEMO_SID_LIKE}'`);
  stat('演示帖子', `SELECT COUNT(*) as count FROM posts WHERE user_id IN (SELECT id FROM users WHERE student_id LIKE '${DEMO_SID_LIKE}')`);
  stat('互评记录', 'SELECT COUNT(*) as count FROM trade_ratings');
  stat('待审核队列', `SELECT COUNT(*) as count FROM posts WHERE status='pending_review'`);
  stat('树洞帖举报', `SELECT COUNT(*) as count FROM reports WHERE target_id=${pid[8]} AND status='pending'`);
  logger.info('种子数据导入完成', { demoAccount: '23770001 / demo1234', adminAccount: 'admin / admin123' });
}

main();
