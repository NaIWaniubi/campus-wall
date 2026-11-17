/**
 * 试点运营数据报告（实效验证用）
 *
 * 用途：小范围真运营（50 人 × 2 周）跑完后，一条命令导出「规模 / 活跃 / 留存 /
 * 审核时效 / 交易闭环」的可引用数字，直接贴进提交材料或周报。
 *
 * 用法：
 *   npx tsx scripts/pilot-report.ts                 # Markdown 报告（stdout）
 *   npx tsx scripts/pilot-report.ts --json          # 机器可读（供看板/文档引用）
 *   npx tsx scripts/pilot-report.ts --days 30       # 窗口改为 30 天（默认 14）
 *   DB_PATH=/var/lib/campus-wall/campus.db npx tsx scripts/pilot-report.ts
 *
 * 设计取舍：
 * - 只读打开（readonly: true），不迁移、不种子、不写任何表——可在生产库上直接跑
 * - 时间字段均为 SQLite CURRENT_TIMESTAMP（UTC），脚本统一按 UTC 计算，避免时区漂移
 * - 留存口径：注册日 D 的用户在 D+N 当天有任意 events 行为 ≡ N 日留存（分母排除注册不足 N 天的用户）
 * - 注意：本地 api/data.db 会被集成测试写入（假用户/假事件），真实试点数字必须用生产库
 *   （DB_PATH=/var/lib/campus-wall/campus.db）或部署机内 `npm run report:pilot` 导出
 */
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import './../api/env.js';

const args = process.argv.slice(2);
const jsonOut = args.includes('--json');
const daysArg = args.indexOf('--days');
const DAYS = daysArg >= 0 ? Math.max(1, Math.min(365, Number(args[daysArg + 1]) || 14)) : 14;

const dbPath = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.resolve('api/data.db');

if (!fs.existsSync(dbPath)) {
  console.error(`[pilot-report] 数据库不存在：${dbPath}（先启动一次服务或设置 DB_PATH）`);
  process.exit(1);
}

const db = new Database(dbPath, { readonly: true, fileMustExist: true });

function one(sql: string, ...params: any[]): any {
  try {
    return db.prepare(sql).get(...params) ?? {};
  } catch {
    return {};
  }
}

function n(v: any): number {
  return Number(v ?? 0) || 0;
}

function pct(a: number, b: number): string {
  if (!b) return '—';
  return `${((a / b) * 100).toFixed(1)}%`;
}

const since = `-${DAYS} days`;

// ---------- A. 规模 ----------
const users = one(`
  SELECT
    COUNT(*) AS total,
    SUM(CASE WHEN openid IS NOT NULL AND openid != '' THEN 1 ELSE 0 END) AS wx_users,
    SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active_users,
    SUM(CASE WHEN status = 'banned' THEN 1 ELSE 0 END) AS banned_users,
    SUM(CASE WHEN created_at >= datetime('now', ?) THEN 1 ELSE 0 END) AS new_in_window
  FROM users
`, since);

const posts = one(`
  SELECT
    COUNT(*) AS total,
    SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) AS published,
    SUM(CASE WHEN status = 'pending_review' THEN 1 ELSE 0 END) AS pending,
    SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS rejected,
    SUM(CASE WHEN is_anonymous = 1 AND status = 'published' THEN 1 ELSE 0 END) AS anonymous,
    SUM(CASE WHEN created_at >= datetime('now', ?) THEN 1 ELSE 0 END) AS in_window
  FROM posts
`, since);

const comments = one(`
  SELECT COUNT(*) AS total,
         SUM(CASE WHEN created_at >= datetime('now', ?) THEN 1 ELSE 0 END) AS in_window
  FROM comments WHERE status = 'active'
`, since);

const engagements = one(`
  SELECT
    (SELECT COUNT(*) FROM likes) AS likes,
    (SELECT COUNT(*) FROM favorites) AS favorites,
    (SELECT COUNT(*) FROM follows) AS follows
`);

const conv = one(`SELECT COUNT(*) AS conversations FROM conversations`);
const chatMsgs = one(`SELECT COUNT(*) AS total FROM chat_messages`);

// 板块分布（窗口内 published）
const bySection = db
  .prepare(`
    SELECT s.name, COUNT(*) AS cnt
    FROM posts p JOIN sections s ON s.id = p.section_id
    WHERE p.status = 'published' AND p.created_at >= datetime('now', ?)
    GROUP BY p.section_id ORDER BY cnt DESC
  `)
  .all(since) as Array<{ name: string; cnt: number }>;

