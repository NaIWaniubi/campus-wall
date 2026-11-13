<script setup lang="ts">
/**
 * 意见反馈：open/closed 双 tab 列表（提交人/内容/联系方式/时间）
 * 契约：GET /api/admin/feedbacks?status=open|closed&page= → { list, total, page, pageSize }
 */
import { ref, reactive, onMounted } from 'vue'
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
// 二次确认弹窗：标记已处理需管理员明确意图，避免误关单
const closeConfirm = reactive({ visible: false, feedback: null as any })
function openCloseConfirm(f: any) {
  closeConfirm.feedback = f
  closeConfirm.visible = true
}
function cancelCloseConfirm() {
  closeConfirm.visible = false
  closeConfirm.feedback = null
}
async function confirmCloseFeedback() {
  const f = closeConfirm.feedback
  closeConfirm.visible = false
  closeConfirm.feedback = null
  if (!f || closingId.value === f.id) return
  closingId.value = f.id
  try {
    await adminApi.closeFeedback(f.id, 'closed')
    toast.success('已标记为已处理')
    load()
  } catch {
  } finally {
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
        type="button"
        class="ds-chip"
        :class="{ 'is-active': activeTab === 'open' }"
        @click="switchTab('open')"
      >
        待处理
      </button>
      <button
        type="button"
        class="ds-chip"
        :class="{ 'is-active': activeTab === 'closed' }"
        @click="switchTab('closed')"
      >
        已关闭
      </button>
    </div>

    <!-- 列表 -->
    <div class="space-y-3">
      <div v-for="f in list" :key="f.id" class="ds-card p-4">
        <div class="flex items-center justify-between mb-2">
          <div class="flex items-center gap-2 min-w-0">
            <div class="w-7 h-7 flex items-center justify-center text-[12px] font-black overflow-hidden shrink-0" style="background: var(--lime); color: var(--ink); border: 1.5px solid var(--ink); border-radius: 9px">
              <img v-if="f.avatar" :src="f.avatar" class="w-full h-full object-cover" alt="" />
              <span v-else>{{ f.nickname?.charAt(0) }}</span>
            </div>
            <span class="text-[13px] font-bold truncate" style="color: var(--ink)">{{ f.nickname || '未知用户' }}</span>
            <span class="text-[11.5px] ds-num" style="color: var(--ink-mute)">{{ f.studentId }}</span>
          </div>
          <span class="text-[11.5px] ds-num whitespace-nowrap ml-2" style="color: var(--ink-mute)">{{ formatTime(f.createdAt) }}</span>
        </div>
        <p class="text-[13px] leading-relaxed whitespace-pre-wrap break-words" style="color: var(--ink-soft)">{{ f.content }}</p>
        <div class="flex items-center justify-between mt-2">
          <p v-if="f.contact" class="text-[11.5px]" style="color: var(--ink-mute)">联系方式：{{ f.contact }}</p>
          <span v-else></span>
          <button
            v-if="activeTab === 'open'"
            type="button"
            class="ds-btn ds-btn--sm whitespace-nowrap"
            style="background: var(--lime); color: var(--ink); border-color: var(--ink)"
            :disabled="closingId === f.id"
            @click="openCloseConfirm(f)"
          >
            {{ closingId === f.id ? '处理中...' : '标记已处理' }}
          </button>
        </div>
      </div>
      <EmptyState v-if="!loading && !list.length" :text="activeTab === 'open' ? '暂无待处理反馈' : '暂无已关闭反馈'" />
      <div v-if="loading" class="py-10 text-center text-sm" style="color: var(--ink-mute)">加载中...</div>
    </div>

    <!-- 二次确认：标记已处理 -->
    <Teleport to="body">
      <div v-if="closeConfirm.visible" class="fixed inset-0 z-50 flex items-center justify-center p-4" @click.self="cancelCloseConfirm">
        <div class="absolute inset-0" style="background: var(--ink); opacity: 0.55"></div>
        <div class="relative ds-card w-full max-w-sm p-6">
          <span class="ds-sticker ds-sticker--sky">CLOSE</span>
          <h3 class="ds-title mt-2 mb-3" style="color: var(--ink)">标记为已处理？</h3>
          <div v-if="closeConfirm.feedback" class="flex items-center gap-3 p-3 mb-3" style="background: var(--color-surface); border: 1px solid var(--hairline); border-radius: 12px">
            <div class="w-9 h-9 flex items-center justify-center text-[13px] font-black overflow-hidden shrink-0" style="background: var(--lime); color: var(--ink); border: 1.5px solid var(--ink); border-radius: 10px">
              <img v-if="closeConfirm.feedback.avatar" :src="closeConfirm.feedback.avatar" class="w-full h-full object-cover" alt="" />
              <span v-else>{{ closeConfirm.feedback.nickname?.charAt(0) }}</span>
            </div>
            <div class="min-w-0 flex-1">
              <div class="text-[13px] font-bold truncate" style="color: var(--ink)">{{ closeConfirm.feedback.nickname || '未知用户' }}</div>
              <div class="text-[11.5px] ds-num truncate" style="color: var(--ink-mute)">账号 {{ closeConfirm.feedback.studentId }} · {{ formatTime(closeConfirm.feedback.createdAt) }}</div>
            </div>
          </div>
          <p class="text-[13px] leading-relaxed mb-4" style="color: var(--ink-soft)">将该条反馈从「待处理」移入「已关闭」。如有需要请先在外部与用户沟通后再操作。</p>
          <div class="flex gap-3">
            <button type="button" class="flex-1 ds-btn" @click="cancelCloseConfirm">取消</button>
            <button type="button" class="flex-1 ds-btn ds-btn--primary" :disabled="closingId === closeConfirm.feedback?.id" @click="confirmCloseFeedback">
              {{ closingId === closeConfirm.feedback?.id ? '提交中…' : '确定' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 分页 -->
    <div v-if="total > pageSize" class="flex items-center justify-between text-[12.5px]" style="color: var(--ink-mute)">
      <span class="ds-num">共 {{ total }} 条，第 {{ page }} / {{ totalPages() }} 页</span>
      <div class="flex gap-2">
        <button type="button" class="ds-icon-btn !w-8 !h-8" aria-label="上一页" :disabled="page <= 1" @click="prevPage">
          <ChevronLeft class="w-4 h-4" />
        </button>
        <button type="button" class="ds-icon-btn !w-8 !h-8" aria-label="下一页" :disabled="page * pageSize >= total" @click="nextPage">
          <ChevronRight class="w-4 h-4" />
        </button>
      </div>
    </div>
  </div>
</template>
