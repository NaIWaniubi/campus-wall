/**
 * 敏感词匹配单测（audit-quality Q30 固守）：
 * 1. ASCII 词边界——「USB」不得被 sb 子串误杀
 * 2. 独立 ASCII 词命中仍有效
 * 3. assessRisk 三级分级与 getRiskLevel 旧接口映射
 * 4. findSensitiveHits 位置提取（高亮预留）
 */
import { describe, it, expect } from 'vitest';
import {
  containsSensitiveWord,
  assessRisk,
  getRiskLevel,
  findSensitiveHits,
  normalizeForMatch,
  sensitiveStats,
} from '../../utils/sensitive.js';

describe('sensitive ASCII 词边界匹配', () => {
  it('USB 不应被 sb 子串误杀（Q30 回归固守）', () => {
    const r = containsSensitiveWord('我的 USB 找不到了，帮忙看看什么情况');
    expect(r.hit).toBe(false);
    expect(r.words).toEqual([]);
  });

  it('独立出现的 ASCII 敏感词仍命中', () => {
    const r = containsSensitiveWord('你就是个 sb');
    expect(r.hit).toBe(true);
    expect(r.words).toContain('sb');
  });

  it('中文词仍然子串命中', () => {
    const r = containsSensitiveWord('这里有洗钱活动');
    expect(r.hit).toBe(true);
    expect(r.words).toContain('洗钱');
  });
});

describe('assessRisk / getRiskLevel 分级', () => {
  it('review 硬词 → review / reject', () => {
    expect(assessRisk('标题', '涉毒品内容').level).toBe('review');
    expect(getRiskLevel('涉毒品内容')).toBe('reject');
  });

  it('灰词（仅 warn 词表）→ assessRisk warn；getRiskLevel 兼容口径为基础词表不含灰词 → safe', () => {
    expect(assessRisk('', '刷单兼职').level).toBe('warn');
    expect(getRiskLevel('刷单兼职')).toBe('safe');
    expect(assessRisk('今天天气', '真不错').level).toBe('pass');
    expect(getRiskLevel('今天天气真不错')).toBe('safe');
  });
});

describe('findSensitiveHits 位置提取', () => {
  it('返回命中词与首个下标（大小写不敏感）', () => {
    const hits = findSensitiveHits('这是 SB 行为', ['sb']);
    expect(hits).toEqual([{ word: 'sb', index: 3 }]);
  });

  it('词边界内不误报位置', () => {
    expect(findSensitiveHits('USB drive', ['sb'])).toEqual([]);
  });
});

describe('变体绕过检测（谐音 / 全角 / 分隔符）', () => {
  it('归一化：全角字母、分隔符、谐音都收敛到标准写法', () => {
    expect(normalizeForMatch('ｓｂ')).toBe('sb');
    expect(normalizeForMatch('傻 * 逼')).toBe('傻逼');
    expect(normalizeForMatch('傻 B')).toBe('傻逼');
    expect(normalizeForMatch('S-B')).toBe('sb');
  });

  it('「傻*逼」这类插入分隔符的写法仍被识别为 warn', () => {
    const r = assessRisk('', '你就是个傻*逼');
    expect(r.level).toBe('warn');
  });

  it('全角「ｓｂ」仍命中（不再靠肉眼判断全角）', () => {
    const r = containsSensitiveWord('你真是个ｓｂ');
    expect(r.hit).toBe(true);
  });

  it('谐音变体「煞笔」命中', () => {
    expect(assessRisk('', '这人是个煞笔').level).toBe('warn');
  });

  it('拆字变体「傻 B」命中', () => {
    expect(assessRisk('', '傻 B 行为').level).toBe('warn');
  });

  it('正常文本不被变体归一化误伤', () => {
    // 正常英文型号（带词边界的 sb 不应命中）
    expect(assessRisk('', 'The SB-1000 model is a device').level).toBe('pass');
    // 正常中文句子
    expect(assessRisk('', '周末一起去操场跑步，顺便聊聊实习的事').level).toBe('pass');
  });

  it('词库规模可查（答辩时说明覆盖面）', () => {
    const s = sensitiveStats();
    expect(s.total).toBeGreaterThan(40);
    expect(s.review).toBeGreaterThan(15);
    expect(s.warn).toBeGreaterThan(10);
    expect(s.variants).toBeGreaterThan(10);
  });
});
