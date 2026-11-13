<script setup lang="ts">
/**
 * 全局命令面板（Ctrl/⌘ + K）
 * - 空查询：最近搜索 + 快捷入口 + 板块直达
 * - 有查询：帖子结果（防抖请求）+ 页面/板块过滤 + 「查看全部」
 * - 键盘：↑↓ 选择 / Enter 进入 / Esc 关闭；点击遮罩关闭；打开时锁定背景滚动
 * 打开方式：window.dispatchEvent(new CustomEvent('cp:open')) 或快捷键
 */
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  Search, CornerDownLeft, FileText, Home, Flame, Bell, User, Settings,
  PenSquare, Moon, Shield, Clock, Loader2, Sun, Hash, Sparkles,
} from '@lucide/vue'
import { useAppStore } from '@/stores/app'
import { useUserStore } from '@/stores/user'
import { useThemeStore } from '@/stores/theme'
import { sectionApi } from '@/utils/api'
import { trapWithInert } from '@/composables/useModalInert'

interface Item {
  id: string
  kind: 'post' | 'nav' | 'section' | 'action' | 'all'
  label: string
  hint?: string
  icon?: any
  color?: string
  run: () => void
}

const router = useRouter()
const appStore = useAppStore()
const userStore = useUserStore()
const themeStore = useThemeStore()

const open = ref(false)
const query = ref('')
const loading = ref(false)
const posts = ref<any[]>([])
const activeIndex = ref(0)
const inputRef = ref<HTMLInputElement | null>(null)
const listRef = ref<HTMLElement | null>(null)
const RECENT_KEY = 'cp:recent'

const recent = ref<string[]>(readRecent())
function readRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr.filter((s) => typeof s === 'string').slice(0, 5) : []
  } catch {
    return []
  }
}
function pushRecent(kw: string) {
  const k = kw.trim()
  if (!k) return
  recent.value = [k, ...recent.value.filter((s) => s !== k)].slice(0, 5)
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(recent.value)) } catch { /* 隐私模式忽略 */ }
}

function go(path: string) {
  close()
  router.push(path)
}

const navItems = computed<Item[]>(() => {
  const items: Item[] = [
    { id: 'nav-home', kind: 'nav', label: '首页 · 信息流', hint: 'Home', icon: Home, run: () => go('/') },
    { id: 'nav-topics', kind: 'nav', label: '话题广场', hint: 'Topics', icon: Flame, run: () => go('/topics') },
    { id: 'nav-publish', kind: 'nav', label: '发布新帖', hint: 'Publish', icon: PenSquare, run: () => go(userStore.isLoggedIn ? '/publish' : '/login?redirect=/publish') },
    { id: 'nav-message', kind: 'nav', label: '消息中心', hint: 'Message', icon: Bell, run: () => go(userStore.isLoggedIn ? '/message' : '/login?redirect=/message') },
    { id: 'nav-profile', kind: 'nav', label: '个人中心', hint: 'Profile', icon: User, run: () => go(userStore.isLoggedIn ? '/profile' : '/login?redirect=/profile') },
    { id: 'nav-settings', kind: 'nav', label: '设置', hint: 'Settings', icon: Settings, run: () => go(userStore.isLoggedIn ? '/profile/settings' : '/login?redirect=/profile') },
    {
      id: 'nav-onboarding', kind: 'action', label: '重新查看新手引导', hint: 'Guide', icon: Sparkles,
      run: () => { close(); setTimeout(() => window.dispatchEvent(new CustomEvent('onboarding:open')), 120) },
    },
    {
      id: 'nav-theme', kind: 'action',
      label: themeStore.effective === 'dark' ? '切换到浅色模式' : '切换到深色模式',
      hint: 'Theme',
      icon: themeStore.effective === 'dark' ? Sun : Moon,
      run: () => { themeStore.setMode(themeStore.effective === 'dark' ? 'light' : 'dark'); close() },
    },
  ]
  if (userStore.isAdmin) {
    items.push({ id: 'nav-admin', kind: 'nav', label: '管理后台', hint: 'Admin', icon: Shield, run: () => go('/admin') })
  }
  return items
})

const sectionItems = computed<Item[]>(() =>
  appStore.sections.map((s: any) => ({
    id: `section-${s.id}`,
    kind: 'section' as const,
    label: s.name,
    hint: s.postCount ? `${s.postCount} 帖` : '板块',
    icon: Hash,
    run: () => go(`/section/${s.id}`),
  })),
)

const navFiltered = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return navItems.value
  return navItems.value.filter((i) => i.label.toLowerCase().includes(q) || (i.hint || '').toLowerCase().includes(q))
})
const sectionFiltered = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return sectionItems.value
  return sectionItems.value.filter((i) => i.label.toLowerCase().includes(q))
})

