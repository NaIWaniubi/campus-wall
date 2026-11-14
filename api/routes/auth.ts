/**
 * 认证路由：注册、登录、获取当前用户、修改密码、微信登录
 */
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db.js';
import { generateToken } from '../utils/jwt.js';
import { authRequired, liftExpiredBan } from '../middleware/auth.js';
import { authRateLimit, recordAuthFailure, clearAuthFailures } from '../middleware/rateLimit.js';
import { success, fail, toCamel } from '../utils/response.js';
import { validate, userSchemas } from '../utils/validation.js';
import { wxLoginHandler } from '../utils/wx-login.js';
import { logger } from '../utils/logger.js';
import { trackEvent, touchActive } from '../utils/events.js';

const router = Router();

/**
 * 安全的 users 表列白名单（不包含 password 列）：
 * 任何对外返回用户对象的 SELECT 必须走此白名单，避免 bcrypt hash 泄露到客户端。
 * 内部校验密码请显式 SELECT password, ${SAFE_USER_COLS}，再用 toCamel 前剥离 password 字段。
 */
const SAFE_USER_COLS = `id, student_id, nickname, avatar, college, grade, signature, credit_score, role, status, ban_reason, ban_until, openid, token_version, created_at`;

// 注册
router.post('/register', authRateLimit, validate({ body: userSchemas.register }), (req, res) => {
  // 账号统一落到 student_id 列（历史列名，语义已是「登录账号」）
  const { password, nickname, college, grade } = req.body;
  const studentId = String(req.body.account ?? req.body.studentId ?? '').trim();

  const exist = db.prepare('SELECT id FROM users WHERE student_id = ?').get(studentId);
  if (exist) {
    recordAuthFailure(req);
    return fail(res, '该账号已被注册，换一个或直接登录');
  }

  const hashedPassword = bcrypt.hashSync(password, 10);
  const result = db.prepare(
    'INSERT INTO users (student_id, password, nickname, college, grade, role, status, credit_score) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(studentId, hashedPassword, nickname.trim(), college || '', grade || '', 'user', 'active', 100);

  const userId = result.lastInsertRowid as number;
  const token = generateToken({ id: userId, studentId, role: 'user' });
  clearAuthFailures(req);

  const user = db.prepare(`SELECT ${SAFE_USER_COLS} FROM users WHERE id = ?`).get(userId) as any;

  trackEvent(userId, 'register', userId, { studentId });
  touchActive(userId);
  logger.info('User registered', { userId, studentId });
  success(res, { token, user: toCamel(user) }, '注册成功');
});

// 登录
router.post('/login', authRateLimit, validate({ body: userSchemas.login }), (req, res) => {
  const { password } = req.body;
  const studentId = String(req.body.account ?? req.body.studentId ?? '').trim();

  const user = db.prepare(`SELECT password, ${SAFE_USER_COLS} FROM users WHERE student_id = ?`).get(studentId) as any;
  // 不区分「账号不存在」与「密码错误」，防账号枚举（审计 P0-3）
  if (!user) {
    recordAuthFailure(req);
    return fail(res, '账号或密码错误', 1002);
  }

  if (user.status === 'banned' && liftExpiredBan(user)) user.status = 'active';

  if (user.status === 'banned') {
    const banUntil = user.ban_until ? new Date(user.ban_until).toLocaleString('zh-CN') : '永久';
    return fail(res, `账号已被封禁，原因：${user.ban_reason || '违规'}，解封时间：${banUntil}`, 1003);
  }

  const isMatch = bcrypt.compareSync(password, user.password);
  if (!isMatch) {
    recordAuthFailure(req);
    return fail(res, '账号或密码错误', 1002);
  }
  clearAuthFailures(req);

  const token = generateToken({
    id: user.id,
    studentId: user.student_id,
    role: user.role,
    ver: Number(user.token_version ?? 0),
  });
  // 显式剥离 password 字段（白名单已不含，但此处仍防御性 toCamel 之前 drop）
  const { password: _pw, ...safeUser } = user;
  trackEvent(user.id, 'login', null, {});
  touchActive(user.id);
  success(res, { token, user: toCamel(safeUser) }, '登录成功');
});

// 微信静默登录（小程序 wx.login code → jscode2session → JWT）
// 未配置 WX_APPID/WX_SECRET 时返回 501，端上静默回退学号密码登录
router.post('/wx-login', wxLoginHandler);

// 获取当前用户信息
// 同时返回个人主页所需计数：小程序「我的」页直接读 postCount/favoriteCount/likeCount/
// followingCount/followerCount，早期只返回用户行，导致这几项永远显示 0。
router.get('/me', authRequired, (req, res) => {
  const user = db.prepare(`SELECT ${SAFE_USER_COLS} FROM users WHERE id = ?`).get(req.currentUser!.id) as any;
  if (!user) {
    return fail(res, '用户不存在', 404, 404);
  }

  const uid = req.currentUser!.id;
  const counts = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM posts WHERE user_id = ? AND status = 'published') AS post_count,
      (SELECT COUNT(*) FROM favorites WHERE user_id = ?) AS favorite_count,
      (SELECT COUNT(*) FROM likes WHERE user_id = ? AND target_type = 'post') AS like_count,
      (SELECT COUNT(*) FROM follows WHERE follower_id = ?) AS following_count,
      (SELECT COUNT(*) FROM follows WHERE following_id = ?) AS follower_count
  `).get(uid, uid, uid, uid, uid) as any;

  success(res, toCamel({
    ...user,
    post_count: counts?.post_count ?? 0,
    favorite_count: counts?.favorite_count ?? 0,
    like_count: counts?.like_count ?? 0,
    following_count: counts?.following_count ?? 0,
    follower_count: counts?.follower_count ?? 0,
  }));
});

// 修改密码（authRateLimit：旧密码可被持有 token 者无限爆破，与登录同一防线）
router.put('/password', authRequired, authRateLimit, (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) {
    return fail(res, '原密码和新密码为必填项');
  }
  if (newPassword.length < 6) {
    return fail(res, '新密码长度至少6位');
  }

  const user = db.prepare('SELECT password FROM users WHERE id = ?').get(req.currentUser!.id) as any;
  if (!bcrypt.compareSync(oldPassword, user.password)) {
    // 与登录共用失败计数：原密码可被持有 token 者无限爆破的口子（R2 审计）
    recordAuthFailure(req);
    return fail(res, '原密码错误');
  }

  const hashedPassword = bcrypt.hashSync(newPassword, 10);
  // 改密同时递增 token_version：所有旧 token（包括可能已被窃取的那个）立即失效。
  // 返回新 token，让当前设备无需重新登录。
  const row = db
    .prepare('UPDATE users SET password = ?, token_version = token_version + 1 WHERE id = ? RETURNING token_version')
    .get(hashedPassword, req.currentUser!.id) as any;
  const newToken = generateToken({
    id: req.currentUser!.id,
    studentId: req.currentUser!.studentId,
    role: req.currentUser!.role,
    ver: Number(row?.token_version ?? 0),
  });
  success(res, { token: newToken }, '密码修改成功，其他设备需重新登录');
});

// 退出登录（客户端清除本地 token 即可；此处仅作幂等确认）
router.post('/logout', authRequired, (_req, res) => {
  success(res, null, '已退出登录');
});

export default router;
