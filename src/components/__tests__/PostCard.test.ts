/**
 * PostCard.vue 组件单测：点击跳详情（含键盘可达性）、关键词高亮与转义（XSS 面）
 *
 * 依赖 mock：vue-router 的 useRouter（纯逻辑测试不挂真实路由）、lucide 图标。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h } from 'vue'

// push spy 用 hoisted：mock 工厂在模块导入期执行，普通 const 会来不及初始化
const { pushSpy } = vi.hoisted(() => ({ pushSpy: vi.fn() }))
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushSpy }),
}))
vi.mock('@lucide/vue', () => ({
  MessageCircle: defineComponent({ name: 'MessageCircle', render: () => h('i') }),
  Heart: defineComponent({ name: 'Heart', render: () => h('i') }),
  Eye: defineComponent({ name: 'Eye', render: () => h('i') }),
  Bookmark: defineComponent({ name: 'Bookmark', render: () => h('i') }),
}))

const PostCard = (await import('../PostCard.vue')).default

function makePost(over: Record<string, unknown> = {}) {
  return {
    id: 42,
    title: '出一个九成新 iPad Air',
    content: '1500 元，可小刀，东门当面交易',
    author: { nickname: '阿伟', avatar: '' },
    section: { id: 7, name: '二手闲置' },
    images: [],
    thumbImages: [],
    viewCount: 12,
    likeCount: 3,
    commentCount: 1,
    favoriteCount: 0,
    createdAt: '2026-11-17T08:00:00.000Z',
    ...over,
  }
}

describe('PostCard', () => {
  let wrapper: VueWrapper
  beforeEach(() => {
    pushSpy.mockClear()
  })
  afterEach(() => {
    wrapper?.unmount()
  })

  it('点击卡片跳转 /post/:id', async () => {
    wrapper = mount(PostCard, {
      props: { post: makePost() },
      global: { stubs: { CreditBadge: true } },
    })
    await wrapper.find('.card-premium').trigger('click')
    expect(pushSpy).toHaveBeenCalledWith('/post/42')
  })

  it('键盘 Enter/Space 同样触发跳转（a11y：role=button 已挂在模板上）', async () => {
    wrapper = mount(PostCard, {
      props: { post: makePost() },
      global: { stubs: { CreditBadge: true } },
    })
    const el = wrapper.find('[role="button"]')
    expect(el.exists()).toBe(true)
    await el.trigger('keydown', { key: 'Enter' })
    await el.trigger('keydown', { key: ' ' })
    expect(pushSpy).toHaveBeenCalledTimes(2)
  })

  it('keyword 高亮命中文本', async () => {
    wrapper = mount(PostCard, {
      props: { post: makePost(), keyword: 'iPad' },
      global: { stubs: { CreditBadge: true } },
    })
    const html = wrapper.html()
    expect(html).toContain('<span class="highlight">iPad</span>')
  })

  it('标题含 HTML 特殊字符时被转义后再高亮（v-html 不引入 XSS）', async () => {
    wrapper = mount(PostCard, {
      props: { post: makePost({ title: '<img src=x onerror=alert(1)>好事' }), keyword: '好事' },
      global: { stubs: { CreditBadge: true } },
    })
    // 标题 h3 内：尖括号被转义，且命中词包上高亮 span
    const h3 = wrapper.find('h3')
    expect(h3.html()).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(h3.html()).toContain('<span class="highlight">好事</span>')
    // 无任何被解析出的注入元素（真实 img 数为 0；aria-label 回显原文属属性上下文，不构成执行面）
    expect(wrapper.findAll('img')).toHaveLength(0)
    expect(wrapper.findAll('[onerror]')).toHaveLength(0)
  })
})