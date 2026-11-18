<script setup lang="ts">
/**
 * 板块详情页：展示单个板块下的帖子列表
 */
import { ref, onMounted, onUnmounted, computed, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, Plus, RefreshCw, Bell, BellRing } from '@lucide/vue'
import { useWindowVirtualizer } from '@tanstack/vue-virtual'
import { useAppStore } from '@/stores/app'
import { useUserStore } from '@/stores/user'
import { postApi, subscriptionApi } from '@/utils/api'
import { toast } from '@/utils/request'
import PostCard from '@/components/PostCard.vue'
import PostSkeleton from '@/components/PostSkeleton.vue'

const route = useRoute()
const router = useRouter()
const appStore = useAppStore()
const userStore = useUserStore()

const sectionId = computed(() => parseInt(route.params.id as string) || 0)
const section = computed(() => appStore.sections.find((s) => s.id === sectionId.value))

const list = ref<any[]>([])
const page = ref(1)
const pageSize = 20
const hasMore = ref(true)
const loading = ref(false)
const loadingMore = ref(false)
const refreshing = ref(false)

// A-T3 窗口虚拟化（与首页同源）：单板块帖量可能上千，DOM 节点不随 list 无限增长
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

const sortOptions = [
  { key: 'new', label: '最新' },
  { key: 'hot', label: '热门' },
  { key: 'price_asc', label: '价格升序' },
  { key: 'price_desc', label: '价格降序' },
]
const activeSort = ref('new')

// 交易/失物筛选条件（上抛后端全局执行，避免客户端子集排序/筛选失真）
const activePriceRange = ref('')   // 形如 "0-100" / "100-500" / "500-"
const activeTimeRange = ref('')    // 天：1 / 7 / 30
const activeSubType = ref('')      // extra_fields 子类型，形如 "tradeType:sell" / "itemType:card"

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
      sectionId: sectionId.value,
      sort: activeSort.value,
      priceRange: activePriceRange.value || undefined,
      timeRange: activeTimeRange.value || undefined,
      subType: activeSubType.value || undefined,
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
    // 列表容器从骨架换成虚拟化容器后，顶部偏移会变，需重算 scrollMargin
    nextTick(updateScrollMargin)
  }
}

function switchSort(key: string) {
  if (activeSort.value === key) return
  activeSort.value = key
  loadList(true)
}

// 设置筛选条件后重置并重载（参数上抛后端）
function setFilter(priceRange: string, timeRange: string, subType: string) {
  activePriceRange.value = priceRange
  activeTimeRange.value = timeRange
  activeSubType.value = subType
  loadList(true)
}

function onScroll() {
  const el = document.documentElement
  if (el.scrollHeight - el.scrollTop - window.innerHeight < 100 && hasMore.value && !loadingMore.value && !loading.value) {
    loadList(false)
  }
}

function goPublish() {
  if (!userStore.isLoggedIn) {
    router.push({ path: '/login', query: { redirect: '/publish' } })
    return
  }
  router.push('/publish')
}

// 板块订阅
const subscribed = ref(false)
const subLoading = ref(false)

async function loadSubscribed() {
  if (!userStore.isLoggedIn || !sectionId.value) return
  try {
    const res: any = await subscriptionApi.list()
    subscribed.value = (res.data as any[]).some((s) => s.sectionId === sectionId.value)
  } catch {
    // 错误已由拦截器 toast，订阅状态加载失败不阻塞页面
  }
}

async function toggleSubscribe() {
  if (!userStore.isLoggedIn) {
    router.push({ path: '/login', query: { redirect: route.fullPath } })
    return
  }
  if (subLoading.value) return
  subLoading.value = true
  try {
    const res: any = await subscriptionApi.toggle(sectionId.value)
    subscribed.value = res.data.subscribed
    toast.success(res.message)
  } catch {
    // 错误已由拦截器 toast
  } finally {
    subLoading.value = false
  }
}

