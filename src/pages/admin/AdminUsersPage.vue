<script setup lang="ts">
/**
 * 用户管理：搜索 + 列表 + 封禁/重置密码/调整信誉分
 */
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  LayoutDashboard, Users, FileCheck, MessageSquare, Flag, LayoutGrid,
  Home, LogOut, Shield, Search, Ban, KeyRound, Star, ChevronLeft, ChevronRight, Megaphone,
} from 'lucide-vue-next'
import { adminApi } from '@/utils/api'
import { useUserStore } from '@/stores/user'
import { formatTime, creditColor, creditLevel } from '@/utils/helpers'
import { toast } from '@/utils/request'
import EmptyState from '@/components/EmptyState.vue'

const router = useRouter()
const userStore = useUserStore()

const navItems = [
  { name: '数据看板', path: '/admin', icon: LayoutDashboard },
  { name: '用户管理', path: '/admin/users', icon: Users },
  { name: '内容审核', path: '/admin/posts', icon: FileCheck },
  { name: '评论管理', path: '/admin/comments', icon: MessageSquare },
  { name: '举报处理', path: '/admin/reports', icon: Flag },
  { name: '板块管理', path: '/admin/sections', icon: LayoutGrid },
  { name: '公告管理', path: '/admin/announcements', icon: Megaphone },
]

