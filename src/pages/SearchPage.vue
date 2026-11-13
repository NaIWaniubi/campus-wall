<script setup lang="ts">
/**
 * 搜索页：历史记录 + 热门搜索 + 防抖搜索 + 结果列表（分页 + 竞态防护 + 板块/排序筛选）
 */
import { ref, onMounted, onUnmounted, computed, nextTick } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import type { Ref } from 'vue'
import { ArrowLeft, Search, X, Clock, Flame, Loader2 } from '@lucide/vue'
import { useWindowVirtualizer } from '@tanstack/vue-virtual'
import { sectionApi } from '@/utils/api'
import { useAppStore } from '@/stores/app'
import PostCard from '@/components/PostCard.vue'
import PostSkeleton from '@/components/PostSkeleton.vue'
import EmptyState from '@/components/EmptyState.vue'

const router = useRouter()
const route = useRoute()
const appStore = useAppStore()
const keyword = ref('')
const history = ref<string[]>([])
const hotWords = ref<string[]>([])
const results = ref<any[]>([])
const total = ref(0)
const page = ref(0)
const hasMore = ref(true)
const loading = ref(false)
const loadingMore = ref(false)
const searched = ref(false)
// 竞态防护：每次请求递增 id，过期响应直接丢弃
let requestSeq = 0

// A-T3 窗口虚拟化（与首页/板块页同源）：搜索结果可能很多，DOM 不随滚动无限增长
const listRef = ref<HTMLElement | null>(null)
const scrollMargin = ref(0)
const virtualizer = useWindowVirtualizer(
  computed(() => ({
    count: results.value.length,
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
let currentKw = ''
// 板块/排序筛选（参考 SectionPage 范式）
const activeSection = ref(0) // 0 = 全部
type SortKey = 'new' | 'hot'
const sortOptions: { key: SortKey; label: string }[] = [
  { key: 'new', label: '最新' },
  { key: 'hot', label: '热门' },
]
const activeSort = ref<SortKey>('new')
const inputRef: Ref<HTMLInputElement | null> = ref(null)
// 列表底部的 sentinel DOM 节点：IntersectionObserver 命中即触发 loadMore
const sentinelRef: Ref<HTMLElement | null> = ref(null)
let ioObserver: IntersectionObserver | null = null
let timer: ReturnType<typeof setTimeout> | null = null

const HISTORY_KEY = 'campus-search-history'

function loadHistory() {
  try {
    history.value = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]')
  } catch {
    history.value = []
  }
}

function saveHistory(kw: string) {
  const list = [kw, ...history.value.filter((h) => h !== kw)].slice(0, 10)
  history.value = list
  localStorage.setItem(HISTORY_KEY, JSON.stringify(list))
}

function removeHistory(kw: string, e: Event) {
  e.stopPropagation()
  history.value = history.value.filter((h) => h !== kw)
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.value))
}

function clearHistory() {
  history.value = []
  localStorage.removeItem(HISTORY_KEY)
}

function onInput() {
  if (timer) clearTimeout(timer)
  const kw = keyword.value.trim()
  if (!kw) {
    searched.value = false
    results.value = []
    total.value = 0
    page.value = 0
    hasMore.value = true
    currentKw = ''
    return
  }
  timer = setTimeout(() => doSearch(kw), 300)
}

async function doSearch(kw: string) {
  // 新一轮搜索：清空 + 递增 seq
  currentKw = kw
  const seq = ++requestSeq
  page.value = 0
  hasMore.value = true
  results.value = []
  total.value = 0
  searched.value = true
  loading.value = true
  try {
    const res: any = await sectionApi.search(kw, {
      page: 1,
      sectionId: activeSection.value || undefined,
      sort: activeSort.value,
    })
    if (seq !== requestSeq) return // 过期响应，丢弃
    const d = res.data || {}
    results.value = d.list || []
    total.value = d.total || 0
    page.value = d.page || 1
    hasMore.value = !!d.hasMore
    saveHistory(kw)
  } catch {
    if (seq !== requestSeq) return
    results.value = []
    total.value = 0
    hasMore.value = false
  } finally {
    if (seq === requestSeq) loading.value = false
    if (seq === requestSeq) nextTick(updateScrollMargin)
  }
}

async function loadMore() {
  if (loading.value || loadingMore.value || !hasMore.value || !currentKw) return
  loadingMore.value = true
  const seq = requestSeq
  try {
    const res: any = await sectionApi.search(currentKw, {
      page: page.value + 1,
      sectionId: activeSection.value || undefined,
      sort: activeSort.value,
    })
    if (seq !== requestSeq) return
    const d = res.data || {}
    results.value.push(...(d.list || []))
    page.value = d.page || page.value + 1
    hasMore.value = !!d.hasMore
  } catch {
    if (seq === requestSeq) hasMore.value = false
  } finally {
    if (seq === requestSeq) loadingMore.value = false
  }
}

// 滚动加载已切换为 IntersectionObserver sentinel（更可靠，对 sticky header / 虚拟滚动更友好）；
// 不再使用 window.addEventListener('scroll')，避免重复触发 / 与 IO 互相干扰。

function searchBy(kw: string) {
  keyword.value = kw
  doSearch(kw)
}

function selectSection(id: number) {
  if (activeSection.value === id) return
  activeSection.value = id
  if (searched.value && currentKw) doSearch(currentKw)
}

function selectSort(key: SortKey) {
  if (activeSort.value === key) return
  activeSort.value = key
  if (searched.value && currentKw) doSearch(currentKw)
}

function goBack() {
  if (window.history.length > 1) router.back()
  else router.push('/')
}

onMounted(async () => {
  loadHistory()
  inputRef.value?.focus()
  if (!appStore.sections.length) appStore.fetchSections()
  // 预留 IO 观察器钩子：模板中 sentinelRef 元素触发 loadMore
  if (sentinelRef.value && 'IntersectionObserver' in window) {
    ioObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) loadMore()
      }
    }, { rootMargin: '200px' })
    ioObserver.observe(sentinelRef.value)
  }
  try {
    const res: any = await sectionApi.hotSearch()
    hotWords.value = (res.data || []).slice(0, 8)
  } catch {
    hotWords.value = []
  }
  // 支持 /search?keyword=xxx 直达（首页右栏热门搜索、外部分享链接）
  const incoming = String(route.query.keyword || '').trim()
  if (incoming) {
    keyword.value = incoming
    doSearch(incoming)
  }
})
onUnmounted(() => {
  if (ioObserver) {
    ioObserver.disconnect()
    ioObserver = null
  }
})
</script>

