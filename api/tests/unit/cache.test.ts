import { describe, it, expect, beforeEach } from 'vitest';
import { cacheSet, cacheGet, cacheInvalidate, cacheClear, cacheStats } from '../../utils/cache.js';

describe('LRU + TTL Memory Cache', () => {
  beforeEach(() => {
    cacheClear();
  });

  it('stores and retrieves values correctly', () => {
    cacheSet('user:1', { name: 'Alice' }, 10_000);
    const cached = cacheGet<{ name: string }>('user:1');
    expect(cached).toEqual({ name: 'Alice' });
  });

  it('returns undefined on cache miss', () => {
    const miss = cacheGet('non_existent_key');
    expect(miss).toBeUndefined();
  });

  it('invalidates cache entries by prefix', () => {
    cacheSet('posts:section:1', [1, 2, 3], 10_000);
    cacheSet('posts:section:2', [4, 5, 6], 10_000);
    cacheSet('users:1', { name: 'Bob' }, 10_000);

    const cleared = cacheInvalidate('posts:');
    expect(cleared).toBe(2);
    expect(cacheGet('posts:section:1')).toBeUndefined();
    expect(cacheGet('posts:section:2')).toBeUndefined();
    expect(cacheGet('users:1')).toBeDefined();
  });

  it('expires items after TTL passes', async () => {
    cacheSet('temp:1', 'expiring_value', 10); // 10ms TTL
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(cacheGet('temp:1')).toBeUndefined();
  });

  it('tracks cache statistics (hits, misses, hitRate)', () => {
    cacheSet('stat:key', 'val', 10_000);
    cacheGet('stat:key'); // hit 1
    cacheGet('stat:key'); // hit 2
    cacheGet('missing');  // miss 1

    const s = cacheStats();
    expect(s.hits).toBe(2);
    expect(s.misses).toBe(1);
    expect(s.hitRate).toBeGreaterThan(60);
  });
});
