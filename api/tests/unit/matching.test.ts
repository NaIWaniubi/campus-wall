import { describe, it, expect } from 'vitest';
import {
  extractLocations,
  locationIntersection,
  timeDecayScore,
  timeFeature,
  bm25Feature,
  daysBetween,
  buildFtsQuery,
  scoreCandidate,
  MATCH_THRESHOLD,
  TIME_WINDOW_DAYS,
} from '../../utils/matching.js';

describe('智能撮合引擎 · 纯函数', () => {
  it('extractLocations 提取地点词块', () => {
    const locs = extractLocations('在一教B栋丢了耳机，昨天中午在二食堂吃过饭');
    expect(locs.size).toBeGreaterThan(0);
    expect([...locs].some((l) => l.includes('教'))).toBe(true);
    expect([...locs].some((l) => l.includes('食堂'))).toBe(true);
  });

  it('extractLocations 空文本返回空集合', () => {
    expect(extractLocations('').size).toBe(0);
    expect(extractLocations('今天天气不错').size).toBe(0);
  });

  it('locationIntersection 计算地点交集', () => {
    const a = extractLocations('一教丢了雨伞');
    const b = extractLocations('在一教门口捡到雨伞一把');
    const hits = locationIntersection(a, b);
    expect(hits.length).toBe(1);
    expect(hits[0]).toContain('教');

    // 无交集
    const c = extractLocations('图书馆捡到学生卡');
    expect(locationIntersection(a, c).length).toBe(0);
  });

  it('timeDecayScore 时间线性衰减：0天=25分，窗界=0分', () => {
    expect(timeDecayScore(0)).toBe(25);
    expect(timeDecayScore(1)).toBeGreaterThan(0);
    expect(timeDecayScore(TIME_WINDOW_DAYS)).toBe(0);
    expect(timeDecayScore(TIME_WINDOW_DAYS + 10)).toBe(0);
    // 负数钳制为 0 天
    expect(timeDecayScore(-5)).toBe(25);
  });

  it('daysBetween 计算绝对天数差', () => {
    expect(daysBetween('2026-10-15 10:00:00', '2026-10-16 10:00:00')).toBeCloseTo(1, 5);
    expect(daysBetween('2026-10-16 10:00:00', '2026-10-15 10:00:00')).toBeCloseTo(1, 5);
    // 非法日期返回时间窗（视为不匹配）
    expect(daysBetween('invalid', '2026-10-16')).toBe(TIME_WINDOW_DAYS);
  });

  it('buildFtsQuery 构造带引号的 OR 查询串', () => {
    const q = buildFtsQuery('丢了蓝牙耳机 airpods');
    expect(q).toContain('"airpods"');
    expect(q).toContain(' OR ');
    // 纯符号文本回退空查询
    expect(buildFtsQuery('!!!')).toBe('""');
  });

  it('MATCH_THRESHOLD 阈值为 60', () => {
    expect(MATCH_THRESHOLD).toBe(60);
  });
});

describe('智能撮合引擎 · 特征归一化（回归：bm25 方向缺陷）', () => {
  it('bm25Feature 相关度越高得分越高（bm25 返回负值，越相关绝对值越大）', () => {
    // 实测：更相关的候选 rank 更负
    expect(bm25Feature(-4.3)).toBeGreaterThan(bm25Feature(-1.0));
    expect(bm25Feature(-1.0)).toBeGreaterThan(bm25Feature(0));
    expect(bm25Feature(-4.3)).toBeLessThanOrEqual(1);
    expect(bm25Feature(0)).toBe(0);
  });

  it('timeFeature 同一天接近 1，超出时间窗为 0', () => {
    expect(timeFeature(0)).toBe(1);
    expect(timeFeature(7)).toBeCloseTo(0.5, 5);
    expect(timeFeature(TIME_WINDOW_DAYS)).toBe(0);
    expect(timeFeature(TIME_WINDOW_DAYS + 5)).toBe(0);
  });
});

