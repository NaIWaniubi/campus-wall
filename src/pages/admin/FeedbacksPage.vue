<script setup lang="ts">
/**
 * 意见反馈：open/closed 双 tab 列表（提交人/内容/联系方式/时间）
 * 契约：GET /api/admin/feedbacks?status=open|closed&page= → { list, total, page, pageSize }
 */
import { ref, onMounted } from 'vue'
import { ChevronLeft, ChevronRight } from '@lucide/vue'
import { adminApi } from '@/utils/api'
import { toast } from '@/utils/request'
import { formatTime } from '@/utils/helpers'
import EmptyState from '@/components/EmptyState.vue'

const activeTab = ref<'open' | 'closed'>('open')
const list = ref<any[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 20
const loading = ref(false)

async function load() {
  loading.value = true
  try {
    const res: any = await adminApi.feedbacks({ status: activeTab.value, page: page.value, pageSize })
    list.value = res.data.list
    total.value = res.data.total
  } catch {
    list.value = []
  } finally {
    loading.value = false
  }
}

function switchTab(tab: 'open' | 'closed') {
  if (activeTab.value === tab) return
  activeTab.value = tab
  page.value = 1
  load()
}

// 反馈闭环：标记已处理（PUT /admin/feedbacks/:id/status {status:'closed'}）
const closingId = ref<number | null>(null)
async function closeFeedback(f: any) {
  if (closingId.value) return
  closingId.value = f.id
  try {
    await adminApi.closeFeedback(f.id, 'closed')
    toast.success('已标记为已处理')
    load()
  } catch {} finally {
    closingId.value = null
  }
}
function prevPage() {
  if (page.value > 1) { page.value--; load() }
}
function nextPage() {
  if (page.value * pageSize < total.value) { page.value++; load() }
}
function totalPages() {
  return Math.max(1, Math.ceil(total.value / pageSize))
}

onMounted(load)
</script>

<template>
  <div class="space-y-4">
    <!-- 双 tab -->
    <div class="flex items-center gap-2">
      <button
        class="px-4 py-2 rounded-full text-sm font-medium transition"
        :class="activeTab === 'open' ? 'bg-brand-500 text-white' : 'bg-white text-zinc-600 border border-zinc-200 hover:bg-zinc-50'"
        @click="switchTab('open')"
      >
        待处理
      </button>
      <button
        class="px-4 py-2 rounded-full text-sm font-medium transition"
        :class="activeTab === 'closed' ? 'bg-brand-500 text-white' : 'bg-white text-zinc-600 border border-zinc-200 hover:bg-zinc-50'"
        @click="switchTab('closed')"
      >
        已关闭
      </button>
    </div>

    <!-- 列表 -->
    <div class="space-y-3">
      <div v-for="f in list" :key="f.id" class="bg-white rounded-xl p-4 border border-zinc-100 shadow-sm">
        <div class="flex items-center justify-between mb-2">
          <div class="flex items-center gap-2 min-w-0">
            <div class="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center text-brand-600 text-xs font-medium overflow-hidden shrink-0">
              <img v-if="f.avatar" :src="f.avatar" class="w-full h-full object-cover" alt="" />
              <span v-else>{{ f.nickname?.charAt(0) }}</span>
            </div>
            <span class="text-sm text-zinc-900 truncate">{{ f.nickname || '未知用户' }}</span>
            <span class="text-xs text-zinc-400">{{ f.studentId }}</span>
          </div>
          <span class="text-xs text-zinc-400 whitespace-nowrap ml-2">{{ formatTime(f.createdAt) }}</span>
        </div>
        <p class="text-sm text-zinc-700 whitespace-pre-wrap break-words">{{ f.content }}</p>
        <div class="flex items-center justify-between mt-2">
          <p v-if="f.contact" class="text-xs text-zinc-400">联系方式：{{ f.contact }}</p>
          <span v-else></span>
          <button
            v-if="activeTab === 'open'"
            class="px-3 py-1.5 rounded-lg text-xs bg-green-50 text-green-600 hover:bg-green-100 disabled:opacity-50 whitespace-nowrap"
            :disabled="closingId === f.id"
            @click="closeFeedback(f)"
          >
            {{ closingId === f.id ? '处理中...' : '标记已处理' }}
          </button>
        </div>
      </div>
      <EmptyState v-if="!loading && !list.length" :text="activeTab === 'open' ? '暂无待处理反馈' : '暂无已关闭反馈'" />
      <div v-if="loading" class="py-10 text-center text-sm text-zinc-400">加载中...</div>
    </div>

    <!-- 分页 -->
    <div v-if="total > pageSize" class="flex items-center justify-between text-sm text-zinc-500">
      <span>共 {{ total }} 条，第 {{ page }} 页 / 共 {{ totalPages() }} 页</span>
      <div class="flex gap-2">
        <button class="px-3 py-1.5 rounded-lg border border-zinc-200 disabled:opacity-40 hover:bg-zinc-50" :disabled="page <= 1" @click="prevPage">
          <ChevronLeft class="w-4 h-4" />
        </button>
        <button class="px-3 py-1.5 rounded-lg border border-zinc-200 disabled:opacity-40 hover:bg-zinc-50" :disabled="page * pageSize >= total" @click="nextPage">
          <ChevronRight class="w-4 h-4" />
        </button>
      </div>
    </div>
  </div>
</template>
