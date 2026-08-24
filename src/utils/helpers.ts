/**
 * 前端敏感词检测工具（与 api/utils/sensitive.ts 保持一致语义）
 *
 * 分级：review 硬词命中才拦截；warn 灰词/一般敏感词仅提示不拦截。
 * 匹配规则：中文词直接包含匹配；纯 ASCII 词（如 sb/nm）加 \b 词边界，
 * 避免「USB」「nm 段落里的英文单词」被子串误杀。
 */
const REVIEW_WORDS = [
  '色情', '做爱', '约炮', '吸毒', '毒品', '大麻', '冰毒', '诈骗', '反动', '颠覆',
]

const WARN_WORDS = [
  '刷单', '代考', '代写论文', '代写作业', '私彩', '套现', '外挂代练',
]

/** 基础词库中非硬词部分（与后端 sensitiveWords 去 REVIEW_WORDS 后一致） */
const MILD_WORDS = [
  '傻逼', '操你', '滚蛋', '去死', '杀你', '废物', '垃圾人',
  '裸体', '一夜情',
  '赌博',
  '台独', '藏独', '疆独',
  '传销', '洗钱',
  '傻b', 'sb', 'nm', 'nmsl', 'mdzz', 'wqnmd',
]

function matchWord(lowerText: string, word: string): boolean {
  const w = word.toLowerCase()
  // 纯 ASCII 词用词边界正则，防止 USB/nmsl 等正常文本被子串误伤
  if (/^[a-z0-9]+$/i.test(w)) {
    return new RegExp(`\\b${w}\\b`).test(lowerText)
  }
  return lowerText.includes(w)
}

function matchWords(text: string, words: string[]): string[] {
  const lower = text.toLowerCase()
  return words.filter((w) => matchWord(lower, w))
}

export type RiskLevel = 'pass' | 'warn' | 'review'

/**
 * 与后端 assessRisk 对齐的风险分级：
 * - review 硬词 → 'review'（前端拦截提交）
 * - 灰词或基础词库非硬词 → 'warn'（仅提示）
 * - 无命中 → 'pass'
 */
export function assessRisk(title: string, content: string): { level: RiskLevel; hits: string[] } {
  const text = `${title || ''} ${content || ''}`
  const hardHits = matchWords(text, REVIEW_WORDS)
  if (hardHits.length) return { level: 'review', hits: hardHits }

  const warnHits = [...matchWords(text, WARN_WORDS), ...matchWords(text, MILD_WORDS)]
  if (warnHits.length) return { level: 'warn', hits: warnHits }

  return { level: 'pass', hits: [] }
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