describe('智能撮合引擎 · scoreCandidate 复合评分', () => {
  const base = {
    title: '丢失校园卡急寻',
    content: '昨天下午在图书馆三楼自习区丢了一张校园卡',
    extra_fields: '{"location":"图书馆三楼","itemType":"校园卡","direction":"lost"}',
  };

  it('品类+地点+同日+高 BM25 的候选应越过阈值', () => {
    const { score, reasons } = scoreCandidate(base, {
      title: '捡到一张校园卡',
      content: '一食堂二楼打饭窗口捡到一张校园卡',
      extra_fields: '{"location":"图书馆三楼","itemType":"校园卡","direction":"found"}',
      rank: -4.3,
      created_at: '2026-08-23 10:00:00',
    }, '2026-08-23 12:00:00');

    expect(score).toBeGreaterThanOrEqual(MATCH_THRESHOLD);
    expect(reasons.some((r) => r.includes('品类一致'))).toBe(true);
    expect(reasons.some((r) => r.includes('地点匹配'))).toBe(true);
  });

  it('品类不同且地点不同时不应越过阈值', () => {
    const { score } = scoreCandidate(base, {
      title: '捡到一串钥匙',
      content: '体育馆副馆看台捡到一串钥匙',
      extra_fields: '{"location":"体育馆副馆","itemType":"钥匙","direction":"found"}',
      rank: -4.3,
      created_at: '2026-08-23 10:00:00',
    }, '2026-08-23 12:00:00');

    expect(score).toBeLessThan(MATCH_THRESHOLD);
  });

  it('同品类但相隔整个时间窗时被时间项拉低', () => {
    const near = scoreCandidate(base, {
      title: '捡到校园卡', content: '捡到校园卡',
      extra_fields: '{"itemType":"校园卡"}',
      rank: -2, created_at: '2026-08-23 10:00:00',
    }, '2026-08-23 12:00:00');

    const far = scoreCandidate(base, {
      title: '捡到校园卡', content: '捡到校园卡',
      extra_fields: '{"itemType":"校园卡"}',
      rank: -2, created_at: '2026-07-24 10:00:00',
    }, '2026-08-23 12:00:00');

    expect(near.score).toBeGreaterThan(far.score);
  });

  it('评分是对称的：两帖互换位置后分数一致', () => {
    const a = {
      title: '丢失校园卡急寻', content: '图书馆三楼丢校园卡',
      extra_fields: '{"location":"图书馆三楼","itemType":"校园卡","direction":"lost"}',
    };
    const b = {
      title: '捡到一张校园卡', content: '一食堂二楼捡到校园卡',
      extra_fields: '{"location":"图书馆三楼","itemType":"校园卡","direction":"found"}',
      rank: -3.5, created_at: '2026-08-23 10:00:00',
    };
    const ab = scoreCandidate(a, b, '2026-08-23 12:00:00').score;
    const ba = scoreCandidate(
      { title: b.title, content: b.content, extra_fields: b.extra_fields },
      { ...a, rank: -3.5, created_at: '2026-08-23 12:00:00' },
      '2026-08-23 10:00:00'
    ).score;
    expect(Math.abs(ab - ba)).toBeLessThanOrEqual(1);
  });

  it('缺少 created_at 时不抛异常（回归：日期缺失导致 replace 崩溃）', () => {
    expect(() => scoreCandidate(base, {
      title: 'x', content: 'y', extra_fields: null,
      rank: -1, created_at: '' as any,
    }, '2026-08-23 12:00:00')).not.toThrow();
  });
});

/**
 * 对抗样本集：这些用例校准了权重与阈值语义，改动 FEATURE_WEIGHTS 或阈值必须重新跑。
 * 语义约定：只撞品类不算命中，必须至少再有一项实质证据（地点或文本）。
 */