// 每日发帖趋势（窗口内）
const dailyPosts = db
  .prepare(`
    SELECT date(created_at) AS day, COUNT(*) AS cnt
    FROM posts WHERE status = 'published' AND created_at >= datetime('now', ?)
    GROUP BY day ORDER BY day
  `)
  .all(since) as Array<{ day: string; cnt: number }>;

// ---------- B. 活跃与留存 ----------
const dau = one(
  `SELECT COUNT(DISTINCT user_id) AS c FROM events WHERE created_at >= datetime('now', '-1 day')`
);
const wau = one(
  `SELECT COUNT(DISTINCT user_id) AS c FROM events WHERE created_at >= datetime('now', '-7 days')`
);

function retention(offsetDays: number): { eligible: number; retained: number } {
  const r = one(`
    SELECT
      COUNT(*) AS eligible,
      SUM(CASE WHEN EXISTS (
        SELECT 1 FROM events e
        WHERE e.user_id = u.id
          AND e.created_at >= datetime(u.created_at, '+${offsetDays} days')
          AND e.created_at <  datetime(u.created_at, '+${offsetDays + 1} days')
      ) THEN 1 ELSE 0 END) AS retained
    FROM users u
    WHERE u.created_at <= datetime('now', '-${offsetDays + 1} days')
  `);
  return { eligible: n(r.eligible), retained: n(r.retained) };
}

const d1 = retention(1);
const d7 = retention(7);

// 激活率：注册 24h 内有发帖或评论行为
const activation = one(`
  SELECT
    COUNT(*) AS eligible,
    SUM(CASE WHEN EXISTS (
      SELECT 1 FROM events e
      WHERE e.user_id = u.id
        AND e.type IN ('post_create','comment_create')
        AND e.created_at < datetime(u.created_at, '+1 day')
    ) THEN 1 ELSE 0 END) AS activated
  FROM users u
  WHERE u.created_at <= datetime('now', '-1 day')
`);

// ---------- C. 审核 ----------
const pendingNow = one(`SELECT COUNT(*) AS c FROM posts WHERE status = 'pending_review'`);
const auditStats = one(`
  SELECT
    COUNT(*) AS approvals,
    ROUND(AVG((julianday(l.created_at) - julianday(p.created_at)) * 1440), 1) AS avg_minutes,
    ROUND(MIN((julianday(l.created_at) - julianday(p.created_at)) * 1440), 1) AS min_minutes,
    ROUND(MAX((julianday(l.created_at) - julianday(p.created_at)) * 1440), 1) AS max_minutes
  FROM admin_logs l
  JOIN posts p ON l.target_type = 'post' AND p.id = l.target_id
  WHERE l.action = 'audit_approve'
    AND l.created_at >= datetime('now', ?)
    AND p.created_at IS NOT NULL
`, since);

// ---------- D. 交易与失物闭环 ----------
const trade = one(`
  SELECT (SELECT COUNT(*) FROM trade_offers) AS offers
`);
const tradeCompleted = one(
  `SELECT COUNT(*) AS c FROM events WHERE type = 'trade_complete' AND created_at >= datetime('now', ?)`,
  since
);
const reports = one(
  `SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending FROM reports`
);

const report = {
  generatedAt: new Date().toISOString(),
  windowDays: DAYS,
  dbPath,
  scale: {
    users: n(users.total),
    wxUsers: n(users.wx_users),
    newUsersInWindow: n(users.new_in_window),
    bannedUsers: n(users.banned_users),
    posts: n(posts.total),
    postsPublished: n(posts.published),
    postsPending: n(posts.pending),
    postsRejected: n(posts.rejected),
    anonymousRatio: posts.published ? Number((n(posts.anonymous) / n(posts.published)).toFixed(3)) : 0,
    postsInWindow: n(posts.in_window),
    comments: n(comments.total),
    commentsInWindow: n(comments.in_window),
    likes: n(engagements.likes),
    favorites: n(engagements.favorites),
    follows: n(engagements.follows),
    conversations: n(conv.conversations),
    chatMessages: n(chatMsgs.total),
  },
  activity: {
    dau: n(dau.c),
    wau: n(wau.c),
    d1Retention: d1,
    d7Retention: d7,
    activation: { eligible: n(activation.eligible), activated: n(activation.activated) },
  },
  moderation: {
    pendingNow: n(pendingNow.c),
    approvalsInWindow: n(auditStats.approvals),
    avgMinutes: auditStats.avg_minutes ?? null,
    minMinutes: auditStats.min_minutes ?? null,
    maxMinutes: auditStats.max_minutes ?? null,
  },
  trade: {
    offers: n(trade.offers),
    completedInWindow: n(tradeCompleted.c),
  },
  reports: { total: n(reports.total), pending: n(reports.pending) },
  sections: bySection,
  dailyPosts,
};

