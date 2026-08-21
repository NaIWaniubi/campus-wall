<script setup lang="ts">
/**
 * 公告管理：发布、列表、停用公告
 */
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  LayoutDashboard, Users, FileCheck, MessageSquare, Flag, LayoutGrid,
  Home, LogOut, Megaphone, Plus, Power, Search, Eye,
} from 'lucide-vue-next'
import { adminApi } from '@/utils/api'
import { useUserStore } from '@/stores/user'
import { formatTime } from '@/utils/helpers'
import { toast } from '@/utils/request'
import EmptyState from '@/components/EmptyState.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

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
const loading = ref(false)
const showCreate = ref(false)
const deactivateTarget = ref<any>(null)
const viewTarget = ref<any>(null)
const form = reactive({ title: '', content: '', expiresAt: '' })

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

async function handleCreate() {
  if (!form.title.trim() || !form.content.trim()) {
    toast.error('标题和内容不能为空')
    return
  }
  // 校验过期时间必须晚于当前
  if (form.expiresAt) {
    const expireTs = new Date(form.expiresAt).getTime()
    if (isNaN(expireTs)) {
      toast.error('过期时间格式不正确')
      return
    }
    if (expireTs <= Date.now()) {
      toast.error('过期时间必须晚于当前时间')
      return
    }
  }
  try {
    await adminApi.createAnnouncement({
      title: form.title.trim(),
      content: form.content.trim(),
      expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : undefined,
    })
    toast.success('公告已发布，全校可见')
    form.title = ''
    form.content = ''
    form.expiresAt = ''
    showCreate.value = false
    load()
  } catch {}
}

// 是否已过期
function isExpired(a: any): boolean {
  if (!a.expires_at) return false
  const ts = new Date(a.expires_at).getTime()
  return !isNaN(ts) && ts <= Date.now()
}

