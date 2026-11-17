import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import { generateToken, generateRefreshToken, verifyToken } from '../../utils/jwt.js';

describe('JWT Utility', () => {
  it('generates a valid JWT token string', () => {
    const payload = { id: 1001, studentId: '20240001', role: 'student' };
    const token = generateToken(payload);
    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3);
  });

  it('verifies and decodes token correctly', () => {
    const payload = { id: 1002, studentId: '20240002', role: 'super_admin' };
    const token = generateToken(payload);
    const decoded = verifyToken(token);

    expect(decoded).not.toBeNull();
    expect(decoded?.id).toBe(payload.id);
    expect(decoded?.studentId).toBe(payload.studentId);
    expect(decoded?.role).toBe(payload.role);
  });

  it('returns null for tampered or invalid token', () => {
    const payload = { id: 1003, studentId: '20240003', role: 'student' };
    const token = generateToken(payload);
    const tampered = token.slice(0, -5) + 'xxxxx';

    expect(verifyToken(tampered)).toBeNull();
    expect(verifyToken('invalid.token.here')).toBeNull();
    expect(verifyToken('')).toBeNull();
  });
});

describe('JWT 双 token（access/refresh）', () => {
  const payload = { id: 2001, studentId: '20242001', role: 'user', ver: 3 };

  it('access token 带 type=access 且通过签名校验', () => {
    const token = generateToken(payload);
    const decoded = verifyToken(token);
    expect(decoded?.type).toBe('access');
    expect(decoded?.id).toBe(payload.id);
    expect(decoded?.ver).toBe(3);
  });

  it('refresh token 带 type=refresh，且与 access token 可区分', () => {
    const refresh = generateRefreshToken(payload);
    const decoded = verifyToken(refresh);
    expect(decoded?.type).toBe('refresh');
    expect(decoded?.id).toBe(payload.id);
    expect(decoded?.ver).toBe(3);
  });

  it('升级前的旧 token（无 type 字段）按 access 兼容处理', () => {
    // 手工签发一个不含 type 的 token（等价升级前形态），用同一 SECRET
    const legacy = jwt.sign(
      { id: 2002, studentId: '20242002', role: 'user', ver: 0 },
      process.env.JWT_SECRET || 'campus-wall-dev-secret-key-2026',
      { expiresIn: '1h' }
    );
    const decoded = verifyToken(legacy);
    expect(decoded).not.toBeNull();
    expect(decoded?.type).toBe('access');
  });

  it('refresh token 不能被当作 access 之外的用途滥用：篡改 type 即签名失效', () => {
    const refresh = generateRefreshToken(payload);
    const parts = refresh.split('.');
    const header = parts[0]!;
    const sig = parts[2]!;
    const parsed = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString());
    parsed.type = 'access';
    const forged = `${header}.${Buffer.from(JSON.stringify(parsed)).toString('base64url')}.${sig}`;
    // 载荷被改后签名不匹配，verifyToken 必须返回 null
    expect(verifyToken(forged)).toBeNull();
  });
});
