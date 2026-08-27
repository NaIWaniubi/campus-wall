import { describe, it, expect } from 'vitest';
import { shouldLiftBan } from '../../utils/auth-helpers.js';

describe('auth-helpers.shouldLiftBan（liftExpiredBan 纯决策函数）', () => {
  const NOW = new Date('2026-01-15T12:00:00Z').getTime();

  it('case 1: banned + ban_until 已过 → true（应解封）', () => {
    const user = {
      status: 'banned',
      ban_until: new Date(NOW - 60_000).toISOString(), // 60s 前过期
    };
    expect(shouldLiftBan(user, NOW)).toBe(true);
  });

  it('case 2: banned + ban_until 未过 → false（仍 banned）', () => {
    const user = {
      status: 'banned',
      ban_until: new Date(NOW + 60_000).toISOString(), // 60s 后才过期
    };
    expect(shouldLiftBan(user, NOW)).toBe(false);
  });

  it('case 3: 非 banned 状态 → false（不动）', () => {
    expect(shouldLiftBan({ status: 'active' }, NOW)).toBe(false);
    expect(shouldLiftBan({ status: 'active', ban_until: null }, NOW)).toBe(false);
  });
});