onMounted(() => {
  window.addEventListener('scroll', onScroll)
  window.addEventListener('resize', updateScrollMargin)
  nextTick(updateScrollMargin)
  loadSubscribed()
  if (!appStore.sections.length) {
    // 板块元数据失败不能把列表一起拖死：列表接口本身不依赖它
    appStore.fetchSections().catch(() => {}).finally(() => loadList(true))
  } else {
    loadList(true)
  }
})
onUnmounted(() => {
  window.removeEventListener('scroll', onScroll)
  window.removeEventListener('resize', updateScrollMargin)
})

watch(sectionId, () => {
  // 换板块：回顶并归零，虚拟化窗口从列表头重新渲染
  window.scrollTo({ top: 0 })
  list.value = []
  nextTick(updateScrollMargin)
  loadList(true)
  loadSubscribed()
})
</script>

<template>
  <div class="min-h-screen pb-24">
    <!-- 墨色海报头：贴纸 + 大字标题 + 一句说明 -->
    <header class="hero rounded-b-[20px]">
      <!-- 导航行 -->
      <div class="max-w-[960px] mx-auto flex items-center gap-2 h-12 px-3 pt-2">
        <button
          class="ds-icon-btn shrink-0"
          style="width:34px;height:34px;background:rgb(255 255 255 / 0.1);border-color:rgb(255 255 255 / 0.32);color:rgb(255 255 255);box-shadow:none"
          aria-label="返回"
          @click="router.back()"
        >
          <ArrowLeft class="w-5 h-5" />
        </button>
        <span class="ds-label flex-1 truncate" style="color:rgb(255 255 255 / 0.45)">SECTION / 板块</span>
        <button
          class="hero-chip shrink-0 px-3 py-1.5 text-[13px] font-bold transition disabled:opacity-60"
          :class="{ 'is-active': subscribed }"
          :disabled="subLoading"
          @click="toggleSubscribe"
        >
          <BellRing v-if="subscribed" class="w-4 h-4" />
          <Bell v-else class="w-4 h-4" />
          {{ subscribed ? '已订阅' : '订阅' }}
        </button>
      </div>

      <!-- 海报块 -->
      <div class="max-w-[960px] mx-auto px-4 pt-1 pb-8">
        <div class="flex items-center gap-2">
          <span class="ds-sticker ds-sticker--coral">CAMPUS</span>
          <span class="ds-label" style="color:rgb(255 255 255 / 0.45)">校园墙 · 板块</span>
        </div>
        <div class="mt-2.5 flex items-end justify-between gap-3">
          <h1 class="ds-display ds-display-lg text-white min-w-0 truncate">{{ section?.name || '板块详情' }}</h1>
          <div class="shrink-0 text-right pb-0.5">
            <div class="ds-num ds-display text-[30px] leading-none" style="color: var(--lime)">
              {{ list.length }}<span v-if="hasMore" class="align-top text-[15px]">+</span>
            </div>
            <div class="ds-label mt-1" style="color:rgb(255 255 255 / 0.45)">篇帖子</div>
          </div>
        </div>
        <p class="mt-1.5 text-[13px]" style="color:rgb(255 255 255 / 0.6)">本校同学的真实动态 · 支持价格与时间筛选</p>
      </div>
    </header>

    <!-- 内容区 -->
    <main
      class="max-w-[960px] mx-auto px-3 py-3 space-y-3"
      @touchstart="onTouchStart"
      @touchmove="onTouchMove"
      @touchend="onTouchEnd"
    >
      <!-- 下拉刷新指示器 -->
      <div class="flex items-center justify-center ds-label transition-all overflow-hidden" :style="{ height: pullDistance + 'px' }">
        <RefreshCw v-if="refreshing" class="w-4 h-4 animate-spin mr-1" />
        {{ refreshing ? '刷新中…' : pullDistance >= pullThreshold ? '松开刷新' : '下拉刷新' }}
      </div>

      <!-- 筛选岛：排序 / 价格 / 时间，统一描边胶囊 -->
      <section class="ds-card p-3.5 space-y-2.5" aria-label="排序与筛选">
        <div class="flex flex-wrap items-center gap-2">
          <span class="ds-label shrink-0 mr-1">排序</span>
          <button
            v-for="opt in sortOptions"
            :key="opt.key"
            class="ds-chip"
            :class="{ 'is-active': activeSort === opt.key }"
            @click="switchSort(opt.key)"
          >{{ opt.label }}</button>
        </div>

        <div class="ds-hairline"></div>

        <div class="flex flex-wrap items-center gap-2">
          <span class="ds-label shrink-0 mr-1">价格</span>
          <button
            v-for="p in [['', '不限'], ['0-100', '0-100'], ['100-500', '100-500'], ['500-', '500+']]"
            :key="p[0]"
            class="ds-chip"
            :class="{ 'is-active': activePriceRange === p[0] }"
            @click="setFilter(p[0], activeTimeRange, activeSubType)"
          >{{ p[1] }}</button>
        </div>

        <div class="ds-hairline"></div>

        <div class="flex flex-wrap items-center gap-2">
          <span class="ds-label shrink-0 mr-1">时间</span>
          <button
            v-for="t in [['', '不限'], ['1', '一天内'], ['7', '一周内'], ['30', '一月内']]"
            :key="t[0]"
            class="ds-chip"
            :class="{ 'is-active': activeTimeRange === t[0] }"
            @click="setFilter(activePriceRange, t[0], activeSubType)"
          >{{ t[1] }}</button>
        </div>
      </section>

      <!-- 列表头：编号 + 标题 + 墨线 -->
      <div class="ds-section-head">
        <span class="ds-section-head__num">01</span>
        <h2 class="ds-title">板块帖子</h2>
        <span class="ds-section-head__line"></span>
      </div>

      <PostSkeleton v-if="loading" :count="4" />

      <template v-else>
        <div ref="listRef" class="relative" :style="{ height: totalSize + 'px' }">
          <div
            v-for="v in virtualItems"
            :key="v.index"
            :data-index="v.index"
            :ref="measureRow"
            class="pb-3"
            :style="{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${v.start - scrollMargin}px)`,
            }"
          >
            <PostCard :post="list[v.index]" />
          </div>
        </div>
        <div v-if="loadingMore" class="py-4 flex items-center justify-center gap-2 ds-label">
          <RefreshCw class="w-4 h-4 animate-spin" /> 加载中…
        </div>
        <div v-else-if="!hasMore && list.length" class="py-4 text-center ds-label">— 已经到底了 —</div>
        <div v-if="!loading && !list.length" class="ds-card ds-card--flat px-6 py-12 text-center">
          <div
            class="mx-auto w-14 h-14 flex items-center justify-center mb-4"
            style="background: var(--lime); border: 1.5px solid var(--ink); border-radius: 14px; box-shadow: var(--shadow-hard-sm); transform: rotate(-3deg)"
          >
            <Plus class="w-7 h-7" style="color: var(--ink)" />
          </div>
          <p class="ds-label">NO POSTS YET</p>
          <p class="mt-2 text-[13px] leading-relaxed" style="color: var(--ink-soft)">该板块暂无帖子，快来发布第一条吧</p>
          <button class="ds-btn ds-btn--primary ds-btn--sm mt-4" @click="goPublish">去发布</button>
        </div>
      </template>
    </main>

    <!-- 悬浮发布按钮 -->
    <button
      class="hidden md:flex fixed right-4 bottom-6 w-14 h-14 rounded-full sa-fab items-center justify-center transition active:scale-95 z-20"
      aria-label="发布新内容"
      @click="goPublish"
    >
      <Plus class="w-7 h-7" />
    </button>
  </div>
</template>

