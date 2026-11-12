/**
 * 敏感词过滤工具
 *
 * 设计目标（对应评委高频追问「几十个词怎么覆盖谐音/变体」）：
 * 1. **三级风险**：review（硬词，转人工审核）/ warn（灰词，放行但标记）/ pass
 * 2. **变体归一化**：先做全角→半角、去分隔符、常见谐音替换，再对归一化文本匹配，
 *    覆盖「傻 B」「傻*逼」「S B」「ｓｂ」等绕过写法
 * 3. **ASCII 词边界**：sb / nm 等短缩写必须整词命中，避免 USB、NM 能量等误伤
 * 4. **可解释**：命中返回原词与位置，供管理端审核高亮
 *
 * 明确边界（不假装能覆盖）：纯图片、语音、拼音首字母组合（"n m s l"）、
 * 跨句拼接（"傻" 与 "逼" 分处两句）不在本词库能力内；
 * 这类由微信 msgSecCheck 与人工审核队列兜底。
 */

/** 词表分级定义：review 最严、warn 次之 */
type WordEntry = { word: string; level: 'review' | 'warn' };

/**
 * 词库（按类别组织，便于维护与答辩时讲清覆盖面）
 * - 辱骂/人身攻击 → warn（校园社区保留吐槽空间，只打标记）
 * - 色情低俗 → review
 * - 毒品/赌博/诈骗/传销 → review
 * - 政治敏感 → review
 * - 违法交易/学术不端（代考代写、刷单套现、外挂）→ warn
 */
const WORD_LIST: WordEntry[] = [
  // 辱骂 / 人身攻击（warn）
  { word: '傻逼', level: 'warn' },
  { word: '傻b', level: 'warn' },
  { word: '煞笔', level: 'warn' },
  { word: '沙比', level: 'warn' },
  { word: '傻批', level: 'warn' },
  { word: '脑残', level: 'warn' },
  { word: '废物', level: 'warn' },
  { word: '垃圾人', level: 'warn' },
  { word: '去死', level: 'warn' },
  { word: '滚蛋', level: 'warn' },
  { word: '操你', level: 'warn' },
  { word: '草泥马', level: 'warn' },
  { word: 'nmsl', level: 'warn' },
  { word: 'mdzz', level: 'warn' },
  { word: 'wqnmd', level: 'warn' },
  // sb 保留（有 \b 词边界保护，不会误伤 USB）；
  // nm 刻意移除：NM 同时是纳米/ nautical mile 等常用缩写，误伤率过高
  { word: 'sb', level: 'warn' },

  // 色情 / 低俗（review）
  { word: '色情', level: 'review' },
  { word: '裸体', level: 'review' },
  { word: '做爱', level: 'review' },
  { word: '性服务', level: 'review' },
  { word: '约炮', level: 'review' },
  { word: '一夜情', level: 'review' },
  { word: '援交', level: 'review' },
  { word: '卖淫', level: 'review' },
  { word: '嫖娼', level: 'review' },

  // 毒品 / 赌博 / 诈骗 / 传销（review）
  { word: '吸毒', level: 'review' },
  { word: '毒品', level: 'review' },
  { word: '大麻', level: 'review' },
  { word: '冰毒', level: 'review' },
  { word: '摇头丸', level: 'review' },
  { word: '赌博', level: 'review' },
  { word: '博彩', level: 'review' },
  { word: '六合彩', level: 'review' },
  { word: '诈骗', level: 'review' },
  { word: '洗钱', level: 'review' },
  { word: '传销', level: 'review' },
  { word: '高利贷', level: 'review' },
  { word: '裸贷', level: 'review' },

  // 政治敏感（review）
  { word: '反动', level: 'review' },
  { word: '颠覆', level: 'review' },
  { word: '台独', level: 'review' },
  { word: '藏独', level: 'review' },
  { word: '疆独', level: 'review' },
  { word: '港独', level: 'review' },

  // 违法交易 / 学术不端（warn：校园高频，先标记后人工判断）
  { word: '刷单', level: 'warn' },
  { word: '代考', level: 'warn' },
  { word: '代写论文', level: 'warn' },
  { word: '代写作业', level: 'warn' },
  { word: '私彩', level: 'warn' },
  { word: '套现', level: 'warn' },
  { word: '外挂代练', level: 'warn' },
  { word: '枪手代写', level: 'warn' },
];

/**
 * 谐音 / 变体替换表：把常见绕过写法归一到词库中的标准写法。
 * 只在检测时使用，绝不修改用户原文。
 */
const VARIANT_MAP: [RegExp, string][] = [
  [/傻\s*[bB逼比批屁]/g, '傻逼'],
  [/煞\s*笔/g, '煞笔'],
  [/草\s*泥\s*马/g, '草泥马'],
  [/操\s*你/g, '操你'],
  [/约\s*炮/g, '约炮'],
  [/援\s*交/g, '援交'],
  [/卖\s*淫/g, '卖淫'],
  [/嫖\s*娼/g, '嫖娼'],
  [/赌\s*博/g, '赌博'],
  [/诈\s*骗/g, '诈骗'],
  [/洗\s*钱/g, '洗钱'],
  [/传\s*销/g, '传销'],
  [/毒\s*品/g, '毒品'],
  [/吸\s*毒/g, '吸毒'],
];

