import { describe, it, expect } from 'vitest';
import { applyDirectionFilter } from '../../utils/direction-filter.js';

describe('direction-filter（仅失物板块生效）', () => {
  it('case 1: sectionId=2 失物板块 + direction=lost 生效', () => {
    const r = applyDirectionFilter('lost', 2, '失物招领');
    expect(r.applied).toBe('lost');
  });

  it('case 2: sectionId=1 非失物板块时 direction 被忽略', () => {
    const r = applyDirectionFilter('found', 1, '二手市场');
    expect(r.applied).toBe('');
  });

  it('case 3: 非法 direction 值（foo）静默忽略', () => {
    expect(applyDirectionFilter('foo', 2, '失物招领').applied).toBe('');
    expect(applyDirectionFilter('', 2, '失物招领').applied).toBe('');
    expect(applyDirectionFilter(undefined, 2, '失物招领').applied).toBe('');
    // 防御：sectionId <= 0 强制忽略
    expect(applyDirectionFilter('lost', 0, '失物招领').applied).toBe('');
  });
});
