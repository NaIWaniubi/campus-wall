/**
 * AiThinkingState.vue 组件单测（AI 交互三态渲染）
 * 这是 AI 主链路的可视化组件：判定每个 phase 都渲染出正确的内容/结构。
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import AiThinkingState from '../AiThinkingState.vue'

describe('AiThinkingState', () => {
  it('thinking：渲染呼吸点 ×3 + 默认阶段文案', () => {
    const wrapper = mount(AiThinkingState, { props: { phase: 'thinking' } })
    expect(wrapper.findAll('.ai-thinking .dot')).toHaveLength(3)
    expect(wrapper.text()).toContain('正在思考…')
  })

  it('thinking：自定义阶段文案透传', () => {
    const wrapper = mount(AiThinkingState, { props: { phase: 'thinking', stage: '正在检索校园资料…' } })
    expect(wrapper.text()).toContain('正在检索校园资料…')
  })

  it('streaming：渲染打字光标与输出中文案', () => {
    const wrapper = mount(AiThinkingState, { props: { phase: 'streaming' } })
    expect(wrapper.find('.cursor-block').exists()).toBe(true)
    expect(wrapper.text()).toContain('正在输出…')
  })

  it('fallback：渲染降级徽标（离线可用提示）', () => {
    const wrapper = mount(AiThinkingState, { props: { phase: 'fallback' } })
    expect(wrapper.find('.ai-fallback').exists()).toBe(true)
    expect(wrapper.text()).toContain('已降级为套版/规则结果')
  })

  it('done：不渲染任何内容（由父容器过渡淡出处理）', () => {
    const wrapper = mount(AiThinkingState, { props: { phase: 'done' } })
    expect(wrapper.find('.ai-thinking').exists()).toBe(false)
    expect(wrapper.find('.ai-streaming').exists()).toBe(false)
    expect(wrapper.find('.ai-fallback').exists()).toBe(false)
    // 模板注释仍保留，但无可见文本与可交互元素
    expect(wrapper.text().trim()).toBe('')
    expect(wrapper.findAll('span')).toHaveLength(0)
  })
})