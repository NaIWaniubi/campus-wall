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
import { logger } from '../utils/logger.js';

const router = Router();

/**
 * 安全的 users 表列白名单（不包含 password 列）：
 * 任何对外返回用户对象的 SELECT 必须走此白名单，避免 bcrypt hash 泄露到客户端。
 * 内部校验密码请显式 SELECT password, ${SAFE_USER_COLS}，再用 toCamel 前剥离 password 字段。
 */
const SAFE_USER_COLS = `id, student_id, nickname, avatar, college, grade, signature, credit_score, role, status, ban_reason, ban_until, openid, created_at`;

// 注册
router.post('/register', authRateLimit, validate({ body: userSchemas.register }), (req, res) => {
  const { studentId, password, nickname, college, grade } = req.body;

  const exist = db.prepare('SELECT id FROM users WHERE student_id = ?').get(studentId);
  if (exist) {
    recordAuthFailure(req);
    return fail(res, '该学号已注册');
  }

  const hashedPassword = bcrypt.hashSync(password, 10);
  const result = db.prepare(
    'INSERT INTO users (student_id, password, nickname, college, grade, role, status, credit_score) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(studentId, hashedPassword, nickname.trim(), college || '', grade || '', 'user', 'active', 100);

  const userId = result.lastInsertRowid as number;
  const token = generateToken({ id: userId, studentId, role: 'user' });
  clearAuthFailures(req);

  const user = db.prepare(`SELECT ${SAFE_USER_COLS} FROM users WHERE id = ?`).get(userId) as any;

  logger.info('User registered', { userId, studentId });
  success(res, { token, user: toCamel(user) }, '注册成功');
});

// 登录
router.post('/login', authRateLimit, validate({ body: userSchemas.login }), (req, res) => {
  const { studentId, password } = req.body;

  const user = db.prepare(`SELECT password, ${SAFE_USER_COLS} FROM users WHERE student_id = ?`).get(studentId) as any;
  // 不区分「账号不存在」与「密码错误」，防账号枚举（审计 P0-3）
  if (!user) {
    recordAuthFailure(req);
    return fail(res, '学号或密码错误', 1002);
  }

  if (user.status === 'banned' && liftExpiredBan(user)) user.status = 'active';

  if (user.status === 'banned') {
    const banUntil = user.ban_until ? new Date(user.ban_until).toLocaleString('zh-CN') : '永久';
    return fail(res, `账号已被封禁，原因：${user.ban_reason || '违规'}，解封时间：${banUntil}`, 1003);
  }

  const isMatch = bcrypt.compareSync(password, user.password);
  if (!isMatch) {
    recordAuthFailure(req);
    return fail(res, '学号或密码错误', 1002);
  }
  clearAuthFailures(req);

  const token = generateToken({ id: user.id, studentId: user.student_id, role: user.role });
  // 显式剥离 password 字段（白名单已不含，但此处仍防御性 toCamel 之前 drop）
  const { password: _pw, ...safeUser } = user;
  success(res, { token, user: toCamel(safeUser) }, '登录成功');
});

// 获取当前用户信息
router.get('/me', authRequired, (req, res) => {
  const user = db.prepare(`SELECT ${SAFE_USER_COLS} FROM users WHERE id = ?`).get(req.currentUser!.id) as any;
  if (!user) {
    return fail(res, '用户不存在', 404, 404);
  }
  success(res, toCamel(user));
});

// 修改密码
router.put('/password', authRequired, (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) {
    return fail(res, '原密码和新密码为必填项');
  }
  if (newPassword.length < 6) {
    return fail(res, '新密码长度至少6位');
  }

  const user = db.prepare('SELECT password FROM users WHERE id = ?').get(req.currentUser!.id) as any;
  if (!bcrypt.compareSync(oldPassword, user.password)) {
    return fail(res, '原密码错误');
  }

  const hashedPassword = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashedPassword, req.currentUser!.id);
  success(res, null, '密码修改成功');
});

// 退出登录
router.post('/logout', authRequired, (_req, res) => {
  success(res, null, '已退出登录');
});

export default router;
