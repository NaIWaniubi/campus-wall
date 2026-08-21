/**
 * 敏感词过滤工具
 * 简易实现：内置常见敏感词库，支持检测与替换
 */

const sensitiveWords = [
  '傻逼', '操你', '滚蛋', '去死', '杀你', '废物', '垃圾人',
  '色情', '裸体', '做爱', '性服务', '约炮', '一夜情',
  '赌博', '吸毒', '毒品', '大麻', '冰毒',
  '反动', '颠覆', '台独', '藏独', '疆独',
  '诈骗', '传销', '洗钱',
  '傻b', 'sb', 'nm', 'nmsl', 'mdzz', 'wqnmd',
];

/**
 * 检测文本是否包含敏感词
 */
export function containsSensitiveWord(text: string): { hit: boolean; words: string[] } {
  const lower = text.toLowerCase();
  const hitWords: string[] = [];
  for (const word of sensitiveWords) {
    if (lower.includes(word.toLowerCase())) {
      hitWords.push(word);
    }
  }
  return { hit: hitWords.length > 0, words: hitWords };
}

/**
 * 获取文本风险等级
 */
export function getRiskLevel(text: string): 'safe' | 'review' | 'reject' {
  const result = containsSensitiveWord(text);
  if (!result.hit) return 'safe';
  // 高风险词
  const highRisk = ['色情', '做爱', '约炮', '吸毒', '毒品', '大麻', '冰毒', '诈骗', '反动', '颠覆'];
  for (const word of result.words) {
    if (highRisk.includes(word)) return 'reject';
  }
  return 'review';
}