<template>
  <div class="min-h-screen pb-24">
    <!-- V4 墨色海报头：返回 + 贴纸 + 大号搜索框（白底墨线胶囊） -->
    <header class="hero sticky top-0 z-10 rounded-b-[20px]">
      <div class="max-w-[960px] mx-auto px-4 pt-4 pb-5">
        <div class="flex items-center gap-2.5">
          <button class="ds-icon-btn !w-9 !h-9 shrink-0" aria-label="返回" @click="goBack">
            <ArrowLeft class="w-[18px] h-[18px]" />
          </button>
          <span class="ds-sticker ds-sticker--coral">SEARCH</span>
          <span class="ds-label" style="color: rgb(255 255 255 / 0.45)">帖子 / 话题 / 用户</span>
        </div>
        <div class="relative mt-3">
          <Search class="absolute left-4 top-1/2 -translate-y-1/2 w-[17px] h-[17px]" style="color: var(--ink-mute)" />
          <input
            ref="inputRef"
            v-model="keyword"
            type="text"
            placeholder="搜索帖子"
            class="ds-input font-semibold !h-12 !rounded-full !py-0 !px-11 !text-[16px]"
            @input="onInput"
            @keyup.enter="doSearch(keyword.trim())"
          />
          <button
            v-if="keyword"
            class="ds-ink-btn absolute right-2.5 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-full"
            
            aria-label="清空输入"
            @click="keyword = ''; onInput()"
          >
            <X class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </header>

    <main class="max-w-[960px] mx-auto px-4 py-4">
      <!-- 未搜索：历史 + 热搜（纸卡 + 编号章节头 + 描边胶囊） -->
      <div v-if="!searched" class="space-y-4">
        <!-- 搜索历史 -->
        <section v-if="history.length" class="ds-card p-4">
          <div class="ds-section-head mb-3">
            <span class="ds-section-head__num">01</span>
            <h3 class="ds-title flex items-center gap-1.5">
              <Clock class="w-4 h-4" style="color: var(--ink-mute)" /> 搜索历史
            </h3>
            <span class="ds-section-head__line"></span>
          </div>
          <div class="flex flex-wrap gap-2">
            <button v-for="h in history" :key="h" class="ds-chip max-w-full break-words !whitespace-normal" @click="searchBy(h)">
              <span>{{ h }}</span>
              <span
                class="inline-flex items-center opacity-50 transition-opacity hover:opacity-100"
                style="color: var(--ink-mute)"
                @click="removeHistory(h, $event)"
              >
                <X class="w-3 h-3" />
              </span>
            </button>
            <button class="ds-chip" style="color: var(--ink-mute)" @click="clearHistory">清空</button>
          </div>
        </section>

        <!-- 热门搜索 -->
        <section v-if="hotWords.length" class="ds-card p-4">
          <div class="ds-section-head mb-3">
            <span class="ds-section-head__num">{{ history.length ? '02' : '01' }}</span>
            <h3 class="ds-title flex items-center gap-1.5">
              <Flame class="w-4 h-4" style="color: var(--coral)" /> 热门搜索
            </h3>
            <span class="ds-section-head__line"></span>
          </div>
          <div class="flex flex-wrap gap-2">
            <button v-for="(w, i) in hotWords" :key="w" class="ds-chip max-w-full break-words !whitespace-normal" @click="searchBy(w)">
              <span class="ds-num text-[11px] font-black" style="color: var(--coral)">{{ i + 1 }}</span>
              {{ w }}
            </button>
          </div>
        </section>

        <!-- 使用提示：把 AI 能力在空搜索页就讲清楚 -->
        <section class="ds-card ds-card--flat p-4">
          <p class="ds-label mb-1.5">TIPS</p>
          <p class="ds-sub">
            搜「失物」看智能雷达撮合；发帖时用「AI 一键成稿」30 秒成文；帖子详情页点「AI 划重点」先看要点和交易风险。
          </p>
        </section>
      </div>

      <!-- 搜索结果 -->
      <div v-else>
        <!-- 板块/排序筛选：V4 描边胶囊（激活 = 墨底荧光字） -->
        <div class="flex items-center gap-2 mb-3 overflow-x-auto scrollbar-hide ds-scroll-x pb-1">
          <button
            v-for="sec in [{ id: 0, name: '全部板块' }, ...appStore.sections]"
            :key="sec.id"
            class="ds-chip shrink-0"
            :class="{ 'is-active': activeSection === sec.id }"
            @click="selectSection(sec.id)"
          >
            {{ sec.name }}
          </button>
          <span class="mx-1 h-4 w-px shrink-0" style="background: var(--ink); opacity: 0.2" />
          <button
            v-for="opt in sortOptions"
            :key="opt.key"
            class="ds-chip shrink-0"
            :class="{ 'is-active': activeSort === opt.key }"
            @click="selectSort(opt.key)"
          >
            {{ opt.label }}
          </button>
        </div>

        <div class="ds-label mb-2">共 <span class="ds-num">{{ total }}</span> 条结果</div>

        <div class="space-y-3">
          <PostSkeleton v-if="loading" :count="3" />
          <template v-else>
            <div ref="listRef" class="relative" :style="{ height: totalSize + 'px' }">
              <div
                v-for="v in virtualItems"
                :key="v.index"
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
                <PostCard :post="results[v.index]" :keyword="keyword" />
              </div>
            </div>
            <div v-if="loadingMore" class="ds-label flex items-center justify-center gap-2 py-3">
              <Loader2 class="w-4 h-4 animate-spin" /> 加载中...
            </div>
            <p v-else-if="!hasMore && results.length" class="ds-label py-3 text-center">没有更多了</p>
            <EmptyState
              v-if="!results.length"
              text="没有找到相关内容"
              action-text="换个关键词"
              @action="keyword = ''; searched = false"
            />
            <!-- IO 哨兵：有数据 + 仍有更多时挂载，IntersectionObserver 命中触发 loadMore -->
            <div v-if="hasMore && results.length" ref="sentinelRef" class="h-1" aria-hidden="true" />
          </template>
        </div>
      </div>
    </main>
  </div>
</template>

