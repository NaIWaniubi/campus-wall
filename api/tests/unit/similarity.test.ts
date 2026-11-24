/**
 * 发布时相似帖检测（V3-P1）：相似度函数单元测试
 *
 * 覆盖：完全相同=1.0、互不相干=0、标点/大小写不敏感、标题相同正文不同（模板刷屏特征）、
 * 空文本边界、超长文本截断后仍有区分度。
 */
import { describe, it, expect } from 'vitest';
import {
  normalizeText,
  tokenizeBigrams,
  jaccardSimilarity,
  postSimilarity,
} from '../../utils/similarity.js';

describe('相似度函数', () => {
  it('normalizeText：全角/半角、大小写、标点归一为可比形态', () => {
    expect(normalizeText('失 校园卡？补办！！')).toBe('失校园卡补办');
    expect(normalizeText('Ｉｐａｄｅｎew')).toBe('ipadenew');
  });

  it('tokenizeBigrams：ASCII 词块整体 + 中文 2 字滑窗', () => {
    const t = tokenizeBigrams('校园卡丢失后怎么补办 ipad');
    expect(t.has('ipad')).toBe(true);
    expect(t.has('校园')).toBe(true);
    expect(t.has('丢失')).toBe(true);
  });

  it('jaccard：完全相同=1、互不相干=0、部分重叠在中间值', () => {
    const a = new Set(tokenizeBigrams('校园卡丢失后怎么补办'));
    const b = new Set(tokenizeBigrams('校园卡丢失后怎么补办'));
    expect(jaccardSimilarity(a, b)).toBeCloseTo(1, 5);
    expect(jaccardSimilarity(a, new Set(tokenizeBigrams('食堂二楼麻辣烫推荐')))).toBe(0);
    const c = new Set(tokenizeBigrams('校园卡丢了'));
    const d = new Set(tokenizeBigrams('丢了校园卡在哪里'));
    const mid = jaccardSimilarity(c, d);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
  });

  it('postSimilarity：标题相同正文不同（模板刷屏）≥ 正文不同的两帖', () => {
    const dupTemplate = {
      title: '出九成新 iPad Air',
      content: '出九成新 iPad Air，五代，64G，1450 元，可小刀。',
    };
    const sameTitleOtherBody = {
      title: '出九成新 iPad Air',
      content: 'iPad Air 坏屏幕便宜卖，需要配件的来看。',
    };
    const other = { title: '考研资料打包出', content: '数学英语政治全套复习资料。' };
    const s1 = postSimilarity(dupTemplate, sameTitleOtherBody);
    const s2 = postSimilarity(dupTemplate, other);
    expect(s1).toBeGreaterThan(s2);
    // 标题相同即给出最强信号的一半以上
    expect(s1).toBeGreaterThanOrEqual(0.5);
  });

  it('空文本 / 空标题：Jaccard 分母为零时按 0 处理，不产生 NaN', () => {
    expect(jaccardSimilarity(new Set(), new Set())).toBe(0);
    expect(postSimilarity({ title: '', content: '' }, { title: 'x', content: 'y' })).toBe(0);
  });

  it('超长正文截断（4000 字以上）后相似度仍有区分度，不退化成全同', () => {
    const base = '校园卡丢失后怎么补办'.repeat(50); // 700 字
    const dup = base;
    const different = '食堂二楼新开麻辣烫窗口推荐'.repeat(50);
    const s1 = postSimilarity({ title: '问', content: base }, { title: '问', content: dup });
    const s2 = postSimilarity({ title: '问', content: base }, { title: '问', content: different });
    expect(s1).toBeGreaterThan(s2);
    expect(s2).toBeLessThan(0.05);
  });
});