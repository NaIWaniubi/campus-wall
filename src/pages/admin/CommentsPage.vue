<script setup lang="ts">
/**
 * 评论管理（内容治理三区之二）：关键词搜索 + 列表（帖标题/评论人/内容/时间）+ 删除（确认弹窗）
 * 说明：后端 /admin/comments 固定返回 active 评论、无 status 维度，筛选走 keyword
 */
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Search, Trash2, ChevronLeft, ChevronRight, Heart } from '@lucide/vue'
import { adminApi } from '@/utils/api'
import { formatTime } from '@/utils/helpers'
import { toast } from '@/utils/request'
import EmptyState from '@/components/EmptyState.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

const router = useRouter()

const list = ref<any[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 20
const loading = ref(false)
const keyword = ref('')

async function load() {
  loading.value = true
  try {
    const res: any = await adminApi.comments({
      keyword: keyword.value || undefined,
      page: page.value,
      pageSize,
    })
    list.value = res.data.list
    total.value = res.data.total
  } catch {
    list.value = []
  } finally {
    loading.value = false
  }
}

function onSearch() {
  page.value = 1
  load()
}
function prevPage() {
  if (page.value > 1) {
    page.value--
    load()
  }
}
function nextPage() {
  if (page.value * pageSize < total.value) {
    page.value++
    load()
  }
}

function goPost(postId?: number) {
  if (postId) router.push(`/post/${postId}`)
}

const delDialog = reactive({ visible: false, comment: null as any })
function openDelete(c: any) {
  delDialog.comment = c
  delDialog.visible = true
}
async function confirmDelete() {
  const c = delDialog.comment
  delDialog.visible = false
  if (!c) return
  try {
    await adminApi.deleteComment(c.id)
    toast.success('评论已删除')
    load()
  } catch {}
}

onMounted(load)
</script>

<template>
  <div class="space-y-4">
    <!-- 搜索 -->
    <div class="bg-white rounded-xl p-3 border border-zinc-100 shadow-sm flex items-center gap-2">
      <div class="relative flex-1">
        <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
        <input
          v-model="keyword"
          placeholder="搜索评论内容"
          class="w-full pl-9 pr-3 py-2 rounded-lg bg-zinc-50 border border-zinc-200 focus:border-brand-500 focus:outline-none text-sm"
          @keyup.enter="onSearch"
        />
      </div>
      <button class="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-sm font-medium" @click="onSearch">搜索</button>
    </div>

    <!-- 列表 -->
    <div class="bg-white rounded-xl border border-zinc-100 shadow-sm overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="text-zinc-500 text-xs bg-zinc-50 border-b border-zinc-100">
            <th class="text-left px-3 py-2 font-medium">所属帖子</th>
            <th class="text-left px-3 py-2 font-medium">评论人</th>
            <th class="text-left px-3 py-2 font-medium">内容</th>
            <th class="text-left px-3 py-2 font-medium">点赞</th>
            <th class="text-left px-3 py-2 font-medium">时间</th>
            <th class="text-left px-3 py-2 font-medium">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="c in list" :key="c.id" class="border-b border-zinc-50 hover:bg-zinc-50/50 align-top">
            <td class="px-3 py-2 max-w-[220px]">
              <button class="text-brand-600 hover:underline text-left truncate max-w-[220px] block" @click="goPost(c.post?.id)">
                {{ c.post?.title || `帖子 #${c.post?.id ?? '-'}` }}
              </button>
            </td>
            <td class="px-3 py-2 whitespace-nowrap">
              <span class="text-zinc-600">{{ c.author?.nickname || '未知用户' }}</span>
              <span v-if="c.isAnonymous" class="ml-1 px-1.5 py-0.5 rounded text-[10px] bg-zinc-100 text-zinc-500">匿名发布</span>
            </td>
            <td class="px-3 py-2 max-w-[320px]"><p class="line-clamp-2 text-zinc-700">{{ c.content }}</p></td>
            <td class="px-3 py-2 whitespace-nowrap">
              <span class="inline-flex items-center gap-0.5 text-zinc-500 text-xs"><Heart class="w-3 h-3 text-red-400" />{{ c.likeCount ?? c.like_count ?? 0 }}</span>
            </td>
            <td class="px-3 py-2 text-zinc-400 whitespace-nowrap">{{ formatTime(c.createdAt) }}</td>
            <td class="px-3 py-2 whitespace-nowrap">
              <button
                class="flex items-center gap-1 px-2 py-1 rounded text-xs bg-red-50 text-red-600 hover:bg-red-100"
                @click="openDelete(c)"
              >
                <Trash2 class="w-3 h-3" />删除
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <EmptyState v-if="!loading && !list.length" text="暂无评论" />
      <div v-if="loading" class="py-10 text-center text-sm text-zinc-400">加载中...</div>
    </div>

    <!-- 分页 -->
    <div class="flex items-center justify-between text-sm text-zinc-500">
      <span>共 {{ total }} 条，第 {{ page }} 页 / 共 {{ Math.max(1, Math.ceil(total / pageSize)) }} 页</span>
      <div class="flex gap-2">
        <button class="px-3 py-1.5 rounded-lg border border-zinc-200 disabled:opacity-40 hover:bg-zinc-50" :disabled="page <= 1" @click="prevPage">
          <ChevronLeft class="w-4 h-4" />
        </button>
        <button class="px-3 py-1.5 rounded-lg border border-zinc-200 disabled:opacity-40 hover:bg-zinc-50" :disabled="page * pageSize >= total" @click="nextPage">
          <ChevronRight class="w-4 h-4" />
        </button>
      </div>
    </div>

    <ConfirmDialog
      :visible="delDialog.visible"
      title="删除评论"
      :content="`确定删除该评论吗？删除后前台不可见。`"
      confirm-text="删除"
      danger
      @confirm="confirmDelete"
      @cancel="delDialog.visible = false"
    />
  </div>
</template>
