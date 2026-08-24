<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useAppStore } from '@/stores/app'
import AnnouncementDialog from '@/components/AnnouncementDialog.vue'
import AiAssistant from '@/components/AiAssistant.vue'

const appStore = useAppStore()

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
  await appStore.fetchSections()
  refreshUnread()
  startPoll()
  window.addEventListener('focus', onWake)
  document.addEventListener('visibilitychange', onWake)
})
onUnmounted(() => {
  stopPoll()
  window.removeEventListener('focus', onWake)
  document.removeEventListener('visibilitychange', onWake)
})
</script>

<template>
  <div class="min-h-screen bg-zinc-50">
    <RouterView v-slot="{ Component }">
      <transition name="fade" mode="out-in">
        <component :is="Component" />
      </transition>
    </RouterView>
    <AnnouncementDialog />
    <AiAssistant />
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
