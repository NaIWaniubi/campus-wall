<script setup lang="ts">
/**
 * 我的评论：评论内容 + 所属帖子 + 时间
 */
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft, MessageCircle, ChevronRight } from '@lucide/vue'
import { userApi } from '@/utils/api'
import { formatTime } from '@/utils/helpers'
import EmptyState from '@/components/EmptyState.vue'
import SkeletonList from '@/components/SkeletonList.vue'

const router = useRouter()
const list = ref<any[]>([])
const loading = ref(true)

async function load() {
  loading.value = true
  try {
    const res: any = await userApi.myComments()
    list.value = res.data || []
  } catch {
    list.value = []
  } finally {
    loading.value = false
  }
}

function goPost(c: any) {
  if (c.postId) router.push(`/post/${c.postId}`)
}

onMounted(load)
</script>

<template>
  <div class="min-h-screen pb-24" style="background: var(--paper)">
    <header class="sticky top-0 z-10" style="background: var(--paper); border-bottom: 1.5px solid var(--ink)">
      <div class="max-w-[960px] mx-auto flex items-center h-14 px-3">
        <button type="button" class="ds-icon-btn !w-9 !h-9 -ml-1" style="border-color: var(--hairline); box-shadow: none" aria-label="返回" @click="router.back()">
          <ArrowLeft class="w-5 h-5" />
        </button>
        <span class="ml-1 font-extrabold" style="color: var(--ink)">我的评论</span>
        <span class="ml-2 text-xs ds-sub">共 {{ list.length }} 条</span>
      </div>
    </header>

    <main class="max-w-[960px] mx-auto px-4 py-4 space-y-2">
      <!-- 加载骨架 -->
      <SkeletonList v-if="loading" :count="4" :show-media="false" />

      <template v-else>
        <button v-for="c in list" :key="c.id"
          type="button" class="w-full text-left ds-card ds-card--hover p-4 transition"
          @click="goPost(c)">
          <div class="flex items-center gap-1.5 text-xs ds-sub mb-1.5">
            <MessageCircle class="w-3.5 h-3.5 flex-shrink-0" style="color: var(--violet)" />
            <span class="truncate">评论了：{{ c.postTitle || '已删除的帖子' }}</span>
          </div>
          <p class="text-sm post-content line-clamp-3" style="color: var(--ink-soft)">{{ c.content }}</p>
          <div class="flex items-center justify-between mt-2">
            <span class="text-xs ds-sub">{{ formatTime(c.createdAt) }}</span>
            <ChevronRight class="w-4 h-4" style="color: var(--ink-mute)" />
          </div>
        </button>

        <EmptyState v-if="!list.length" text="还没有评论" />
      </template>
    </main>
  </div>
</template>

