<script setup lang="ts">
/**
 * 首页：板块Tab + 帖子信息流 + 下拉刷新 + 上拉加载
 * A-T3 虚拟滚动：默认 useVirtual=true，走 @tanstack/vue-virtual 真·窗口虚拟化（只渲染可视区 ± overscan）
 */
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { Search, Bell, Plus, RefreshCw, BellRing, Megaphone, Flame, LayoutGrid, Sparkles, ChevronRight } from '@lucide/vue'
import { useAppStore } from '@/stores/app'
import { useUserStore } from '@/stores/user'
import { postApi, subscriptionApi, announcementApi, sectionApi, aiApi } from '@/utils/api'
import { sectionGradient, sectionColor } from '@/utils/sections'
import { toast } from '@/utils/request'
import { useVirtualList } from '@/composables/useVirtualList'
import { useWindowVirtualizer } from '@tanstack/vue-virtual'
import PostCard from '@/components/PostCard.vue'
import PostSkeleton from '@/components/PostSkeleton.vue'
import EmptyState from '@/components/EmptyState.vue'

const router = useRouter()
const appStore = useAppStore()
const userStore = useUserStore()

const activeSection = ref(0) // 0 = 全部
type SortKey = 'hot' | 'new'
const sortOptions: { key: SortKey; label: string }[] = [
  { key: 'hot', label: '热门' },
  { key: 'new', label: '最新' },
]
const activeSort = ref<SortKey>('hot')
const list = ref<any[]>([])
const page = ref(1)
const pageSize = 20
const hasMore = ref(true)
const loading = ref(false)
const loadingMore = ref(false)
const refreshing = ref(false)
// 已订阅板块 id 集合（首页 Tab 铃铛角标）
const subscribedSectionIds = ref<Set<number>>(new Set())

async function loadSubscriptions() {
  if (!userStore.isLoggedIn) return
  try {
    const res: any = await subscriptionApi.list()
    const items = res?.data || res || []
    subscribedSectionIds.value = new Set(items.map((s: any) => s.sectionId ?? s.id))
  } catch {
    // 静默失败：未登录/网络问题都不影响首页
  }
}

// 下拉刷新相关
const pullDistance = ref(0)
const pullThreshold = 60
let startY = 0
let pulling = false

function onTouchStart(e: TouchEvent) {
  if (document.documentElement.scrollTop > 0 || refreshing.value) return
  const firstTouch = e.touches[0];
  if (!firstTouch) return;
  startY = firstTouch.clientY
  pulling = true
}
function onTouchMove(e: TouchEvent) {
  if (!pulling) return
  const firstTouch = e.touches[0];
  if (!firstTouch) return;
  const diff = firstTouch.clientY - startY
  if (diff > 0) {
    pullDistance.value = Math.min(diff * 0.5, 80)
  }
}
function onTouchEnd() {
  if (!pulling) return
  pulling = false
  if (pullDistance.value >= pullThreshold) {
    refreshing.value = true
    pullDistance.value = 40
    loadList(true).finally(() => {
      refreshing.value = false
      pullDistance.value = 0
    })
  } else {
    pullDistance.value = 0
  }
}

async function loadList(reset = false) {
  if (reset) {
    page.value = 1
    hasMore.value = true
  }
  if (loading.value || loadingMore.value) return
  if (!reset && !hasMore.value) return
  if (reset) loading.value = true
  else loadingMore.value = true
  try {
    const res: any = await postApi.list({
      page: page.value,
      pageSize,
      sectionId: activeSection.value || undefined,
      sort: activeSort.value,
    })
    const data = res.data
    if (reset || page.value === 1) list.value = data.list
    else list.value.push(...data.list)
    hasMore.value = data.hasMore
    if (data.list.length) page.value++
  } catch {
    // 错误已由拦截器 toast
  } finally {
    loading.value = false
    loadingMore.value = false
  }
}

function selectSection(id: number) {
  if (activeSection.value === id) return
  if (id > 0) {
    router.push(`/section/${id}`)
    return
  }
  activeSection.value = id
  loadList(true)
}

// 切换热门/最新排序：重置到第一页重新请求（带 sort 参数）
function selectSort(key: SortKey) {
  if (activeSort.value === key) return
  activeSort.value = key
  loadList(true)
}

function onScroll() {
  const el = document.documentElement
  if (el.scrollHeight - el.scrollTop - window.innerHeight < 100 && hasMore.value && !loadingMore.value && !loading.value) {
    loadList(false)
  }
}