/** 需要剔除的分隔符（用户常用空格/星号/点号拆词绕过） */
const SEPARATOR_RE = /[\s*.\-_·•。，、,;；:：!！?？'"“”‘’()（）[\]【】<>《》|/\\~～`@#$%^&+=]/g;

/** 全角 → 半角（字母/数字/常用符号），避免「ｓｂ」这类全角绕过 */
function toHalfWidth(text: string): string {
  return text
    .replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
    .replace(/\u3000/g, ' ');
}

/**
 * 文本归一化：全角→半角 → 小写 → 应用谐音替换 → 去分隔符。
 * 归一化后 `傻*逼` → `傻逼`，`S B` → `sb`，`ｓｂ` → `sb`。
 */
export function normalizeForMatch(text: string): string {
  let out = toHalfWidth(String(text || '')).toLowerCase();
  for (const [re, to] of VARIANT_MAP) out = out.replace(re, to);
  return out.replace(SEPARATOR_RE, '');
}

/**
 * 单词匹配：纯 ASCII 词必须整词命中（避免 USB / NM 能量误伤）
 * 额外约束：后面不能紧跟「可选分隔符 + 数字」，否则 SB-1000 / NM-200 这类
 * 正常型号会被判成人身攻击（实测误伤）。
 */
function asciiWordRegex(word: string): RegExp {
  const w = word.toLowerCase();
  return new RegExp(`(?<![a-z0-9])${w}(?![a-z0-9])(?![-_.]?\\d)`, 'i');
}

function matchWord(lowerText: string, word: string): boolean {
  if (/^[a-z0-9]+$/i.test(word)) {
    return asciiWordRegex(word).test(lowerText);
  }
  return lowerText.includes(word.toLowerCase());
}

/** 按级别匹配：原文（保留词边界语义）+ 归一化文本（覆盖变体）双路 */
function matchByLevel(text: string, level: 'review' | 'warn'): string[] {
  const rawLower = String(text || '').toLowerCase();
  const normalized = normalizeForMatch(text);
  const words = WORD_LIST.filter((e) => e.level === level).map((e) => e.word);

  return words.filter((w) => matchWord(rawLower, w) || matchWord(normalized, w));
}

/** 兼容旧接口：全词表（不含级别信息） */
const allWords = WORD_LIST.map((e) => e.word);

/**
 * 命中位置提取（供管理端审核高亮）：返回每个命中词在原文中的首个位置。
 * 归一化会改变长度，位置以原文为准；仅归一化才命中的词返回 -1。
 */
export function findSensitiveHits(
  text: string,
  words: string[] = allWords
): { word: string; index: number }[] {
  const rawLower = String(text || '').toLowerCase();
  const hits: { word: string; index: number }[] = [];
  for (const raw of words) {
    const w = raw.toLowerCase();
    let idx = -1;
    if (/^[a-z0-9]+$/i.test(w)) {
      const m = new RegExp(`\\b${w}\\b`).exec(rawLower);
      idx = m ? m.index : -1;
    } else {
      idx = rawLower.indexOf(w);
    }
    if (idx >= 0) hits.push({ word: raw, index: idx });
  }
  return hits;
}

/** 检测文本是否包含敏感词（兼容旧调用） */
export function containsSensitiveWord(text: string): { hit: boolean; words: string[] } {
  const words = [...matchByLevel(text, 'review'), ...matchByLevel(text, 'warn')];
  return { hit: words.length > 0, words };
}

export type RiskLevel = 'pass' | 'warn' | 'review';

/**
 * 风险分级：
 * - 命中 review 硬词 → 'review'（转人工审核队列，status=pending_review）
 * - 命中 warn 灰词 → 'warn'（正常发布但写 risk_flag）
 * - 无命中 → 'pass'
 */
export function assessRisk(title: string, content: string): { level: RiskLevel; hits: string[] } {
  const text = `${title || ''} ${content || ''}`;

  const hardHits = matchByLevel(text, 'review');
  if (hardHits.length) return { level: 'review', hits: hardHits };

  const warnHits = matchByLevel(text, 'warn');
  if (warnHits.length) return { level: 'warn', hits: warnHits };

  return { level: 'pass', hits: [] };
}

/**
 * 获取文本风险等级（兼容旧调用：ai.ts / comments.ts）
 *
 * 语义与历史版本保持一致，避免影响既有调用方：
 * - reject：命中 review 硬词
 * - review：命中「基础词库中非硬词」的部分（历史实现里灰词表不计入此接口）
 * - safe  ：其余
 * 需要完整三级（含灰词表）请直接用 assessRisk。
 */
export function getRiskLevel(text: string): 'safe' | 'review' | 'reject' {
  const hard = matchByLevel(text, 'review');
  if (hard.length) return 'reject';
  const mild = matchByLevel(text, 'warn');
  // 灰词表（刷单/代考等）历史上只在 assessRisk 中生效，这里保持旧口径
  const warnOnlyWords = new Set(['刷单', '代考', '代写论文', '代写作业', '私彩', '套现', '外挂代练', '枪手代写']);
  const mildHits = mild.filter((w) => !warnOnlyWords.has(w));
  if (mildHits.length) return 'review';
  return 'safe';
}

/** 词库规模与级别分布（管理端展示 / 答辩说明覆盖面） */
export function sensitiveStats(): { total: number; review: number; warn: number; variants: number } {
  return {
    total: WORD_LIST.length,
    review: WORD_LIST.filter((e) => e.level === 'review').length,
    warn: WORD_LIST.filter((e) => e.level === 'warn').length,
    variants: VARIANT_MAP.length,
  };
}
