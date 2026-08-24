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

function statusMeta(s: string) {
  const map: Record<string, { text: string; cls: string }> = {
    published: { text: '已发布', cls: 'bg-green-100 text-green-600' },
    pending_review: { text: '人工审核', cls: 'bg-orange-100 text-orange-600' },
    pending: { text: '待审核', cls: 'bg-amber-100 text-amber-600' },
    rejected: { text: '已驳回', cls: 'bg-red-100 text-red-600' },
    deleted: { text: '已删除', cls: 'bg-zinc-200 text-zinc-500' },
  }
  return map[s] || { text: s || '-', cls: 'bg-zinc-100 text-zinc-500' }
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

async function approve(p: any) {
  try {
    await adminApi.auditPost(p.id, 'approve')
    toast.success('已通过审核')
    load()
  } catch {}
}

const rejectModal = reactive({ visible: false, post: null as any, reason: '' })
function openReject(p: any) {
  rejectModal.post = p
  rejectModal.reason = ''
  rejectModal.visible = true
}
async function submitReject() {
  if (!rejectModal.reason.trim()) return toast.error('请填写驳回原因')
  try {
    await adminApi.auditPost(rejectModal.post.id, 'reject', rejectModal.reason.trim())
    toast.success('已驳回')
    rejectModal.visible = false
    load()
  } catch {}
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

const deleteModal = reactive({ visible: false, post: null as any })
function openDelete(p: any) {
  deleteModal.post = p
  deleteModal.visible = true
}
async function submitDelete() {
  if (!deleteModal.post) return
  try {
    await postApi.delete(deleteModal.post.id)
    toast.success('已删除')
    deleteModal.visible = false
    load()
  } catch {}
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
  <div class="space-y-4">
    <!-- Tab + 搜索 -->
    <div class="bg-white rounded-xl p-3 border border-zinc-100 shadow-sm space-y-3">
      <div class="flex items-center gap-1 overflow-x-auto scrollbar-hide">
        <button
          v-for="t in tabs"
          :key="t.value"
          class="px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition"
          :class="activeTab === t.value ? 'bg-brand-500 text-white font-medium' : 'text-zinc-500 hover:bg-zinc-100'"
          @click="switchTab(t.value)"
        >
          {{ t.label }}
        </button>
      </div>
      <div class="flex items-center gap-2">
        <div class="relative flex-1">
          <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            v-model="keyword"
            placeholder="搜索标题/内容"
            class="w-full pl-9 pr-3 py-2 rounded-lg bg-zinc-50 border border-zinc-200 focus:border-brand-500 focus:outline-none text-sm"
            @keyup.enter="onSearch"
          />
        </div>
        <select
          v-model="sectionId"
          class="px-3 py-2 rounded-lg bg-zinc-50 border border-zinc-200 focus:border-brand-500 focus:outline-none text-sm text-zinc-600"
          @change="onSearch"
        >
          <option value="">全部板块</option>
          <option v-for="s in sections" :key="s.id" :value="s.id">{{ s.name }}</option>
        </select>
        <button class="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-sm font-medium" @click="onSearch">搜索</button>
      </div>
    </div>

    <!-- 列表 -->
    <div class="bg-white rounded-xl border border-zinc-100 shadow-sm overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="text-zinc-500 text-xs bg-zinc-50 border-b border-zinc-100">
            <th class="text-left px-3 py-2 font-medium">帖子</th>
            <th class="text-left px-3 py-2 font-medium">作者</th>
            <th class="text-left px-3 py-2 font-medium">状态</th>
            <th class="text-left px-3 py-2 font-medium">时间</th>
            <th class="text-left px-3 py-2 font-medium">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in list" :key="p.id" class="border-b border-zinc-50 hover:bg-zinc-50/50 align-top">
            <td class="px-3 py-2 max-w-[280px]">
              <div class="flex items-center gap-1">
                <span v-if="p.isTop" class="px-1.5 py-0.5 rounded text-[10px] font-medium bg-brand-100 text-brand-600 flex-shrink-0">
                  {{ p.topType === 'global' ? '全局置顶' : '板块置顶' }}
                </span>
                <span class="text-zinc-900 font-medium truncate">{{ p.title }}</span>
              </div>
              <p class="text-xs text-zinc-400 mt-1 line-clamp-2">{{ p.content }}</p>
              <p v-if="p.status === 'rejected' && p.rejectReason" class="text-xs text-red-500 mt-1">驳回：{{ p.rejectReason }}</p>
            </td>
            <td class="px-3 py-2 text-zinc-600 whitespace-nowrap">{{ p.author?.nickname || '匿名' }}</td>
            <td class="px-3 py-2 whitespace-nowrap">
              <span class="px-2 py-0.5 rounded text-xs font-medium" :class="statusMeta(p.status).cls">{{ statusMeta(p.status).text }}</span>
            </td>
            <td class="px-3 py-2 text-zinc-400 whitespace-nowrap">{{ formatTime(p.createdAt) }}</td>
            <td class="px-3 py-2">
              <div class="flex flex-wrap items-center gap-1 whitespace-nowrap">
                <button
                  v-if="p.status === 'pending' || p.status === 'pending_review'"
                  class="flex items-center gap-1 px-2 py-1 rounded text-xs bg-green-50 text-green-600 hover:bg-green-100"
                  @click="approve(p)"
                >
                  <Check class="w-3 h-3" />通过
                </button>
                <button
                  v-if="p.status === 'pending' || p.status === 'pending_review'"
                  class="flex items-center gap-1 px-2 py-1 rounded text-xs bg-red-50 text-red-600 hover:bg-red-100"
                  @click="openReject(p)"
                >
                  <X class="w-3 h-3" />驳回
                </button>
                <button
                  v-if="p.status === 'published' && !p.isTop"
                  class="flex items-center gap-1 px-2 py-1 rounded text-xs bg-brand-50 text-brand-600 hover:bg-brand-100"
                  @click="openTop(p)"
                >
                  <Pin class="w-3 h-3" />置顶
                </button>
                <button
                  v-if="p.status === 'published' && p.isTop"
                  class="flex items-center gap-1 px-2 py-1 rounded text-xs bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                  @click="toggleTop(p)"
                >
                  <PinOff class="w-3 h-3" />取消置顶
                </button>
                <button
                  v-if="p.status !== 'deleted'"
                  class="flex items-center gap-1 px-2 py-1 rounded text-xs bg-red-50/60 text-red-500 hover:bg-red-100"
                  @click="openDelete(p)"
                >
                  <Trash2 class="w-3 h-3" />删除
                </button>
                <button
                  class="flex items-center gap-1 px-2 py-1 rounded text-xs bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                  @click="viewDetail(p.id)"
                >
                  <ExternalLink class="w-3 h-3" />详情
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <EmptyState v-if="!loading && !list.length" text="暂无帖子" />
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

    <!-- 驳回弹窗（原因必填） -->
    <Teleport to="body">
      <div v-if="rejectModal.visible" class="fixed inset-0 z-50 flex items-center justify-center p-4" @click.self="rejectModal.visible = false">
        <div class="absolute inset-0 bg-black/40"></div>
        <div class="relative bg-white rounded-2xl w-full max-w-sm p-6">
          <h3 class="text-lg font-semibold mb-4">驳回帖子</h3>
          <p class="text-sm text-zinc-500 mb-3 truncate">{{ rejectModal.post?.title }}</p>
          <label class="block text-sm text-zinc-600 mb-1">驳回原因（必填）</label>
          <textarea
            v-model="rejectModal.reason"
            rows="3"
            placeholder="请填写驳回原因"
            class="w-full px-3 py-2 rounded-lg bg-zinc-50 border border-zinc-200 focus:border-brand-500 focus:outline-none text-sm mb-4 resize-none"
          ></textarea>
          <div class="flex gap-3">
            <button class="flex-1 py-2 rounded-full border border-zinc-200 text-zinc-600 text-sm" @click="rejectModal.visible = false">取消</button>
            <button class="flex-1 py-2 rounded-full bg-brand-500 hover:bg-brand-600 text-white text-sm" @click="submitReject">确定驳回</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 置顶二选一弹窗 -->
    <Teleport to="body">
      <div v-if="topModal.visible" class="fixed inset-0 z-50 flex items-center justify-center p-4" @click.self="topModal.visible = false">
        <div class="absolute inset-0 bg-black/40"></div>
        <div class="relative bg-white rounded-2xl w-full max-w-sm p-6">
          <h3 class="text-lg font-semibold mb-3">设置置顶</h3>
          <p class="text-sm text-zinc-500 mb-4 truncate">{{ topModal.post?.title }}</p>
          <div class="space-y-2 mb-2">
            <button
              class="w-full px-4 py-2.5 rounded-lg border border-zinc-200 text-sm text-left hover:border-brand-400 hover:bg-brand-50/50"
              @click="submitTop('section')"
            >
              板块置顶<span class="block text-xs text-zinc-400 mt-0.5">仅在该板块列表内置顶展示</span>
            </button>
            <button
              class="w-full px-4 py-2.5 rounded-lg border border-zinc-200 text-sm text-left hover:border-brand-400 hover:bg-brand-50/50"
              @click="submitTop('global')"
            >
              全局置顶<span class="block text-xs text-zinc-400 mt-0.5">全站首页置顶，最多 3 条</span>
            </button>
          </div>
          <button class="w-full py-2 rounded-full border border-zinc-200 text-zinc-600 text-sm" @click="topModal.visible = false">取消</button>
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
