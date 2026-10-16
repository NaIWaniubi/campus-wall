import { describe, it, expect } from 'vitest';
import { generateToken, verifyToken } from '../../utils/jwt.js';

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
