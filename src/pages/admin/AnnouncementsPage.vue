<script setup lang="ts">
/**
 * 公告管理：全量列表 + 新建（title/content 必填、expiresAt 可选）+ 下线
 * 契约：GET/POST /api/announcements、PUT /api/announcements/:id/deactivate（后端无 DELETE，下线即停用）
 */
import { ref, reactive, onMounted } from 'vue'
import { Plus, MegaphoneOff } from '@lucide/vue'
import { adminApi } from '@/utils/api'
import { toast } from '@/utils/request'
import EmptyState from '@/components/EmptyState.vue'

const list = ref<any[]>([])
const loading = ref(false)

async function load() {
  loading.value = true
  try {
    const res: any = await adminApi.announcements()
    list.value = res.data || []
  } catch {
    list.value = []
  } finally {
    loading.value = false
  }
}

function statusOf(a: any): { label: string; cls: string } {
  if (!a.is_active) return { label: '已下线', cls: 'bg-zinc-100 text-zinc-500' }
  if (a.expires_at && new Date(a.expires_at).getTime() < Date.now()) return { label: '已过期', cls: 'bg-amber-100 text-amber-600' }
  return { label: '生效中', cls: 'bg-green-100 text-green-600' }
}
function fmtDate(v: string) {
  if (!v) return '-'
  const d = new Date(v)
  return isNaN(d.getTime()) ? v : d.toLocaleString('zh-CN')
}

// 新建公告弹窗
const createModal = reactive({ visible: false, title: '', content: '', expiresAt: '' })
const submitting = ref(false)
function openCreate() {
  createModal.title = ''
  createModal.content = ''
  createModal.expiresAt = ''
  createModal.visible = true
}
async function submitCreate() {
  if (!createModal.title.trim()) return toast.error('请输入公告标题')
  if (!createModal.content.trim()) return toast.error('请输入公告内容')
  submitting.value = true
  try {
    await adminApi.createAnnouncement({
      title: createModal.title.trim(),
      content: createModal.content.trim(),
      expiresAt: createModal.expiresAt ? new Date(createModal.expiresAt).toISOString() : undefined,
    })
    toast.success('公告已发布')
    createModal.visible = false
    load()
  } catch {
  } finally {
    submitting.value = false
  }
}

// 下线确认（后端无 DELETE 端点，走 PUT deactivate 停用）
const offlineTarget = ref<any>(null)
async function submitOffline() {
  try {
    await adminApi.deactivateAnnouncement(offlineTarget.value.id)
    toast.success('公告已下线')
    offlineTarget.value = null
    load()
  } catch {}
}

onMounted(load)
</script>

<template>
  <div class="space-y-4">
    <!-- 工具栏 -->
    <div class="flex items-center justify-between">
      <p class="text-sm text-zinc-500">共 {{ list.length }} 条公告</p>
      <button class="flex items-center gap-1.5 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-sm font-medium" @click="openCreate">
        <Plus class="w-4 h-4" />发布公告
      </button>
    </div>

    <!-- 列表 -->
    <div class="space-y-3">
      <div v-for="a in list" :key="a.id" class="bg-white rounded-xl p-4 border border-zinc-100 shadow-sm">
        <div class="flex items-start justify-between gap-3 mb-1">
          <div class="flex items-center gap-2 min-w-0">
            <span class="text-sm font-medium text-zinc-900 truncate">{{ a.title }}</span>
            <span class="px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap shrink-0" :class="statusOf(a).cls">{{ statusOf(a).label }}</span>
          </div>
          <button
            v-if="a.is_active"
            class="flex items-center gap-1 px-2 py-1 rounded text-xs bg-red-50 text-red-600 hover:bg-red-100 whitespace-nowrap shrink-0"
            @click="offlineTarget = a"
          >
            <MegaphoneOff class="w-3 h-3" />下线
          </button>
        </div>
        <p class="text-sm text-zinc-600 whitespace-pre-wrap break-words">{{ a.content }}</p>
        <div class="flex items-center gap-4 mt-2 text-xs text-zinc-400">
          <span>发布于 {{ fmtDate(a.createdAt) }}</span>
          <span v-if="a.expires_at">到期 {{ fmtDate(a.expires_at) }}</span>
        </div>
      </div>
      <EmptyState v-if="!loading && !list.length" text="暂无公告" />
      <div v-if="loading" class="py-10 text-center text-sm text-zinc-400">加载中...</div>
    </div>

    <!-- 发布公告弹窗 -->
    <Teleport to="body">
      <div v-if="createModal.visible" class="fixed inset-0 z-50 flex items-center justify-center p-4" @click.self="createModal.visible = false">
        <div class="absolute inset-0 bg-black/40"></div>
        <div class="relative bg-white rounded-2xl w-full max-w-md p-6">
          <h3 class="text-lg font-semibold mb-4">发布公告</h3>
          <div class="mb-3">
            <label class="block text-sm text-zinc-600 mb-1">标题<span class="text-red-500">*</span></label>
            <input
              v-model="createModal.title"
              placeholder="公告标题"
              maxlength="50"
              class="w-full px-3 py-2 rounded-lg bg-zinc-50 border border-zinc-200 focus:border-brand-500 focus:outline-none text-sm"
            />
          </div>
          <div class="mb-3">
            <label class="block text-sm text-zinc-600 mb-1">内容<span class="text-red-500">*</span></label>
            <textarea
              v-model="createModal.content"
              placeholder="公告内容"
              rows="5"
              maxlength="2000"
              class="w-full px-3 py-2 rounded-lg bg-zinc-50 border border-zinc-200 focus:border-brand-500 focus:outline-none text-sm resize-none"
            ></textarea>
          </div>
          <div class="mb-4">
            <label class="block text-sm text-zinc-600 mb-1">到期时间（选填，到期后不再弹出）</label>
            <input
              v-model="createModal.expiresAt"
              type="datetime-local"
              class="w-full px-3 py-2 rounded-lg bg-zinc-50 border border-zinc-200 focus:border-brand-500 focus:outline-none text-sm"
            />
          </div>
          <div class="flex gap-3">
            <button class="flex-1 py-2 rounded-full border border-zinc-200 text-zinc-600 text-sm" @click="createModal.visible = false">取消</button>
            <button class="flex-1 py-2 rounded-full bg-brand-500 hover:bg-brand-600 disabled:opacity-60 text-white text-sm" :disabled="submitting" @click="submitCreate">
              {{ submitting ? '发布中...' : '发布' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 下线确认弹窗 -->
    <Teleport to="body">
      <div v-if="offlineTarget" class="fixed inset-0 z-50 flex items-center justify-center p-4" @click.self="offlineTarget = null">
        <div class="absolute inset-0 bg-black/40"></div>
        <div class="relative bg-white rounded-2xl w-full max-w-sm p-6">
          <h3 class="text-lg font-semibold mb-3">下线公告</h3>
          <p class="text-sm text-zinc-500 mb-4">确定下线「{{ offlineTarget.title }}」？下线后用户端不再展示。</p>
          <div class="flex gap-3">
            <button class="flex-1 py-2 rounded-full border border-zinc-200 text-zinc-600 text-sm" @click="offlineTarget = null">取消</button>
            <button class="flex-1 py-2 rounded-full bg-red-500 hover:bg-red-600 text-white text-sm" @click="submitOffline">确认下线</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
