/**
 * JWT 工具：生成与验证 Token
 */
// 本模块在顶层读取 NODE_ENV / JWT_SECRET，先确保 .env 已加载，避免密钥取错
import '../env.js';
import { randomUUID } from 'node:crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { logger } from './logger.js';

const DEV_SECRET = 'campus-wall-dev-secret-key-2026';

// 是否为生产环境：NODE_ENV=production 或 PRODUCTION=1 均可标记
const isProduction =
  process.env.NODE_ENV === 'production' || process.env.PRODUCTION === '1';

let SECRET: string;

if (isProduction) {
  // 生产环境：缺少 JWT_SECRET 直接拒绝启动，禁止回退默认密钥
  if (!process.env.JWT_SECRET) {
    throw new Error(
      '[启动失败] 生产环境必须配置 JWT_SECRET 环境变量（set JWT_SECRET=...），未配置时拒绝启动以避免 token 可被伪造的安全风险。'
    );
  }
  SECRET = process.env.JWT_SECRET;
} else {
  // 开发环境：保留默认密钥，但打印一次性安全警告
  SECRET = process.env.JWT_SECRET || DEV_SECRET;
  if (!process.env.JWT_SECRET) {
    logger.warn('当前使用开发默认 JWT_SECRET，仅可用于本地开发；部署到生产环境（NODE_ENV=production 或 PRODUCTION=1）前必须配置 JWT_SECRET');
  }
}

const EXPIRES_IN = process.env.JWT_EXPIRES_IN || '2h';
const REFRESH_EXPIRES = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

/**
 * 生成 access token（默认 2h）。携带 type 标记以便与 refresh token 区分。
 */
export function generateToken(payload: { id: number; studentId: string; role: string; ver?: number }): string {
  const options: SignOptions = { expiresIn: EXPIRES_IN as any };
  return jwt.sign(
    { id: payload.id, studentId: payload.studentId, role: payload.role, ver: payload.ver ?? 0, type: 'access' },
    SECRET,
    options
  );
}

/**
 * 生成 refresh token（默认 7d）：用于无感续期。
 * 与 access token 同密钥签名，通过 type 字段区分用途。
 * 带 jti（随机 id）：续期时换发的新 refresh 与旧的不同（真正的轮换，
 * 同秒同载荷若不带 jti 会签出完全相同的串），也为将来接服务端吊销名单留出抓手。
 */
export function generateRefreshToken(payload: { id: number; studentId: string; role: string; ver?: number }): string {
  const options: SignOptions = { expiresIn: REFRESH_EXPIRES as any };
  return jwt.sign(
    {
      id: payload.id,
      studentId: payload.studentId,
      role: payload.role,
      ver: payload.ver ?? 0,
      type: 'refresh',
      jti: randomUUID(),
    },
    SECRET,
    options
  );
}

export interface TokenPayload {
  id: number;
  studentId: string;
  role: string;
  ver: number;
  type: string;
  /** refresh token 的一次性 id（单次消费/重用检测用）；旧 token 无此字段 */
  jti?: string;
  /** 过期时间（秒，JWT 标准），用于 jti 记录的过期清理 */
  exp?: number;
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    const raw = jwt.verify(token, SECRET) as any;
    return {
      id: raw.id,
      studentId: raw.studentId,
      role: raw.role,
      // 兼容升级前签发的旧 token（无 ver 字段）：视为 0
      ver: Number(raw.ver ?? 0),
      // 兼容升级前签发的旧 token（无 type 字段）：视为 access
      type: raw.type || 'access',
      jti: typeof raw.jti === 'string' ? raw.jti : undefined,
      exp: typeof raw.exp === 'number' ? raw.exp : undefined,
    };
  } catch {
    return null;
  }
}
