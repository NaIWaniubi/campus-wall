<script setup lang="ts">
/**
 * 我的收藏：收藏帖子列表
 */
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft } from 'lucide-vue-next'
import { userApi } from '@/utils/api'
import PostCard from '@/components/PostCard.vue'
import EmptyState from '@/components/EmptyState.vue'

const router = useRouter()
const list = ref<any[]>([])
const loading = ref(true)

async function load() {
  loading.value = true
  try {
    const res: any = await userApi.myFavorites()
    list.value = res.data || []
  } catch {
    list.value = []
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="min-h-screen bg-zinc-50 pb-6">
    <header class="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-zinc-100">
      <div class="max-w-[960px] mx-auto flex items-center h-14 px-3">
        <button class="p-2 -ml-2 text-zinc-600 hover:text-zinc-900" @click="router.back()">
          <ArrowLeft class="w-5 h-5" />
        </button>
        <span class="ml-1 font-medium text-zinc-900">我的收藏</span>
        <span class="ml-2 text-xs text-zinc-400">共 {{ list.length }} 条</span>
      </div>
    </header>

    <main class="max-w-[960px] mx-auto px-4 py-4 space-y-3">
      <!-- 加载骨架 -->
      <div v-if="loading" class="space-y-3">
        <div v-for="i in 3" :key="i" class="bg-white rounded-xl p-4">
          <div class="h-4 w-3/4 skeleton rounded mb-2"></div>
          <div class="h-3 w-full skeleton rounded mb-1"></div>
          <div class="h-3 w-2/3 skeleton rounded"></div>
        </div>
      </div>

      <template v-else>
        <PostCard v-for="post in list" :key="post.id" :post="post" />
        <EmptyState v-if="!list.length" text="还没有收藏内容" action-text="去逛逛" @action="router.push('/')" />
      </template>
    </main>
  </div>
</template>