// 格式化过期时间
function formatExpires(a: any): string {
  if (!a.expires_at) return '永久有效'
  const ts = new Date(a.expires_at).getTime()
  if (isNaN(ts)) return '-'
  const d = new Date(a.expires_at)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function confirmDeactivate(a: any) {
  deactivateTarget.value = a
}

async function handleDeactivate() {
  if (!deactivateTarget.value) return
  try {
    await adminApi.deactivateAnnouncement(deactivateTarget.value.id)
    toast.success('已停用')
    deactivateTarget.value = null
    load()
  } catch {}
}

function viewDetail(a: any) {
  viewTarget.value = a
}

function logout() {
  userStore.logout()
  router.replace('/admin/login')
}

onMounted(load)
</script>

<template>
  <div class="min-h-screen bg-zinc-50 lg:flex">
    <!-- 侧栏 -->
    <aside class="hidden lg:flex w-52 bg-white border-r border-zinc-100 flex-col fixed inset-y-0 left-0">
      <div class="px-4 py-5 border-b border-zinc-100">
        <h2 class="text-base font-bold text-brand-600 flex items-center gap-2">
          <Megaphone class="w-5 h-5" /> 校园墙后台
        </h2>
      </div>
      <nav class="flex-1 py-2">
        <RouterLink v-for="item in navItems" :key="item.path" :to="item.path"
          class="flex items-center gap-2.5 mx-2 px-3 py-2.5 rounded-lg text-sm text-zinc-700 hover:bg-zinc-50"
          active-class="!bg-brand-50 !text-brand-600 font-medium">
          <component :is="item.icon" class="w-4 h-4" /> {{ item.name }}
        </RouterLink>
      </nav>
      <div class="p-3 border-t border-zinc-100 space-y-1">
        <button class="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50 rounded-lg" @click="router.push('/')">
          <Home class="w-4 h-4" /> 返回前台
        </button>
        <button class="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-500 hover:bg-red-50 rounded-lg" @click="logout">
          <LogOut class="w-4 h-4" /> 退出
        </button>
      </div>
    </aside>

    <!-- 移动端顶栏 -->
    <header class="lg:hidden sticky top-0 z-10 bg-white border-b border-zinc-100">
      <div class="flex items-center px-4 h-12">
        <h2 class="font-bold text-brand-600">校园墙后台</h2>
        <div class="ml-auto flex items-center gap-1">
          <span class="text-sm text-zinc-500">{{ userStore.user?.nickname }}</span>
        </div>
      </div>
      <nav class="flex overflow-x-auto scrollbar-hide px-2 border-t border-zinc-50">
        <RouterLink v-for="item in navItems" :key="item.path" :to="item.path"
          class="flex items-center gap-1 px-3 py-2 text-xs whitespace-nowrap text-zinc-600"
          active-class="!text-brand-600 font-medium">
          <component :is="item.icon" class="w-3.5 h-3.5" /> {{ item.name }}
        </RouterLink>
      </nav>
    </header>

    <main class="flex-1 lg:ml-52">
      <div class="max-w-5xl mx-auto p-4 lg:p-6">
        <!-- 页头 -->
        <div class="flex items-center justify-between mb-4">
          <div>
            <h1 class="text-xl lg:text-2xl font-bold text-zinc-900">公告管理</h1>
            <p class="text-sm text-zinc-500 mt-1">发布后所有用户登录时将看到弹窗</p>
          </div>
          <button class="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-full text-sm font-medium flex items-center gap-1.5" @click="showCreate = true">
            <Plus class="w-4 h-4" /> 发布公告
          </button>
        </div>

        <!-- 列表 -->
        <div v-if="loading" class="space-y-2">
          <div v-for="i in 3" :key="i" class="bg-white rounded-xl p-4 h-20 skeleton"></div>
        </div>
        <EmptyState v-else-if="!list.length" text="暂无公告" />
        <div v-else class="space-y-2">
          <div v-for="a in list" :key="a.id" class="bg-white rounded-xl p-4 shadow-sm">
            <div class="flex items-start gap-3">
              <div class="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                :class="(!a.is_active || isExpired(a)) ? 'bg-zinc-100' : 'bg-brand-50'">
                <Megaphone class="w-5 h-5" :class="(!a.is_active || isExpired(a)) ? 'text-zinc-400' : 'text-brand-600'" />
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-1 flex-wrap">
                  <h3 class="font-medium text-zinc-900">{{ a.title }}</h3>
                  <span v-if="!a.is_active" class="text-xs px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-500">已停用</span>
                  <span v-else-if="isExpired(a)" class="text-xs px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-500">已过期</span>
                  <span v-else class="text-xs px-1.5 py-0.5 rounded bg-brand-100 text-brand-700">进行中</span>
                </div>
                <p class="text-sm text-zinc-600 line-clamp-2 mb-1.5">{{ a.content }}</p>
                <div class="flex items-center gap-3 text-xs text-zinc-400 flex-wrap">
                  <span>发布：{{ formatTime(a.createdAt) }}</span>
                  <span :class="isExpired(a) ? 'text-red-400' : ''">过期：{{ formatExpires(a) }}</span>
                </div>
              </div>
              <div class="flex items-center gap-1 flex-shrink-0">
                <button class="p-1.5 text-zinc-400 hover:text-brand-500 hover:bg-brand-50 rounded" title="查看详情" @click="viewDetail(a)">
                  <Eye class="w-4 h-4" />
                </button>
                <button v-if="a.is_active && !isExpired(a)" class="p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded" title="停用" @click="confirmDeactivate(a)">
                  <Power class="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>

    <!-- 发布公告弹窗 -->
    <Teleport to="body">
      <div v-if="showCreate" class="fixed inset-0 z-50 flex items-center justify-center p-4" @click.self="showCreate = false">
        <div class="absolute inset-0 bg-black/40"></div>
        <div class="relative bg-white rounded-2xl w-full max-w-md p-5">
          <h3 class="text-lg font-semibold text-zinc-900 mb-3">发布公告</h3>
          <input v-model="form.title" placeholder="公告标题（最多50字）" maxlength="50" class="w-full h-10 px-3 rounded-lg border border-zinc-200 focus:border-brand-500 focus:outline-none text-sm mb-3" />
          <textarea v-model="form.content" placeholder="公告内容（最多500字）" rows="6" maxlength="500" class="w-full px-3 py-2 rounded-lg border border-zinc-200 focus:border-brand-500 focus:outline-none text-sm resize-none"></textarea>
          <div class="text-right text-xs text-zinc-400 mb-3">{{ form.content.length }}/500</div>
          <div class="mb-4">
            <label class="block text-sm text-zinc-600 mb-1">过期时间（可选，留空表示永久）</label>
            <input v-model="form.expiresAt" type="datetime-local" class="w-full h-10 px-3 rounded-lg border border-zinc-200 focus:border-brand-500 focus:outline-none text-sm" />
          </div>
          <div class="flex gap-2">
            <button class="flex-1 py-2.5 rounded-full text-sm border border-zinc-200 text-zinc-600" @click="showCreate = false">取消</button>
            <button class="flex-1 py-2.5 rounded-full text-sm bg-brand-500 hover:bg-brand-600 text-white" @click="handleCreate">发布</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 公告详情弹窗 -->
    <Teleport to="body">
      <div v-if="viewTarget" class="fixed inset-0 z-50 flex items-center justify-center p-4" @click.self="viewTarget = null">
        <div class="absolute inset-0 bg-black/40"></div>
        <div class="relative bg-white rounded-2xl w-full max-w-md p-5">
          <div class="flex items-start gap-3 mb-3">
            <div class="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
              :class="(!viewTarget.is_active || isExpired(viewTarget)) ? 'bg-zinc-100' : 'bg-brand-50'">
              <Megaphone class="w-5 h-5" :class="(!viewTarget.is_active || isExpired(viewTarget)) ? 'text-zinc-400' : 'text-brand-600'" />
            </div>
            <div class="flex-1 min-w-0">
              <h3 class="text-lg font-semibold text-zinc-900 break-words">{{ viewTarget.title }}</h3>
              <div class="flex items-center gap-2 mt-1 flex-wrap">
                <span v-if="!viewTarget.is_active" class="text-xs px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-500">已停用</span>
                <span v-else-if="isExpired(viewTarget)" class="text-xs px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-500">已过期</span>
                <span v-else class="text-xs px-1.5 py-0.5 rounded bg-brand-100 text-brand-700">进行中</span>
                <span class="text-xs text-zinc-400">{{ formatTime(viewTarget.createdAt) }}</span>
              </div>
            </div>
          </div>
          <div class="text-sm text-zinc-700 whitespace-pre-wrap break-words bg-zinc-50 rounded-lg p-3 max-h-[50vh] overflow-y-auto">{{ viewTarget.content }}</div>
          <div class="mt-3 text-xs text-zinc-400 flex items-center gap-3">
            <span>过期：{{ formatExpires(viewTarget) }}</span>
          </div>
          <div class="flex gap-2 mt-4">
            <button class="flex-1 py-2.5 rounded-full text-sm border border-zinc-200 text-zinc-600" @click="viewTarget = null">关闭</button>
            <button v-if="viewTarget.is_active && !isExpired(viewTarget)" class="flex-1 py-2.5 rounded-full text-sm bg-red-500 hover:bg-red-600 text-white" @click="confirmDeactivate(viewTarget); viewTarget = null">停用</button>
          </div>
        </div>
      </div>
    </Teleport>

    <ConfirmDialog :visible="!!deactivateTarget" content="确定停用该公告吗？已确认用户不受影响" title="停用公告" confirm-text="停用" danger
      @confirm="handleDeactivate" @cancel="deactivateTarget = null" />
  </div>
</template>
