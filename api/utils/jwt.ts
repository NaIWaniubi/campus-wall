/**
 * JWT 工具：生成与验证 Token
 */
// 本模块在顶层读取 NODE_ENV / JWT_SECRET，先确保 .env 已加载，避免密钥取错
import '../env.js';
import jwt, { type SignOptions } from 'jsonwebtoken';

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
    console.warn(
      '[安全警告] 当前使用开发默认 JWT_SECRET，仅可用于本地开发；部署到生产环境（NODE_ENV=production 或 PRODUCTION=1）前必须配置 JWT_SECRET。'
    );
  }
}

const EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

export function generateToken(payload: { id: number; studentId: string; role: string }): string {
  const options: SignOptions = { expiresIn: EXPIRES_IN as any };
  return jwt.sign(payload, SECRET, options);
}

export function verifyToken(token: string): { id: number; studentId: string; role: string } | null {
  try {
    return jwt.verify(token, SECRET) as { id: number; studentId: string; role: string };
  } catch {
    return null;
  }
}