if (jsonOut) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

// ---------- Markdown 输出 ----------
const lines: string[] = [];
lines.push(`# 试点运营数据报告`);
lines.push('');
lines.push(`> 生成：${report.generatedAt}　·　窗口：最近 ${DAYS} 天　·　库：\`${dbPath}\``);
lines.push('');
lines.push(`## 规模`);
lines.push('');
lines.push(`| 指标 | 数值 |`);
lines.push(`|---|---|`);
lines.push(`| 注册用户 | ${report.scale.users}（微信 ${report.scale.wxUsers}） |`);
lines.push(`| 窗口内新增用户 | ${report.scale.newUsersInWindow} |`);
lines.push(`| 帖子总数 | ${report.scale.posts}（已发布 ${report.scale.postsPublished} / 待审 ${report.scale.postsPending} / 驳回 ${report.scale.postsRejected}） |`);
lines.push(`| 窗口内新帖 | ${report.scale.postsInWindow} |`);
lines.push(`| 匿名帖占已发布 | ${pct(Math.round(report.scale.anonymousRatio * n(posts.published)), n(posts.published))} |`);
lines.push(`| 评论 | ${report.scale.comments}（窗口内 ${report.scale.commentsInWindow}） |`);
lines.push(`| 点赞 / 收藏 / 关注 | ${report.scale.likes} / ${report.scale.favorites} / ${report.scale.follows} |`);
lines.push(`| 私信 | ${report.scale.conversations} 会话 / ${report.scale.chatMessages} 条 |`);
lines.push('');
lines.push(`## 活跃与留存`);
lines.push('');
lines.push(`| 指标 | 数值 |`);
lines.push(`|---|---|`);
lines.push(`| DAU（近 24h） | ${report.activity.dau} |`);
lines.push(`| WAU（近 7 天） | ${report.activity.wau} |`);
lines.push(`| 次日留存（D1） | ${pct(report.activity.d1Retention.retained, report.activity.d1Retention.eligible)}（${report.activity.d1Retention.retained}/${report.activity.d1Retention.eligible}） |`);
lines.push(`| 7 日留存（D7） | ${pct(report.activity.d7Retention.retained, report.activity.d7Retention.eligible)}（${report.activity.d7Retention.retained}/${report.activity.d7Retention.eligible}） |`);
lines.push(`| 激活率（注册 24h 内发帖/评论） | ${pct(report.activity.activation.activated, report.activity.activation.eligible)}（${report.activity.activation.activated}/${report.activity.activation.eligible}） |`);
lines.push('');
lines.push(`## 审核负载`);
lines.push('');
lines.push(`| 指标 | 数值 |`);
lines.push(`|---|---|`);
lines.push(`| 当前待审存量 | ${report.moderation.pendingNow} |`);
lines.push(`| 窗口内审核通过 | ${report.moderation.approvalsInWindow} |`);
lines.push(`| 审核时效（均值） | ${report.moderation.avgMinutes == null ? '—' : report.moderation.avgMinutes + ' 分钟'} |`);
lines.push(`| 审核时效（最快/最慢） | ${report.moderation.minMinutes == null ? '—' : report.moderation.minMinutes + ' / ' + report.moderation.maxMinutes + ' 分钟'} |`);
lines.push('');
lines.push(`## 交易与举报`);
lines.push('');
lines.push(`| 指标 | 数值 |`);
lines.push(`|---|---|`);
lines.push(`| 交易报价 | ${report.trade.offers} |`);
lines.push(`| 窗口内成交（trade_complete） | ${report.trade.completedInWindow} |`);
lines.push(`| 举报（累计/待处理） | ${report.reports.total} / ${report.reports.pending} |`);
lines.push('');
if (report.sections.length) {
  lines.push(`## 板块分布（窗口内已发布）`);
  lines.push('');
  lines.push(`| 板块 | 帖子 |`);
  lines.push(`|---|---|`);
  for (const s of report.sections) lines.push(`| ${s.name} | ${s.cnt} |`);
  lines.push('');
}
if (report.dailyPosts.length) {
  lines.push(`## 每日发帖（窗口内）`);
  lines.push('');
  lines.push(`| 日期 | 帖子 |`);
  lines.push(`|---|---|`);
  for (const d of report.dailyPosts) lines.push(`| ${d.day} | ${d.cnt} |`);
  lines.push('');
}
console.log(lines.join('\n'));