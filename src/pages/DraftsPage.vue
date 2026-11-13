<script setup lang="ts">
/**
 * 草稿箱页面
 */
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft, FileText, Trash2 } from '@lucide/vue'
import { draftApi } from '@/utils/api'
import { formatTime } from '@/utils/helpers'
import { toast } from '@/utils/request'
import EmptyState from '@/components/EmptyState.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import SkeletonList from '@/components/SkeletonList.vue'

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
  <div class="min-h-screen pb-24" style="background: var(--paper)">
    <!-- 顶部 -->
    <header class="sticky top-0 z-10" style="background: var(--paper); border-bottom: 1.5px solid var(--ink)">
      <div class="max-w-[960px] mx-auto flex items-center px-4 h-12">
        <button type="button" class="ds-icon-btn !w-9 !h-9 -ml-1" style="border-color: var(--hairline); box-shadow: none" aria-label="返回" @click="router.back()">
          <ArrowLeft class="w-5 h-5" />
        </button>
        <h1 class="flex-1 text-center ds-display text-[17px]" style="color: var(--ink)">草稿箱</h1>
        <div class="w-8"></div>
      </div>
    </header>

    <!-- 列表 -->
    <main class="max-w-[960px] mx-auto px-4 py-3">
      <!-- 云端草稿上限：后端 LIMIT 10、FIFO 驱逐最早一条 -->
      <p v-if="!loading" class="text-xs ds-sub px-1 pb-2">云端最多保存 10 条草稿，已存 {{ drafts.length }}/10 条，超出后自动删除最早的一条</p>
      <SkeletonList v-if="loading" :count="3" :show-media="false">
        <template #item>
          <div
            v-for="i in 3"
            :key="i"
            class="rounded-xl p-4 h-20 skeleton"
            style="background-color: var(--color-surface); border: 1px solid var(--color-border);"
          />
        </template>
      </SkeletonList>
      <EmptyState v-else-if="!drafts.length" text="草稿箱空空如也" />
      <div v-else class="space-y-2">
        <div
          v-for="d in drafts"
          :key="d.id"
          class="ds-card p-3.5 flex items-center gap-3 hover:transition cursor-pointer"
          @click="useDraft(d)"
        >
          <div class="w-9 h-9 rounded-[10px] flex items-center justify-center flex-shrink-0" style="background: var(--sky); border: 1.5px solid var(--ink)">
            <FileText class="w-4 h-4" style="color: var(--ink)" />
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 text-xs ds-sub mb-0.5">
              <span class="ds-tag !py-0.5">{{ d.sectionName || '未选板块' }}</span>
              <span>{{ formatTime(d.createdAt) }}</span>
            </div>
            <p class="text-sm font-bold truncate" style="color: var(--ink)">{{ d.title || '无标题' }}</p>
            <p class="text-xs truncate mt-0.5" style="color: var(--ink-mute)">{{ d.content || '无内容' }}</p>
          </div>
          <button class="p-1.5 rounded-full flex-shrink-0 transition" style="color: var(--ink-mute)" @click.stop="confirmDelete(d)">
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


