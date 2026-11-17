/**
 * V3 AI 产品层（离线规则）单测：
 * 这些函数是大模型不可用时的兜底路径，必须有回归保护 —— 否则线上「AI 挂了」就等于整个功能挂。
 */
import { describe, it, expect } from 'vitest';
import {
  guessSectionId,
  extractiveSummary,
  detectRisk,
  parseJsonLoose,
  ruleDraft,
} from '../../routes/ai.js';
import { extractTags, extractPrice } from '../../routes/ai/text.js';

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

  it('失物招领套版：抽出物品/地点/联系方式并标注捡到状态', () => {
    const d = ruleDraft('三号楼捡到一张校园卡，名字王明，放在宿管阿姨那，联系 13800001111', 2);
    expect(d.sectionName).toBe('失物招领');
    const map = Object.fromEntries(d.fields);
    expect(map['物品']).toBe('校园卡');
    expect(map['状态']).toBe('捡到待认领');
    expect(map['联系方式']).toContain('13800001111');
    // 标题带板块前缀且 ≤24
    expect(d.title.startsWith('【失物招领】')).toBe(true);
    expect(d.title.length).toBeLessThanOrEqual(25);
    expect(d.content).toContain('📌');
    // 标签必须是干净词：物品/地点优先，禁止滑窗半截词
    expect(d.tags).toContain('校园卡');
    expect(d.tags).toContain('三号楼');
    expect(d.tags.some((t) => /到一张|园卡名|字王明/.test(t))).toBe(false);
    // 原文不能被丢掉
    expect(d.content).toContain('名字王明');
  });

  it('二手交易套版：价格提前、成色识别，读起来像正文', () => {
    const d = ruleDraft('出九成新 iPad Air 4000 元 东门自提', 1);
    const map = Object.fromEntries(d.fields);
    expect(map['价格']).toBe('¥4000');
    expect(map['成色']).toContain('九成新');
    expect(d.fields.findIndex((f) => f[0] === '价格')).toBeLessThan(d.fields.findIndex((f) => f[0] === '地点'));
  });

  it('信息太少不硬凑套版（fields 为空 → 无 📌 块）', () => {
    const d = ruleDraft('随便水一条动态看看');
    expect(d.fields.length).toBe(0);
    expect(d.content).not.toContain('📌');
  });

  it('情绪板块（表白/吐槽）不套结构化清单', () => {
    const d = ruleDraft('想认识图书馆三楼穿白衣服的男生，每天下午都在', 3);
    expect(d.sectionName).toBe('表白墙');
    expect(d.fields.length).toBe(0);
    expect(d.content).not.toContain('📌');
  });
});

describe('AI V5 · 离线套版回归锁（防巨型假地点/半截标签回潮）', () => {
  const val = (fields: Array<[string, string]>, k: string) => fields.find((f) => f[0] === k)?.[1];

  it('地点不吃虚词：「昨天下午在操场」→ 操场，不是整句', () => {
    const d = ruleDraft('昨天下午在操场丢了AirPods Pro耳机 捡到请联系QQ2856789012 重谢50元', 2);
    expect(val(d.fields, '地点')).toBe('操场');
    // 方向以首现者为准：先「丢」后「捡」→ 判为丢失寻找（不是捡到待认领）
    expect(val(d.fields, '状态')).toBe('丢失寻找');
  });

  it('时间相邻词缝合：昨天 + 下午 → 昨天下午', () => {
    const d = ruleDraft('昨天下午在操场丢了钥匙', 2);
    expect(val(d.fields, '时间')).toBe('昨天下午');
  });

  it('交易地点不被前置描述污染', () => {
    const d = ruleDraft('出九成新自行车 200元 先到先得 东门自提', 1);
    expect(val(d.fields, '地点')).toBe('东门');
    expect(val(d.fields, '价格')).toBe('¥200');
  });

  it('标签零半截词：种子在场时滑窗不触发', () => {
    const d = ruleDraft('出九成新自行车 200元 先到先得 东门自提', 1);
    for (const t of d.tags) {
      // 每个标签要么命中原文子串，要么是 ¥价格 形态；杜绝「到一张校」式滑窗碎片
      expect(d.content.includes(t) || /^¥\d+$/.test(t)).toBe(true);
    }
  });

  it('中文点位「大学生活动中心」整体命中', () => {
    const d = ruleDraft('音乐社本周六晚七点在大学生活动中心办草地音乐节 免费入场', 6);
    expect(val(d.fields, '地点')).toBe('大学生活动中心');
  });
});