// A-T3 虚拟滚动（降级版：IntersectionObserver 哨兵触底自动加载）
// 开关默认开；如出现兼容问题可临时改 false 退回 window scroll 监听
const useVirtual = ref(true)
const { sentinelRef: _sentinelRef } = useVirtualList({
  isLoading: () => loadingMore.value || loading.value,
  hasMore: () => hasMore.value,
  onLoad: () => loadList(false),
  rootMargin: '200px',
})

// A-T3 真·窗口虚拟化：只渲染可视区 ± overscan，DOM 节点数不随 list 无限增长。
// 行高由 measureElement 实测（ResizeObserver），首屏用 estimateSize 估算。
const listRef = ref<HTMLElement | null>(null)
const scrollMargin = ref(0)
const virtualizer = useWindowVirtualizer(
  computed(() => ({
    count: list.value.length,
    estimateSize: () => 320,
    overscan: 6,
    scrollMargin: scrollMargin.value,
  })),
)
const virtualItems = computed(() => virtualizer.value.getVirtualItems())
const totalSize = computed(() => virtualizer.value.getTotalSize())

function measureRow(el: any) {
  if (el) virtualizer.value.measureElement(el)
}
function updateScrollMargin() {
  scrollMargin.value = listRef.value
    ? listRef.value.getBoundingClientRect().top + window.scrollY
    : 0
}

function goPublish() {
  if (!userStore.isLoggedIn) {
    router.push({ path: '/login', query: { redirect: '/publish' } })
    return
  }
  router.push('/publish')
}

// 桌面端手动刷新（PC 端无触摸下拉，复用顶部 refreshing 状态）
async function manualRefresh() {
  if (refreshing.value) return
  refreshing.value = true
  try {
    await loadList(true)
    toast.success('已刷新')
  } finally {
    refreshing.value = false
  }
}

function goProfile() {
  if (!userStore.isLoggedIn) {
    router.push({ path: '/login', query: { redirect: '/profile' } })
    return
  }
  router.push('/profile')
}

function goMessage() {
  if (!userStore.isLoggedIn) {
    router.push({ path: '/login', query: { redirect: '/message' } })
    return
  }
  router.push('/message')
}

// 桌面端右栏数据：官方公告 + 热门搜索词（失败静默，不影响信息流）
const announcements = ref<{ id: number; title: string; content: string }[]>([])
const hotWords = ref<string[]>([])

async function loadRailData() {
  // 学生侧只有 /announcements/active（返回单条或 null）；/announcements 列表是超管接口，学生/游客拉会 403
  try {
    const res: any = await announcementApi.active()
    const a = res?.data ?? res
    announcements.value = a && a.title ? [a] : []
  } catch {
    announcements.value = []
  }
  try {
    const res: any = await sectionApi.hotSearch()
    hotWords.value = (res?.data || res || []).slice(0, 8)
  } catch {
    // 静默
  }
}

// ── 今日校园 · AI 简报（V3）：服务端 60s 缓存，未接入大模型时走站内统计，永不空窗 ──
const digest = ref<any>(null)
async function loadDigest() {
  try {
    const res: any = await aiApi.digest()
    digest.value = res?.data ?? null
  } catch {
    digest.value = null // 简报失败不影响信息流
  }
}

onMounted(() => {
  loadDigest()
  if (!useVirtual.value) window.addEventListener('scroll', onScroll)
  if (!appStore.sections.length) appStore.fetchSections()
  loadList(true)
  loadSubscriptions()
  loadRailData()
  updateScrollMargin()
  window.addEventListener('resize', updateScrollMargin)
})
onUnmounted(() => {
  window.removeEventListener('scroll', onScroll)
  window.removeEventListener('resize', updateScrollMargin)
})
// 列表变化后重算虚拟容器相对文档的偏移（首屏骨架卸载后才拿得到 listRef）
watch(list, () => nextTick(updateScrollMargin))
</script>

