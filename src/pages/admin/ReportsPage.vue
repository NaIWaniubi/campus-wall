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
    const actionConfig = actions[action];
    if (!actionConfig) return;
    await adminApi.handleReport(report.id, action, actionConfig.result)
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
  <div class="min-h-screen space-y-4">
    <!-- 页头：海报式标题 + 统计数字 -->
    <header class="flex flex-wrap items-end justify-between gap-3 pb-3" style="border-bottom: 1.5px solid var(--ink)">
      <div class="min-w-0">
        <div class="flex items-center gap-2 mb-2">
          <span class="ds-sticker ds-sticker--violet">REPORTS</span>
          <span class="ds-label">内容治理</span>
        </div>
        <h1 class="ds-display ds-display-lg" style="color: var(--ink)">举报处理</h1>
      </div>
      <div class="flex items-baseline gap-2">
        <span class="ds-display ds-display-lg ds-num" style="color: var(--ink)">{{ total }}</span>
        <span class="ds-label">TICKETS</span>
      </div>
    </header>

    <!-- 状态 chips -->
    <section class="ds-card p-3 md:p-4 flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
      <button
        v-for="c in chips"
        :key="c.value"
        type="button"
        class="ds-chip"
        :class="{ 'is-active': activeChip === c.value }"
        @click="switchChip(c.value)"
      >
        {{ c.label }}
      </button>
    </section>

    <!-- 工单列表：纸感表格 -->
    <section class="ds-card ds-card--flat overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-[13px]">
          <thead>
            <tr style="background: var(--paper); border-bottom: 1.5px solid var(--ink)">
              <th class="ds-label text-left px-3 py-2.5 font-normal" style="color: var(--ink-soft)">工单</th>
              <th class="ds-label text-left px-3 py-2.5 font-normal" style="color: var(--ink-soft)">举报原因</th>
              <th class="ds-label text-left px-3 py-2.5 font-normal" style="color: var(--ink-soft)">举报人</th>
              <th class="ds-label text-left px-3 py-2.5 font-normal" style="color: var(--ink-soft)">时间</th>
              <th class="ds-label text-left px-3 py-2.5 font-normal" style="color: var(--ink-soft)">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="r in list"
              :key="r.id"
              class="align-top hover:bg-[var(--paper)]"
              style="border-bottom: 1px solid var(--hairline)"
            >
              <!-- 工单：目标类型 + 状态标签 -->
              <td class="px-3 py-2.5 whitespace-nowrap">
                <div class="flex flex-wrap items-center gap-1.5">
                  <span class="ds-tag">
                    <span class="ds-tag-dot" :style="{ background: r.targetType === 'post' ? 'var(--sky)' : 'var(--violet)' }"></span>
                    {{ targetText(r) }}
                  </span>
                  <span v-if="r.status === 'pending'" class="ds-tag">
                    <span class="ds-tag-dot" style="background: var(--coral)"></span>待处理
                  </span>
                  <span v-else class="ds-tag">
                    <span class="ds-tag-dot" style="background: var(--lime)"></span>已处理
                  </span>
                </div>
              </td>

              <!-- 举报原因 + 匿名阈值警示 + 处理结果 -->
              <td class="px-3 py-2.5 min-w-[220px]">
                <p class="leading-relaxed" style="color: var(--ink)">
                  <span style="color: var(--ink-mute)">举报原因：</span>{{ r.reason || '-' }}
                </p>

                <!-- 匿名帖达举报阈值：后端仅在此场景附加 revealedAuthor -->
                <div
                  v-if="r.revealedAuthor"
                  class="mt-2 px-3 py-2 text-xs leading-relaxed"
                  style="background: var(--coral); color: var(--ink); border: 1.5px solid var(--ink); box-shadow: var(--shadow-hard-sm); border-radius: 10px"
                >
                  ⚠ 匿名帖已达举报阈值({{ r.reportCount }}人)，作者：{{ r.revealedAuthor.nickname }}({{ r.revealedAuthor.studentId }})
                </div>

                <p v-if="r.status === 'handled'" class="mt-1.5 text-xs" style="color: var(--ink-mute)">
                  处理结果：{{ r.handleResult || '-' }}
                </p>
              </td>

              <!-- 举报人 + 举报人数 -->
              <td class="px-3 py-2.5 min-w-[160px]">
                <p style="color: var(--ink-soft)">
                  {{ r.reporter?.nickname || '未知用户' }}<template v-if="r.reporter?.studentId">（{{ r.reporter.studentId }}）</template>
                </p>
                <p class="mt-1.5 text-xs font-bold ds-num" style="color: var(--ink)">
                  <span class="ds-tag-dot inline-block align-middle mr-1" style="background: var(--coral)"></span>{{ r.reportCount }} 人举报该内容
                </p>
              </td>

              <td class="px-3 py-2.5 whitespace-nowrap ds-num text-xs" style="color: var(--ink-mute)">{{ formatTime(r.createdAt) }}</td>

              <!-- 操作：仅在待处理时出现；查看内容仅帖子目标 -->
              <td class="px-3 py-2.5">
                <div v-if="r.status === 'pending'" class="flex flex-wrap items-center gap-1.5 whitespace-nowrap">
                  <button
                    type="button"
                    class="ds-btn ds-btn--sm ds-btn--primary"
                    @click="openHandle(r, 'resolve')"
                  >
                    <Check class="w-3 h-3" />{{ actions.resolve?.label }}
                  </button>
                  <button
                    type="button"
                    class="ds-btn ds-btn--sm"
                    @click="openHandle(r, 'dismiss')"
                  >
                    <XCircle class="w-3 h-3" />{{ actions.dismiss?.label }}
                  </button>
                  <button
                    v-if="r.targetType === 'post'"
                    type="button"
                    class="ds-btn ds-btn--sm"
                    @click="viewDetail(r)"
                  >
                    <ExternalLink class="w-3 h-3" />查看内容
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <EmptyState v-if="!loading && !list.length" text="暂无举报工单" />
      <div v-if="loading" class="py-10 text-center ds-sub">加载中...</div>
    </section>

    <!-- 分页 -->
    <div class="flex flex-wrap items-center justify-between gap-2 ds-sub">
      <span class="ds-num">共 {{ total }} 条，第 {{ page }} 页 / 共 {{ Math.max(1, Math.ceil(total / pageSize)) }} 页</span>
      <div class="flex gap-2">
        <button
          type="button"
          class="ds-btn ds-btn--sm"
          aria-label="上一页"
          :disabled="page <= 1"
          @click="prevPage"
        >
          <ChevronLeft class="w-4 h-4" />
        </button>
        <button
          type="button"
          class="ds-btn ds-btn--sm"
          aria-label="下一页"
          :disabled="page * pageSize >= total"
          @click="nextPage"
        >
          <ChevronRight class="w-4 h-4" />
        </button>
      </div>
    </div>

    <ConfirmDialog
      :visible="handleDialog.visible"
      :title="handleDialog.action && actions[handleDialog.action] ? actions[handleDialog.action]!.label : '提示'"
      :content="handleDialog.report && handleDialog.action && actions[handleDialog.action] ? `${targetText(handleDialog.report)}：${actions[handleDialog.action]!.content}` : ''"
      :confirm-text="handleDialog.action && actions[handleDialog.action] ? actions[handleDialog.action]!.label : '确定'"
      :danger="handleDialog.action === 'dismiss'"
      @confirm="confirmHandle"
      @cancel="handleDialog.visible = false"
    />
  </div>
</template>
