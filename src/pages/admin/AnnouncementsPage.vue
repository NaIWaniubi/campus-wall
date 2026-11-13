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
  if (!a.is_active) return { label: '已下线', cls: 'st-off' }
  if (a.expires_at && new Date(a.expires_at).getTime() < Date.now()) return { label: '已过期', cls: 'st-exp' }
  return { label: '生效中', cls: 'st-on' }
}
function fmtDate(v: string) {
  if (!v) return '-'
  const d = new Date(v)
  return isNaN(d.getTime()) ? v : d.toLocaleString('zh-CN')
}

// 新建公告弹窗（targetUserId 选填：定向公告仅该用户可见）
const createModal = reactive({ visible: false, title: '', content: '', expiresAt: '', targetUserId: '' })
const submitting = ref(false)
function openCreate() {
  createModal.title = ''
  createModal.content = ''
  createModal.expiresAt = ''
  createModal.targetUserId = ''
  createModal.visible = true
}
async function submitCreate() {
  if (!createModal.title.trim()) return toast.error('请输入公告标题')
  if (!createModal.content.trim()) return toast.error('请输入公告内容')
  const uidStr = createModal.targetUserId.trim()
  const targetUserId = uidStr ? Number(uidStr) : undefined
  if (uidStr && (!Number.isInteger(targetUserId) || (targetUserId as number) <= 0)) {
    return toast.error('定向用户ID需为正整数')
  }
  submitting.value = true
  try {
    await adminApi.createAnnouncement({
      title: createModal.title.trim(),
      content: createModal.content.trim(),
      expiresAt: createModal.expiresAt ? new Date(createModal.expiresAt).toISOString() : undefined,
      targetUserId,
    })
    toast.success(targetUserId ? '定向公告已发布' : '公告已发布')
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
      <p class="text-[12.5px] ds-num" style="color: var(--ink-mute)">共 {{ list.length }} 条公告</p>
      <button type="button" class="ds-btn ds-btn--primary !py-2" @click="openCreate">
        <Plus class="w-4 h-4" />发布公告
      </button>
    </div>

    <!-- 列表 -->
    <div class="space-y-3">
      <div v-for="a in list" :key="a.id" class="ds-card p-4">
        <div class="flex items-start justify-between gap-3 mb-1">
          <div class="flex items-center gap-2 min-w-0 flex-wrap">
            <span class="text-[13.5px] font-extrabold truncate" style="color: var(--ink)">{{ a.title }}</span>
            <span v-if="a.target_user_id" class="ds-tag whitespace-nowrap shrink-0" style="color: var(--violet)">定向 #{{ a.target_user_id }}</span>
            <span class="ds-tag whitespace-nowrap shrink-0" :class="statusOf(a).cls">{{ statusOf(a).label }}</span>
          </div>
          <button
            v-if="a.is_active"
            type="button"
            class="ds-btn ds-btn--sm ds-btn--danger whitespace-nowrap shrink-0"
            @click="offlineTarget = a"
          >
            <MegaphoneOff class="w-3 h-3" />下线
          </button>
        </div>
        <p class="text-[13px] leading-relaxed whitespace-pre-wrap break-words" style="color: var(--ink-soft)">{{ a.content }}</p>
        <div class="flex items-center gap-4 mt-2 text-[11.5px] ds-num" style="color: var(--ink-mute)">
          <span>发布于 {{ fmtDate(a.createdAt) }}</span>
          <span v-if="a.expires_at">到期 {{ fmtDate(a.expires_at) }}</span>
        </div>
      </div>
      <EmptyState v-if="!loading && !list.length" text="暂无公告" />
      <div v-if="loading" class="py-10 text-center text-sm" style="color: var(--ink-mute)">加载中...</div>
    </div>

    <!-- 发布公告弹窗 -->
    <Teleport to="body">
      <div v-if="createModal.visible" class="fixed inset-0 z-50 flex items-center justify-center p-4" @click.self="createModal.visible = false">
        <div class="absolute inset-0" style="background: var(--ink); opacity: 0.55"></div>
        <div class="relative ds-card w-full max-w-md p-6">
          <span class="ds-sticker ds-sticker--coral">NOTICE</span>
          <h3 class="ds-title mt-2 mb-4" style="color: var(--ink)">发布公告</h3>
          <div class="mb-3">
            <label for="ann-title" class="ds-label block mb-1.5">标题 <span style="color: var(--coral)">*</span></label>
            <input
              id="ann-title"
              v-model="createModal.title"
              placeholder="公告标题"
              maxlength="50"
              class="ds-input"
            />
          </div>
          <div class="mb-3">
            <label for="ann-content" class="ds-label block mb-1.5">内容 <span style="color: var(--coral)">*</span></label>
            <textarea
              id="ann-content"
              v-model="createModal.content"
              placeholder="公告内容"
              rows="5"
              maxlength="2000"
              class="ds-input resize-none"
            ></textarea>
          </div>
          <div class="mb-4">
            <label for="ann-expires" class="ds-label block mb-1.5">到期时间（选填，到期后不再弹出）</label>
            <input
              id="ann-expires"
              v-model="createModal.expiresAt"
              type="datetime-local"
              class="ds-input"
            />
          </div>
          <div class="mb-4">
            <label for="ann-target" class="ds-label block mb-1.5">定向用户ID（选填，仅该用户可见此公告）</label>
            <input
              id="ann-target"
              v-model="createModal.targetUserId"
              placeholder="留空则全员可见"
              maxlength="10"
              class="ds-input"
            />
          </div>
          <div class="flex gap-3">
            <button type="button" class="flex-1 ds-btn" @click="createModal.visible = false">取消</button>
            <button type="button" class="flex-1 ds-btn ds-btn--primary" :disabled="submitting" @click="submitCreate">
              {{ submitting ? '发布中...' : '发布' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 下线确认弹窗 -->
    <Teleport to="body">
      <div v-if="offlineTarget" class="fixed inset-0 z-50 flex items-center justify-center p-4" @click.self="offlineTarget = null">
        <div class="absolute inset-0" style="background: var(--ink); opacity: 0.55"></div>
        <div class="relative ds-card w-full max-w-sm p-6">
          <h3 class="ds-title mb-3" style="color: var(--ink)">下线公告</h3>
          <p class="text-[13px] leading-relaxed mb-4" style="color: var(--ink-soft)">确定下线「{{ offlineTarget.title }}」？下线后用户端不再展示。</p>
          <div class="flex gap-3">
            <button type="button" class="flex-1 ds-btn" @click="offlineTarget = null">取消</button>
            <button type="button" class="flex-1 ds-btn ds-btn--danger" @click="submitOffline">确认下线</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.st-on { background: var(--lime); color: var(--ink); border-color: var(--ink); }
.st-off { background: var(--color-surface); color: var(--ink-mute); }
.st-exp { background: var(--coral); color: var(--paper); border-color: var(--ink); }
</style>
