/**
 * AI 调用量统计（内存计数，进程重启清零）
 *
 * 从 routes/ai.ts 抽出：chat/draft/summarize/digest 各入口共用的计数器，
 * 以及管理端 adminAi 的用量面板读取点。
 *
 * 说明：原文件里还有一套 checkRateLimit/userId 内存频控，但路由挂载处已有
 * aiLimiter 中间件兜底且无任何调用点，抽出时一并移除以免维护两份真相。
 */
export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export const aiStats = { date: todayStr(), today: 0, total: 0 };

// ---------- 频控（内存实现：10 秒间隔，每日 50 次） ----------
// 注意：chat 与 chat/stream 入口在进入模型链前先过这道闸，aiLimiter 只是粗粒度兜底
const RATE_INTERVAL_MS = 10_000;
const RATE_DAILY_LIMIT = 50;
const rateMap = new Map<number, { lastTs: number; count: number; date: string }>();

export function checkRateLimit(userId: number): { ok: boolean; msg?: string } {
  const today = todayStr();
  let entry = rateMap.get(userId);
  if (!entry || entry.date !== today) {
    entry = { lastTs: 0, count: 0, date: today };
    rateMap.set(userId, entry);
  }
  if (Date.now() - entry.lastTs < RATE_INTERVAL_MS) {
    return { ok: false, msg: '提问太频繁啦，请稍等几秒再试' };
  }
  if (entry.count >= RATE_DAILY_LIMIT) {
    return { ok: false, msg: '今日提问次数已达上限（50 次），明天再来吧' };
  }
  entry.lastTs = Date.now();
  entry.count += 1;
  return { ok: true };
}

/** 每次成功发起 AI 调用（含降级路径）时 +1；跨天自动归零今日计数 */
export function bumpStats(): void {
  const today = todayStr();
  if (aiStats.date !== today) {
    aiStats.date = today;
    aiStats.today = 0;
  }
  aiStats.today += 1;
  aiStats.total += 1;
}