describe('智能撮合引擎 · 对抗样本（权重/阈值语义守护）', () => {
  const q = (extra: string, created = '2026-10-28 08:00:00') => ({
    title: '丢失校园卡', content: '图书馆丢校园卡', extra_fields: extra, created_at: created,
  });
  const c = (extra: string, title = '捡到校园卡', content = '食堂捡到校园卡', created = '2026-10-28 09:00:00') => ({
    title, content, extra_fields: extra, rank: -0.01, created_at: created,
  });

  it('同品类 + 同地点 + 同时段 → 命中（核心场景）', () => {
    const r = scoreCandidate(
      q('{"location":"图书馆","itemType":"校园卡"}'),
      c('{"location":"图书馆","itemType":"校园卡"}'),
      '2026-10-28 08:00:00'
    );
    expect(r.score).toBeGreaterThanOrEqual(MATCH_THRESHOLD);
  });

  it('同品类 + 异地点 + 文本重合 → 命中（品类是最强信号）', () => {
    const r = scoreCandidate(
      q('{"location":"图书馆","itemType":"校园卡"}'),
      c('{"location":"食堂","itemType":"校园卡"}', '捡到校园卡', '捡到一张校园卡'),
      '2026-10-28 08:00:00'
    );
    expect(r.score).toBeGreaterThanOrEqual(MATCH_THRESHOLD);
  });

  it('异品类 + 同地点 → 不命中（地点不能单独构成命中）', () => {
    const r = scoreCandidate(
      q('{"location":"图书馆","itemType":"校园卡"}'),
      c('{"location":"图书馆","itemType":"钥匙"}', '捡到钥匙', '图书馆捡到钥匙'),
      '2026-10-28 08:00:00'
    );
    expect(r.score).toBeLessThan(MATCH_THRESHOLD);
  });

  it('完全无关 → 不命中', () => {
    const r = scoreCandidate(
      q('{"location":"图书馆","itemType":"校园卡"}'),
      c('{"location":"东门","itemType":"自行车"}', '出二手自行车', '出九成新自行车'),
      '2026-10-28 08:00:00'
    );
    expect(r.score).toBeLessThan(MATCH_THRESHOLD);
  });

  it('同品类 + 异地点 + 相隔 27 天 → 不命中（时间窗与近因共同抑制）', () => {
    const r = scoreCandidate(
      q('{"location":"图书馆","itemType":"校园卡"}', '2026-10-01 08:00:00'),
      c('{"location":"食堂","itemType":"校园卡"}', '捡到校园卡', '食堂捡到校园卡', '2026-10-28 08:00:00'),
      '2026-10-01 08:00:00'
    );
    expect(r.score).toBeLessThan(MATCH_THRESHOLD);
  });

  it('超出时间窗 → 分数直接归零（硬过滤，不再靠时间项衰减）', () => {
    const r = scoreCandidate(
      q('{"location":"宿舍楼","itemType":"钥匙"}', '2026-09-28 08:00:00'),
      c('{"location":"宿舍楼","itemType":"钥匙"}', '捡到钥匙', '宿舍捡到钥匙', '2026-10-28 08:00:00'),
      '2026-09-28 08:00:00'
    );
    expect(r.score).toBe(0);
    expect(r.reasons).toContain('超出时间窗');
  });

  it('双方都无 itemType 时按地点+文本判定（权重自适应不虚高）', () => {
    // 注意：这里必须让 query 与候选描述同一物品，否则文本特征本就该为 0
    const same = scoreCandidate(
      { title: '丢失雨伞', content: '教学楼丢雨伞', extra_fields: '{"location":"教学楼"}' },
      { title: '捡到雨伞', content: '教学楼捡到雨伞', extra_fields: '{"location":"教学楼"}', rank: -0.01, created_at: '2026-10-28 09:00:00' },
      '2026-10-28 08:00:00'
    );
    expect(same.score).toBeGreaterThanOrEqual(MATCH_THRESHOLD);

    const diff = scoreCandidate(
      { title: '丢失雨伞', content: '教学楼丢雨伞', extra_fields: '{"location":"教学楼"}' },
      { title: '出二手自行车', content: '出九成新自行车', extra_fields: '{"location":"东门"}', rank: -0.01, created_at: '2026-10-28 09:00:00' },
      '2026-10-28 08:00:00'
    );
    expect(diff.score).toBeLessThan(MATCH_THRESHOLD);
  });
});
