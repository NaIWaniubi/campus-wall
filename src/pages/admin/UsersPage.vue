<script setup lang="ts">
/**
 * 用户管理：关键词搜索 + 分页列表 + 封禁/解封 + 重置密码（一次性密码） + 信誉调整
 * 列表字段对齐 GET /api/admin/users（snake_case：student_id/credit_score/ban_reason）
 */
import { ref, reactive, onMounted } from 'vue'
import { Search, Ban, KeyRound, Star, ChevronLeft, ChevronRight } from '@lucide/vue'
import { adminApi } from '@/utils/api'
import { formatTime } from '@/utils/helpers'
import { toast } from '@/utils/request'
import CreditBadge from '@/components/CreditBadge.vue'
import EmptyState from '@/components/EmptyState.vue'

const list = ref<any[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 20
const loading = ref(false)
const keyword = ref('')
const statusFilter = ref('') // '' = 全部
const roleFilter = ref('')   // '' = 全部

async function load() {
  loading.value = true
  try {
    const res: any = await adminApi.users({
      keyword: keyword.value || undefined,
      status: statusFilter.value || undefined,
      role: roleFilter.value || undefined,
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

function onSearch() {
  page.value = 1
  load()
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

const ROLE_LABELS: Record<string, string> = {
  user: '普通用户',
  section_admin: '板块管理员',
  super_admin: '超级管理员',
}

// 二次确认弹窗：所有「写操作」（封禁/解封、重置密码、调整信誉）都先经此，确认后再走真正的表单弹窗
// 防止管理员误点造成不可逆后果。
type ConfirmKind = 'ban' | 'unban' | 'resetPassword' | 'adjustCredit'
interface ConfirmState {
  visible: boolean
  title: string
  body: string
  target: any | null
  kind: ConfirmKind | ''
  submitting: boolean
  meta?: Record<string, unknown>
}
const confirmDialog = reactive<ConfirmState>({
  visible: false,
  title: '',
  body: '',
  target: null,
  kind: '',
  submitting: false,
  meta: {},
})

// 锁：防止在 onConfirm 内异步等待时再次点击「确定」
function lockConfirm() { confirmDialog.submitting = true }
function unlockConfirm() { confirmDialog.submitting = false }
function openConfirm(kind: ConfirmKind, u: any, body: string, title?: string, meta?: Record<string, unknown>) {
  confirmDialog.kind = kind
  confirmDialog.target = u
  confirmDialog.body = body
  confirmDialog.title = title || (
    kind === 'ban' ? '确认封禁该用户？' :
    kind === 'unban' ? '确认解封该用户？' :
    kind === 'resetPassword' ? '确认重置该用户密码？' :
    '确认调整该用户信誉分？'
  )
  confirmDialog.meta = meta || {}
  confirmDialog.submitting = false
  confirmDialog.visible = true
}
function closeConfirm() {
  confirmDialog.visible = false
  confirmDialog.target = null
  confirmDialog.kind = ''
  confirmDialog.submitting = false
  confirmDialog.meta = {}
}
async function onConfirm() {
  if (confirmDialog.submitting) return
  lockConfirm()
  try {
    switch (confirmDialog.kind) {
      case 'ban':
      case 'unban':
        openBan(confirmDialog.target)
        break
      case 'resetPassword':
        openPwd(confirmDialog.target)
        break
      case 'adjustCredit':
        openCredit(confirmDialog.target)
        break
    }
    closeConfirm()
  } finally {
    unlockConfirm()
  }
}

// 封禁/解封弹窗
const banModal = reactive({ visible: false, user: null as any, action: 'ban' as 'ban' | 'unban', reason: '', duration: '7', submitting: false })
function openBan(u: any) {
  if (!u) return
  banModal.user = u
  banModal.action = u.status === 'banned' ? 'unban' : 'ban'
  banModal.reason = u.ban_reason || ''
  banModal.duration = '7'
  banModal.submitting = false
  banModal.visible = true
}
async function submitBan() {
  if (banModal.submitting) return
  if (banModal.action === 'ban' && !banModal.reason.trim()) return toast.error('请输入封禁原因')
  banModal.submitting = true
  try {
    await adminApi.banUser(banModal.user.id, { action: banModal.action, reason: banModal.reason, duration: banModal.duration })
    toast.success(banModal.action === 'ban' ? '已封禁' : '已解封')
    banModal.visible = false
    load()
  } catch {
  } finally {
    banModal.submitting = false
  }
}

// 重置密码弹窗：前端生成一次性密码，提交成功后展示给管理员转告用户
const pwdModal = reactive({ visible: false, user: null as any, password: '', done: false, submitting: false })
function genPassword() {
  // crypto.getRandomValues 4 字节 → 8 位 hex（Web Crypto 等价于后端 randomBytes(4).toString('hex')）
  return [...crypto.getRandomValues(new Uint8Array(4))].map((b) => b.toString(16).padStart(2, '0')).join('')
}
async function copyPwd() {
  try {
    await navigator.clipboard.writeText(pwdModal.password)
    toast.success('已复制')
  } catch {
    toast.error('复制失败，请手动选择复制')
  }
}
function openPwd(u: any) {
  if (!u) return
  pwdModal.user = u
  pwdModal.password = genPassword()
  pwdModal.done = false
  pwdModal.submitting = false
  pwdModal.visible = true
}
async function submitPwd() {
  if (pwdModal.submitting) return
  pwdModal.submitting = true
  try {
    await adminApi.resetPassword(pwdModal.user.id, pwdModal.password)
    pwdModal.done = true
    toast.success('密码已重置')
  } catch {
  } finally {
    pwdModal.submitting = false
  }
}

// 信誉调整弹窗
const creditModal = reactive({ visible: false, user: null as any, score: 0, reason: '', submitting: false })
function openCredit(u: any) {
  if (!u) return
  creditModal.user = u
  creditModal.score = 0
  creditModal.reason = ''
  creditModal.submitting = false
  creditModal.visible = true
}
async function submitCredit() {
  if (creditModal.submitting) return
  if (!creditModal.score) return toast.error('请输入非零分值')
  creditModal.submitting = true
  try {
    await adminApi.adjustCredit(creditModal.user.id, creditModal.score, creditModal.reason)
    toast.success('信誉分已调整')
    creditModal.visible = false
    load()
  } catch {
  } finally {
    creditModal.submitting = false
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
          <span class="ds-sticker ds-sticker--coral">USER OPS</span>
          <span class="ds-label">账号治理</span>
        </div>
        <h1 class="ds-display ds-display-lg" style="color: var(--ink)">用户管理</h1>
      </div>
      <div class="flex items-baseline gap-2">
        <span class="ds-display ds-display-lg ds-num" style="color: var(--ink)">{{ total }}</span>
        <span class="ds-label">USERS</span>
      </div>
    </header>

    <!-- 搜索栏 -->
    <section class="ds-card p-3 md:p-4 flex items-center gap-2 flex-wrap">
      <div class="relative flex-1 max-w-md min-w-[200px]">
        <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style="color: var(--ink-mute)" />
        <input
          v-model="keyword"
          placeholder="搜索学号/昵称"
          class="ds-input"
          style="padding-left: 38px"
          @keyup.enter="onSearch"
        />
      </div>
      <select v-model="statusFilter" class="ds-input" style="width: auto; min-width: 108px" @change="onSearch">
        <option value="">全部状态</option>
        <option value="active">正常</option>
        <option value="banned">封禁</option>
      </select>
      <select v-model="roleFilter" class="ds-input" style="width: auto; min-width: 108px" @change="onSearch">
        <option value="">全部角色</option>
        <option value="user">普通用户</option>
        <option value="section_admin">板块管理员</option>
        <option value="super_admin">超级管理员</option>
      </select>
      <button type="button" class="ds-btn ds-btn--primary" @click="onSearch">搜索</button>
    </section>

    <!-- 列表：纸感表格 -->
    <section class="ds-card ds-card--flat overflow-x-auto">
      <table class="w-full text-[13px]">
        <thead>
          <tr style="background: var(--paper); border-bottom: 1.5px solid var(--ink)">
            <th class="ds-label text-left px-3 py-2.5 font-normal" style="color: var(--ink-soft)">学号</th>
            <th class="ds-label text-left px-3 py-2.5 font-normal" style="color: var(--ink-soft)">昵称</th>
            <th class="ds-label text-left px-3 py-2.5 font-normal" style="color: var(--ink-soft)">学院</th>
            <th class="ds-label text-left px-3 py-2.5 font-normal" style="color: var(--ink-soft)">信誉分</th>
            <th class="ds-label text-left px-3 py-2.5 font-normal" style="color: var(--ink-soft)">角色</th>
            <th class="ds-label text-left px-3 py-2.5 font-normal" style="color: var(--ink-soft)">状态</th>
            <th class="ds-label text-left px-3 py-2.5 font-normal" style="color: var(--ink-soft)">注册时间</th>
            <th class="ds-label text-left px-3 py-2.5 font-normal" style="color: var(--ink-soft)">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="u in list"
            :key="u.id"
            class="align-top hover:bg-[var(--paper)]"
            style="border-bottom: 1px solid var(--hairline)"
          >
            <td class="px-3 py-2.5 whitespace-nowrap ds-num" style="color: var(--ink-soft)">{{ u.student_id }}</td>
            <td class="px-3 py-2.5">
              <div class="flex items-center gap-2">
                <div
                  class="w-7 h-7 flex items-center justify-center text-[11px] font-bold overflow-hidden shrink-0"
                  style="border-radius: 8px; border: 1.5px solid var(--ink); background: var(--lime); color: var(--ink)"
                >
                  <img v-if="u.avatar" :src="u.avatar" class="w-full h-full object-cover" alt="" />
                  <span v-else>{{ u.nickname?.charAt(0) }}</span>
                </div>
                <span class="font-semibold" style="color: var(--ink)">{{ u.nickname }}</span>
              </div>
            </td>
            <td class="px-3 py-2.5" style="color: var(--ink-mute)">{{ u.college || '-' }}</td>
            <td class="px-3 py-2.5">
              <div class="flex items-center gap-1.5">
                <span class="font-bold ds-num" style="color: var(--ink)">{{ u.credit_score }}</span>
                <CreditBadge :score="u.credit_score" size="sm" />
              </div>
            </td>
            <td class="px-3 py-2.5 whitespace-nowrap" style="color: var(--ink-soft)">{{ ROLE_LABELS[u.role] || u.role }}</td>
            <td class="px-3 py-2.5 whitespace-nowrap">
              <span class="ds-tag">
                <span class="ds-tag-dot" :style="{ background: u.status === 'banned' ? 'var(--coral)' : 'var(--lime)' }"></span>
                {{ u.status === 'banned' ? '封禁' : '正常' }}
              </span>
              <p v-if="u.status === 'banned' && u.ban_reason" class="text-[11px] mt-1 max-w-[180px]" style="color: var(--ink-mute)">{{ u.ban_reason }}</p>
            </td>
            <td class="px-3 py-2.5 whitespace-nowrap ds-num text-[12px]" style="color: var(--ink-mute)">{{ formatTime(u.createdAt) }}</td>
            <td class="px-3 py-2.5">
              <div class="flex items-center gap-1.5 whitespace-nowrap">
                <button
                  type="button"
                  class="ds-btn ds-btn--sm"
                  :class="u.status === 'banned' ? '' : 'ds-btn--danger'"
                  @click="openConfirm(u.status === 'banned' ? 'unban' : 'ban', u, `${u.status === 'banned' ? '解封' : '封禁'}后该用户${u.status === 'banned' ? '将恢复' : '将无法'}登录`, undefined, { reason: u.ban_reason || '', duration: '7' })"
                >
                  <Ban class="w-3 h-3" />{{ u.status === 'banned' ? '解封' : '封禁' }}
                </button>
                <button type="button" class="ds-btn ds-btn--sm" @click="openConfirm('resetPassword', u, `将生成新的 8 位一次性密码并立即生效`);">
                  <KeyRound class="w-3 h-3" />重置密码
                </button>
                <button type="button" class="ds-btn ds-btn--sm" @click="openConfirm('adjustCredit', u, '可在下一步弹窗中输入分值与理由')">
                  <Star class="w-3 h-3" />信誉
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <EmptyState v-if="!loading && !list.length" text="暂无用户数据" />
      <div v-if="loading" class="py-10 text-center ds-sub">加载中...</div>
    </section>

    <!-- 分页 -->
    <div class="flex items-center justify-between text-[13px]" style="color: var(--ink-mute)">
      <span class="ds-num">共 {{ total }} 条，第 {{ page }} 页 / 共 {{ totalPages() }} 页</span>
      <div class="flex gap-2">
        <button type="button" class="ds-btn ds-btn--sm" aria-label="上一页" :disabled="page <= 1" @click="prevPage">
          <ChevronLeft class="w-4 h-4" />
        </button>
        <button type="button" class="ds-btn ds-btn--sm" aria-label="下一页" :disabled="page * pageSize >= total" @click="nextPage">
          <ChevronRight class="w-4 h-4" />
        </button>
      </div>
    </div>

    <!-- 二次确认弹窗（封禁/解封/重置密码/调整信誉） -->
    <Teleport to="body">
      <div v-if="confirmDialog.visible" class="fixed inset-0 z-50 flex items-center justify-center p-4" @click.self="closeConfirm">
        <div class="absolute inset-0" style="background: rgb(20 17 15 / 0.55)"></div>
        <div class="relative ds-card w-full max-w-sm p-5">
          <div class="flex items-center gap-2 mb-3">
            <span class="ds-sticker ds-sticker--coral">CONFIRM</span>
            <span class="ds-label">二次确认</span>
          </div>
          <h3 class="ds-title mb-3" style="color: var(--ink)">{{ confirmDialog.title }}</h3>
          <!-- 目标用户信息 -->
          <div v-if="confirmDialog.target" class="flex items-center gap-3 p-3 mb-3" style="background: var(--paper); border-radius: var(--ds-radius-sm); border: 1px solid var(--hairline)">
            <div
              class="w-9 h-9 flex items-center justify-center text-[11px] font-bold overflow-hidden shrink-0"
              style="border-radius: 9px; border: 1.5px solid var(--ink); background: var(--lime); color: var(--ink)"
            >
              <img v-if="confirmDialog.target.avatar" :src="confirmDialog.target.avatar" class="w-full h-full object-cover" alt="" />
              <span v-else>{{ confirmDialog.target.nickname?.charAt(0) }}</span>
            </div>
            <div class="min-w-0 flex-1">
              <div class="text-[13px] font-bold truncate" style="color: var(--ink)">{{ confirmDialog.target.nickname }}</div>
              <div class="text-[12px] truncate ds-num" style="color: var(--ink-mute)">学号 {{ confirmDialog.target.student_id }} · 当前信誉 {{ confirmDialog.target.credit_score }}</div>
            </div>
          </div>
          <!-- 动作预览 -->
          <div class="text-[13px] mb-2" style="color: var(--ink-soft)">{{ confirmDialog.body }}</div>
          <ul v-if="confirmDialog.kind === 'ban'" class="text-[12px] space-y-0.5 mb-4" style="color: var(--ink-mute)">
            <li>· 动作：封禁 7 天</li>
            <li>· 原因：{{ (confirmDialog.meta?.reason as string) || '（下一步填写）' }}</li>
          </ul>
          <ul v-else-if="confirmDialog.kind === 'resetPassword'" class="text-[12px] space-y-0.5 mb-4" style="color: var(--ink-mute)">
            <li>· 动作：重置密码</li>
            <li>· 新密码：********（下一步生成 8 位一次性密码）</li>
          </ul>
          <ul v-else-if="confirmDialog.kind === 'adjustCredit'" class="text-[12px] space-y-0.5 mb-4" style="color: var(--ink-mute)">
            <li>· 当前：{{ confirmDialog.target?.credit_score }}</li>
            <li>· 新值：在下一步弹窗中输入</li>
          </ul>
          <div v-else class="mb-4"></div>
          <p class="ds-sub mb-3">本操作将被记录到审计日志，包含操作者、时间与原因。</p>
          <div class="flex gap-3">
            <button type="button" class="ds-btn flex-1" @click="closeConfirm">取消</button>
            <button
              type="button"
              class="ds-btn ds-btn--primary flex-1"
              :disabled="confirmDialog.submitting"
              @click="onConfirm"
            >
              {{ confirmDialog.submitting ? '处理中…' : '确定' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 封禁/解封弹窗 -->
    <Teleport to="body">
      <div v-if="banModal.visible" class="fixed inset-0 z-50 flex items-center justify-center p-4" @click.self="banModal.visible = false">
        <div class="absolute inset-0" style="background: rgb(20 17 15 / 0.55)"></div>
        <div class="relative ds-card w-full max-w-sm p-5">
          <div class="flex items-center gap-2 mb-3">
            <span class="ds-sticker" :class="banModal.action === 'ban' ? 'ds-sticker--coral' : 'ds-sticker--sky'">{{ banModal.action === 'ban' ? 'BAN' : 'UNBAN' }}</span>
            <span class="ds-label">{{ banModal.action === 'ban' ? '处罚' : '恢复' }}</span>
          </div>
          <h3 class="ds-title mb-2" style="color: var(--ink)">{{ banModal.action === 'ban' ? '封禁用户' : '解封用户' }}</h3>
          <p class="text-[13px] mb-4 ds-num" style="color: var(--ink-mute)">{{ banModal.user?.nickname }}（{{ banModal.user?.student_id }}）</p>
          <template v-if="banModal.action === 'ban'">
            <div class="mb-3">
              <label class="ds-label block mb-1.5">封禁原因</label>
              <input
                v-model="banModal.reason"
                placeholder="请输入封禁原因"
                class="ds-input"
              />
            </div>
            <div class="mb-4">
              <label class="ds-label block mb-1.5">封禁时长</label>
              <select v-model="banModal.duration" class="ds-input">
                <option value="1">1天</option>
                <option value="7">7天</option>
                <option value="30">30天</option>
                <option value="forever">永久</option>
              </select>
            </div>
          </template>
          <p v-else class="text-[13px] mb-4" style="color: var(--ink-soft)">确定要解封该用户吗？</p>
          <div class="flex gap-3">
            <button type="button" class="ds-btn flex-1" @click="banModal.visible = false">取消</button>
            <button
              type="button"
              class="ds-btn flex-1"
              :class="banModal.action === 'ban' ? 'ds-btn--danger' : 'ds-btn--primary'"
              :disabled="banModal.submitting"
              @click="submitBan"
            >{{ banModal.submitting ? '提交中…' : '确定' }}</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 重置密码弹窗 -->
    <Teleport to="body">
      <div v-if="pwdModal.visible" class="fixed inset-0 z-50 flex items-center justify-center p-4" @click.self="pwdModal.visible = false">
        <div class="absolute inset-0" style="background: rgb(20 17 15 / 0.55)"></div>
        <div class="relative ds-card w-full max-w-sm p-5">
          <div class="flex items-center gap-2 mb-3">
            <span class="ds-sticker ds-sticker--violet">RESET</span>
            <span class="ds-label">凭据</span>
          </div>
          <h3 class="ds-title mb-2" style="color: var(--ink)">重置密码</h3>
          <p class="text-[13px] mb-4 ds-num" style="color: var(--ink-mute)">{{ pwdModal.user?.nickname }}（{{ pwdModal.user?.student_id }}）</p>
          <template v-if="!pwdModal.done">
            <label class="ds-label block mb-1.5">一次性新密码（请妥善转告用户）</label>
            <input
              :value="pwdModal.password"
              readonly
              class="ds-input font-mono tracking-wider mb-4 select-all"
            />
            <div class="flex gap-3">
              <button type="button" class="ds-btn flex-1" @click="pwdModal.visible = false">取消</button>
              <button type="button" class="ds-btn ds-btn--primary flex-1" :disabled="pwdModal.submitting" @click="submitPwd">{{ pwdModal.submitting ? '提交中…' : '确认重置' }}</button>
            </div>
          </template>
          <template v-else>
            <p class="text-[13px] mb-1.5" style="color: var(--ink-soft)">已生效的一次性新密码：</p>
            <p
              class="text-[15px] font-mono font-bold tracking-wider px-3 py-2 mb-4 select-all ds-num"
              style="background: var(--lime); color: var(--ink); border: 1.5px solid var(--ink); border-radius: var(--ds-radius-sm); box-shadow: var(--shadow-hard-sm)"
            >{{ pwdModal.password }}</p>
            <div class="flex gap-3">
              <button type="button" class="ds-btn flex-1" @click="copyPwd">复制密码</button>
              <button type="button" class="ds-btn ds-btn--primary flex-1" @click="pwdModal.visible = false">我已记录，关闭</button>
            </div>
          </template>
        </div>
      </div>
    </Teleport>

    <!-- 信誉调整弹窗 -->
    <Teleport to="body">
      <div v-if="creditModal.visible" class="fixed inset-0 z-50 flex items-center justify-center p-4" @click.self="creditModal.visible = false">
        <div class="absolute inset-0" style="background: rgb(20 17 15 / 0.55)"></div>
        <div class="relative ds-card w-full max-w-sm p-5">
          <div class="flex items-center gap-2 mb-3">
            <span class="ds-sticker">CREDIT</span>
            <span class="ds-label">信誉</span>
          </div>
          <h3 class="ds-title mb-2" style="color: var(--ink)">调整信誉分</h3>
          <p class="text-[13px] mb-4" style="color: var(--ink-soft)">
            {{ creditModal.user?.nickname }}（当前
            <span class="font-bold ds-num" style="color: var(--ink)">{{ creditModal.user?.credit_score }}</span>
            ，调整后
            <span class="font-bold ds-num" style="color: var(--violet)">{{ Math.max(0, Math.min(120, (creditModal.user?.credit_score || 0) + Number(creditModal.score) || 0)) }}</span>
            ）
          </p>
          <label class="ds-label block mb-1.5">分值（正数增加，负数减少）</label>
          <input
            v-model.number="creditModal.score"
            type="number"
            placeholder="如 10 或 -10"
            class="ds-input mb-3"
          />
          <label class="ds-label block mb-1.5">理由</label>
          <input
            v-model="creditModal.reason"
            placeholder="调整原因"
            class="ds-input mb-4"
          />
          <div class="flex gap-3">
            <button type="button" class="ds-btn flex-1" @click="creditModal.visible = false">取消</button>
            <button
              type="button"
              class="ds-btn flex-1"
              :class="creditModal.score < 0 ? 'ds-btn--danger' : 'ds-btn--primary'"
              :disabled="creditModal.submitting"
              @click="submitCredit"
            >{{ creditModal.submitting ? '提交中…' : '确定' }}</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
