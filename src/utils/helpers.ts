/**
 * 前端敏感词检测工具
 */
const sensitiveWords = [
  '傻逼', '操你', '滚蛋', '去死', '杀你', '废物',
  '色情', '裸体', '做爱', '性服务', '约炮', '一夜情',
  '赌博', '吸毒', '毒品', '大麻', '冰毒',
  '反动', '颠覆', '台独', '藏独', '疆独',
  '诈骗', '传销', '洗钱',
  '傻b', 'sb', 'nm', 'nmsl', 'mdzz', 'wqnmd',
]

export function checkSensitive(text: string): { hit: boolean; words: string[] } {
  const lower = text.toLowerCase()
  const hitWords: string[] = []
  for (const word of sensitiveWords) {
    if (lower.includes(word.toLowerCase())) {
      hitWords.push(word)
    }
  }
  return { hit: hitWords.length > 0, words: hitWords }
}

/**
 * 格式化时间为相对时间
 */
export function formatTime(time: string): string {
  if (!time) return ''
  const date = new Date(time)
  if (isNaN(date.getTime())) return ''
  const now = new Date()
  const diff = (now.getTime() - date.getTime()) / 1000

  if (diff < 60) return '刚刚'
  if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`
  if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`
  if (diff < 2592000) return `${Math.floor(diff / 86400)}天前`
  return date.toLocaleDateString('zh-CN')
}

/**
 * 信誉分对应颜色
 */
export function creditColor(score: number): string {
  if (score >= 90) return '#10b981'
  if (score >= 80) return '#3b82f6'
  if (score >= 60) return '#f59e0b'
  return '#ef4444'
}

/**
 * 信誉分对应等级名称
 */
export function creditLevel(score: number): string {
  if (score >= 90) return '优秀'
  if (score >= 80) return '良好'
  if (score >= 60) return '一般'
  return '较低'
}

/**
 * 信誉分等级称号（四档徽章）：与 creditLevel 阈值对齐
 * icon 为图标键名，CreditBadge 组件内映射为 lucide 图标
 */
export interface CreditTitleInfo {
  name: string
  icon: 'trophy' | 'medal' | 'award' | 'shield-alert'
  color: string
}

export function creditTitle(score: number): CreditTitleInfo {
  if (score >= 90) return { name: '信誉之星', icon: 'trophy', color: '#f59e0b' }
  if (score >= 80) return { name: '可靠达人', icon: 'medal', color: '#3b82f6' }
  if (score >= 60) return { name: '诚信新人', icon: 'award', color: '#f97316' }
  return { name: '待改进', icon: 'shield-alert', color: '#9ca3af' }
}
