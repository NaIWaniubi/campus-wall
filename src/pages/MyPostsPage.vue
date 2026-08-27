<script setup lang="ts">
/**
 * 我的帖子：状态标签 + 列表 + 删除
 */
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft, Trash2, Pencil } from '@lucide/vue'
import { userApi, postApi } from '@/utils/api'
import PostCard from '@/components/PostCard.vue'
import EmptyState from '@/components/EmptyState.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import SkeletonList from '@/components/SkeletonList.vue'
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

// ---------- 编辑 / 驳回修改重发（复用 PublishPage ?edit= 模式，提交走 PUT /posts/:id） ----------
function isWithin24h(post: any) {
  const t = post.createdAt ? new Date(post.createdAt).getTime() : 0
  return t > 0 && Date.now() - t < 24 * 60 * 60 * 1000
}
// 服务端对一切编辑统一限制发布后 24h 内（posts.ts PUT /:id），published 可改、rejected 走修改重发
function canEdit(post: any) {
  return (post.status === 'published' || post.status === 'rejected') && isWithin24h(post)
}
function goEdit(post: any) {
  router.push(`/publish?edit=${post.id}`)
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
      <SkeletonList v-if="loading" :count="3" :show-media="false" />

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
          <!-- 操作按钮：编辑/修改重发 + 删除 -->
          <div class="absolute bottom-3 right-3 flex items-center gap-2">
            <button v-if="canEdit(post)"
              class="flex items-center gap-1 px-2.5 py-1 rounded-full bg-brand-50 text-brand-600 text-xs hover:bg-brand-100 transition"
              @click.stop="goEdit(post)">
              <Pencil class="w-3.5 h-3.5" /> {{ post.status === 'rejected' ? '修改重发' : '编辑' }}
            </button>
            <button class="flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-50 text-red-500 text-xs hover:bg-red-100 transition"
              @click.stop="onDelete(post)">
              <Trash2 class="w-3.5 h-3.5" /> 删除
            </button>
          </div>
        </div>

        <EmptyState v-if="!list.length" text="还没有发布内容" action-text="去发布" @action="router.push('/publish')" />
      </template>
    </main>

    <ConfirmDialog :visible="showDelete" content="确定删除该帖子吗？删除后不可恢复" confirm-text="删除" danger
      @confirm="confirmDelete" @cancel="showDelete = false" />
  </div>
</template>

