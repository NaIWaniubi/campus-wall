<script setup lang="ts">
/**
 * 举报处理（内容治理三区之三）：状态 chips（待处理/已处理/全部）+ 工单列表
 * - 条目为后端 camelCase 字段：targetType/targetId/reportCount
 * - revealedAuthor 存在（匿名帖有效举报达阈值）时展示橙色警示条，仅匿名帖语义
 * - 处理动作：核实处理(resolve) / 驳回举报(dismiss) 二选一，均需二次确认
 */
import { ref, reactive, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ExternalLink, ChevronLeft, ChevronRight, Check, XCircle } from '@lucide/vue'
import { adminApi } from '@/utils/api'
import { formatTime } from '@/utils/helpers'
import { toast } from '@/utils/request'
import EmptyState from '@/components/EmptyState.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

const router = useRouter()
const route = useRoute()

const chips = [
  { label: '待处理', value: 'pending' },
  { label: '已处理', value: 'handled' },
  { label: '全部', value: '' },
]

const list = ref<any[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 20
const loading = ref(false)
// 支持 Dashboard 下钻：?status=pending 预置筛选
const activeChip = ref(chips.some((c) => c.value === route.query.status) ? (route.query.status as string) : 'pending')

async function load() {
  loading.value = true
  try {
    const res: any = await adminApi.reports({
      status: activeChip.value || undefined,
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

function switchChip(v: string) {
  if (activeChip.value === v) return
  activeChip.value = v
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

function targetText(r: any) {
  const type = r.targetType === 'post' ? '帖子' : r.targetType === 'comment' ? '评论' : '内容'
  return `${type} #${r.targetId}`
}
function viewDetail(r: any) {
  if (r.targetType === 'post') router.push(`/post/${r.targetId}`)
  else toast.info('评论暂无详情页')
}

// 处理动作：resolve / dismiss 二选一 + 确认弹窗
const actions: Record<string, { label: string; result: string; content: string }> = {
  resolve: { label: '核实处理', result: '已核实并处理违规内容', content: '确认该举报属实并标记处理完成？如有需要请先在帖子治理/评论管理中删除对应内容。' },
  dismiss: { label: '驳回举报', result: '举报不实，予以驳回', content: '确认驳回该举报？工单将标记为已处理且不对被举报内容做任何改动。' },
}
const handleDialog = reactive({ visible: false, report: null as any, action: '', submitting: false })
// 提交锁：每个工单的操作都加 id 锁，防止双击重复触发
const submittingId = ref<number | null>(null)
function openHandle(r: any, action: string) {
  handleDialog.report = r
  handleDialog.action = action
  handleDialog.submitting = false
  handleDialog.visible = true
}
async function confirmHandle() {
  const { report, action } = handleDialog
  if (handleDialog.submitting) return
  if (!report || !action) return
  if (submittingId.value === report.id) return
  handleDialog.submitting = true
  submittingId.value = report.id
  // 乐观移除本地列表项（不用 reload 全表）
  const removedIdx = list.value.findIndex((x) => x.id === report.id)
  const removedItem = removedIdx >= 0 ? list.value[removedIdx] : null
  if (removedIdx >= 0) {
    list.value.splice(removedIdx, 1)
    total.value = Math.max(0, total.value - 1)
  }
  handleDialog.visible = false
  try {
    await adminApi.handleReport(report.id, action, actions[action].result)
    toast.success(action === 'resolve' ? '已核实处理' : '已驳回举报')
  } catch {
    // 失败回滚
    if (removedItem && removedIdx >= 0) {
      list.value.splice(removedIdx, 0, removedItem)
      total.value += 1
    }
  } finally {
    submittingId.value = null
    handleDialog.submitting = false
  }
}

onMounted(load)
</script>

<template>
  <div class="space-y-4">
    <!-- 状态 chips -->
    <div class="bg-white rounded-xl p-3 border border-zinc-100 shadow-sm flex items-center gap-1 overflow-x-auto scrollbar-hide">
      <button
        v-for="c in chips"
        :key="c.value"
        class="px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition"
        :class="activeChip === c.value ? 'bg-brand-500 text-white font-medium' : 'text-zinc-500 hover:bg-zinc-100'"
        @click="switchChip(c.value)"
      >
        {{ c.label }}
      </button>
    </div>

    <!-- 工单列表 -->
    <div class="space-y-3">
      <div v-for="r in list" :key="r.id" class="bg-white rounded-xl border border-zinc-100 shadow-sm p-4 space-y-2">
        <div class="flex items-start justify-between gap-2">
          <div class="flex items-center gap-2 min-w-0">
            <span class="px-2 py-0.5 rounded text-xs font-medium flex-shrink-0" :class="r.targetType === 'post' ? 'bg-brand-50 text-brand-600' : 'bg-violet-50 text-violet-600'">
              {{ targetText(r) }}
            </span>
            <span v-if="r.status === 'pending'" class="px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-600">待处理</span>
            <span v-else class="px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-600">已处理</span>
          </div>
          <span class="text-xs text-zinc-400 whitespace-nowrap">{{ formatTime(r.createdAt) }}</span>
        </div>

        <p class="text-sm text-zinc-700"><span class="text-zinc-400">举报原因：</span>{{ r.reason || '-' }}</p>

        <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500">
          <span>举报人：{{ r.reporter?.nickname || '未知用户' }}<template v-if="r.reporter?.studentId">（{{ r.reporter.studentId }}）</template></span>
          <span class="text-red-500 font-medium">{{ r.reportCount }} 人举报该内容</span>
        </div>

        <!-- 匿名帖达举报阈值：后端仅在此场景附加 revealedAuthor -->
        <div v-if="r.revealedAuthor" class="rounded-lg bg-orange-50 border border-orange-200 px-3 py-2 text-sm text-orange-600">
          ⚠ 匿名帖已达举报阈值({{ r.reportCount }}人)，作者：{{ r.revealedAuthor.nickname }}({{ r.revealedAuthor.studentId }})
        </div>

        <p v-if="r.status === 'handled'" class="text-xs text-zinc-400">处理结果：{{ r.handleResult || '-' }}</p>

        <div v-if="r.status === 'pending'" class="flex flex-wrap items-center gap-2 pt-1">
          <button
            class="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs bg-brand-500 hover:bg-brand-600 text-white font-medium"
            @click="openHandle(r, 'resolve')"
          >
            <Check class="w-3 h-3" />{{ actions.resolve.label }}
          </button>
          <button
            class="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs bg-zinc-100 hover:bg-zinc-200 text-zinc-600"
            @click="openHandle(r, 'dismiss')"
          >
            <XCircle class="w-3 h-3" />{{ actions.dismiss.label }}
          </button>
          <button
            v-if="r.targetType === 'post'"
            class="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs bg-zinc-100 hover:bg-zinc-200 text-zinc-600"
            @click="viewDetail(r)"
          >
            <ExternalLink class="w-3 h-3" />查看内容
          </button>
        </div>
      </div>

      <EmptyState v-if="!loading && !list.length" text="暂无举报工单" />
      <div v-if="loading" class="py-10 text-center text-sm text-zinc-400 bg-white rounded-xl border border-zinc-100">加载中...</div>
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
      :visible="handleDialog.visible"
      :title="handleDialog.action ? actions[handleDialog.action].label : '提示'"
      :content="handleDialog.report ? `${targetText(handleDialog.report)}：${handleDialog.action ? actions[handleDialog.action].content : ''}` : ''"
      :confirm-text="handleDialog.action ? actions[handleDialog.action].label : '确定'"
      :danger="handleDialog.action === 'dismiss'"
      @confirm="confirmHandle"
      @cancel="handleDialog.visible = false"
    />
  </div>
</template>