const recentItems = computed<Item[]>(() =>
  query.value.trim() ? [] : recent.value.map((kw) => ({
    id: `recent-${kw}`,
    kind: 'nav' as const,
    label: kw,
    hint: '最近搜索',
    icon: Clock,
    run: () => { pushRecent(kw); go(`/search?keyword=${encodeURIComponent(kw)}`) },
  })),
)

const postItems = computed<Item[]>(() =>
  posts.value.map((p: any) => ({
    id: `post-${p.id}`,
    kind: 'post' as const,
    label: p.title || p.content?.slice(0, 40) || '无标题',
    hint: p.sectionName || (p.authorNickname ? `@${p.authorNickname}` : '帖子'),
    icon: FileText,
    run: () => { pushRecent(query.value); go(`/post/${p.id}`) },
  })),
)

const allSearchItem = computed<Item[]>(() => {
  const q = query.value.trim()
  if (!q) return []
  return [{
    id: 'all-results',
    kind: 'all' as const,
    label: `查看「${q}」的全部搜索结果`,
    hint: 'Search',
    icon: Search,
    run: () => { pushRecent(q); go(`/search?keyword=${encodeURIComponent(q)}`) },
  }]
})

/** 扁平可选项：分组顺序 = 最近搜索 → 帖子 → 全部 → 快捷 → 板块 */
const flat = computed<Item[]>(() => [
  ...recentItems.value,
  ...postItems.value,
  ...allSearchItem.value,
  ...navFiltered.value,
  ...sectionFiltered.value,
])
const showSectionHeads = computed(() => query.value.trim().length === 0)

function groupStart(id: string): boolean {
  const f = flat.value
  const idx = f.findIndex((i) => i.id === id)
  if (idx <= 0) return true
  return f[idx - 1]!.kind !== f[idx]!.kind
}

watch(activeIndex, async () => {
  await nextTick()
  const el = listRef.value?.querySelector<HTMLElement>('[data-active="true"]')
  el?.scrollIntoView({ block: 'nearest' })
})

// 查询防抖：只搜帖子；空查询清空结果
let timer: ReturnType<typeof setTimeout> | null = null
let seq = 0
watch(query, (q) => {
  activeIndex.value = 0
  if (timer) clearTimeout(timer)
  const kw = q.trim()
  if (!kw) {
    posts.value = []
    loading.value = false
    return
  }
  loading.value = true
  timer = setTimeout(async () => {
    const my = ++seq
    try {
      const res: any = await sectionApi.search(kw, { page: 1 })
      if (my !== seq) return
      posts.value = (res?.data?.list || []).slice(0, 6)
    } catch {
      if (my === seq) posts.value = []
    } finally {
      if (my === seq) loading.value = false
    }
  }, 220)
})

function openPalette() {
  open.value = true
  query.value = ''
  posts.value = []
  activeIndex.value = 0
  nextTick(() => inputRef.value?.focus())
}
function close() {
  open.value = false
  if (timer) clearTimeout(timer)
}

function move(delta: number) {
  const n = flat.value.length
  if (!n) return
  activeIndex.value = (activeIndex.value + delta + n) % n
}
function choose(item?: Item) {
  const target = item || flat.value[activeIndex.value]
  target?.run()
}

function onKeydown(e: KeyboardEvent) {
  const metaK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k'
  if (metaK) {
    e.preventDefault()
    open.value ? close() : openPalette()
    return
  }
  if (!open.value) return
  if (e.key === 'Escape') { e.preventDefault(); close() }
  else if (e.key === 'ArrowDown') { e.preventDefault(); move(1) }
  else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1) }
  else if (e.key === 'Enter') { e.preventDefault(); choose() }
}

function onOpenEvent() { openPalette() }

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('cp:open', onOpenEvent)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('cp:open', onOpenEvent)
})

// 打开时锁定背景滚动
watch(open, (v) => {
  document.body.style.overflow = v ? 'hidden' : ''
})
trapWithInert(open)
</script>

