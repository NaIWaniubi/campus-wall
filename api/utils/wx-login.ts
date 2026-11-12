/**
 * 微信静默登录 handler（供 /api/auth/wx-login 使用）
 *
 * 契约（与小程序 utils/auth.js 的 silentCodes: [501] 对齐）：
 *   未配置 WX_APPID / WX_SECRET → 501，端上静默回退学号密码表单登录
 *   微信接口报错                → 400
 *   已绑定 openid               → 直接签发 JWT
 *   未绑定                      → 首次登录创建占位账号（信誉 100），
 *                                 学生可用学号密码登录后再由管理端/自助绑定
 *
 * 单独成模块的原因：路由文件顶层读 process.env 会早于 api/env.ts 的 dotenv 加载，
 * 因此所有配置读取都在函数内运行时进行。
 */
import type { Request, Response } from 'express';
import { db } from '../db.js';
import { success, fail, toCamel } from '../utils/response.js';
import { generateToken } from '../utils/jwt.js';
import { logger } from '../utils/logger.js';

export const SAFE_USER_COLS = `id, student_id, nickname, avatar, college, grade, signature, credit_score, role, status, ban_reason, ban_until, openid, token_version, created_at`;

const wxAppId = () => process.env.WX_APPID?.trim() || '';
const wxSecret = () => process.env.WX_SECRET?.trim() || '';

/** 是否具备微信登录能力（未配置时走 501 降级） */
export function isWxLoginEnabled(): boolean {
  return !!(wxAppId() && wxSecret());
}

/** 用 code 换取 openid（jscode2session） */
async function code2Session(code: string): Promise<{ openid: string }> {
  const url =
    'https://api.weixin.qq.com/sns/jscode2session' +
    `?appid=${encodeURIComponent(wxAppId())}` +
    `&secret=${encodeURIComponent(wxSecret())}` +
    `&js_code=${encodeURIComponent(code)}` +
    '&grant_type=authorization_code';

  const resp = await fetch(url, { method: 'GET' });
  if (!resp.ok) throw new Error(`jscode2session HTTP ${resp.status}`);
  const data = (await resp.json()) as any;
  if (!data.openid) {
    throw new Error(`jscode2session errcode=${data.errcode ?? 'unknown'} ${data.errmsg ?? ''}`.trim());
  }
  return { openid: String(data.openid) };
}

export async function wxLoginHandler(req: Request, res: Response) {
  // 未配置：501 让端上静默降级（返回 400 会让小程序每次启动弹错误框）
  if (!isWxLoginEnabled()) {
    return fail(res, '微信登录未配置，请使用学号密码登录', 501, 501);
  }

  const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
  if (!code) return fail(res, '缺少 wx.login code', 400, 400);

  let openid: string;
  try {
    ({ openid } = await code2Session(code));
  } catch (e: any) {
    logger.warn('wx-login jscode2session failed', { error: e?.message });
    return fail(res, '微信登录失败，请重试或使用学号密码登录', 400, 400);
  }

  // 已绑定：直接登录
  const bound = db.prepare(`SELECT ${SAFE_USER_COLS} FROM users WHERE openid = ?`).get(openid) as any;
  if (bound) {
    if (bound.status === 'banned') {
      const banUntil = bound.ban_until ? new Date(bound.ban_until).toLocaleString('zh-CN') : '永久';
      return fail(
        res,
        `账号已被封禁，原因：${bound.ban_reason || '违规'}，解封时间：${banUntil}`,
        1003,
        403
      );
    }
    const token = generateToken({ id: bound.id, studentId: bound.student_id, role: bound.role });
    return success(res, { token, user: toCamel(bound), isNewUser: false }, '登录成功');
  }

  // 未绑定：创建占位账号。student_id 由 openid 派生，保证唯一且不能拿来猜他人学号
  const placeholderStudentId = `wx_${openid.slice(0, 16)}`;
  const nickname =
    typeof req.body?.nickname === 'string' && req.body.nickname.trim()
      ? req.body.nickname.trim().slice(0, 20)
      : '微信用户';

  const result = db.prepare(
    'INSERT INTO users (student_id, password, nickname, role, status, credit_score, openid) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(placeholderStudentId, 'wx-no-password', nickname, 'user', 'active', 100, openid);

  const userId = Number(result.lastInsertRowid);
  const user = db.prepare(`SELECT ${SAFE_USER_COLS} FROM users WHERE id = ?`).get(userId) as any;
  const token = generateToken({ id: userId, studentId: placeholderStudentId, role: 'user' });

  logger.info('wx-login new user', { userId });
  success(res, { token, user: toCamel(user), isNewUser: true }, '登录成功');
}
