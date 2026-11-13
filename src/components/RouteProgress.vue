<script setup lang="ts">
/**
 * 路由顶部进度条（V5）：懒加载页面时的即时反馈，1.5px 墨线 + 荧光填充
 * beforeEach 起跳 → afterEach 冲 100% 淡出；失败同样收尾，不会卡住。
 */
import { ref, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const visible = ref(false)
const progress = ref(0)
let ramp: ReturnType<typeof setInterval> | null = null
let hideTimer: ReturnType<typeof setTimeout> | null = null

function stopRamp() {
  if (ramp) { clearInterval(ramp); ramp = null }
}

const stopAfter = router.beforeEach((_to, _from, next) => {
  if (hideTimer) { clearTimeout(hideTimer); hideTimer = null }
  visible.value = true
  progress.value = 12
  stopRamp()
  // 慢请求时爬到 80% 封顶，留 20% 给真正完成那一刻
  ramp = setInterval(() => {
    if (progress.value < 80) progress.value += (80 - progress.value) * 0.08
  }, 120)
  next()
})

function settle() {
  stopRamp()
  progress.value = 100
  hideTimer = setTimeout(() => { visible.value = false; progress.value = 0 }, 260)
}
const stopEach = router.afterEach(() => settle())
const stopErr = router.onError(() => settle())

onUnmounted(() => {
  stopAfter(); stopEach(); stopErr(); stopRamp()
  if (hideTimer) clearTimeout(hideTimer)
})
</script>

<template>
  <transition name="rp-fade">
    <div v-if="visible" class="rp-track" aria-hidden="true">
      <div class="rp-bar" :style="{ width: progress + '%' }"></div>
    </div>
  </transition>
</template>

<style scoped>
.rp-track {
  position: fixed;
  top: 0; left: 0; right: 0;
  height: 3px;
  z-index: 90;
  pointer-events: none;
  background: transparent;
}
.rp-bar {
  height: 100%;
  background: var(--lime);
  box-shadow: 0 0 0 1px var(--ink);
  border-radius: 0 2px 2px 0;
  transition: width 0.22s ease;
}
.rp-fade-enter-active { transition: opacity 0.1s ease; }
.rp-fade-leave-active { transition: opacity 0.3s ease 0.1s; }
.rp-fade-enter-from, .rp-fade-leave-to { opacity: 0; }
</style>
