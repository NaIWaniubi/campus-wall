/**
 * 认证辅助：纯决策函数（不依赖 db，便于单测）。
 * liftExpiredBan 的真正 db 副作用保留在 middleware/auth.ts，
 * 那里通过 shouldLiftBan 拿到决策后再写库。
 */
export interface BanCheckUser {
  status: string;
  ban_until?: string | null;
}

/**
 * 判定一个用户是否因封禁到期应当被解封（纯函数）。
 * 规则：
 * - 非 banned 状态 → false
 * - banned 但无 ban_until（永封）→ false
 * - banned 且 ban_until 已过（<= now）→ true
 * - banned 且 ban_until 未过 → false
 */
export function shouldLiftBan(user: BanCheckUser, now: number = Date.now()): boolean {
  if (user.status !== 'banned') return false;
  if (!user.ban_until) return false;
  const until = new Date(user.ban_until).getTime();
  if (Number.isNaN(until)) return false;
  return until <= now;
}
