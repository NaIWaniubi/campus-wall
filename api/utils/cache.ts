/**
 * 极简 LRU+TTL 内存缓存（Map 实现，零依赖）
 *
 * 设计要点：
 * - Map 迭代按插入序：get 命中时删除重插实现 LRU touch，淘汰时删首个键（最旧）
 * - 容量 200 / TTL 60s 默认，可用环境变量 CACHE_MAX_SIZE / CACHE_TTL_MS 覆盖
 * - cacheInvalidate(prefix) 按前缀批量失效，供写路径调用（如 cacheInvalidate('posts')）
 * - 支持缓存统计和监控
 */

const MAX_SIZE = Math.max(1, Number(process.env.CACHE_MAX_SIZE) || 200);
const DEFAULT_TTL_MS = Math.max(1000, Number(process.env.CACHE_TTL_MS) || 60_000);

interface CacheEntry {
  value: any;
  expiresAt: number;
}

interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  size: number;
  maxSize: number;
  hitRate: number;
}

const store = new Map<string, CacheEntry>();

// 缓存统计
let stats = {
  hits: 0,
  misses: 0,
  evictions: 0,
};

export function cacheGet<T = any>(key: string): T | undefined {
  const hit = store.get(key);
  if (!hit) {
    stats.misses++;
    return undefined;
  }
  if (Date.now() > hit.expiresAt) {
    store.delete(key);
    stats.misses++;
    stats.evictions++;
    return undefined;
  }
  // LRU touch：移到尾部
  store.delete(key);
  store.set(key, hit);
  stats.hits++;
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
    stats.evictions++;
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

/** 获取缓存统计信息（用于健康检查和监控） */
export function cacheStats(): CacheStats {
  const total = stats.hits + stats.misses;
  return {
    hits: stats.hits,
    misses: stats.misses,
    evictions: stats.evictions,
    size: store.size,
    maxSize: MAX_SIZE,
    hitRate: total > 0 ? Math.round((stats.hits / total) * 10000) / 100 : 0,
  };
}

/** 清空所有缓存（用于测试或紧急情况） */
export function cacheClear(): void {
  store.clear();
  stats = { hits: 0, misses: 0, evictions: 0 };
}

/** 预热缓存（可选功能，用于关键数据） */
export function cacheWarmup(entries: Array<{ key: string; value: any; ttlMs?: number }>): void {
  for (const entry of entries) {
    cacheSet(entry.key, entry.value, entry.ttlMs);
  }
}

/** 设置空值缓存（防止缓存穿透） */
export function cacheSetNull(key: string, ttlMs: number = 5000): void {
  cacheSet(key, null, ttlMs);
}

