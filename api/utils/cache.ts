/**
 * 极简 LRU+TTL 内存缓存（Map 实现，零依赖）
 *
 * 设计要点：
 * - Map 迭代按插入序：get 命中时删除重插实现 LRU touch，淘汰时删首个键（最旧）
 * - 容量 200 / TTL 60s 默认，可用环境变量 CACHE_MAX_SIZE / CACHE_TTL_MS 覆盖
 * - cacheInvalidate(prefix) 按前缀批量失效，供写路径调用（如 cacheInvalidate('posts')）
 */

const MAX_SIZE = Math.max(1, Number(process.env.CACHE_MAX_SIZE) || 200);
const DEFAULT_TTL_MS = Math.max(1000, Number(process.env.CACHE_TTL_MS) || 60_000);

const store = new Map<string, { value: any; expiresAt: number }>();

export function cacheGet<T = any>(key: string): T | undefined {
  const hit = store.get(key);
  if (!hit) return undefined;
  if (Date.now() > hit.expiresAt) {
    store.delete(key);
    return undefined;
  }
  // LRU touch：移到尾部
  store.delete(key);
  store.set(key, hit);
  return hit.value as T;
}

export function cacheSet(key: string, value: any, ttlMs: number = DEFAULT_TTL_MS): void {
  if (store.has(key)) store.delete(key);
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
  // 超容淘汰最旧（Map 首个键）
  while (store.size > MAX_SIZE) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }
}

/** 按前缀失效，返回清除的条目数 */
export function cacheInvalidate(prefix: string): number {
  let removed = 0;
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) {
      store.delete(key);
      removed++;
    }
  }
  return removed;
}
