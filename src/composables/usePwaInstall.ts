import { computed, ref, shallowRef } from 'vue'

/** Chromium 安装提示事件（类型库未覆盖，最小声明） */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const deferred = shallowRef<BeforeInstallPromptEvent | null>(null)
const installed = ref(false)
let bound = false

/**
 * PWA 安装（V5）：捕获 beforeinstallprompt，提供应用内一键安装。
 * 模块级单例：任何页面挂载时都已完成事件绑定（事件只在页面存活早期发一次）。
 */
export function usePwaInstall() {
  if (!bound) {
    bound = true
    if (typeof window === 'undefined') return snapshot()
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault()
      deferred.value = e as BeforeInstallPromptEvent
      installed.value = false
    })
    window.addEventListener('appinstalled', () => {
      deferred.value = null
      installed.value = true
    })
    try {
      const standalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (navigator as unknown as { standalone?: boolean }).standalone === true
      if (standalone) installed.value = true
    } catch { /* 老内核无 matchMedia 场景忽略 */ }
  }
  return snapshot()
}

function snapshot() {
  const canInstall = computed(() => deferred.value !== null && !installed.value)
  /** 'accepted' | 'dismissed' | 'unavailable' */
  async function install(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
    const ev = deferred.value
    if (!ev) return 'unavailable'
    try {
      await ev.prompt()
      const { outcome } = await ev.userChoice
      if (outcome === 'accepted') {
        deferred.value = null
        installed.value = true
      }
      return outcome
    } catch {
      return 'unavailable'
    }
  }
  return { canInstall, installed, install }
}
