/**
 * V3 AI 产品层（离线规则）单测：
 * 这些函数是大模型不可用时的兜底路径，必须有回归保护 —— 否则线上「AI 挂了」就等于整个功能挂。
 */
import { describe, it, expect } from 'vitest';
import {
  guessSectionId,
  extractTags,
  extractPrice,
  extractiveSummary,
  detectRisk,
  parseJsonLoose,
  ruleDraft,
} from '../../routes/ai.js';

describe('AI V3 · 板块判定', () => {
  it('二手交易：出/价/元 关键词命中', () => {
    expect(guessSectionId('出一个九成新 iPad Air，1500 元，可小刀')).toBe(1);
  });

  it('失物招领：丢失校园卡', () => {
    expect(guessSectionId('在图书馆丢了一张校园卡，求帮忙')).toBe(2);
  });

  it('拼车：返校/机场', () => {
    expect(guessSectionId('周日返校，机场拼车还差两人')).toBe(7);
  });

  it('没有命中时回落调用方给的板块', () => {
    expect(guessSectionId('随便说说', 6)).toBe(6);
    expect(guessSectionId('随便说说')).toBeNull();
  });
});

describe('AI V3 · 标签与价格抽取', () => {
  it('优先命中校园词表，不再切出半截词', () => {
    const tags = extractTags('出一个九成新 iPad Air，1500 元，可小刀，东门当面交易');
    expect(tags).toContain('九成新');
    expect(tags).toContain('可小刀');
    expect(tags).toContain('东门');
    expect(tags).not.toContain('出一个九');
    expect(tags.length).toBeLessThanOrEqual(4);
  });

  it('价格：元 / ¥ 两种写法都能抽到', () => {
    expect(extractPrice('1500 元可小刀')).toBe(1500);
    expect(extractPrice('¥88 出')).toBe(88);
    expect(extractPrice('免费送')).toBeNull();
  });
});

describe('AI V3 · 帖子划重点（抽取式）', () => {
  it('最多 3 条要点，且来自原文', () => {
    const text = '一年一度最盛大的舞台！本届十强选手将带来全新编曲，另有神秘嘉宾压轴。凭学生证免费入场。';
    const points = extractiveSummary('迎新晚会暨十佳歌手决赛', text);
    expect(points.length).toBeGreaterThan(0);
    expect(points.length).toBeLessThanOrEqual(3);
    for (const p of points) expect(text).toContain(p.replace('…', ''));
  });

  it('长句会被截断到 46 字以内', () => {
    const long = '这是'.repeat(60);
    const points = extractiveSummary('测试', long);
    expect(points[0]!.length).toBeLessThanOrEqual(47);
  });
});

describe('AI V3 · 风险提示', () => {
  it('先交押金 → high 且带解释', () => {
    const r = detectRisk('低价出手机，先交押金 200 元锁定名额');
    expect(r.level).toBe('high');
    expect(r.note).toContain('押金');
  });

  it('私下转账/扫码 → high', () => {
    expect(detectRisk('加微信扫码转账，马上发货').level).toBe('high');
  });

  it('含联系方式但无风险话术 → medium', () => {
    const r = detectRisk('宿舍楼下自取，联系 13800138000');
    expect(r.level).toBe('medium');
  });

  it('普通帖子 → low 且无提示', () => {
    const r = detectRisk('图书馆三楼有人捡到一把黑色雨伞，放在前台了');
    expect(r.level).toBe('low');
    expect(r.note).toBeNull();
  });
});

describe('AI V3 · 宽容 JSON 解析 / 规则成稿', () => {
  it('模型把 JSON 包进 ```json 里也能解析', () => {
    const raw = '好的，这是结果：\n```json\n{"title":"出iPad","content":"九成新","tags":["iPad"],"price":1500}\n```\n希望有帮助';
    const j = parseJsonLoose(raw);
    expect(j?.title).toBe('出iPad');
  });

  it('不是 JSON 时返回 null（调用方回落规则版）', () => {
    expect(parseJsonLoose('直接说人话，没有 JSON')).toBeNull();
  });

  it('规则成稿：标题/板块/价格/标签一次到位', () => {
    const d = ruleDraft('出一个九成新 iPad Air，1500 元，可小刀，东门当面交易');
    expect(d.title.length).toBeLessThanOrEqual(25);
    expect(d.sectionId).toBe(1);
    expect(d.sectionName).toBe('二手交易');
    expect(d.price).toBe(1500);
    expect(d.tags.length).toBeGreaterThanOrEqual(2);
  });

  it('一句话太短时补一句提示，而不是丢一句空正文', () => {
    const d = ruleDraft('出自行车');
    expect(d.content).toContain('出自行车');
    expect(d.content).toContain('还想补充');
  });
});
