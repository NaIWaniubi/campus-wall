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

async function load() {
  loading.value = true
  try {
    const res: any = await adminApi.users({
      keyword: keyword.value || undefined,
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

// 封禁/解封弹窗
const banModal = reactive({ visible: false, user: null as any, action: 'ban' as 'ban' | 'unban', reason: '', duration: '7' })
function openBan(u: any) {
  banModal.user = u
  banModal.action = u.status === 'banned' ? 'unban' : 'ban'
  banModal.reason = u.ban_reason || ''
  banModal.duration = '7'
  banModal.visible = true
}
async function submitBan() {
  if (banModal.action === 'ban' && !banModal.reason.trim()) return toast.error('请输入封禁原因')
  try {
    await adminApi.banUser(banModal.user.id, { action: banModal.action, reason: banModal.reason, duration: banModal.duration })
    toast.success(banModal.action === 'ban' ? '已封禁' : '已解封')
    banModal.visible = false
    load()
  } catch {}
}

// 重置密码弹窗：前端生成一次性密码，提交成功后展示给管理员转告用户
const pwdModal = reactive({ visible: false, user: null as any, password: '', done: false })
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
  pwdModal.user = u
  pwdModal.password = genPassword()
  pwdModal.done = false
  pwdModal.visible = true
}
async function submitPwd() {
  try {
    await adminApi.resetPassword(pwdModal.user.id, pwdModal.password)
    pwdModal.done = true
    toast.success('密码已重置')
  } catch {}
}

// 信誉调整弹窗
const creditModal = reactive({ visible: false, user: null as any, score: 0, reason: '' })
function openCredit(u: any) {
  creditModal.user = u
  creditModal.score = 0
  creditModal.reason = ''
  creditModal.visible = true
}
async function submitCredit() {
  if (!creditModal.score) return toast.error('请输入非零分值')
  try {
    await adminApi.adjustCredit(creditModal.user.id, creditModal.score, creditModal.reason)
    toast.success('信誉分已调整')
    creditModal.visible = false
    load()
  } catch {}
}

onMounted(load)
</script>

<template>
  <div class="space-y-4">
    <!-- 搜索栏 -->
    <div class="bg-white rounded-xl p-3 border border-zinc-100 shadow-sm flex items-center gap-2">
      <div class="relative flex-1 max-w-md">
        <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
        <input
          v-model="keyword"
          placeholder="搜索学号/昵称"
          class="w-full pl-9 pr-3 py-2 rounded-lg bg-zinc-50 border border-zinc-200 focus:border-brand-500 focus:outline-none text-sm"
          @keyup.enter="onSearch"
        />
      </div>
      <button class="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-sm font-medium" @click="onSearch">搜索</button>
    </div>

    <!-- 列表 -->
    <div class="bg-white rounded-xl border border-zinc-100 shadow-sm overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="text-zinc-500 text-xs bg-zinc-50 border-b border-zinc-100">
            <th class="text-left px-3 py-2 font-medium">学号</th>
            <th class="text-left px-3 py-2 font-medium">昵称</th>
            <th class="text-left px-3 py-2 font-medium">学院</th>
            <th class="text-left px-3 py-2 font-medium">信誉分</th>
            <th class="text-left px-3 py-2 font-medium">角色</th>
            <th class="text-left px-3 py-2 font-medium">状态</th>
            <th class="text-left px-3 py-2 font-medium">注册时间</th>
            <th class="text-left px-3 py-2 font-medium">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="u in list" :key="u.id" class="border-b border-zinc-50 hover:bg-zinc-50/50">
            <td class="px-3 py-2 text-zinc-600 whitespace-nowrap">{{ u.student_id }}</td>
            <td class="px-3 py-2">
              <div class="flex items-center gap-2">
                <div class="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center text-brand-600 text-xs font-medium overflow-hidden shrink-0">
                  <img v-if="u.avatar" :src="u.avatar" class="w-full h-full object-cover" alt="" />
                  <span v-else>{{ u.nickname?.charAt(0) }}</span>
                </div>
                <span class="text-zinc-900">{{ u.nickname }}</span>
              </div>
            </td>
            <td class="px-3 py-2 text-zinc-600">{{ u.college || '-' }}</td>
            <td class="px-3 py-2">
              <div class="flex items-center gap-1.5">
                <span class="font-medium text-zinc-900">{{ u.credit_score }}</span>
                <CreditBadge :score="u.credit_score" size="sm" />
              </div>
            </td>
            <td class="px-3 py-2 text-zinc-600 whitespace-nowrap">{{ ROLE_LABELS[u.role] || u.role }}</td>
            <td class="px-3 py-2 whitespace-nowrap">
              <span
                class="px-2 py-0.5 rounded text-xs font-medium"
                :class="u.status === 'banned' ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'"
              >
                {{ u.status === 'banned' ? '封禁' : '正常' }}
              </span>
              <p v-if="u.status === 'banned' && u.ban_reason" class="text-xs text-zinc-400 mt-0.5">{{ u.ban_reason }}</p>
            </td>
            <td class="px-3 py-2 text-zinc-400 whitespace-nowrap">{{ formatTime(u.createdAt) }}</td>
            <td class="px-3 py-2">
              <div class="flex items-center gap-1.5 whitespace-nowrap">
                <button
                  class="flex items-center gap-1 px-2 py-1 rounded text-xs"
                  :class="u.status === 'banned' ? 'bg-green-50 text-green-600 hover:bg-green-100' : 'bg-red-50 text-red-600 hover:bg-red-100'"
                  @click="openBan(u)"
                >
                  <Ban class="w-3 h-3" />{{ u.status === 'banned' ? '解封' : '封禁' }}
                </button>
                <button class="flex items-center gap-1 px-2 py-1 rounded text-xs bg-blue-50 text-blue-600 hover:bg-blue-100" @click="openPwd(u)">
                  <KeyRound class="w-3 h-3" />重置密码
                </button>
                <button class="flex items-center gap-1 px-2 py-1 rounded text-xs bg-amber-50 text-amber-600 hover:bg-amber-100" @click="openCredit(u)">
                  <Star class="w-3 h-3" />信誉
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <EmptyState v-if="!loading && !list.length" text="暂无用户数据" />
      <div v-if="loading" class="py-10 text-center text-sm text-zinc-400">加载中...</div>
    </div>

    <!-- 分页 -->
    <div class="flex items-center justify-between text-sm text-zinc-500">
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

    <!-- 封禁/解封弹窗 -->
    <Teleport to="body">
      <div v-if="banModal.visible" class="fixed inset-0 z-50 flex items-center justify-center p-4" @click.self="banModal.visible = false">
        <div class="absolute inset-0 bg-black/40"></div>
        <div class="relative bg-white rounded-2xl w-full max-w-sm p-6">
          <h3 class="text-lg font-semibold mb-4">{{ banModal.action === 'ban' ? '封禁用户' : '解封用户' }}</h3>
          <p class="text-sm text-zinc-500 mb-3">{{ banModal.user?.nickname }}（{{ banModal.user?.student_id }}）</p>
          <template v-if="banModal.action === 'ban'">
            <div class="mb-3">
              <label class="block text-sm text-zinc-600 mb-1">封禁原因</label>
              <input
                v-model="banModal.reason"
                placeholder="请输入封禁原因"
                class="w-full px-3 py-2 rounded-lg bg-zinc-50 border border-zinc-200 focus:border-brand-500 focus:outline-none text-sm"
              />
            </div>
            <div class="mb-4">
              <label class="block text-sm text-zinc-600 mb-1">封禁时长</label>
              <select v-model="banModal.duration" class="w-full px-3 py-2 rounded-lg bg-zinc-50 border border-zinc-200 text-sm focus:outline-none">
                <option value="1">1天</option>
                <option value="7">7天</option>
                <option value="30">30天</option>
                <option value="forever">永久</option>
              </select>
            </div>
          </template>
          <p v-else class="text-sm text-zinc-500 mb-4">确定要解封该用户吗？</p>
          <div class="flex gap-3">
            <button class="flex-1 py-2 rounded-full border border-zinc-200 text-zinc-600 text-sm" @click="banModal.visible = false">取消</button>
            <button class="flex-1 py-2 rounded-full bg-brand-500 hover:bg-brand-600 text-white text-sm" @click="submitBan">确定</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 重置密码弹窗 -->
    <Teleport to="body">
      <div v-if="pwdModal.visible" class="fixed inset-0 z-50 flex items-center justify-center p-4" @click.self="pwdModal.visible = false">
        <div class="absolute inset-0 bg-black/40"></div>
        <div class="relative bg-white rounded-2xl w-full max-w-sm p-6">
          <h3 class="text-lg font-semibold mb-4">重置密码</h3>
          <p class="text-sm text-zinc-500 mb-3">{{ pwdModal.user?.nickname }}（{{ pwdModal.user?.student_id }}）</p>
          <template v-if="!pwdModal.done">
            <label class="block text-sm text-zinc-600 mb-1">一次性新密码（请妥善转告用户）</label>
            <input
              :value="pwdModal.password"
              readonly
              class="w-full px-3 py-2 rounded-lg bg-zinc-50 border border-zinc-200 focus:outline-none text-sm font-mono tracking-wider mb-4 select-all"
            />
            <div class="flex gap-3">
              <button class="flex-1 py-2 rounded-full border border-zinc-200 text-zinc-600 text-sm" @click="pwdModal.visible = false">取消</button>
              <button class="flex-1 py-2 rounded-full bg-brand-500 hover:bg-brand-600 text-white text-sm" @click="submitPwd">确认重置</button>
            </div>
          </template>
          <template v-else>
            <p class="text-sm text-zinc-600 mb-1">已生效的一次性新密码：</p>
            <p class="text-base font-mono font-semibold text-brand-600 tracking-wider bg-brand-50 rounded-lg px-3 py-2 mb-4 select-all">{{ pwdModal.password }}</p>
            <div class="flex gap-3">
              <button class="flex-1 py-2 rounded-full border border-brand-200 text-brand-600 text-sm hover:bg-brand-50" @click="copyPwd">复制密码</button>
              <button class="flex-1 py-2 rounded-full bg-brand-500 hover:bg-brand-600 text-white text-sm" @click="pwdModal.visible = false">我已记录，关闭</button>
            </div>
          </template>
        </div>
      </div>
    </Teleport>

    <!-- 信誉调整弹窗 -->
    <Teleport to="body">
      <div v-if="creditModal.visible" class="fixed inset-0 z-50 flex items-center justify-center p-4" @click.self="creditModal.visible = false">
        <div class="absolute inset-0 bg-black/40"></div>
        <div class="relative bg-white rounded-2xl w-full max-w-sm p-6">
          <h3 class="text-lg font-semibold mb-4">调整信誉分</h3>
          <p class="text-sm text-zinc-500 mb-3">
            {{ creditModal.user?.nickname }}（当前
            <span class="font-medium text-zinc-900">{{ creditModal.user?.credit_score }}</span>
            ，调整后
            <span class="font-medium text-brand-600">{{ Math.max(0, Math.min(120, (creditModal.user?.credit_score || 0) + Number(creditModal.score) || 0)) }}</span>
            ）
          </p>
          <label class="block text-sm text-zinc-600 mb-1">分值（正数增加，负数减少）</label>
          <input
            v-model.number="creditModal.score"
            type="number"
            placeholder="如 10 或 -10"
            class="w-full px-3 py-2 rounded-lg bg-zinc-50 border border-zinc-200 focus:border-brand-500 focus:outline-none text-sm mb-3"
          />
          <label class="block text-sm text-zinc-600 mb-1">理由</label>
          <input
            v-model="creditModal.reason"
            placeholder="调整原因"
            class="w-full px-3 py-2 rounded-lg bg-zinc-50 border border-zinc-200 focus:border-brand-500 focus:outline-none text-sm mb-4"
          />
          <div class="flex gap-3">
            <button class="flex-1 py-2 rounded-full border border-zinc-200 text-zinc-600 text-sm" @click="creditModal.visible = false">取消</button>
            <button class="flex-1 py-2 rounded-full bg-brand-500 hover:bg-brand-600 text-white text-sm" @click="submitCredit">确定</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
