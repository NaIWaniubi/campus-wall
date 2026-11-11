/**
 * 板块视觉字典：颜色 / 简介
 * 对齐原生小程序：分类标签用「分类色 12% 透明度底 + 同色文字」，
 * 话题页卡片用「6rpx 分类色左边框」（见 pages/category/category.wxml）。
 */

/** 板块 id -> 分类色（与小程序 category 页 color 字段同源） */
const SECTION_COLORS: Record<number, string> = {
  1: '#F59E0B', // 二手交易
  2: '#2CC9DD', // 失物招领
  3: '#FF6B6B', // 表白墙
  4: '#8B5CF6', // 吐槽树洞
  5: '#16A085', // 互助问答
  6: '#74B9FF', // 校园活动
  7: '#10B981', // 拼车
  8: '#EC4899', // 组队
}

/** 板块名 -> 分类色（板块 id 变化时兜底） */
const COLOR_BY_NAME: Record<string, string> = {
  二手交易: '#F59E0B',
  失物招领: '#2CC9DD',
  表白墙: '#FF6B6B',
  吐槽树洞: '#8B5CF6',
  互助问答: '#16A085',
  校园活动: '#74B9FF',
  拼车: '#10B981',
  组队: '#EC4899',
}

/** 板块简介（话题页副标题） */
export const SECTION_DESC: Record<string, string> = {
  二手交易: '闲置转让、求购竞价，线下当面交易',
  失物招领: '丢东西、捡到物品，智能雷达自动撮合',
  表白墙: '匿名告白、寻人祝福，说给 TA 听',
  吐槽树洞: '匿名倾诉、食堂红黑榜、日常吐槽',
  互助问答: '选课建议、考研交流、学长学姐答疑',
  校园活动: '社团招新、讲座演出、比赛报名',
  拼车: '顺风车、节假日返校、机场接送',
  组队: '开黑搭子、竞赛队伍、自习伙伴',
}

/** 板块 -> 彩色渐变（V2：标签、图标底、话题卡用它，做出「多彩」层次） */
const SECTION_GRADS: Record<number, [string, string]> = {
  1: ['#F59E0B', '#F97316'], // 二手交易 琥珀橙
  2: ['#06B6D4', '#22D3EE'], // 失物招领 青
  3: ['#FB7185', '#F43F5E'], // 表白墙 玫红
  4: ['#8B5CF6', '#A78BFA'], // 吐槽树洞 紫
  5: ['#0E7C67', '#16A085'], // 互助问答 品牌绿
  6: ['#3B82F6', '#60A5FA'], // 校园活动 蓝
  7: ['#10B981', '#34D399'], // 拼车 翠绿
  8: ['#EC4899', '#F472B6'], // 组队 粉
}

const GRAD_BY_NAME: Record<string, [string, string]> = {
  二手交易: ['#F59E0B', '#F97316'],
  失物招领: ['#06B6D4', '#22D3EE'],
  表白墙: ['#FB7185', '#F43F5E'],
  吐槽树洞: ['#8B5CF6', '#A78BFA'],
  互助问答: ['#0E7C67', '#16A085'],
  校园活动: ['#3B82F6', '#60A5FA'],
  拼车: ['#10B981', '#34D399'],
  组队: ['#EC4899', '#F472B6'],
}

/** 分类渐变：用于标签、图标底、话题卡（线性 135°） */
export function sectionGradient(id?: number | null, name?: string | null): string {
  const pair =
    (id && SECTION_GRADS[id]) ||
    (name && GRAD_BY_NAME[name]) ||
    (['#0E7C67', '#16A085'] as [string, string])
  return `linear-gradient(135deg, ${pair[0]} 0%, ${pair[1]} 100%)`
}

export function sectionColor(id?: number | null, name?: string | null): string {
  if (id && SECTION_COLORS[id]) return SECTION_COLORS[id]
  if (name && COLOR_BY_NAME[name]) return COLOR_BY_NAME[name]
  return '#16A085'
}

/** 分类色 12% 透明度的底（对齐小程序 style="background-color: {{color}}20"） */
export function sectionTint(color: string, alpha = 0.13): string {
  const hex = color.replace('#', '')
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export function sectionDesc(name?: string | null): string {
  if (!name) return ''
  return SECTION_DESC[name] || '校园生活，同频交流'
}