<template>
  <div class="min-h-screen pb-24" style="background: var(--color-bg)">
    <!-- V4 海报头：墨色画布 + 字标 + 荧光走马条（高度压到 ~210px，首屏能露两张卡） -->
    <header class="hero sticky top-0 z-20">
      <div class="max-w-[1280px] mx-auto px-4 pt-3">
        <!-- 品牌行 -->
        <div class="flex items-center justify-between gap-3">
          <div class="flex items-center gap-2.5 min-w-0">
            <span class="ds-sticker ds-sticker--coral shrink-0">CAMPUS</span>
            <h1 class="ds-display text-[26px] md:text-[34px] leading-none text-white whitespace-nowrap">
              校园<span style="color: var(--lime)">墙</span>
            </h1>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <button
              class="hidden md:inline-flex ds-icon-btn"
              style="width:34px;height:34px;background:rgba(255,255,255,.1);border-color:rgba(255,255,255,.32);color:#fff;box-shadow:none"
              title="刷新" :disabled="refreshing" @click="manualRefresh"
            >
              <RefreshCw class="w-4 h-4" :class="refreshing ? 'animate-spin' : ''" />
            </button>
            <button
              class="hidden md:inline-flex ds-icon-btn relative"
              style="width:34px;height:34px;background:rgba(255,255,255,.1);border-color:rgba(255,255,255,.32);color:#fff;box-shadow:none"
              aria-label="消息中心" @click="goMessage"
            >
              <Bell class="w-[17px] h-[17px]" />
              <span v-if="appStore.unreadCount > 0" class="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full" style="background: var(--coral); box-shadow: 0 0 0 1.5px var(--ink)"></span>
            </button>
            <button
              class="ds-icon-btn overflow-hidden"
              style="width:34px;height:34px;background: var(--lime); border-color: var(--lime); color: var(--ink); box-shadow: none"
              aria-label="个人中心" @click="goProfile"
            >
              <img v-if="userStore.user?.avatar" :src="userStore.user.avatar" class="w-full h-full object-cover" alt="" />
              <span v-else class="text-[12px] font-black">{{ userStore.user?.nickname?.charAt(0) || '我' }}</span>
            </button>
          </div>
        </div>

        <!-- 搜索行 -->
        <div class="mt-2.5 flex items-center gap-2">
          <button
            class="flex-1 min-w-0 flex items-center gap-2 rounded-full px-4 py-2 text-[13px] text-white/60"
            style="background: rgba(255,255,255,.07); border: 1.2px solid rgba(255,255,255,.26)"
            @click="router.push('/search')"
          >
            <Search class="w-4 h-4 opacity-70 shrink-0" />
            <span class="truncate">搜索内容、话题、用户</span>
          </button>
          <button class="hero-pill shrink-0 font-bold !text-[12px]" aria-label="切换校区">
            <span>📍</span><span>本校</span>
          </button>
        </div>

        <!-- 分类 chips：纸底描边 + 分类色圆点（颜色留给点，不铺满整颗 chip） -->
        <div class="mt-2.5 flex items-center gap-2 overflow-x-auto scrollbar-hide pb-2.5 ds-scroll-x">
          <button
            v-for="sec in [{ id: 0, name: '全部' }, ...appStore.sections]"
            :key="sec.id"
            class="hero-chip"
            :class="{ 'is-active': activeSection === sec.id }"
            @click="selectSection(sec.id)"
          >
            <span
              class="w-[7px] h-[7px] rounded-full shrink-0"
              :style="{
                background: sec.id ? sectionGradient(sec.id, sec.name) : 'currentColor',
                boxShadow: 'inset 0 0 0 1px rgba(20,17,15,.45)',
              }"
            ></span>
            {{ sec.name }}
            <BellRing v-if="sec.id > 0 && subscribedSectionIds.has(sec.id)" class="w-3 h-3 opacity-70" />
          </button>
        </div>
      </div>

      <!-- 荧光走马条：把「今天有什么」压成一行 -->
      <div class="ds-marquee">
        <div class="ds-marquee__track" aria-hidden="true">
          <template v-for="n in 2" :key="n">
            <span>★ 今日校园 · {{ digest ? `${digest.stats.posts} 条新动态 / ${digest.stats.comments} 条评论` : '真实同学，真实生活' }}</span>
            <span>★ 失物雷达自动撮合</span>
            <span>★ AI 一键成稿 · 30 秒发一条</span>
            <span>★ 信誉分 92 才敢匿名</span>
            <span>★ 交易先验货，押金都是坑</span>
          </template>
        </div>
      </div>

      <!-- 排序条：纸色 + 墨色下划线 -->
      <div class="sort-strip max-w-[1280px] mx-auto flex items-center gap-10 px-4 pt-2.5 pb-2">
        <button
          v-for="opt in sortOptions"
          :key="opt.key"
          class="sort-strip-item"
          :class="{ 'is-active': activeSort === opt.key }"
          @click="selectSort(opt.key)"
        >
          {{ opt.label }}
        </button>
      </div>
    </header>

    <!-- 内容区：左信息流 + 右栏（xl 及以上显示） -->
    <main
      class="max-w-[1280px] mx-auto px-3 py-3 flex gap-6 items-start"
      @touchstart="onTouchStart"
      @touchmove="onTouchMove"
      @touchend="onTouchEnd"
    >
      <div class="flex-1 min-w-0 max-w-[960px] space-y-3"><!-- 下拉刷新指示器 -->
      <div class="flex items-center justify-center text-xs text-zinc-400 transition-all overflow-hidden" :style="{ height: pullDistance + 'px' }">
        <RefreshCw v-if="refreshing" class="w-4 h-4 animate-spin mr-1" />
        {{ refreshing ? '刷新中...' : pullDistance >= pullThreshold ? '松开刷新' : '下拉刷新' }}
      </div>

      <!-- 今日校园 · AI 简报：AI 进首页主链路，一眼看完今天 -->
      <section v-if="digest" class="card-premium ai-trail rounded-[16px] p-4">
        <div class="flex items-center gap-2">
          <span class="w-7 h-7 rounded-xl flex items-center justify-center text-white flex-shrink-0"
            style="background: var(--grad-brand)">
            <Sparkles class="w-4 h-4" />
          </span>
          <div class="min-w-0">
            <h2 class="text-sm font-semibold text-zinc-900 leading-tight">今日校园</h2>
            <p class="text-[11px] text-zinc-400">{{ digest.date }}<template v-if="digest.window"> · {{ digest.window }}</template></p>
          </div>
          <span class="ml-auto dopa-chip flex-shrink-0">{{ digest.offline ? '站内统计' : 'AI 生成' }}</span>
        </div>

        <p class="mt-2.5 text-[13px] text-zinc-700 leading-relaxed">{{ digest.summary }}</p>

        <div class="mt-2.5 flex flex-wrap gap-1.5">
          <span v-for="sec in digest.sections" :key="sec.name" class="ds-tag">
            <span class="ds-tag-dot" :style="{ background: sectionColor(null, sec.name) }"></span>
            {{ sec.name }} {{ sec.n }}
          </span>
          <span class="ds-tag">
            <span class="ds-tag-dot" style="background: var(--lime)"></span>
            新动态 {{ digest.stats.posts }}
          </span>
          <span class="ds-tag">
            <span class="ds-tag-dot" style="background: var(--sky)"></span>
            评论 {{ digest.stats.comments }}
          </span>
        </div>

        <button
          v-if="digest.hot"
          class="mt-3 w-full flex items-center gap-2 text-left px-3 py-2.5 transition active:translate-x-[1px] active:translate-y-[1px]"
          style="border: 1.5px solid var(--ink); border-radius: 12px; background: var(--paper); box-shadow: 2px 2px 0 var(--ink)"
          @click="router.push(`/post/${digest.hot.id}`)"
        >
          <span class="w-6 h-6 rounded-[7px] flex items-center justify-center shrink-0" style="background: var(--coral)">
            <Flame class="w-3.5 h-3.5 text-white" />
          </span>
          <span class="text-[12.5px] font-semibold truncate flex-1" style="color: var(--ink)">今日最热：{{ digest.hot.title }}</span>
          <ChevronRight class="w-4 h-4 shrink-0" style="color: var(--ink-mute)" />
        </button>

        <p v-if="digest.tip" class="mt-2.5 text-[11px] leading-relaxed" style="color: var(--ink-mute)">{{ digest.tip }}</p>
      </section>

      <PostSkeleton v-if="loading" :count="4" />

      <template v-else>
        <!-- A-T3 真·窗口虚拟化容器：仅渲染可视区 ± overscan -->
        <div ref="listRef" class="relative" :style="{ height: totalSize + 'px' }">
          <div
            v-for="v in virtualItems"
            :key="v.index"
            :ref="measureRow"
            :data-index="v.index"
            class="pb-3"
            :style="{
              position: 'absolute',
              top: '0',
              left: '0',
              width: '100%',
              transform: `translateY(${v.start - scrollMargin}px)`,
            }"
          >
            <PostCard :post="list[v.index]" />
          </div>
        </div>
        <div v-if="loadingMore" class="py-4 text-center text-sm text-zinc-400 flex items-center justify-center gap-2">
          <RefreshCw class="w-4 h-4 animate-spin" /> 加载中...
        </div>
        <div v-else-if="!hasMore && list.length" class="py-4 text-center text-xs text-zinc-400">— 已经到底了 —</div>
        <EmptyState
          v-if="!loading && !list.length"
          text="暂无帖子，快来发布第一条吧"
          action-text="去发布"
          @action="goPublish"
        />
        <!-- A-T3 虚拟滚动哨兵：进入视口 → 触发 loadList(false) -->
        <div v-if="useVirtual && hasMore" ref="sentinelRef" class="h-1" aria-hidden="true" />
      </template>
      </div>

      <!-- 右栏：官方公告 / 热门搜索 / 板块直达（V4 海报卡） -->
      <aside class="hidden xl:block w-[300px] shrink-0 sticky top-[196px] space-y-3">
        <section v-if="announcements.length" class="ds-card p-4">
          <div class="ds-section-head mb-3">
            <span class="ds-section-head__num">01</span>
            <h2 class="ds-title !text-[16px]">官方公告</h2>
            <span class="ds-section-head__line"></span>
            <Megaphone class="w-4 h-4" style="color: var(--coral)" />
          </div>
          <div
            v-for="a in announcements"
            :key="a.id"
            class="pb-3 mb-3 last:pb-0 last:mb-0"
            style="border-bottom: 1px solid var(--hairline)"
          >
            <p class="text-[13.5px] font-bold leading-snug" style="color: var(--ink)">{{ a.title }}</p>
            <p class="mt-1 text-[12px] leading-relaxed line-clamp-3" style="color: var(--ink-mute)">{{ a.content }}</p>
          </div>
        </section>

        <section class="ds-card p-4">
          <div class="ds-section-head mb-3">
            <span class="ds-section-head__num">{{ announcements.length ? '02' : '01' }}</span>
            <h2 class="ds-title !text-[16px]">热门搜索</h2>
            <span class="ds-section-head__line"></span>
            <Flame class="w-4 h-4" style="color: var(--coral)" />
          </div>
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="w in hotWords"
              :key="w"
              class="ds-chip !text-[11.5px] !py-1 !px-2.5"
              @click="router.push({ path: '/search', query: { keyword: w } })"
            >
              {{ w }}
            </button>
          </div>
        </section>

        <section class="ds-card p-4">
          <div class="ds-section-head mb-3">
            <span class="ds-section-head__num">{{ announcements.length ? '03' : '02' }}</span>
            <h2 class="ds-title !text-[16px]">板块直达</h2>
            <span class="ds-section-head__line"></span>
            <LayoutGrid class="w-4 h-4" style="color: var(--violet)" />
          </div>
          <div class="grid grid-cols-2 gap-1.5">
            <button
              v-for="sec in appStore.sections"
              :key="sec.id"
              class="ds-chip !justify-start !text-[11.5px] !py-1.5 !px-2.5 truncate"
              @click="router.push(`/section/${sec.id}`)"
            >
              <span
                class="w-[6px] h-[6px] rounded-full shrink-0"
                :style="{ background: sectionGradient(sec.id, sec.name) }"
              ></span>
              <span class="truncate">{{ sec.name }}</span>
            </button>
          </div>
        </section>

        <!-- 品牌卡：墨色海报 + 荧光字 -->
        <section class="relative overflow-hidden p-4" style="background: var(--ink); border: 1.5px solid var(--ink); border-radius: 18px; box-shadow: var(--shadow-hard)">
          <span class="pointer-events-none absolute -right-8 -top-10 w-28 h-28 rounded-full blur-2xl" style="background: rgb(200 240 74 / 0.35)" aria-hidden="true"></span>
          <div class="relative">
            <span class="ds-sticker ds-sticker--coral">SINCE 2026</span>
            <p class="ds-display text-[22px] mt-2" style="color: var(--paper)">校园墙</p>
            <p class="mt-1.5 text-[11.5px] leading-relaxed" style="color: rgb(247 242 232 / 0.72)">
              二手 · 失物 · 表白 · 树洞 · 互助 · 活动 · 拼车 · 组队
            </p>
            <p class="mt-2 text-[11px] font-bold" style="color: var(--lime)">失物雷达 / 信誉分 / 匿名治理 / 实时私信</p>
          </div>
        </section>
      </aside>
    </main>

    <!-- 悬浮发布按钮 -->
    <button
      class="hidden md:flex fixed right-5 w-14 h-14 rounded-[16px] items-center justify-center transition-all duration-200 active:translate-x-[2px] active:translate-y-[2px] z-20"
      style="background: var(--ink); color: var(--lime); border: 1.5px solid var(--ink); box-shadow: var(--shadow-hard); bottom: calc(1.5rem + env(safe-area-inset-bottom))"
      aria-label="发布新内容"
      @click="goPublish"
    >
      <Plus class="w-7 h-7" />
    </button>
  </div>
</template>