const list = ref<any[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 20
const loading = ref(false)
const keyword = ref('')
const statusFilter = ref('')
const roleFilter = ref('')

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
const totalPages = () => Math.max(1, Math.ceil(total.value / pageSize))

// 封禁弹窗
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

// 重置密码弹窗
const pwdModal = reactive({ visible: false, user: null as any, newPassword: '' })
function openPwd(u: any) { pwdModal.user = u; pwdModal.newPassword = ''; pwdModal.visible = true }
async function submitPwd() {
  if (pwdModal.newPassword.length < 6) return toast.error('密码至少6位')
  try {
    await adminApi.resetPassword(pwdModal.user.id, pwdModal.newPassword)
    toast.success('密码已重置')
    pwdModal.visible = false
  } catch {}
}

// 信誉分弹窗
const creditModal = reactive({ visible: false, user: null as any, score: 0, reason: '' })
function openCredit(u: any) { creditModal.user = u; creditModal.score = 0; creditModal.reason = ''; creditModal.visible = true }
async function submitCredit() {
  if (!creditModal.score) return toast.error('请输入非零分值')
  try {
    await adminApi.adjustCredit(creditModal.user.id, creditModal.score, creditModal.reason)
    toast.success('信誉分已调整')
    creditModal.visible = false
    load()
  } catch {}
}

function onLogout() { userStore.logout(); router.replace('/admin/login') }
function isActive(p: string) { return router.currentRoute.value.path === p }
onMounted(load)
</script>

<template>
  <div class="min-h-screen bg-zinc-50">
    <aside class="hidden md:flex flex-col w-[200px] fixed inset-y-0 left-0 bg-white border-r border-zinc-100 z-20">
      <div class="h-14 flex items-center px-4 border-b border-zinc-100">
        <Shield class="w-5 h-5 text-brand-500 mr-2" /><span class="font-semibold text-zinc-900 text-sm">校园墙后台</span>
      </div>
      <nav class="flex-1 py-2 px-2 space-y-0.5">
        <router-link v-for="item in navItems" :key="item.path" :to="item.path"
          class="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition"
          :class="isActive(item.path) ? 'bg-brand-50 text-brand-600 font-medium' : 'text-zinc-600 hover:bg-zinc-50'">
          <component :is="item.icon" class="w-4 h-4" />{{ item.name }}
        </router-link>
      </nav>
      <div class="p-2 border-t border-zinc-100">
        <router-link to="/" class="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-zinc-600 hover:bg-zinc-50">
          <Home class="w-4 h-4" /> 返回前台
        </router-link>
      </div>
    </aside>

    <div class="md:ml-[200px]">
      <header class="h-14 bg-white border-b border-zinc-100 flex items-center justify-between px-4 md:px-6 sticky top-0 z-10">
        <h1 class="font-medium text-zinc-900">用户管理</h1>
        <button class="flex items-center gap-1 text-sm text-zinc-500 hover:text-red-500" @click="onLogout">
          <LogOut class="w-4 h-4" /> 退出
        </button>
      </header>
      <div class="md:hidden bg-white border-b border-zinc-100">
        <div class="flex items-center gap-1 px-2 h-11 overflow-x-auto scrollbar-hide">
          <router-link v-for="item in navItems" :key="item.path" :to="item.path"
            class="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs whitespace-nowrap"
            :class="isActive(item.path) ? 'bg-brand-50 text-brand-600 font-medium' : 'text-zinc-500'">
            <component :is="item.icon" class="w-3.5 h-3.5" />{{ item.name }}
          </router-link>
        </div>
      </div>

      <div class="p-4 md:p-6 space-y-4">
        <!-- 搜索栏 -->
        <div class="bg-white rounded-xl p-3 border border-zinc-100 shadow-sm flex flex-wrap items-center gap-2">
          <div class="relative flex-1 min-w-[180px]">
            <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input v-model="keyword" placeholder="搜索学号/昵称"
              class="w-full pl-9 pr-3 py-2 rounded-lg bg-zinc-50 border border-zinc-200 focus:border-brand-500 focus:outline-none text-sm"
              @keyup.enter="onSearch" />
          </div>
          <select v-model="statusFilter" class="px-3 py-2 rounded-lg bg-zinc-50 border border-zinc-200 text-sm focus:outline-none" @change="onSearch">
            <option value="">全部状态</option>
            <option value="active">正常</option>
            <option value="banned">封禁</option>
          </select>
          <select v-model="roleFilter" class="px-3 py-2 rounded-lg bg-zinc-50 border border-zinc-200 text-sm focus:outline-none" @change="onSearch">
            <option value="">全部角色</option>
            <option value="user">普通用户</option>
            <option value="section_admin">板块管理员</option>
            <option value="super_admin">超级管理员</option>
          </select>
          <button class="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-sm font-medium" @click="onSearch">搜索</button>
        </div>

        <!-- 表格 -->
        <div class="bg-white rounded-xl border border-zinc-100 shadow-sm overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-zinc-500 text-xs bg-zinc-50 border-b border-zinc-100">
                <th class="text-left px-3 py-2 font-medium">用户</th>
                <th class="text-left px-3 py-2 font-medium">学号</th>
                <th class="text-left px-3 py-2 font-medium">学院/年级</th>
                <th class="text-left px-3 py-2 font-medium">信誉分</th>
                <th class="text-left px-3 py-2 font-medium">发帖</th>
                <th class="text-left px-3 py-2 font-medium">状态</th>
                <th class="text-left px-3 py-2 font-medium">注册时间</th>
                <th class="text-left px-3 py-2 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="u in list" :key="u.id" class="border-b border-zinc-50 hover:bg-zinc-50/50">
                <td class="px-3 py-2">
                  <div class="flex items-center gap-2">
                    <div class="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center text-brand-600 text-xs font-medium overflow-hidden">
                      <img v-if="u.avatar" :src="u.avatar" class="w-full h-full object-cover" alt="" />
                      <span v-else>{{ u.nickname?.charAt(0) }}</span>
                    </div>
                    <span class="text-zinc-900">{{ u.nickname }}</span>
                  </div>
                </td>
                <td class="px-3 py-2 text-zinc-600">{{ u.student_id }}</td>
                <td class="px-3 py-2 text-zinc-600">{{ u.college || '-' }} / {{ u.grade || '-' }}</td>
                <td class="px-3 py-2">
                  <span class="font-medium" :style="{ color: creditColor(u.credit_score) }">{{ u.credit_score }}</span>
                  <span class="ml-1 text-xs text-zinc-400">({{ creditLevel(u.credit_score) }})</span>
                </td>
                <td class="px-3 py-2 text-zinc-600">{{ u.postCount }}</td>
                <td class="px-3 py-2">
                  <span class="px-2 py-0.5 rounded text-xs font-medium"
                    :class="u.status === 'banned' ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'">
                    {{ u.status === 'banned' ? '封禁' : '正常' }}
                  </span>
                </td>
                <td class="px-3 py-2 text-zinc-400 whitespace-nowrap">{{ formatTime(u.createdAt) }}</td>
                <td class="px-3 py-2">
                  <div class="flex items-center gap-1.5 whitespace-nowrap">
                    <button class="flex items-center gap-1 px-2 py-1 rounded text-xs"
                      :class="u.status === 'banned' ? 'bg-green-50 text-green-600 hover:bg-green-100' : 'bg-red-50 text-red-600 hover:bg-red-100'"
                      @click="openBan(u)">
                      <Ban class="w-3 h-3" />{{ u.status === 'banned' ? '解封' : '封禁' }}
                    </button>
                    <button class="flex items-center gap-1 px-2 py-1 rounded text-xs bg-blue-50 text-blue-600 hover:bg-blue-100" @click="openPwd(u)">
                      <KeyRound class="w-3 h-3" />密码
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
      </div>
    </div>

    <!-- 封禁弹窗 -->
    <Teleport to="body">
      <div v-if="banModal.visible" class="fixed inset-0 z-50 flex items-center justify-center p-4" @click.self="banModal.visible = false">
        <div class="absolute inset-0 bg-black/40"></div>
        <div class="relative bg-white rounded-2xl w-full max-w-sm p-6">
          <h3 class="text-lg font-semibold mb-4">{{ banModal.action === 'ban' ? '封禁用户' : '解封用户' }}</h3>
          <p class="text-sm text-zinc-500 mb-3">用户：{{ banModal.user?.nickname }}（{{ banModal.user?.student_id }}）</p>
          <template v-if="banModal.action === 'ban'">
            <div class="mb-3">
              <label class="block text-sm text-zinc-600 mb-1">封禁原因</label>
              <input v-model="banModal.reason" placeholder="请输入封禁原因"
                class="w-full px-3 py-2 rounded-lg bg-zinc-50 border border-zinc-200 focus:border-brand-500 focus:outline-none text-sm" />
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
          <p class="text-sm text-zinc-500 mb-3">用户：{{ pwdModal.user?.nickname }}</p>
          <label class="block text-sm text-zinc-600 mb-1">新密码（至少6位）</label>
          <input v-model="pwdModal.newPassword" type="password" placeholder="请输入新密码"
            class="w-full px-3 py-2 rounded-lg bg-zinc-50 border border-zinc-200 focus:border-brand-500 focus:outline-none text-sm mb-4" />
          <div class="flex gap-3">
            <button class="flex-1 py-2 rounded-full border border-zinc-200 text-zinc-600 text-sm" @click="pwdModal.visible = false">取消</button>
            <button class="flex-1 py-2 rounded-full bg-brand-500 hover:bg-brand-600 text-white text-sm" @click="submitPwd">确定</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 信誉分弹窗 -->
    <Teleport to="body">
      <div v-if="creditModal.visible" class="fixed inset-0 z-50 flex items-center justify-center p-4" @click.self="creditModal.visible = false">
        <div class="absolute inset-0 bg-black/40"></div>
        <div class="relative bg-white rounded-2xl w-full max-w-sm p-6">
          <h3 class="text-lg font-semibold mb-4">调整信誉分</h3>
          <p class="text-sm text-zinc-500 mb-3">用户：{{ creditModal.user?.nickname }}（当前 <span :style="{ color: creditColor(creditModal.user?.credit_score || 0) }" class="font-medium">{{ creditModal.user?.credit_score }}</span> · {{ creditLevel(creditModal.user?.credit_score || 0) }}）</p>
          <label class="block text-sm text-zinc-600 mb-1">分值（正数增加，负数减少）</label>
          <input v-model.number="creditModal.score" type="number" placeholder="如 10 或 -10"
            class="w-full px-3 py-2 rounded-lg bg-zinc-50 border border-zinc-200 focus:border-brand-500 focus:outline-none text-sm mb-3" />
          <label class="block text-sm text-zinc-600 mb-1">原因</label>
          <input v-model="creditModal.reason" placeholder="调整原因"
            class="w-full px-3 py-2 rounded-lg bg-zinc-50 border border-zinc-200 focus:border-brand-500 focus:outline-none text-sm mb-4" />
          <div class="flex gap-3">
            <button class="flex-1 py-2 rounded-full border border-zinc-200 text-zinc-600 text-sm" @click="creditModal.visible = false">取消</button>
            <button class="flex-1 py-2 rounded-full bg-brand-500 hover:bg-brand-600 text-white text-sm" @click="submitCredit">确定</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
