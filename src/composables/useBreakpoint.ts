/**
 * 三档响应式断点：sm<640 / md 640-960 / lg≥960
 * 移动优先。优先级 lg > md > sm，保证命中唯一。
 */
import { ref, onMounted, onUnmounted, readonly } from 'vue'

export type Breakpoint = 'sm' | 'md' | 'lg'

const QUERIES: Record<Breakpoint, string> = {
  sm: '(max-width: 639px)',
  md: '(min-width: 640px) and (max-width: 959px)',
  lg: '(min-width: 960px)',
}

export function useBreakpoint() {
  const current = ref<Breakpoint>('sm')
  const mqls: Partial<Record<Breakpoint, MediaQueryList>> = {}

  const update = () => {
    if (mqls.lg?.matches) current.value = 'lg'
    else if (mqls.md?.matches) current.value = 'md'
    else current.value = 'sm'
  }

  onMounted(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    ;(Object.keys(QUERIES) as Breakpoint[]).forEach((bp) => {
      const mql = window.matchMedia(QUERIES[bp])
      mql.addEventListener('change', update)
      mqls[bp] = mql
    })
    update()
  })

  onUnmounted(() => {
    ;(Object.keys(mqls) as Breakpoint[]).forEach((bp) => {
      mqls[bp]?.removeEventListener('change', update)
    })
  })

  return {
    current: readonly(current),
    isMobile: () => current.value === 'sm',
    isTablet: () => current.value === 'md',
    isDesktop: () => current.value === 'lg',
  }
}
