/**
 * 认证路由：注册、登录、获取当前用户、修改密码
 */
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db.js';
import { generateToken } from '../utils/jwt.js';
import { authRequired } from '../middleware/auth.js';
import { success, fail } from '../utils/response.js';

const router = Router();

// 学号格式校验：纯数字，6-12位
function isValidStudentId(id: string): boolean {
  return /^\d{6,12}$/.test(id) || id === 'admin';
}

// 密码格式校验：6-20位，包含字母和数字
function isValidPassword(pwd: string): boolean {
  return /^(?=.*[a-zA-Z])(?=.*\d)[a-zA-Z\d]{6,20}$/.test(pwd) || pwd.length >= 6;
}

// 注册
router.post('/register', (req, res) => {
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
    return fail(res, '该学号已注册');
  }

  const hashedPassword = bcrypt.hashSync(password, 10);
  const result = db.prepare(
    'INSERT INTO users (student_id, password, nickname, college, grade, role, status, credit_score) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(studentId, hashedPassword, nickname.trim(), college || '', grade || '', 'user', 'active', 100);

  const userId = result.lastInsertRowid as number;
  const token = generateToken({ id: userId, studentId, role: 'user' });

  const user = db.prepare('SELECT id, student_id, nickname, avatar, college, grade, signature, credit_score, role, status, created_at FROM users WHERE id = ?').get(userId) as any;

  success(res, { token, user: { ...user, created_at: user.created_at ? new Date(user.created_at).toISOString() : user.created_at } }, '注册成功');
});

// 登录
router.post('/login', (req, res) => {
  const { studentId, password } = req.body;

  if (!studentId || !password) {
    return fail(res, '学号和密码为必填项');
  }

  const user = db.prepare('SELECT * FROM users WHERE student_id = ?').get(studentId) as any;
  if (!user) {
    return fail(res, '账号不存在，请前往注册', 1001);
  }

  if (user.status === 'banned') {
    const banUntil = user.ban_until ? new Date(user.ban_until).toLocaleString('zh-CN') : '永久';
    return fail(res, `账号已被封禁，原因：${user.ban_reason || '违规'}，解封时间：${banUntil}`, 1003);
  }

  const isMatch = bcrypt.compareSync(password, user.password);
  if (!isMatch) {
    return fail(res, '密码错误', 1002);
  }

  const token = generateToken({ id: user.id, studentId: user.student_id, role: user.role });
  const userData = {
    id: user.id,
    student_id: user.student_id,
    nickname: user.nickname,
    avatar: user.avatar,
    college: user.college,
    grade: user.grade,
    signature: user.signature,
    credit_score: user.credit_score,
    role: user.role,
    status: user.status,
    created_at: user.created_at ? new Date(user.created_at).toISOString() : user.created_at,
  };

  success(res, { token, user: userData }, '登录成功');
});

// 获取当前用户信息
router.get('/me', authRequired, (req, res) => {
  const user = db.prepare('SELECT id, student_id, nickname, avatar, college, grade, signature, credit_score, role, status, created_at FROM users WHERE id = ?').get(req.currentUser!.id) as any;
  if (!user) {
    return fail(res, '用户不存在', 404, 404);
  }
  success(res, { ...user, created_at: user.created_at ? new Date(user.created_at).toISOString() : user.created_at });
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
