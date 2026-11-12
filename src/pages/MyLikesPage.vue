<script setup lang="ts">
/**
 * 我的点赞：点赞过的帖子列表（滚动分页）
 */
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft, Loader2 } from '@lucide/vue'
import { userApi } from '@/utils/api'
import PostCard from '@/components/PostCard.vue'
import EmptyState from '@/components/EmptyState.vue'
import SkeletonList from '@/components/SkeletonList.vue'

const router = useRouter()
const list = ref<any[]>([])
const total = ref(0)
const page = ref(0)
const hasMore = ref(true)
const loading = ref(false)

async function loadMore() {
  if (loading.value || !hasMore.value) return
  loading.value = true
  try {
    const res: any = await userApi.myLikes({ page: page.value + 1 })
    const d = res.data || {}
    list.value.push(...(d.list || []))
    total.value = d.total || 0
    page.value = d.page || page.value + 1
    hasMore.value = !!d.hasMore
  } catch {
    hasMore.value = false
  } finally {
    loading.value = false
  }
}

function onScroll() {
  if (loading.value || !hasMore.value) return
  const nearBottom =
    window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 200
  if (nearBottom) loadMore()
}

onMounted(() => {
  loadMore()
  window.addEventListener('scroll', onScroll)
})
onUnmounted(() => {
  window.removeEventListener('scroll', onScroll)
})
</script>

<template>
  <div class="min-h-screen bg-transparent pb-6">
    <header class="sticky top-0 z-10" style="background: var(--paper); border-bottom: 1.5px solid var(--ink)">
      <div class="max-w-[960px] mx-auto flex items-center h-14 px-3">
        <button class="p-2 -ml-2 text-zinc-600 hover:text-zinc-900" @click="router.back()">
          <ArrowLeft class="w-5 h-5" />
        </button>
        <span class="ml-1 font-extrabold" style="color: var(--ink)">我的点赞</span>
        <span class="ml-2 text-xs ds-sub">共 {{ total }} 条</span>
      </div>
    </header>

    <main class="max-w-[960px] mx-auto px-4 py-4 space-y-3">
      <!-- 首屏骨架 -->
      <SkeletonList v-if="!page && loading" :count="3" :show-media="false" />

      <template v-else>
        <PostCard v-for="post in list" :key="post.id" :post="post" />
        <EmptyState v-if="!list.length" text="还没有点赞内容" action-text="去逛逛" @action="router.push('/')" />
        <!-- 加载更多 -->
        <div v-if="list.length && loading" class="flex items-center justify-center gap-2 py-3 text-sm ds-sub">
          <Loader2 class="w-4 h-4 animate-spin" /> 加载中...
        </div>
        <p v-else-if="list.length && !hasMore" class="text-center text-xs text-zinc-300 py-3">没有更多了</p>
      </template>
    </main>
  </div>
</template>
