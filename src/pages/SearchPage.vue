<script setup lang="ts">
/**
 * 搜索页：历史记录 + 热门搜索 + 防抖搜索 + 结果列表（分页 + 竞态防护 + 板块/排序筛选）
 */
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import type { Ref } from 'vue'
import { ArrowLeft, Search, X, Clock, Flame, Loader2 } from '@lucide/vue'
import { sectionApi } from '@/utils/api'
import { useAppStore } from '@/stores/app'
import PostCard from '@/components/PostCard.vue'
import PostSkeleton from '@/components/PostSkeleton.vue'
import EmptyState from '@/components/EmptyState.vue'

const router = useRouter()
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

function onScroll() {
  if (loading.value || loadingMore.value || !hasMore.value) return
  const el = document.documentElement
  if (el.scrollHeight - el.scrollTop - window.innerHeight < 200) loadMore()
}

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
  window.addEventListener('scroll', onScroll)
  try {
    const res: any = await sectionApi.hotSearch()
    hotWords.value = (res.data || []).slice(0, 8)
  } catch {
    hotWords.value = []
  }
})
onUnmounted(() => {
  window.removeEventListener('scroll', onScroll)
})
</script>

<template>
  <div class="min-h-screen bg-zinc-50">
    <!-- 顶部搜索框 -->
    <header class="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-zinc-100">
      <div class="max-w-[960px] mx-auto flex items-center gap-2 h-14 px-3">
        <button class="p-1 -ml-1 text-zinc-600 hover:text-zinc-900" @click="goBack">
          <ArrowLeft class="w-5 h-5" />
        </button>
        <div class="flex-1 relative">
          <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            ref="inputRef"
            v-model="keyword"
            type="text"
            placeholder="搜索帖子"
            class="w-full h-9 pl-9 pr-9 rounded-full bg-zinc-100 focus:bg-white border border-transparent focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 text-sm transition"
            @input="onInput"
            @keyup.enter="doSearch(keyword.trim())"
          />
          <button v-if="keyword" class="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600" @click="keyword = ''; onInput()">
            <X class="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>

    <main class="max-w-[960px] mx-auto px-4 py-4">
      <!-- 未搜索：历史 + 热搜 -->
      <div v-if="!searched" class="space-y-6">
        <!-- 搜索历史 -->
        <section v-if="history.length">
          <div class="flex items-center justify-between mb-3">
            <h3 class="flex items-center gap-1.5 text-sm font-medium text-zinc-700">
              <Clock class="w-4 h-4 text-zinc-400" /> 搜索历史
            </h3>
            <button class="text-xs text-zinc-400 hover:text-zinc-600" @click="clearHistory">清空</button>
          </div>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="h in history"
              :key="h"
              class="group flex items-center gap-1 px-3 py-1.5 rounded-full bg-zinc-100 hover:bg-zinc-200 text-sm text-zinc-700 transition"
              @click="searchBy(h)"
            >
              <span>{{ h }}</span>
              <span class="text-zinc-400 group-hover:text-red-500" @click="removeHistory(h, $event)">
                <X class="w-3 h-3" />
              </span>
            </button>
          </div>
        </section>

        <!-- 热门搜索 -->
        <section v-if="hotWords.length">
          <h3 class="flex items-center gap-1.5 text-sm font-medium text-zinc-700 mb-3">
            <Flame class="w-4 h-4 text-orange-500" /> 热门搜索
          </h3>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="(w, i) in hotWords"
              :key="w"
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-brand-50 hover:bg-brand-100 text-sm text-brand-700 transition"
              @click="searchBy(w)"
            >
              <span class="text-xs font-bold text-brand-500">{{ i + 1 }}</span>
              {{ w }}
            </button>
          </div>
        </section>
      </div>

      <!-- 搜索结果 -->
      <div v-else>
        <!-- 板块/排序筛选 chip（参考 SectionPage 范式） -->
        <div class="flex items-center gap-1 mb-2 overflow-x-auto scrollbar-hide">
          <button
            v-for="sec in [{ id: 0, name: '全部板块' }, ...appStore.sections]"
            :key="sec.id"
            class="relative px-3 py-1.5 text-xs whitespace-nowrap transition rounded-full"
            :class="activeSection === sec.id ? 'text-brand-600 font-medium bg-brand-50 border border-brand-200' : 'text-zinc-500 hover:text-zinc-800 bg-white border border-zinc-200'"
            @click="selectSection(sec.id)"
          >
            {{ sec.name }}
          </button>
          <span class="mx-1 w-px h-4 bg-zinc-200" />
          <button
            v-for="opt in sortOptions"
            :key="opt.key"
            class="px-3 py-1.5 text-xs whitespace-nowrap transition rounded-full"
            :class="activeSort === opt.key ? 'text-brand-600 font-medium bg-brand-50 border border-brand-200' : 'text-zinc-500 hover:text-zinc-800 bg-white border border-zinc-200'"
            @click="selectSort(opt.key)"
          >
            {{ opt.label }}
          </button>
        </div>

        <div class="text-xs text-zinc-400 mb-2">共 {{ total }} 条结果</div>

        <div class="space-y-3">
          <PostSkeleton v-if="loading" :count="3" />
          <template v-else>
            <PostCard v-for="post in results" :key="post.id" :post="post" :keyword="keyword" />
            <div v-if="loadingMore" class="flex items-center justify-center gap-2 py-3 text-sm text-zinc-400">
              <Loader2 class="w-4 h-4 animate-spin" /> 加载中...
            </div>
            <p v-else-if="!hasMore && results.length" class="text-center text-xs text-zinc-300 py-3">没有更多了</p>
            <EmptyState
              v-if="!results.length"
              text="没有找到相关内容"
              action-text="换个关键词"
              @action="keyword = ''; searched = false"
            />
          </template>
        </div>
      </div>
    </main>
  </div>
</template>

