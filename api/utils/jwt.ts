/**
 * JWT 工具：生成与验证 Token
 */
import jwt, { type SignOptions } from 'jsonwebtoken';

// 优先使用环境变量，开发环境提供默认值便于开箱即用
const SECRET = process.env.JWT_SECRET || 'campus-wall-dev-secret-key-2026';
const EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
  console.warn('[安全警告] 未设置 JWT_SECRET 环境变量，正在使用默认密钥，生产环境请务必配置！');
}

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
