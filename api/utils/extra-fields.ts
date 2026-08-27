/**
 * 帖子 extraFields 工具：白名单清洗 + 浅合并（审计 P2-8 第 1 点修复）
 *
 * - sanitizeExtraFields：仅保留白名单键；值限定 string/number；过 200 字符丢弃；非对象/数组返回空
 * - mergeExtraFields：浅合并语义（请求键覆盖库中键，未传键保留）—— 避免编辑漏带 direction 等键
 *   把整组 extra 抹掉、帖子从对应 tab 消失
 */
export const EXTRA_FIELD_WHITELIST = [
  'price', 'contact', 'location', 'tradeType',
  'condition', 'time', 'itemType', 'organizer', 'direction',
] as const;

export const MAX_EXTRA_VALUE_LEN = 200;

export type ExtraFields = Record<string, string>;

export function sanitizeExtraFields(input: unknown): ExtraFields {
  const cleaned: ExtraFields = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return cleaned;
  for (const key of Object.keys(input as Record<string, unknown>)) {
    if (!EXTRA_FIELD_WHITELIST.includes(key as any)) continue;
    const val = (input as Record<string, unknown>)[key];
    if (val === null || val === undefined) continue;
    // 仅允许原始值：拒绝对象/数组嵌套（防存储膨胀/注入）
    if (typeof val === 'object') continue;
    const str = String(val);
    if (str.length > MAX_EXTRA_VALUE_LEN) continue;
    cleaned[key] = str;
  }
  return cleaned;
}

/**
 * 浅合并：existing 全部键打底，incoming（已过白名单）覆盖 existing 的同键；
 * 未在 incoming 出现的 existing 键全部保留（关键：编辑漏带 direction 不会抹掉原值）
 */
export function mergeExtraFields(
  existing: Record<string, unknown> | null | undefined,
  incoming: ExtraFields
): Record<string, unknown> {
  return { ...(existing || {}), ...incoming };
}
