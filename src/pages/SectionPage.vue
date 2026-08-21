<script setup lang="ts">
/**
 * 板块详情页：展示单个板块下的帖子列表
 */
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, Plus, RefreshCw } from 'lucide-vue-next'
import { useAppStore } from '@/stores/app'
import { useUserStore } from '@/stores/user'
import { postApi } from '@/utils/api'
import PostCard from '@/components/PostCard.vue'
import PostSkeleton from '@/components/PostSkeleton.vue'
import EmptyState from '@/components/EmptyState.vue'

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

const sortOptions = [
  { key: 'new', label: '最新' },
  { key: 'hot', label: '热门' },
]
const activeSort = ref('new')

// 下拉刷新相关
const pullDistance = ref(0)
const pullThreshold = 60
let startY = 0
let pulling = false

function onTouchStart(e: TouchEvent) {
  if (document.documentElement.scrollTop > 0 || refreshing.value) return
  startY = e.touches[0].clientY
  pulling = true
}
function onTouchMove(e: TouchEvent) {
  if (!pulling) return
  const diff = e.touches[0].clientY - startY
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

function switchSort(key: string) {
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

function goPublish() {
  if (!userStore.isLoggedIn) {
    router.push({ path: '/login', query: { redirect: '/publish' } })
    return
  }
  router.push('/publish')
}

onMounted(() => {
  window.addEventListener('scroll', onScroll)
  if (!appStore.sections.length) appStore.fetchSections().then(() => loadList(true))
  else loadList(true)
})
onUnmounted(() => {
  window.removeEventListener('scroll', onScroll)
})

watch(sectionId, () => {
  loadList(true)
})
</script>

<template>
  <div class="min-h-screen bg-zinc-50 pb-24">
    <!-- 顶部导航 -->
    <header class="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-zinc-100">
      <div class="max-w-[960px] mx-auto flex items-center h-14 px-3">
        <button class="p-2 -ml-2 text-zinc-600 hover:text-zinc-900" @click="router.back()">
          <ArrowLeft class="w-5 h-5" />
        </button>
        <span class="ml-2 font-medium text-zinc-900 flex-1">{{ section?.name || '板块详情' }}</span>
      </div>

      <!-- 排序 Tab -->
      <div class="max-w-[960px] mx-auto px-3 flex items-center gap-1 h-11">
        <button
          v-for="opt in sortOptions"
          :key="opt.key"
          class="relative px-3 py-2 text-sm whitespace-nowrap transition"
          :class="activeSort === opt.key ? 'text-brand-600 font-medium' : 'text-zinc-500 hover:text-zinc-800'"
          @click="switchSort(opt.key)"
        >
          {{ opt.label }}
          <span v-if="activeSort === opt.key" class="absolute left-1/2 -translate-x-1/2 bottom-0 w-6 h-0.5 bg-brand-500 rounded-full"></span>
        </button>
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
      <div class="flex items-center justify-center text-xs text-zinc-400 transition-all overflow-hidden" :style="{ height: pullDistance + 'px' }">
        <RefreshCw v-if="refreshing" class="w-4 h-4 animate-spin mr-1" />
        {{ refreshing ? '刷新中...' : pullDistance >= pullThreshold ? '松开刷新' : '下拉刷新' }}
      </div>

      <PostSkeleton v-if="loading" :count="4" />

      <template v-else>
        <PostCard v-for="post in list" :key="post.id" :post="post" />
        <div v-if="loadingMore" class="py-4 text-center text-sm text-zinc-400 flex items-center justify-center gap-2">
          <RefreshCw class="w-4 h-4 animate-spin" /> 加载中...
        </div>
        <div v-else-if="!hasMore && list.length" class="py-4 text-center text-xs text-zinc-400">— 已经到底了 —</div>
        <EmptyState
          v-if="!loading && !list.length"
          text="该板块暂无帖子，快来发布第一条吧"
          action-text="去发布"
          @action="goPublish"
        />
      </template>
    </main>

    <!-- 悬浮发布按钮 -->
    <button
      class="fixed right-4 bottom-6 w-14 h-14 rounded-full bg-brand-500 hover:bg-brand-600 active:bg-brand-700 shadow-lg shadow-brand-500/40 flex items-center justify-center text-white transition z-20"
      @click="goPublish"
    >
      <Plus class="w-7 h-7" />
    </button>
  </div>
</template>
