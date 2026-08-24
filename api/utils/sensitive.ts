/**
 * 敏感词过滤工具
 * 简易实现：内置常见敏感词库，支持检测与替换
 *
 * 风险分级（assessRisk）：
 * - review：硬词（最严），发布转人工审核队列（status=pending_review）
 * - warn ：灰词/一般敏感词，正常发布但打 risk_flag 标记
 * - pass ：无命中，直接过
 */

/** 基础敏感词库（沿用现库）：作为通用过滤底表 + 兼容旧函数 */
const sensitiveWords = [
  '傻逼', '操你', '滚蛋', '去死', '杀你', '废物', '垃圾人',
  '色情', '裸体', '做爱', '性服务', '约炮', '一夜情',
  '赌博', '吸毒', '毒品', '大麻', '冰毒',
  '反动', '颠覆', '台独', '藏独', '疆独',
  '诈骗', '传销', '洗钱',
  '傻b', 'sb', 'nm', 'nmsl', 'mdzz', 'wqnmd',
];

/** review 级硬词（沿用原最严词集）：命中即转人工审核队列 */
const reviewWords = [
  '色情', '做爱', '约炮', '吸毒', '毒品', '大麻', '冰毒', '诈骗', '反动', '颠覆',
];

/** warn 级灰词（自拟少量示例）：擦边/软性风险，放行但标记 */
const warnWords = [
  '刷单', '代考', '代写论文', '代写作业', '私彩', '套现', '外挂代练',
];

function matchWords(text: string, words: string[]): string[] {
  const lower = text.toLowerCase();
  return words.filter((w) => lower.includes(w.toLowerCase()));
}

/**
 * 检测文本是否包含敏感词
 */
export function containsSensitiveWord(text: string): { hit: boolean; words: string[] } {
  const hitWords = matchWords(text, sensitiveWords);
  return { hit: hitWords.length > 0, words: hitWords };
}

export type RiskLevel = 'pass' | 'warn' | 'review';

/**
 * 风险评分分级：
 * - 命中 review 硬词 → 'review'（转人工审核）
 * - 命中灰词或基础词库非硬词 → 'warn'（放行但标记）
 * - 无命中 → 'pass'
 */
export function assessRisk(title: string, content: string): { level: RiskLevel; hits: string[] } {
  const text = `${title || ''} ${content || ''}`;
  const hardHits = matchWords(text, reviewWords);
  if (hardHits.length) return { level: 'review', hits: hardHits };

  const mildLibWords = sensitiveWords.filter((w) => !reviewWords.includes(w));
  const warnHits = [...matchWords(text, warnWords), ...matchWords(text, mildLibWords)];
  if (warnHits.length) return { level: 'warn', hits: warnHits };

  return { level: 'pass', hits: [] };
}

/**
 * 获取文本风险等级（兼容旧调用：ai.ts / comments.ts 继续使用）
 */
export function getRiskLevel(text: string): 'safe' | 'review' | 'reject' {
  const result = containsSensitiveWord(text);
  if (!result.hit) return 'safe';
  for (const word of result.words) {
    if (reviewWords.includes(word)) return 'reject';
  }
  return 'review';
}
