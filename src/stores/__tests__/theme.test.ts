/**
 * theme store 单测：三态解析 / 持久化 / system 跟随 / data-theme 写入
 * happy-dom 提供 localStorage + matchMedia；每个用例重置 pinia 与存储
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useThemeStore, type ThemeMode } from '../theme'

function setSystemDark(dark: boolean) {
  const listeners: ((e: { matches: boolean }) => void)[] = []
  ;(globalThis as any).matchMedia = (query: string) => ({
    matches: dark,
    media: query,
    addEventListener: (_: string, cb: (e: { matches: boolean }) => void) => listeners.push(cb),
    removeEventListener: () => {},
  })
  return listeners
}

describe('theme store', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
    setActivePinia(createPinia())
  })

  it('默认 system；apply 后 data-theme 跟随系统偏好', () => {
    setSystemDark(true)
    const store = useThemeStore()
    expect(store.mode).toBe('system')
    store.apply()
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it("setMode('dark') 持久化到 localStorage 并写入 data-theme", () => {
    setSystemDark(false)
    const store = useThemeStore()
    store.setMode('dark')
    expect(localStorage.getItem('app:theme')).toBe('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(store.effective).toBe('dark')
  })

  it('mode=light 时即便系统是暗色也保持亮色', () => {
    setSystemDark(true)
    const store = useThemeStore()
    store.setMode('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    expect(store.effective).toBe('light')
  })

  it('system 模式下系统切换偏好会跟随（change 事件触发 apply）', () => {
    const listeners = setSystemDark(false)
    const store = useThemeStore()
    store.init()
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    // 模拟系统切到暗色
    setSystemDark(true)
    listeners.forEach((cb) => cb({ matches: true }))
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('非法持久化值回退 system', () => {
    localStorage.setItem('app:theme', 'blue')
    setActivePinia(createPinia())
    const store = useThemeStore()
    expect(store.mode satisfies ThemeMode).toBe('system')
  })
})
