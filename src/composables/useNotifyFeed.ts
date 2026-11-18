/**
 * 全局实时通知（V5）：任意页面收到 WS 推送 →
 *   - 未读徽标即时刷新（免去 30s 轮询等待）
 *   - 右下角 toast 摘要（当前就在消息页时不打扰，页面自己更新列表）
 * App.vue 挂载一次即可；消费者是 Set，与 MessagePage/ChatPanel 并存互不影响。
 */
import { onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { useAppStore } from '@/stores/app'
import { toast } from '@/utils/request'
import { useChatSocket } from './useChatSocket'

export function useNotifyFeed() {
  const route = useRoute()
  const appStore = useAppStore()
  const { onNotify, onIncoming } = useChatSocket()

  const kindIcon: Record<string, string> = {
    comment: '💬', like: '❤️', match: '🎯', digest: '📋', system: '📢',
  }

  // onNotify/onIncoming 返回退订句柄：宿主组件（App.vue）卸载时退订，
  // 避免热重载/测试环境反复挂载时 Set 里累积陈旧闭包
  const offNotify = onNotify((n) => {
    appStore.refreshUnread().catch(() => {})
    if (route.path === '/message') return
    const text = String(n.content || '').slice(0, 32)
    if (!text) return
    toast.info(`${kindIcon[n.kind] || '🔔'} ${text}`)
  })

  // 私信帧在消息会话之外也提醒一声（消息页内由会话视图自行渲染气泡）
  const offIncoming = onIncoming(() => {
    appStore.refreshUnread().catch(() => {})
    if (route.path === '/message') return
    toast.info('💬 收到新的私信')
  })

  onUnmounted(() => {
    offNotify()
    offIncoming()
  })
}
