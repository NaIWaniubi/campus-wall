/**
 * 认证路由：注册、登录、获取当前用户、修改密码、微信登录
 */
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import https from 'https';
import crypto from 'crypto';
import { db } from '../db.js';
import { generateToken } from '../utils/jwt.js';
import { authRequired, liftExpiredBan } from '../middleware/auth.js';
import { authRateLimit, recordAuthFailure, clearAuthFailures } from '../middleware/rateLimit.js';
import { success, fail, toCamel } from '../utils/response.js';

const router = Router();

/**
 * 调用微信 jscode2session（https.get，5 秒超时）
 * 返回微信原始响应；网络失败/超时/非 JSON 统一返回空对象
 */
function wxCode2Session(appid: string, secret: string, code: string): Promise<any> {
  return new Promise((resolve) => {
    const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${encodeURIComponent(appid)}&secret=${encodeURIComponent(secret)}&js_code=${encodeURIComponent(code)}&grant_type=authorization_code`;
    const req = https.get(url, { timeout: 5000 }, (r) => {
      let body = '';
      r.on('data', (chunk) => (body += chunk));
      r.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch {
          resolve({});
        }
      });
    });
    req.on('timeout', () => {
      req.destroy();
      resolve({});
    });
    req.on('error', () => resolve({}));
  });
}

// 微信登录：按 openid 找/建用户并签发常规 JWT（响应形状与 /login 一致）
router.post('/wx-login', async (req, res) => {
  const { code } = req.body || {};
  if (!code || typeof code !== 'string') {
    return fail(res, 'code 为必填项');
  }

  const appid = process.env.WX_APPID;
  const secret = process.env.WX_SECRET;
  if (!appid || !secret) {
    return fail(res, '微信登录未配置', 501);
  }

  const session = await wxCode2Session(appid, secret, code);
  if (!session.openid) {
    const msg = session.errmsg ? `微信登录失败：${session.errmsg}` : '微信登录失败，请稍后重试';
    return fail(res, msg);
  }
  const openid: string = session.openid;

  let user = db.prepare('SELECT * FROM users WHERE openid = ?').get(openid) as any;
  if (!user) {
    // 自动建号：学号 wx_+openid 前 8 位（冲突加后缀）、昵称'微信用户'+随机数、随机密码不可知
    let studentId = `wx_${openid.slice(0, 8)}`;
    while (db.prepare('SELECT id FROM users WHERE student_id = ?').get(studentId)) {
      studentId = `wx_${openid.slice(0, 8)}_${crypto.randomBytes(2).toString('hex')}`;
    }
    const nickname = `微信用户${Math.floor(100000 + Math.random() * 900000)}`;
    const randomPassword = bcrypt.hashSync(crypto.randomBytes(24).toString('hex'), 10);
    const result = db
      .prepare("INSERT INTO users (student_id, password, nickname, openid, role, status, credit_score) VALUES (?, ?, ?, ?, 'user', 'active', 100)")
      .run(studentId, randomPassword, nickname, openid);
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid) as any;
  }

  if (user.status === 'banned' && liftExpiredBan(user)) user.status = 'active';

  if (user.status === 'banned') {
    const banUntil = user.ban_until ? new Date(user.ban_until).toLocaleString('zh-CN') : '永久';
    return fail(res, `账号已被封禁，原因：${user.ban_reason || '违规'}，解封时间：${banUntil}`, 1003);
  }

  const token = generateToken({ id: user.id, studentId: user.student_id, role: user.role });
  success(res, { token, user: toCamel(user) }, '登录成功');
});

// 学号格式校验：纯数字，6-12位
function isValidStudentId(id: string): boolean {
  return /^\d{6,12}$/.test(id) || id === 'admin';
}

// 注册
router.post('/register', authRateLimit, (req, res) => {
  const { studentId, password, nickname, college, grade } = req.body;

  if (!studentId || !password || !nickname) {
    return fail(res, '学号、密码、昵称为必填项');
  }
  if (!isValidStudentId(studentId)) {
    return fail(res, '学号格式不正确，应为6-12位数字');
  }
  if (password.length < 6) {
    return fail(res, '密码长度至少6位');
  }
  if (!nickname.trim()) {
    return fail(res, '昵称不能为空');
  }

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

  const user = db.prepare('SELECT id, student_id, nickname, avatar, college, grade, signature, credit_score, role, status, created_at FROM users WHERE id = ?').get(userId) as any;

  success(res, { token, user: toCamel(user) }, '注册成功');
});

// 登录
router.post('/login', authRateLimit, (req, res) => {
  const { studentId, password } = req.body;

  if (!studentId || !password) {
    return fail(res, '学号和密码为必填项');
  }

  const user = db.prepare('SELECT * FROM users WHERE student_id = ?').get(studentId) as any;
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
  success(res, { token, user: toCamel(user) }, '登录成功');
});

// 获取当前用户信息
router.get('/me', authRequired, (req, res) => {
  const user = db.prepare('SELECT id, student_id, nickname, avatar, college, grade, signature, credit_score, role, status, created_at FROM users WHERE id = ?').get(req.currentUser!.id) as any;
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
router.post('/logout', authRequired, (req, res) => {
  success(res, null, '已退出登录');
});

export default router;
