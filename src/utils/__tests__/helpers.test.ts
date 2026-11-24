/**
 * helpers.ts 纯函数单测：敏感词分级 / 相对时间 / 信誉档位
 * 重点固守：ASCII 词边界匹配（audit-quality P2-8 同源——防 USB 误杀 sb 规则回归）
 */
import { describe, it, expect } from 'vitest'
import { assessRisk, formatTime, creditColor, creditLevel, creditTitle, isLatestScopedRequest } from '../helpers'

describe('assessRisk 敏感词分级', () => {
  it('硬词命中 → review 并返回命中词', () => {
    const r = assessRisk('正常标题', '内容里出现毒品字样')
    expect(r.level).toBe('review')
    expect(r.hits).toContain('毒品')
  })

  it('灰词命中 → warn 不拦截', () => {
    const r = assessRisk('标题', '有刷单兼职')
    expect(r.level).toBe('warn')
    expect(r.hits).toContain('刷单')
  })

  it('正常内容 → pass；USB 不应被 sb 子串误杀（词边界）', () => {
    expect(assessRisk('我的 USB 找不到了', '借一下').level).toBe('pass')
    expect(assessRisk('', '你就是个 sb').level).toBe('warn')
  })

  it('标题与内容合并参与匹配', () => {
    expect(assessRisk('约炮信息', '无').level).toBe('review')
  })
})

describe('formatTime 相对时间', () => {
  it('空值与非法时间返回空串', () => {
    expect(formatTime('')).toBe('')
    expect(formatTime('not-a-date')).toBe('')
  })

  it('一分钟内 → 刚刚；一小时级 → 分钟前；一天级 → 小时前', () => {
    const now = Date.now()
    expect(formatTime(new Date(now - 10_000).toISOString())).toBe('刚刚')
    expect(formatTime(new Date(now - 5 * 60_000).toISOString())).toBe('5分钟前')
    expect(formatTime(new Date(now - 3 * 3600_000).toISOString())).toBe('3小时前')
    expect(formatTime(new Date(now - 2 * 86400_000).toISOString())).toBe('2天前')
  })
})

describe('creditColor / creditLevel / creditTitle 信誉档位边界', () => {
  it('四档阈值：90/80/60 边界值归属正确', () => {
    expect(creditColor(90)).toBe('#6D3BF5')
    expect(creditColor(80)).toBe('#0E7C86')
    expect(creditColor(60)).toBe('#B45309')
    expect(creditColor(59)).toBe('#DC2626')
    expect(creditLevel(90)).toBe('优秀')
    expect(creditLevel(80)).toBe('良好')
    expect(creditLevel(60)).toBe('一般')
    expect(creditLevel(0)).toBe('较低')
  })

  it('creditTitle 图标键与档位对齐', () => {
    expect(creditTitle(95).icon).toBe('trophy')
    expect(creditTitle(85).icon).toBe('medal')
    expect(creditTitle(65).icon).toBe('award')
    expect(creditTitle(30).icon).toBe('shield-alert')
  })
})

describe('isLatestScopedRequest 账号切换竞态', () => {
  it('只允许最新序号且当前账号 key 的请求写回', () => {
    expect(isLatestScopedRequest(1, 1, 'user:1', 'user:1')).toBe(true)
    expect(isLatestScopedRequest(1, 2, 'user:1', 'user:2')).toBe(false)
    expect(isLatestScopedRequest(1, 1, 'user:1', 'user:2')).toBe(false)
  })
})
