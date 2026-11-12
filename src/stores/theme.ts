/**
 * 主题 Pinia store：light / dark / system 三态
 * - 持久化到 localStorage（key: app:theme）
 * - 启动时 apply() 把 data-theme 写到 <html>
 * - system 模式跟随 prefers-color-scheme 变化
 */
import { defineStore } from 'pinia'

export type ThemeMode = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'app:theme'

function readSaved(): ThemeMode {
  if (typeof localStorage === 'undefined') return 'system'
  const v = localStorage.getItem(STORAGE_KEY)
  if (v === 'light' || v === 'dark' || v === 'system') return v
  return 'system'
}

function systemPrefersDark(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function resolve(mode: ThemeMode): 'light' | 'dark' {
  return mode === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : mode
}

function applyToDom(mode: ThemeMode) {
  if (typeof document === 'undefined') return
  const effective = resolve(mode)
  document.documentElement.setAttribute('data-theme', effective)
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', effective === 'dark' ? '#18181B' : '#6D3BF5')
}

export const useThemeStore = defineStore('theme', {
  state: () => ({
    mode: readSaved() as ThemeMode,
    /** 内部缓存：当前实际生效（system 模式下用于判断是否需要 update） */
    effective: 'light' as 'light' | 'dark',
  }),
  actions: {
    setMode(next: ThemeMode) {
      this.mode = next
      if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, next)
      this.apply()
    },
    /** 在 main.ts 启动时调用一次 */
    init() {
      if (typeof window === 'undefined' || !window.matchMedia) {
        this.apply()
        return
      }
      // 监听系统主题变化
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (this.mode === 'system') this.apply()
      })
      this.apply()
    },
    apply() {
      const eff = resolve(this.mode)
      this.effective = eff
      applyToDom(this.mode)
    },
  },
})
