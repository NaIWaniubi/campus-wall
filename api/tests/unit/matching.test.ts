import { describe, it, expect } from 'vitest';
import {
  extractLocations,
  locationIntersection,
  timeDecayScore,
  daysBetween,
  buildFtsQuery,
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