<template>
  <Teleport to="body">
    <transition name="cp-fade">
      <div v-if="open" class="fixed inset-0 z-[80] flex items-start justify-center px-4 pt-[10vh]" role="dialog" aria-modal="true" aria-label="全局命令面板">
        <div class="absolute inset-0 cp-overlay" @click="close"></div>

        <div class="relative cp-panel w-full max-w-[560px] overflow-hidden">
          <!-- 输入行 -->
          <div class="flex items-center gap-2.5 px-4 h-[54px]" style="border-bottom: 1.5px solid var(--line)">
            <Search class="w-[18px] h-[18px] shrink-0" style="color: var(--ink-mute)" />
            <input
              ref="inputRef"
              v-model="query"
              type="text"
              class="flex-1 min-w-0 bg-transparent outline-none text-[15px] font-medium"
              style="color: var(--ink)"
              placeholder="搜索帖子、板块，或跳转页面…"
              aria-label="搜索或跳转"
              autocomplete="off"
              spellcheck="false"
            />
            <Loader2 v-if="loading" class="w-4 h-4 animate-spin shrink-0" style="color: var(--ink-mute)" />
            <button v-else class="cp-kbd shrink-0" aria-label="关闭" @click="close">ESC</button>
          </div>

          <!-- 结果列表 -->
          <div ref="listRef" class="cp-list overflow-y-auto overscroll-contain py-1.5" style="max-height: min(56vh, 420px)">
            <div v-if="!flat.length" class="px-4 py-10 text-center">
              <p class="ds-display text-[22px]" style="color: var(--ink)">没有结果</p>
              <p class="mt-1 text-[12.5px]" style="color: var(--ink-mute)">换个关键词，或直接回车查看全部搜索</p>
            </div>

            <template v-for="(item, i) in flat" :key="item.id">
              <div v-if="groupStart(item.id) && (showSectionHeads || item.kind === 'post' || item.kind === 'all')" class="cp-head">
                <span v-if="item.kind === 'nav' && recentItems.length && i === 0">最近搜索</span>
                <span v-else-if="item.kind === 'post'">帖子</span>
                <span v-else-if="item.kind === 'nav'">快捷入口</span>
                <span v-else-if="item.kind === 'section'">板块直达</span>
              </div>
              <button
                class="cp-item w-full flex items-center gap-3 px-3.5 py-2.5 mx-1.5 rounded-[10px] text-left"
                :data-active="i === activeIndex"
                :class="{ 'is-active': i === activeIndex }"
                style="width: calc(100% - 12px)"
                @mouseenter="activeIndex = i"
                @click="choose(item)"
              >
                <span class="cp-ico shrink-0">
                  <component :is="item.icon" class="w-[15px] h-[15px]" />
                </span>
                <span class="flex-1 min-w-0">
                  <span class="block truncate text-[13.5px] font-semibold" style="color: inherit">{{ item.label }}</span>
                </span>
                <span class="cp-hint shrink-0">{{ item.kind === 'post' ? '打开' : item.hint }}</span>
                <CornerDownLeft v-if="i === activeIndex" class="w-3.5 h-3.5 shrink-0 opacity-70" />
              </button>
            </template>
          </div>

          <!-- 底部操作提示 -->
          <div class="cp-foot flex items-center justify-between px-4 h-9 text-[11px]" style="border-top: 1.5px solid var(--line); color: var(--ink-mute)">
            <span class="flex items-center gap-1.5"><span class="cp-kbd">↑</span><span class="cp-kbd">↓</span>选择 <span class="cp-kbd">↵</span>进入</span>
            <span class="flex items-center gap-1"><span class="cp-kbd">Ctrl</span><span class="cp-kbd">K</span>随时唤起</span>
          </div>
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<style scoped>
.cp-overlay {
  background: rgb(20 17 15 / 0.62);
  backdrop-filter: blur(3px);
}
.cp-panel {
  background: var(--paper);
  border: 1.5px solid var(--line);
  border-radius: 18px;
  box-shadow: var(--shadow-hard-lg);
}
.cp-kbd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 5px;
  border: 1px solid var(--hairline);
  border-radius: 5px;
  font-size: 10px;
  font-weight: 700;
  font-family: ui-monospace, monospace;
  color: var(--ink-mute);
}
.cp-head {
  padding: 8px 18px 4px;
  font-size: 10.5px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-mute);
}
.cp-ico {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 7px;
  border: 1px solid var(--hairline);
  color: var(--ink-soft);
  background: var(--card);
}
.cp-item {
  color: var(--ink-soft);
  transition: background 0.12s ease, color 0.12s ease;
}
.cp-item.is-active {
  background: var(--ink);
  color: var(--lime);
}
[data-theme='dark'] .cp-item.is-active {
  background: var(--lime);
  color: #14110F;
}
.cp-item.is-active .cp-ico {
  background: rgb(255 255 255 / 0.1);
  border-color: rgb(255 255 255 / 0.28);
  color: var(--lime);
}
.cp-item.is-active .cp-hint {
  color: rgb(247 242 232 / 0.55);
}
.cp-hint {
  font-size: 11px;
  color: var(--ink-mute);
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cp-foot {
  background: var(--card);
}
.cp-fade-enter-active,
.cp-fade-leave-active {
  transition: opacity 0.16s ease;
}
.cp-fade-enter-active .cp-panel,
.cp-fade-leave-active .cp-panel {
  transition: transform 0.18s cubic-bezier(0.2, 0.9, 0.3, 1.2), opacity 0.16s ease;
}
.cp-fade-enter-from,
.cp-fade-leave-to {
  opacity: 0;
}
.cp-fade-enter-from .cp-panel,
.cp-fade-leave-to .cp-panel {
  transform: translateY(-8px) scale(0.985);
  opacity: 0;
}
:global([data-theme='dark']) .cp-overlay {
  background: rgb(0 0 0 / 0.7);
}
</style>
