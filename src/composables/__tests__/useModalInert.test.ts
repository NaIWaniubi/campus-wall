/**
 * 模态锁引用计数回归：
 * 多个模态共存时（新手引导开着 → Ctrl+K 打开命令面板），
 * 先关掉的那个不能把锁整个解开——背景必须保持 inert + 不可滚动。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { ref, nextTick } from 'vue'
import {
  acquireModalLock,
  releaseModalLock,
  modalLockCount,
  trapWithInert,
} from '../useModalInert'

function root() {
  let el = document.getElementById('app')
  if (!el) {
    el = document.createElement('div')
    el.id = 'app'
    document.body.appendChild(el)
  }
  return el
}

describe('模态锁（引用计数）', () => {
  beforeEach(() => {
    // 复位计数与 DOM 状态
    while (modalLockCount() > 0) releaseModalLock()
    root().removeAttribute('inert')
    document.body.style.overflow = ''
  })

  it('两个模态共存时，先关一个仍保持锁定', async () => {
    const a = ref(false)
    const b = ref(false)
    trapWithInert(a)
    trapWithInert(b)

    a.value = true
    b.value = true
    await nextTick()
    expect(modalLockCount()).toBe(2)
    expect(root().hasAttribute('inert')).toBe(true)
    expect(document.body.style.overflow).toBe('hidden')

    // 关掉第一个 → 第二个还开着，锁不能解
    a.value = false
    await nextTick()
    expect(modalLockCount()).toBe(1)
    expect(root().hasAttribute('inert')).toBe(true)
    expect(document.body.style.overflow).toBe('hidden')

    // 关掉第二个 → 全部关闭才解锁
    b.value = false
    await nextTick()
    expect(modalLockCount()).toBe(0)
    expect(root().hasAttribute('inert')).toBe(false)
    expect(document.body.style.overflow).toBe('')
  })

  it('重复加锁不会重复计数（同组件 watch 抖动）', async () => {
    const v = ref(false)
    trapWithInert(v)
    v.value = true
    await nextTick()
    v.value = false
    await nextTick()
    v.value = true
    await nextTick()
    expect(modalLockCount()).toBe(1)
    v.value = false
    await nextTick()
    expect(modalLockCount()).toBe(0)
  })

  it('释放次数多于加锁时计数不为负', () => {
    acquireModalLock()
    releaseModalLock()
    releaseModalLock()
    expect(modalLockCount()).toBe(0)
  })
})
