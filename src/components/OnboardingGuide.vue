<script setup lang="ts">
/**
 * 新手引导（V5）
 * - 首次访问首页 1.2s 后自动弹出一次（localStorage 记忆）
 * - 从命令面板 / 设置页可通过 window.dispatchEvent(new CustomEvent('onboarding:open')) 重看
 * - 三步说明：选板块 → 发一条 → AI 搭把手
 */
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { X, ArrowRight, LayoutGrid, PenSquare, Sparkles } from '@lucide/vue'
import { useUserStore } from '@/stores/user'
import { trapWithInert } from '@/composables/useModalInert'

const STORAGE_KEY = 'onboarding:v1'
const router = useRouter()
const route = useRoute()
const userStore = useUserStore()

const open = ref(false)
const step = ref(0)
let autoTimer: ReturnType<typeof setTimeout> | null = null
let seenDone = false

const steps = [
  {
    icon: LayoutGrid,
    color: 'var(--sky)',
    title: '先选个板块',
    desc: '首页顶部一排彩色圆点，点一下直达对应板块：二手、拼车、表白、求助……',
  },
  {
    icon: PenSquare,
    color: 'var(--lime)',
    title: '30 秒发一条',
    desc: '右下角 + 号进入发布页，选板块、写标题、贴图，发布后全校可见。',
  },
  {
    icon: Sparkles,
    color: 'var(--coral)',
    title: 'AI 搭把手',
    desc: '发布页输入一句话，AI 自动补全标题正文和标签；详情页还能一键划重点。',
  },
]

function dismiss() {
  open.value = false
  seenDone = true // 本次会话内不再自动弹（返回首页也不弹）
  try { localStorage.setItem(STORAGE_KEY, 'done') } catch { /* 隐私模式忽略 */ }
}

function next() {
  if (step.value < steps.length - 1) {
    step.value++
  } else {
    dismiss()
    router.push(userStore.isLoggedIn ? '/publish' : '/login?redirect=/publish')
  }
}

function schedule() {
  if (autoTimer) clearTimeout(autoTimer)
  autoTimer = setTimeout(() => {
    autoTimer = null
    if (route.path === '/' && !open.value) { open.value = true; seenDone = true }
  }, 800)
}

const stopWatch = watch(() => route.path, (path) => {
  if (!seenDone && path === '/' && !open.value) schedule()
})

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && open.value) dismiss()
}

function openGuide() {
  if (autoTimer) { clearTimeout(autoTimer); autoTimer = null }
  step.value = 0
  open.value = true
}

onMounted(() => {
  let seen = ''
  try { seen = localStorage.getItem(STORAGE_KEY) || '' } catch { /* 忽略 */ }
  if (seen) seenDone = true
  if (!seen) {
    // 登录/注册/后台页不打扰；到首页 0.8s 后自动弹一次
    if (route.path === '/') schedule()
  }
  window.addEventListener('onboarding:open', openGuide)
  window.addEventListener('keydown', onKey)
})
onUnmounted(() => {
  window.removeEventListener('onboarding:open', openGuide)
  window.removeEventListener('keydown', onKey)
  if (autoTimer) clearTimeout(autoTimer)
  stopWatch()
})

watch(open, (v) => { document.body.style.overflow = v ? 'hidden' : '' })
trapWithInert(open)
</script>

<template>
  <Teleport to="body">
    <transition name="ob-fade">
      <div v-if="open" class="fixed inset-0 z-[75] flex items-end sm:items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="新手引导">
        <div class="absolute inset-0 ob-overlay" @click="dismiss"></div>

        <div class="relative ob-card w-full max-w-[400px] p-5" style="background: var(--paper)">
          <button class="ds-icon-btn !w-8 !h-8 absolute top-3.5 right-3.5" aria-label="关闭引导" @click="dismiss">
            <X class="w-4 h-4" />
          </button>

          <span class="ds-sticker ds-sticker--coral">START</span>
          <h2 class="ds-display text-[26px] mt-2.5 leading-none" style="color: var(--ink)">
            30 秒上手<span style="color: var(--coral)">校园墙</span>
          </h2>
          <p class="mt-1.5 text-[12.5px]" style="color: var(--ink-mute)">三步就够，随时可以跳过</p>

          <div class="mt-4 space-y-2">
            <button
              v-for="(s, i) in steps"
              :key="s.title"
              class="ob-step w-full flex items-start gap-3 p-3 rounded-[12px] text-left"
              :class="{ 'is-active': i === step }"
              @click="step = i"
            >
              <span class="ob-num shrink-0 ds-num">{{ String(i + 1).padStart(2, '0') }}</span>
              <span class="flex-1 min-w-0">
                <span class="flex items-center gap-1.5 text-[13.5px] font-extrabold" style="color: var(--ink)">
                  <component :is="s.icon" class="w-4 h-4" :style="{ color: s.color }" />
                  {{ s.title }}
                </span>
                <span v-if="i === step" class="block mt-1 text-[12px] leading-relaxed" style="color: var(--ink-soft)">{{ s.desc }}</span>
              </span>
              <span v-if="i === step" class="ob-dot shrink-0" :style="{ background: s.color }"></span>
            </button>
          </div>

          <div class="mt-4 flex items-center gap-2">
            <button class="ds-btn ds-btn--ghost flex-1 !py-2.5 !text-[12.5px]" @click="dismiss">先逛逛</button>
            <button class="ds-btn ds-btn--primary flex-1 !py-2.5 !text-[12.5px]" @click="next">
              {{ step === steps.length - 1 ? '去发第一条' : '下一步' }}
              <ArrowRight class="w-4 h-4" />
            </button>
          </div>

          <div class="mt-3 flex items-center justify-center gap-1.5">
            <span
              v-for="(_, i) in steps" :key="i"
              class="w-1.5 h-1.5 rounded-full transition"
              :style="{ background: i === step ? 'var(--ink)' : 'var(--hairline)' }"
            ></span>
          </div>
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<style scoped>
.ob-overlay { background: rgb(20 17 15 / 0.58); backdrop-filter: blur(3px); }
[data-theme='dark'] .ob-overlay { background: rgb(0 0 0 / 0.74); }
.ob-card {
  border: 1.5px solid var(--line);
  border-radius: 20px;
  box-shadow: var(--shadow-hard-lg);
}
.ob-step {
  border: 1.5px solid transparent;
  color: var(--ink-soft);
  transition: background 0.15s ease, border-color 0.15s ease;
}
.ob-step:hover { background: var(--color-bg); }
.ob-step.is-active {
  background: var(--card);
  border-color: var(--line);
  box-shadow: var(--shadow-hard-sm);
}
.ob-num {
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.04em;
  color: var(--ink-mute);
  border: 1px solid var(--hairline);
  border-radius: 5px;
  padding: 1px 5px;
}
.ob-step.is-active .ob-num { color: var(--ink); border-color: var(--line); }
.ob-dot { width: 8px; height: 8px; border-radius: 999px; margin-top: 5px; }
.ob-fade-enter-active, .ob-fade-leave-active { transition: opacity 0.18s ease; }
.ob-fade-enter-active .ob-card, .ob-fade-leave-active .ob-card {
  transition: transform 0.2s cubic-bezier(0.2, 0.9, 0.3, 1.2), opacity 0.18s ease;
}
.ob-fade-enter-from, .ob-fade-leave-to { opacity: 0; }
.ob-fade-enter-from .ob-card, .ob-fade-leave-to .ob-card { transform: translateY(10px) scale(0.985); opacity: 0; }
</style>
