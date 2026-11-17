<script setup lang="ts">
import { onMounted, onUnmounted, ref, defineAsyncComponent } from 'vue'
import { useAppStore } from '@/stores/app'
import { useThemeStore } from '@/stores/theme'
import { useUserStore } from '@/stores/user'
import AnnouncementDialog from '@/components/AnnouncementDialog.vue'
import AiAssistant from '@/components/AiAssistant.vue'
import RouteProgress from '@/components/RouteProgress.vue'
import OnboardingGuide from '@/components/OnboardingGuide.vue'
import BottomNav from '@/components/BottomNav.vue'
import { useNotifyFeed } from '@/composables/useNotifyFeed'

// 命令面板懒挂载：首次 Ctrl/⌘+K 或 cp:open 才加载 chunk（启动期不求值面板代码）
const CommandPalette = defineAsyncComponent(() => import('@/components/CommandPalette.vue'))
const paletteMounted = ref(false)
function mountPalette() {
  if (paletteMounted.value) return
  ;(window as any).__cpPendingOpen = true
  paletteMounted.value = true
}
function onPaletteShortcut(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k' && !paletteMounted.value) {
    e.preventDefault()
    mountPalette()
  }
}
function onPaletteEvent() {
  if (!paletteMounted.value) mountPalette()
}

const appStore = useAppStore()
const themeStore = useThemeStore()
const userStore = useUserStore()
useNotifyFeed()

// 未读红点激活：30s 低频轮询 + focus/回前台边沿即时刷新；后台标签页暂停轮询
let pollTimer: ReturnType<typeof setInterval> | null = null
let lastFetchAt = 0

function refreshUnread() {
  const now = Date.now()
  // focus 与 visibilitychange 回前台常同帧双触发，2s 内去重
  if (now - lastFetchAt < 2000) return
  lastFetchAt = now
  appStore.refreshUnread().catch(() => {})
}
function startPoll() {
  if (pollTimer !== null || document.hidden) return
  pollTimer = setInterval(() => {
    if (!document.hidden) refreshUnread()
  }, 30000)
}
function stopPoll() {
  if (pollTimer !== null) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}
function onWake() {
  if (document.hidden) {
    stopPoll()
  } else {
    refreshUnread() // 回前台立即拉一次
    startPoll()
  }
}

onMounted(async () => {
  // access token 只在内存：刷新页面后先用持久化的 refreshToken 静默续期，
  // 再走后续依赖登录态的初始化（板块拉取/未读轮询）
  try { await userStore.ensureSession() } catch { /* 已记录在 request.ts */ }
  // 启动时应用主题（设置 data-theme / theme-color）
  themeStore.init()
  // 把持久化里可能存在的旧版 snake_case 字段（student_id/credit_score/created_at）
  // 迁到新字段名（studentId/creditScore/createdAt），避免刷新后页面访问 user.creditScore 变 undefined
  userStore.migrateLegacyUser()
  // 板块接口失败不应阻塞启动：后续轮询/唤醒监听必须照常注册，
  // 各页面（发布页、板块页）自己提供重试入口
  try { await appStore.fetchSections() } catch { /* 已记录在 sectionsError */ }
  refreshUnread()
  startPoll()
  window.addEventListener('focus', onWake)
  document.addEventListener('visibilitychange', onWake)
  window.addEventListener('keydown', onPaletteShortcut)
  window.addEventListener('cp:open', onPaletteEvent)
})
onUnmounted(() => {
  stopPoll()
  window.removeEventListener('focus', onWake)
  document.removeEventListener('visibilitychange', onWake)
  window.removeEventListener('keydown', onPaletteShortcut)
  window.removeEventListener('cp:open', onPaletteEvent)
})
</script>

<template>
  <!--
    三档响应式外层：
      - < 640（mobile）：单栏
      - 640-960（pad）：单栏 + 居中最大 960
      - ≥ 960（desktop）：左右两栏 sidebar + main（中间留空填充）
    通过 .app-container 工具类控制内层 max-width
  -->
  <div class="app-shell">
    <a href="#app-main" class="skip-link">跳到主要内容</a>
    <div class="aurora-bg" aria-hidden="true"></div>
    <div id="app-main" tabindex="-1" class="app-container">
      <RouterView v-slot="{ Component }">
        <transition name="fade" mode="out-in">
          <component :is="Component" />
        </transition>
      </RouterView>
    </div>
    <BottomNav />
    <AnnouncementDialog />
    <AiAssistant />
    <RouteProgress />
    <CommandPalette v-if="paletteMounted" />
    <OnboardingGuide />
  </div>
</template>

<style>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
