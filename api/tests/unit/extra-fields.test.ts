import { describe, it, expect } from 'vitest';
import { sanitizeExtraFields, mergeExtraFields } from '../../utils/extra-fields.js';

describe('extra-fields', () => {
  describe('sanitizeExtraFields + mergeExtraFields 浅合并语义（审计 P2-8 第 1 点）', () => {
    it('case 1: 编辑漏带 direction 不抹掉原值（未传键保留）', () => {
      // 库里已有 price=100、direction=lost
      const existing = { price: '100', direction: 'lost' };
      // 编辑请求只传 price，不传 direction
      const incoming = sanitizeExtraFields({ price: '200' });
      const merged = mergeExtraFields(existing, incoming);
      expect(merged).toEqual({ price: '200', direction: 'lost' });
    });

    it('case 2: 传 price 覆盖原值（请求键覆盖库中键）', () => {
      const existing = { price: '100', contact: 'wx:foo' };
      const incoming = sanitizeExtraFields({ price: '999' });
      const merged = mergeExtraFields(existing, incoming);
      expect(merged.price).toBe('999');
      expect(merged.contact).toBe('wx:foo');
    });

    it('case 3: 非法键被白名单丢弃（injection 防护）', () => {
      const input = {
        price: '100',                // 合法
        direction: 'found',          // 合法
        __proto__: 'polluted',       // 非法（不在白名单）
        adminFlag: 'true',           // 非法
        nested: { evil: 1 },         // 对象嵌套被丢弃
        arr: [1, 2, 3],              // 数组被丢弃
        tooLong: 'x'.repeat(300),    // 超 200 字符被丢弃
      };
      const out = sanitizeExtraFields(input);
      expect(out).toEqual({ price: '100', direction: 'found' });
    });
  });
});
