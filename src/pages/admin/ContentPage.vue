<script setup lang="ts">
/**
 * 帖子治理（内容治理三区之一）：状态 Tab 全覆盖 + 关键词/板块筛选 + 列表
 * 行内操作：审核通过 / 驳回（必填原因）/ 置顶切换（全局·板块）/ 查看详情跳前台 / 删除
 */
import { ref, reactive, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  Search, Check, X, PinOff, Pin, ExternalLink, Trash2, ChevronLeft, ChevronRight,
} from '@lucide/vue'
import { adminApi, postApi, sectionApi } from '@/utils/api'
import { formatTime } from '@/utils/helpers'
import { toast } from '@/utils/request'
import EmptyState from '@/components/EmptyState.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

const route = useRoute()
const router = useRouter()

const tabs = [
  { label: '全部', value: '' },
  { label: '已发布', value: 'published' },
  { label: '人工审核', value: 'pending_review' },
  { label: '待审核', value: 'pending' },
  { label: '已驳回', value: 'rejected' },
  { label: '已删除', value: 'deleted' },
]

const list = ref<any[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 20
const loading = ref(false)
const activeTab = ref('')
const keyword = ref('')
const sectionId = ref<number | ''>('')
const sections = ref<any[]>([])

// 仅可视化映射：状态 → 文案 + ds-tag 圆点色（token 变量）
function statusMeta(s: string) {
  const map: Record<string, { text: string; dot: string }> = {
    published: { text: '已发布', dot: 'var(--lime)' },
    pending_review: { text: '人工审核', dot: 'var(--violet)' },
    pending: { text: '待审核', dot: 'var(--sky)' },
    rejected: { text: '已驳回', dot: 'var(--coral)' },
    deleted: { text: '已删除', dot: 'var(--ink-mute)' },
  }
  return map[s] || { text: s || '-', dot: 'var(--ink-mute)' }
}

async function load() {
  loading.value = true
  try {
    const res: any = await adminApi.posts({
      status: activeTab.value || undefined,
      keyword: keyword.value || undefined,
      sectionId: sectionId.value || undefined,
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

function switchTab(v: string) {
  if (activeTab.value === v) return
  activeTab.value = v
  page.value = 1
  load()
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

// 提交锁：每个帖子的 approve/reject/delete 操作都加 id 锁，防止双击触发两次
const submittingId = ref<number | null>(null)

async function approve(p: any) {
  if (!p || submittingId.value === p.id) return
  submittingId.value = p.id
  try {
    await adminApi.auditPost(p.id, 'approve')
    toast.success('已通过审核')
    load()
  } catch {
  } finally {
    submittingId.value = null
  }
}

const rejectModal = reactive({ visible: false, post: null as any, reason: '', submitting: false })
function openReject(p: any) {
  rejectModal.post = p
  rejectModal.reason = ''
  rejectModal.submitting = false
  rejectModal.visible = true
}
async function submitReject() {
  if (rejectModal.submitting) return
  if (!rejectModal.reason.trim()) return toast.error('请填写驳回原因')
  rejectModal.submitting = true
  try {
    await adminApi.auditPost(rejectModal.post.id, 'reject', rejectModal.reason.trim())
    toast.success('已驳回')
    rejectModal.visible = false
    load()
  } catch {
  } finally {
    rejectModal.submitting = false
  }
}

// 置顶二选一（板块置顶 topType=section / 全局置顶 topType=global），untop 不变
const topModal = reactive({ visible: false, post: null as any })
function openTop(p: any) {
  topModal.post = p
  topModal.visible = true
}
async function submitTop(topType: 'section' | 'global') {
  if (!topModal.post) return
  try {
    await adminApi.topPost(topModal.post.id, 'top', topType)
    toast.success(topType === 'global' ? '已设为全局置顶' : '已设为板块置顶')
    topModal.visible = false
    load()
  } catch {}
}

async function toggleTop(p: any) {
  try {
    if (p.isTop) {
      await adminApi.topPost(p.id, 'untop')
      toast.success('已取消置顶')
      load()
    }
  } catch {}
}

function viewDetail(id: number) {
  router.push(`/post/${id}`)
}

async function loadSections() {
  try {
    const res: any = await sectionApi.list(true)
    sections.value = res.data || []
  } catch {}
}

const deleteModal = reactive({ visible: false, post: null as any, submitting: false })
function openDelete(p: any) {
  deleteModal.post = p
  deleteModal.submitting = false
  deleteModal.visible = true
}
async function submitDelete() {
  if (deleteModal.submitting) return
  if (!deleteModal.post) return
  deleteModal.submitting = true
  try {
    await postApi.delete(deleteModal.post.id)
    toast.success('已删除')
    deleteModal.visible = false
    load()
  } catch {
  } finally {
    deleteModal.submitting = false
  }
}

onMounted(() => {
  // Dashboard 下钻：?tab=pending_review|published|deleted... 预置筛选
  const qTab = route.query.tab as string | undefined
  if (qTab && tabs.some((t) => t.value === qTab)) activeTab.value = qTab
  load()
  loadSections()
})
</script>

<template>
  <div class="min-h-screen space-y-4">
    <!-- 页头：海报式标题 + 统计数字 -->
    <header class="flex flex-wrap items-end justify-between gap-3 pb-3" style="border-bottom: 1.5px solid var(--ink)">
      <div class="min-w-0">
        <div class="flex items-center gap-2 mb-2">
          <span class="ds-sticker ds-sticker--coral">POSTS</span>
          <span class="ds-label">内容治理</span>
        </div>
        <h1 class="ds-display ds-display-lg" style="color: var(--ink)">帖子治理</h1>
      </div>
      <div class="flex items-baseline gap-2">
        <span class="ds-display ds-display-lg ds-num" style="color: var(--ink)">{{ total }}</span>
        <span class="ds-label">POSTS</span>
      </div>
    </header>

    <!-- Tab + 搜索 -->
    <section class="ds-card p-3 md:p-4 space-y-3">
      <div class="flex items-center gap-1.5 overflow-x-auto scrollbar-hide pb-0.5">
        <button
          v-for="t in tabs"
          :key="t.value"
          type="button"
          class="ds-chip"
          :class="{ 'is-active': activeTab === t.value }"
          @click="switchTab(t.value)"
        >
          {{ t.label }}
        </button>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <div class="relative flex-1 min-w-[180px]">
          <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style="color: var(--ink-mute)" />
          <input
            v-model="keyword"
            type="text"
            placeholder="搜索标题/内容"
            class="ds-input"
            style="padding-left: 38px"
            @keyup.enter="onSearch"
          />
        </div>
        <select
          v-model="sectionId"
          class="ds-input flex-none"
          style="width: auto; min-width: 132px"
          @change="onSearch"
        >
          <option value="">全部板块</option>
          <option v-for="s in sections" :key="s.id" :value="s.id">{{ s.name }}</option>
        </select>
        <button type="button" class="ds-btn ds-btn--primary" @click="onSearch">搜索</button>
      </div>
    </section>

    <!-- 列表：纸感表格 -->
    <section class="ds-card ds-card--flat overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-[13px]">
          <thead>
            <tr style="background: var(--paper); border-bottom: 1.5px solid var(--ink)">
              <th class="ds-label text-left px-3 py-2.5 font-normal" style="color: var(--ink-soft)">帖子</th>
              <th class="ds-label text-left px-3 py-2.5 font-normal" style="color: var(--ink-soft)">作者</th>
              <th class="ds-label text-left px-3 py-2.5 font-normal" style="color: var(--ink-soft)">状态</th>
              <th class="ds-label text-left px-3 py-2.5 font-normal" style="color: var(--ink-soft)">时间</th>
              <th class="ds-label text-left px-3 py-2.5 font-normal" style="color: var(--ink-soft)">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="p in list"
              :key="p.id"
              class="align-top hover:bg-[var(--paper)]"
              style="border-bottom: 1px solid var(--hairline)"
            >
              <td class="px-3 py-2.5 max-w-[280px]">
                <div class="flex items-center gap-1.5">
                  <span
                    v-if="p.isTop"
                    class="ds-tag flex-shrink-0"
                    style="background: var(--lime)"
                  >
                    {{ p.topType === 'global' ? '全局置顶' : '板块置顶' }}
                  </span>
                  <span class="font-bold truncate" style="color: var(--ink)">{{ p.title }}</span>
                </div>
                <p class="mt-1 text-xs leading-relaxed line-clamp-2" style="color: var(--ink-mute)">{{ p.content }}</p>
                <p v-if="p.status === 'rejected' && p.rejectReason" class="mt-1 flex items-baseline gap-1.5 text-xs leading-relaxed" style="color: var(--ink-soft)">
                  <span class="ds-tag-dot flex-none" style="background: var(--coral)"></span>驳回：{{ p.rejectReason }}
                </p>
              </td>
              <td class="px-3 py-2.5 whitespace-nowrap" style="color: var(--ink-soft)">{{ p.author?.nickname || '匿名' }}</td>
              <td class="px-3 py-2.5 whitespace-nowrap">
                <span class="ds-tag">
                  <span class="ds-tag-dot" :style="{ background: statusMeta(p.status).dot }"></span>
                  {{ statusMeta(p.status).text }}
                </span>
              </td>
              <td class="px-3 py-2.5 whitespace-nowrap ds-num text-xs" style="color: var(--ink-mute)">{{ formatTime(p.createdAt) }}</td>
              <td class="px-3 py-2.5">
                <div class="flex flex-wrap items-center gap-1.5 whitespace-nowrap">
                  <button
                    v-if="p.status === 'pending' || p.status === 'pending_review'"
                    type="button"
                    class="ds-btn ds-btn--sm"
                    :disabled="submittingId === p.id"
                    @click="approve(p)"
                  >
                    <Check class="w-3 h-3" />{{ submittingId === p.id ? '处理中…' : '通过' }}
                  </button>
                  <button
                    v-if="p.status === 'pending' || p.status === 'pending_review'"
                    type="button"
                    class="ds-btn ds-btn--sm ds-btn--danger"
                    @click="openReject(p)"
                  >
                    <X class="w-3 h-3" />驳回
                  </button>
                  <button
                    v-if="p.status === 'published' && !p.isTop"
                    type="button"
                    class="ds-btn ds-btn--sm"
                    @click="openTop(p)"
                  >
                    <Pin class="w-3 h-3" />置顶
                  </button>
                  <button
                    v-if="p.status === 'published' && p.isTop"
                    type="button"
                    class="ds-btn ds-btn--sm"
                    @click="toggleTop(p)"
                  >
                    <PinOff class="w-3 h-3" />取消置顶
                  </button>
                  <button
                    v-if="p.status !== 'deleted'"
                    type="button"
                    class="ds-btn ds-btn--sm ds-btn--danger"
                    :disabled="submittingId === p.id"
                    @click="openDelete(p)"
                  >
                    <Trash2 class="w-3 h-3" />删除
                  </button>
                  <button type="button" class="ds-btn ds-btn--sm" @click="viewDetail(p.id)">
                    <ExternalLink class="w-3 h-3" />详情
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <EmptyState v-if="!loading && !list.length" text="暂无帖子" />
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

    <!-- 驳回弹窗（原因必填） -->
    <Teleport to="body">
      <div v-if="rejectModal.visible" class="fixed inset-0 z-50 flex items-center justify-center p-4" @click.self="rejectModal.visible = false">
        <div class="absolute inset-0" style="background: var(--ink); opacity: 0.5"></div>
        <div class="relative ds-card w-full max-w-sm p-5">
          <h3 class="ds-title">驳回帖子</h3>
          <p class="ds-sub mt-1.5 mb-3 truncate">{{ rejectModal.post?.title }}</p>
          <label class="ds-label block mb-1.5" for="reject-reason">驳回原因（必填）</label>
          <textarea
            id="reject-reason"
            v-model="rejectModal.reason"
            rows="3"
            placeholder="请填写驳回原因"
            class="ds-input mb-4 resize-none"
          ></textarea>
          <div class="flex gap-2.5">
            <button type="button" class="ds-btn flex-1" @click="rejectModal.visible = false">取消</button>
            <button
              type="button"
              class="ds-btn ds-btn--primary flex-1"
              :disabled="rejectModal.submitting"
              @click="submitReject"
            >{{ rejectModal.submitting ? '提交中…' : '确定驳回' }}</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 置顶二选一弹窗 -->
    <Teleport to="body">
      <div v-if="topModal.visible" class="fixed inset-0 z-50 flex items-center justify-center p-4" @click.self="topModal.visible = false">
        <div class="absolute inset-0" style="background: var(--ink); opacity: 0.5"></div>
        <div class="relative ds-card w-full max-w-sm p-5">
          <h3 class="ds-title">设置置顶</h3>
          <p class="ds-sub mt-1.5 mb-4 truncate">{{ topModal.post?.title }}</p>
          <div class="space-y-2 mb-2">
            <button
              type="button"
              class="ds-card ds-card--flat w-full px-4 py-2.5 text-left hover:bg-[var(--paper)]"
              @click="submitTop('section')"
            >
              板块置顶<span class="block text-xs mt-0.5" style="color: var(--ink-mute)">仅在该板块列表内置顶展示</span>
            </button>
            <button
              type="button"
              class="ds-card ds-card--flat w-full px-4 py-2.5 text-left hover:bg-[var(--paper)]"
              @click="submitTop('global')"
            >
              全局置顶<span class="block text-xs mt-0.5" style="color: var(--ink-mute)">全站首页置顶，最多 3 条</span>
            </button>
          </div>
          <button type="button" class="ds-btn w-full" @click="topModal.visible = false">取消</button>
        </div>
      </div>
    </Teleport>

    <!-- 删除确认 -->
    <ConfirmDialog
      :visible="deleteModal.visible"
      title="删除帖子"
      :content="`确定删除「${deleteModal.post?.title || ''}」吗？该操作不可恢复。`"
      confirm-text="确定删除"
      danger
      @confirm="submitDelete"
      @cancel="deleteModal.visible = false"
    />
  </div>
</template>
