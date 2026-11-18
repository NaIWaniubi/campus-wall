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
import { generateToken, generateRefreshToken } from '../utils/jwt.js';
import { logger } from '../utils/logger.js';
import { sha256Hex } from '../utils/hash.js';

export const SAFE_USER_COLS = `id, student_id, nickname, avatar, college, grade, signature, credit_score, role, status, ban_reason, ban_until, openid, token_version, created_at`;

const wxAppId = () => process.env.WX_APPID?.trim() || '';
const wxSecret = () => process.env.WX_SECRET?.trim() || '';

/** 是否具备微信登录能力（未配置时走 501 降级） */
export function isWxLoginEnabled(): boolean {
  return !!(wxAppId() && wxSecret());
}

/** 用 code 换取 openid（jscode2session）。测试可注入替身（code2SessionOverride），生产恒为真实实现 */
async function code2Session(code: string): Promise<{ openid: string }> {
  if (code2SessionOverride) return code2SessionOverride(code);
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

/** 测试注入点（null = 走真实 jscode2session）；仅测试代码可写 */
export let code2SessionOverride: ((code: string) => Promise<{ openid: string }>) | null = null;
export function setCode2SessionOverride(fn: ((code: string) => Promise<{ openid: string }>) | null): void {
  code2SessionOverride = fn;
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
    // ver 必须带 token_version：改密/封禁会 +1，缺省 0 会让这类账号 wx 登录后每个请求都 401（登录死循环）
    const token = generateToken({ id: bound.id, studentId: bound.student_id, role: bound.role, ver: Number(bound.token_version ?? 0) });
    const refreshToken = generateRefreshToken({ id: bound.id, studentId: bound.student_id, role: bound.role, ver: Number(bound.token_version ?? 0) });
    return success(res, { token, refreshToken, user: toCamel(bound), isNewUser: false }, '登录成功');
  }

  // 未绑定：创建占位账号。student_id 由 openid 完整哈希派生（前 16 位哈希，
  // 原实现取 openid 前 16 字符，不同 openid 可能同前缀 → student_id UNIQUE 冲突），
  // 且不能拿来猜他人学号
  const placeholderStudentId = `wx_${sha256Hex(openid).slice(0, 16)}`;
  const nickname =
    typeof req.body?.nickname === 'string' && req.body.nickname.trim()
      ? req.body.nickname.trim().slice(0, 20)
      : '微信用户';

  // 并发首登：两个请求可能都查到「未绑定」→ 同时 INSERT。
  // openid 与 student_id 都是 UNIQUE，冲突时 better-sqlite3 同步抛错，
  // 原实现不捕获 → Express 收不到 next(err)，请求无响应，客户端干等到 10s 超时。
  // 这里捕获约束冲突后回查已存在行做幂等绑定（返回同一个账号）。
  let userId: number;
  try {
    const result = db.prepare(
      'INSERT INTO users (student_id, password, nickname, role, status, credit_score, openid) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(placeholderStudentId, 'wx-no-password', nickname, 'user', 'active', 100, openid);
    userId = Number(result.lastInsertRowid);
  } catch (e: any) {
    const msg = String(e?.message || '');
    if (!/UNIQUE|constraint/i.test(msg)) {
      logger.error('wx-login insert failed', { error: msg });
      return fail(res, '微信登录失败，请重试或使用学号密码登录', 500, 500);
    }
    // 并发首登：另一个请求已建好账号 → 幂等复用
    const existing = db.prepare(`SELECT ${SAFE_USER_COLS} FROM users WHERE openid = ?`).get(openid) as any;
    if (!existing) return fail(res, '微信登录失败，请重试或使用学号密码登录', 409, 409);
    const exToken = generateToken({ id: existing.id, studentId: existing.student_id, role: existing.role, ver: Number(existing.token_version ?? 0) });
    const exRefresh = generateRefreshToken({ id: existing.id, studentId: existing.student_id, role: existing.role, ver: Number(existing.token_version ?? 0) });
    return success(res, { token: exToken, refreshToken: exRefresh, user: toCamel(existing), isNewUser: false }, '登录成功');
  }
  const user = db.prepare(`SELECT ${SAFE_USER_COLS} FROM users WHERE id = ?`).get(userId) as any;
  const token = generateToken({ id: userId, studentId: placeholderStudentId, role: 'user', ver: 0 });
  const refreshToken = generateRefreshToken({ id: userId, studentId: placeholderStudentId, role: 'user', ver: 0 });

  logger.info('wx-login new user', { userId });
  success(res, { token, refreshToken, user: toCamel(user), isNewUser: true }, '登录成功');
}
