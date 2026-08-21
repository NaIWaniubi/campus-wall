<script setup lang="ts">
/**
 * 内容审核：Tab切换 + 搜索 + 列表 + 通过/驳回/置顶/删除
 */
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  LayoutDashboard, Users, FileCheck, MessageSquare, Flag, LayoutGrid,
  Home, LogOut, Shield, Search, Check, X, PinOff, Trash2,
  ChevronLeft, ChevronRight, Megaphone,
} from 'lucide-vue-next'
import { adminApi, postApi, sectionApi } from '@/utils/api'
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

const tabs = [
  { label: '待审核', value: 'pending' },
  { label: '已通过', value: 'published' },
  { label: '已驳回', value: 'rejected' },
  { label: '已删除', value: 'deleted' },
]

const list = ref<any[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 20
const loading = ref(false)
const activeTab = ref('pending')
const keyword = ref('')
const sectionId = ref<number | ''>('')
const sections = ref<any[]>([])

function statusMeta(s: string) {
  const map: Record<string, { text: string; cls: string }> = {
    pending: { text: '待审核', cls: 'bg-amber-100 text-amber-600' },
    published: { text: '已通过', cls: 'bg-green-100 text-green-600' },
    rejected: { text: '已驳回', cls: 'bg-red-100 text-red-600' },
    deleted: { text: '已删除', cls: 'bg-zinc-200 text-zinc-500' },
  }
  return map[s] || map.pending
}

async function loadSections() {
  try {
    const res: any = await sectionApi.list(true)
    sections.value = res.data || []
  } catch {}
}

async function load() {
  loading.value = true
  try {
    const res: any = await adminApi.posts({
      status: activeTab.value,
      sectionId: sectionId.value || undefined,
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

function switchTab(v: string) {
  if (activeTab.value === v) return
  activeTab.value = v
  page.value = 1
  load()
}
function onSearch() { page.value = 1; load() }
function prevPage() { if (page.value > 1) { page.value--; load() } }
function nextPage() { if (page.value * pageSize < total.value) { page.value++; load() } }
const totalPages = () => Math.max(1, Math.ceil(total.value / pageSize))

async function approve(p: any) {
  try {
    await adminApi.auditPost(p.id, 'approve')
    toast.success('已通过审核')
    load()
  } catch {}
}

const rejectModal = reactive({ visible: false, post: null as any, reason: '' })
function openReject(p: any) { rejectModal.post = p; rejectModal.reason = ''; rejectModal.visible = true }
async function submitReject() {
  if (!rejectModal.reason.trim()) return toast.error('请填写驳回原因')
  try {
    await adminApi.auditPost(rejectModal.post.id, 'reject', rejectModal.reason)
    toast.success('已驳回')
    rejectModal.visible = false
    load()
  } catch {}
}

async function top(p: any, topType: 'global' | 'section') {
  try {
    await adminApi.topPost(p.id, 'top', topType)
    toast.success('已设置置顶')
    load()
  } catch {}
}
async function untop(p: any) {
  try {
    await adminApi.topPost(p.id, 'untop')
    toast.success('已取消置顶')
    load()
  } catch {}
}

const deleteDialog = reactive({ visible: false, post: null as any })
function openDelete(p: any) { deleteDialog.post = p; deleteDialog.visible = true }
async function confirmDelete() {
  deleteDialog.visible = false
  if (!deleteDialog.post) return
  try {
    await postApi.delete(deleteDialog.post.id)
    toast.success('已删除')
    load()
  } catch {}
}

function onLogout() { userStore.logout(); router.replace('/admin/login') }
function isActive(p: string) { return router.currentRoute.value.path === p }
onMounted(() => { loadSections(); load() })
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
        <h1 class="font-medium text-zinc-900">内容审核</h1>
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
        <!-- Tab + 搜索 -->
        <div class="bg-white rounded-xl p-3 border border-zinc-100 shadow-sm space-y-3">
          <div class="flex items-center gap-1 overflow-x-auto scrollbar-hide">
            <button v-for="t in tabs" :key="t.value" @click="switchTab(t.value)"
              class="px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition"
              :class="activeTab === t.value ? 'bg-brand-500 text-white font-medium' : 'text-zinc-500 hover:bg-zinc-100'">
              {{ t.label }}
            </button>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <div class="relative flex-1 min-w-[180px]">
              <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input v-model="keyword" placeholder="搜索标题/内容"
                class="w-full pl-9 pr-3 py-2 rounded-lg bg-zinc-50 border border-zinc-200 focus:border-brand-500 focus:outline-none text-sm"
                @keyup.enter="onSearch" />
            </div>
            <select v-model="sectionId" class="px-3 py-2 rounded-lg bg-zinc-50 border border-zinc-200 text-sm focus:outline-none" @change="onSearch">
              <option :value="''">全部板块</option>
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
                <th class="text-left px-3 py-2 font-medium">板块</th>
                <th class="text-left px-3 py-2 font-medium">状态</th>
                <th class="text-left px-3 py-2 font-medium">时间</th>
                <th class="text-left px-3 py-2 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in list" :key="p.id" class="border-b border-zinc-50 hover:bg-zinc-50/50 align-top">
                <td class="px-3 py-2 max-w-[260px]">
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
                <td class="px-3 py-2 text-zinc-600 whitespace-nowrap">{{ p.section?.name || '-' }}</td>
                <td class="px-3 py-2">
                  <span class="px-2 py-0.5 rounded text-xs font-medium" :class="statusMeta(p.status).cls">{{ statusMeta(p.status).text }}</span>
                </td>
                <td class="px-3 py-2 text-zinc-400 whitespace-nowrap">{{ formatTime(p.createdAt) }}</td>
                <td class="px-3 py-2">
                  <div class="flex flex-wrap items-center gap-1 whitespace-nowrap">
                    <button v-if="p.status === 'pending'" class="flex items-center gap-1 px-2 py-1 rounded text-xs bg-green-50 text-green-600 hover:bg-green-100" @click="approve(p)">
                      <Check class="w-3 h-3" />通过
                    </button>
                    <button v-if="p.status === 'pending'" class="flex items-center gap-1 px-2 py-1 rounded text-xs bg-red-50 text-red-600 hover:bg-red-100" @click="openReject(p)">
                      <X class="w-3 h-3" />驳回
                    </button>
                    <template v-if="!p.isTop && p.status === 'published'">
                      <button class="flex items-center gap-1 px-2 py-1 rounded text-xs bg-brand-50 text-brand-600 hover:bg-brand-100" @click="top(p, 'global')">全顶</button>
                      <button class="flex items-center gap-1 px-2 py-1 rounded text-xs bg-brand-50 text-brand-600 hover:bg-brand-100" @click="top(p, 'section')">版顶</button>
                    </template>
                    <button v-if="p.isTop" class="flex items-center gap-1 px-2 py-1 rounded text-xs bg-zinc-100 text-zinc-600 hover:bg-zinc-200" @click="untop(p)">
                      <PinOff class="w-3 h-3" />取消置顶
                    </button>
                    <button v-if="p.status !== 'deleted'" class="flex items-center gap-1 px-2 py-1 rounded text-xs bg-red-50 text-red-600 hover:bg-red-100" @click="openDelete(p)">
                      <Trash2 class="w-3 h-3" />删除
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
          <EmptyState v-if="!loading && !list.length" text="暂无帖子" />
          <div v-if="loading" class="py-10 text-center text-sm text-zinc-400">加载中...</div>
        </div>

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

    <!-- 驳回弹窗 -->
    <Teleport to="body">
      <div v-if="rejectModal.visible" class="fixed inset-0 z-50 flex items-center justify-center p-4" @click.self="rejectModal.visible = false">
        <div class="absolute inset-0 bg-black/40"></div>
        <div class="relative bg-white rounded-2xl w-full max-w-sm p-6">
          <h3 class="text-lg font-semibold mb-4">驳回帖子</h3>
          <p class="text-sm text-zinc-500 mb-3 truncate">{{ rejectModal.post?.title }}</p>
          <label class="block text-sm text-zinc-600 mb-1">驳回原因</label>
          <textarea v-model="rejectModal.reason" rows="3" placeholder="请填写驳回原因"
            class="w-full px-3 py-2 rounded-lg bg-zinc-50 border border-zinc-200 focus:border-brand-500 focus:outline-none text-sm mb-4 resize-none"></textarea>
          <div class="flex gap-3">
            <button class="flex-1 py-2 rounded-full border border-zinc-200 text-zinc-600 text-sm" @click="rejectModal.visible = false">取消</button>
            <button class="flex-1 py-2 rounded-full bg-brand-500 hover:bg-brand-600 text-white text-sm" @click="submitReject">确定驳回</button>
          </div>
        </div>
      </div>
    </Teleport>

    <ConfirmDialog :visible="deleteDialog.visible" content="确定删除该帖子吗？删除后不可恢复" confirm-text="删除" danger
      @confirm="confirmDelete" @cancel="deleteDialog.visible = false" />
  </div>
</template>
