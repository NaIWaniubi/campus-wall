/**
 * 认证中间件
 */
import type { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt.js';
import { db } from '../db.js';
import { unauthorized, forbidden } from '../utils/response.js';
import { shouldLiftBan } from '../utils/auth-helpers.js';

import type { CurrentUser } from '../types/index.js';

// 扩展 Request 类型，携带当前用户
declare global {
  namespace Express {
    interface Request {
      currentUser?: CurrentUser;
    }
  }
}

/**
 * 从请求中提取 Token
 */
function extractToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) {
    return auth.slice(7);
  }
  return null;
}

/**
 * 临时封禁到期惰性解封：banned 且 ban_until 已过期则原地恢复 active（审计 P0-2）
 * @returns true 表示本次已解封
 */
export function liftExpiredBan(user: { id: number; status: string; ban_until?: string | null }): boolean {
  if (!shouldLiftBan(user)) return false;
  db.prepare("UPDATE users SET status = 'active', ban_until = NULL WHERE id = ?").run(user.id);
  return true;
}

/**
 * 登录校验中间件（必须登录）
 */
export function authRequired(req: Request, res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) {
    return unauthorized(res);
  }
  const payload = verifyToken(token);
  // type 必须为 access：refresh token（7 天）只允许在 /auth/refresh 使用，
  // 否则被盗的 refresh 等同于长寿命 access token
  if (!payload || payload.type !== 'access') {
    return unauthorized(res);
  }
  const user = db.prepare('SELECT id, student_id, nickname, role, credit_score, status, ban_until, token_version, openid FROM users WHERE id = ?').get(payload.id) as any;
  if (!user) {
    return unauthorized(res, '用户不存在');
  }
  // token 吊销：改密/封禁时 token_version 递增，旧 token 的 ver 不再匹配
  if (Number(user.token_version ?? 0) !== payload.ver) {
    return unauthorized(res, '登录状态已失效，请重新登录');
  }
  if (user.status === 'banned') {
    if (!liftExpiredBan(user)) {
      return forbidden(res, '账号已被封禁');
    }
    user.status = 'active';
  }
  req.currentUser = {
    id: user.id,
    studentId: user.student_id,
    role: user.role,
    nickname: user.nickname,
    creditScore: user.credit_score,
    status: user.status,
    openid: user.openid ?? null,
  };
  next();
}

/**
 * 可选登录中间件（有 Token 则解析，无则放行）
 */
export function authOptional(req: Request, _res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (token) {
    const payload = verifyToken(token);
    // refresh token 不作为业务身份凭据（同 authRequired 的约束）
    if (payload && payload.type === 'access') {
      const user = db.prepare('SELECT id, student_id, nickname, role, credit_score, status, ban_until, token_version, openid FROM users WHERE id = ?').get(payload.id) as any;
      if (user && Number(user.token_version ?? 0) === payload.ver) {
        if (user.status === 'banned' && liftExpiredBan(user)) user.status = 'active';
        if (user.status !== 'banned') {
          req.currentUser = {
            id: user.id,
            studentId: user.student_id,
            role: user.role,
            nickname: user.nickname,
            creditScore: user.credit_score,
            status: user.status,
            openid: user.openid ?? null,
          };
        }
      }
    }
  }
  next();
}

/**
 * 管理员权限校验中间件
 */
export function adminRequired(req: Request, res: Response, next: NextFunction) {
  if (!req.currentUser) {
    return unauthorized(res);
  }
  if (req.currentUser.role !== 'super_admin' && req.currentUser.role !== 'section_admin') {
    return forbidden(res, '需要管理员权限');
  }
  next();
}

/**
 * 超级管理员权限校验
 */
export function superAdminRequired(req: Request, res: Response, next: NextFunction) {
  if (!req.currentUser) {
    return unauthorized(res);
  }
  if (req.currentUser.role !== 'super_admin') {
    return forbidden(res, '需要超级管理员权限');
  }
  next();
}
