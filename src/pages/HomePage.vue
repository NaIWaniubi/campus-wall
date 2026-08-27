<script setup lang="ts">
/**
 * 首页：板块Tab + 帖子信息流 + 下拉刷新 + 上拉加载
 */
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { Search, Bell, Plus, RefreshCw, BellRing } from '@lucide/vue'
import { useAppStore } from '@/stores/app'
import { useUserStore } from '@/stores/user'
import { postApi, subscriptionApi } from '@/utils/api'
import { toast } from '@/utils/request'
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

onMounted(() => {
  window.addEventListener('scroll', onScroll)
  if (!appStore.sections.length) appStore.fetchSections()
  loadList(true)
  loadSubscriptions()
})
onUnmounted(() => {
  window.removeEventListener('scroll', onScroll)
})
</script>

<template>
  <div class="min-h-screen bg-zinc-50 pb-24">
    <!-- 顶部导航 -->
    <header class="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-zinc-100">
      <div class="max-w-[960px] mx-auto flex items-center gap-2 h-14 px-3">
        <button class="flex-1 flex items-center gap-2 h-9 px-3 rounded-full bg-zinc-100 text-zinc-400 text-sm" @click="router.push('/search')">
          <Search class="w-4 h-4" />
          <span>搜索帖子、用户</span>
        </button>
        <button class="hidden sm:flex p-1.5 text-zinc-500 hover:text-brand-600 transition" title="刷新" :disabled="refreshing" @click="manualRefresh">
          <RefreshCw class="w-5 h-5" :class="refreshing ? 'animate-spin' : ''" />
        </button>
        <button class="relative p-1.5 text-zinc-600 hover:text-zinc-900 transition" @click="goMessage">
          <Bell class="w-6 h-6" />
          <span v-if="appStore.unreadCount > 0" class="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full"></span>
        </button>
        <button class="w-8 h-8 rounded-full overflow-hidden bg-gradient-to-br from-brand-100 to-brand-200 flex items-center justify-center flex-shrink-0 ring-2 ring-brand-50" @click="goProfile">
          <img v-if="userStore.user?.avatar" :src="userStore.user.avatar" class="w-full h-full object-cover" alt="" />
          <span v-else class="text-sm font-bold text-brand-700">{{ userStore.user?.nickname?.charAt(0) || '我' }}</span>
        </button>
      </div>

      <!-- 板块Tab -->
      <div class="max-w-[960px] mx-auto px-3 overflow-x-auto scrollbar-hide">
        <div class="flex items-center gap-1 h-11">
          <button
            v-for="sec in [{ id: 0, name: '全部' }, ...appStore.sections]"
            :key="sec.id"
            class="relative px-3 py-2 text-sm whitespace-nowrap transition rounded-lg"
            :class="activeSection === sec.id ? 'text-brand-600 font-medium bg-brand-50' : 'text-zinc-500 hover:text-zinc-800 hover:bg-zinc-50'"
            @click="selectSection(sec.id)"
          >
            {{ sec.name }}
            <BellRing v-if="sec.id > 0 && subscribedSectionIds.has(sec.id)" class="inline-block w-3 h-3 ml-0.5 text-brand-500" />
            <span v-if="activeSection === sec.id" class="absolute left-1/2 -translate-x-1/2 bottom-0.5 w-5 h-0.5 bg-brand-500 rounded-full"></span>
          </button>
        </div>
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

      <!-- 排序切换：热门 / 最新（风格与板块 Tab 一致） -->
      <div class="flex items-center gap-1">
        <button
          v-for="opt in sortOptions"
          :key="opt.key"
          class="relative px-3 py-2 text-sm whitespace-nowrap transition rounded-lg"
          :class="activeSort === opt.key ? 'text-brand-600 font-medium bg-brand-50' : 'text-zinc-500 hover:text-zinc-800 hover:bg-zinc-50'"
          @click="selectSort(opt.key)"
        >
          {{ opt.label }}
          <span v-if="activeSort === opt.key" class="absolute left-1/2 -translate-x-1/2 bottom-0.5 w-5 h-0.5 bg-brand-500 rounded-full"></span>
        </button>
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
          text="暂无帖子，快来发布第一条吧"
          action-text="去发布"
          @action="goPublish"
        />
      </template>
    </main>

    <!-- 悬浮发布按钮 -->
    <button
      class="fixed right-4 bottom-6 w-14 h-14 rounded-full bg-brand-500 hover:bg-brand-600 active:bg-brand-700 active:scale-90 shadow-lg shadow-brand-500/40 flex items-center justify-center text-white transition-all duration-200 z-20"
      @click="goPublish"
    >
      <Plus class="w-7 h-7" />
    </button>
  </div>
</template>

