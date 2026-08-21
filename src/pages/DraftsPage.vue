<script setup lang="ts">
/**
 * 草稿箱页面
 */
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft, FileText, Trash2, ChevronRight } from 'lucide-vue-next'
import { draftApi } from '@/utils/api'
import { formatTime } from '@/utils/helpers'
import { toast } from '@/utils/request'
import EmptyState from '@/components/EmptyState.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

const router = useRouter()
const drafts = ref<any[]>([])
const loading = ref(true)
const showDelete = ref(false)
const deleteTarget = ref<any>(null)

async function load() {
  loading.value = true
  try {
    const res: any = await draftApi.list()
    drafts.value = res.data || []
  } catch {
    drafts.value = []
  } finally {
    loading.value = false
  }
}

function useDraft(d: any) {
  // 暂存草稿到sessionStorage，跳转到发布页恢复
  sessionStorage.setItem('campus-wall-draft-restore', JSON.stringify(d))
  router.push('/publish')
}

function confirmDelete(d: any) {
  deleteTarget.value = d
  showDelete.value = true
}

async function handleDelete() {
  if (!deleteTarget.value) return
  try {
    await draftApi.remove(deleteTarget.value.id)
    toast.success('已删除')
    showDelete.value = false
    deleteTarget.value = null
    load()
  } catch {}
}

onMounted(load)
</script>

<template>
  <div class="min-h-screen bg-zinc-50">
    <!-- 顶部 -->
    <header class="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-zinc-100">
      <div class="max-w-[960px] mx-auto flex items-center px-4 h-12">
        <button class="p-1.5 -ml-1.5 hover:bg-zinc-100 rounded-full" @click="router.back()">
          <ArrowLeft class="w-5 h-5 text-zinc-700" />
        </button>
        <h1 class="flex-1 text-center font-medium text-zinc-900">草稿箱</h1>
        <div class="w-8"></div>
      </div>
    </header>

    <!-- 列表 -->
    <main class="max-w-[960px] mx-auto px-4 py-3">
      <div v-if="loading" class="space-y-3">
        <div v-for="i in 3" :key="i" class="bg-white rounded-xl p-4 skeleton h-20"></div>
      </div>
      <EmptyState v-else-if="!drafts.length" text="草稿箱空空如也" />
      <div v-else class="space-y-2">
        <div
          v-for="d in drafts"
          :key="d.id"
          class="bg-white rounded-xl p-3.5 flex items-center gap-3 hover:shadow-sm transition cursor-pointer"
          @click="useDraft(d)"
        >
          <div class="w-9 h-9 rounded-lg bg-brand-50 flex items-center justify-center flex-shrink-0">
            <FileText class="w-4.5 h-4.5 text-brand-600" />
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 text-xs text-zinc-400 mb-0.5">
              <span class="px-1.5 py-0.5 bg-zinc-100 text-zinc-600 rounded">{{ d.sectionName || '未选板块' }}</span>
              <span>{{ formatTime(d.createdAt) }}</span>
            </div>
            <p class="text-sm text-zinc-900 font-medium truncate">{{ d.title || '无标题' }}</p>
            <p class="text-xs text-zinc-500 truncate mt-0.5">{{ d.content || '无内容' }}</p>
          </div>
          <button class="p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-full flex-shrink-0" @click.stop="confirmDelete(d)">
            <Trash2 class="w-4 h-4" />
          </button>
        </div>
      </div>
    </main>

    <ConfirmDialog
      :visible="showDelete"
      content="确定删除该草稿吗？"
      title="删除草稿"
      confirm-text="删除"
      danger
      @confirm="handleDelete"
      @cancel="showDelete = false"
    />
  </div>
</template>
