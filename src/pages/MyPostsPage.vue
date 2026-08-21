<script setup lang="ts">
/**
 * 我的帖子：状态标签 + 列表 + 删除
 */
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft, Trash2 } from 'lucide-vue-next'
import { userApi, postApi } from '@/utils/api'
import PostCard from '@/components/PostCard.vue'
import EmptyState from '@/components/EmptyState.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { toast } from '@/utils/request'

const router = useRouter()
const list = ref<any[]>([])
const loading = ref(true)
const showDelete = ref(false)
const targetId = ref<number | null>(null)

async function load() {
  loading.value = true
  try {
    const res: any = await userApi.myPosts()
    list.value = res.data || []
  } catch {
    list.value = []
  } finally {
    loading.value = false
  }
}

function statusMeta(post: any) {
  if (post.status === 'pending') return { text: '审核中', class: 'bg-amber-100 text-amber-600' }
  if (post.status === 'rejected') return { text: '已驳回', class: 'bg-red-100 text-red-600' }
  if (post.status === 'offline') return { text: '已下架', class: 'bg-zinc-200 text-zinc-500' }
  return null
}

function onDelete(post: any) {
  targetId.value = post.id
  showDelete.value = true
}

async function confirmDelete() {
  if (targetId.value == null) return
  const id = targetId.value
  showDelete.value = false
  try {
    await postApi.delete(id)
    list.value = list.value.filter((p) => p.id !== id)
    toast.success('已删除')
  } catch {
    // 错误已由拦截器 toast
  } finally {
    targetId.value = null
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
        <span class="ml-1 font-medium text-zinc-900">我的帖子</span>
        <span class="ml-2 text-xs text-zinc-400">共 {{ list.length }} 条</span>
      </div>
    </header>

    <main class="max-w-[960px] mx-auto px-4 py-4 space-y-3">
      <!-- 加载骨架 -->
      <div v-if="loading" class="space-y-3">
        <div v-for="i in 3" :key="i" class="bg-white rounded-xl p-4 shadow-sm">
          <div class="h-4 w-3/4 skeleton rounded mb-2"></div>
          <div class="h-3 w-full skeleton rounded mb-1"></div>
          <div class="h-3 w-2/3 skeleton rounded"></div>
        </div>
      </div>

      <template v-else>
        <div v-for="post in list" :key="post.id" class="relative">
          <PostCard :post="post" />
          <!-- 状态标签 -->
          <div v-if="statusMeta(post)" class="absolute top-3 right-3 pointer-events-none">
            <span class="px-2 py-0.5 rounded text-xs font-medium" :class="statusMeta(post)!.class">
              {{ statusMeta(post)!.text }}
            </span>
          </div>
          <!-- 驳回原因 -->
          <div v-if="post.status === 'rejected' && (post.rejectReason || post.reason)"
            class="mt-1 px-3 py-2 rounded-lg bg-red-50 text-xs text-red-600">
            驳回原因：{{ post.rejectReason || post.reason }}
          </div>
          <!-- 删除按钮 -->
          <button class="absolute bottom-3 right-3 flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-50 text-red-500 text-xs hover:bg-red-100 transition"
            @click.stop="onDelete(post)">
            <Trash2 class="w-3.5 h-3.5" /> 删除
          </button>
        </div>

        <EmptyState v-if="!list.length" text="还没有发布内容" action-text="去发布" @action="router.push('/publish')" />
      </template>
    </main>

    <ConfirmDialog :visible="showDelete" content="确定删除该帖子吗？删除后不可恢复" confirm-text="删除" danger
      @confirm="confirmDelete" @cancel="showDelete = false" />
  </div>
</template>
