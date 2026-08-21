<script setup lang="ts">
/**
 * 举报处理：Tab切换 + 工单列表 + 驳回/删除内容/封禁用户
 */
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  LayoutDashboard, Users, FileCheck, MessageSquare, Flag, LayoutGrid,
  Home, LogOut, Shield, ChevronLeft, ChevronRight, ExternalLink, Ban, Trash2, XCircle, Megaphone,
} from 'lucide-vue-next'
import { adminApi } from '@/utils/api'
import { useUserStore } from '@/stores/user'
import { formatTime } from '@/utils/helpers'
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

const tabs = [
  { label: '待处理', value: 'pending' },
  { label: '已处理', value: 'handled' },
]

const list = ref<any[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 20
const loading = ref(false)
const activeTab = ref('pending')

async function load() {
  loading.value = true
  try {
    const res: any = await adminApi.reports({ status: activeTab.value, page: page.value, pageSize })
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
function prevPage() { if (page.value > 1) { page.value--; load() } }
function nextPage() { if (page.value * pageSize < total.value) { page.value++; load() } }
const totalPages = () => Math.max(1, Math.ceil(total.value / pageSize))

function targetText(t: any) {
  return t.targetType === 'post' ? `帖子 #${t.targetId}` : t.targetType === 'comment' ? `评论 #${t.targetId}` : `#${t.targetId}`
}

function viewDetail(t: any) {
  if (t.targetType === 'post') router.push(`/post/${t.targetId}`)
  else toast.info('评论暂无详情页')
}

// 处理弹窗
const actionMap: Record<string, string> = {
  dismiss: '驳回举报',
  delete_content: '删除内容',
  ban_user: '封禁用户',
}
const handleModal = reactive({ visible: false, report: null as any, action: 'dismiss', result: '' })
function openHandle(report: any, action: string) {
  handleModal.report = report
  handleModal.action = action
  handleModal.result = actionMap[action] || ''
  handleModal.visible = true
}
async function submitHandle() {
  try {
    await adminApi.handleReport(handleModal.report.id, handleModal.action, handleModal.result)
    toast.success('举报已处理')
    handleModal.visible = false
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
        <h1 class="font-medium text-zinc-900">举报处理</h1>
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
        <!-- Tab -->
        <div class="bg-white rounded-xl p-3 border border-zinc-100 shadow-sm">
          <div class="flex items-center gap-1">
            <button v-for="t in tabs" :key="t.value" @click="switchTab(t.value)"
              class="px-3 py-1.5 rounded-full text-sm transition"
              :class="activeTab === t.value ? 'bg-brand-500 text-white font-medium' : 'text-zinc-500 hover:bg-zinc-100'">
              {{ t.label }}
            </button>
          </div>
        </div>

        <!-- 列表 -->
        <div class="bg-white rounded-xl border border-zinc-100 shadow-sm overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-zinc-500 text-xs bg-zinc-50 border-b border-zinc-100">
                <th class="text-left px-3 py-2 font-medium">举报内容</th>
                <th class="text-left px-3 py-2 font-medium">原因</th>
                <th class="text-left px-3 py-2 font-medium">举报人</th>
                <th class="text-left px-3 py-2 font-medium">人数</th>
                <th class="text-left px-3 py-2 font-medium">优先级</th>
                <th class="text-left px-3 py-2 font-medium">状态</th>
                <th class="text-left px-3 py-2 font-medium">时间</th>
                <th class="text-left px-3 py-2 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in list" :key="r.id" class="border-b border-zinc-50 hover:bg-zinc-50/50 align-top">
                <td class="px-3 py-2 text-zinc-900 whitespace-nowrap">{{ targetText(r) }}</td>
                <td class="px-3 py-2 text-zinc-600 max-w-[200px]">
                  <p class="truncate">{{ r.reason }}</p>
                  <p v-if="r.handleResult && r.status === 'handled'" class="text-xs text-zinc-400 mt-0.5 truncate">结果：{{ r.handleResult }}</p>
                </td>
                <td class="px-3 py-2 text-zinc-600 whitespace-nowrap">{{ r.reporter?.nickname || '-' }}</td>
                <td class="px-3 py-2 text-zinc-600">{{ r.reportCount }}</td>
                <td class="px-3 py-2">
                  <span class="px-2 py-0.5 rounded text-xs font-medium"
                    :class="r.priority === 'high' ? 'bg-red-100 text-red-600' : 'bg-zinc-100 text-zinc-500'">
                    {{ r.priority === 'high' ? '高' : '普通' }}
                  </span>
                </td>
                <td class="px-3 py-2">
                  <span class="px-2 py-0.5 rounded text-xs font-medium"
                    :class="r.status === 'handled' ? 'bg-green-100 text-green-600' : 'bg-amber-100 text-amber-600'">
                    {{ r.status === 'handled' ? '已处理' : '待处理' }}
                  </span>
                </td>
                <td class="px-3 py-2 text-zinc-400 whitespace-nowrap">{{ formatTime(r.createdAt) }}</td>
                <td class="px-3 py-2">
                  <div class="flex flex-wrap items-center gap-1 whitespace-nowrap">
                    <button class="flex items-center gap-1 px-2 py-1 rounded text-xs bg-blue-50 text-blue-600 hover:bg-blue-100" @click="viewDetail(r)">
                      <ExternalLink class="w-3 h-3" />详情
                    </button>
                    <template v-if="r.status === 'pending'">
                      <button class="flex items-center gap-1 px-2 py-1 rounded text-xs bg-zinc-100 text-zinc-600 hover:bg-zinc-200" @click="openHandle(r, 'dismiss')">
                        <XCircle class="w-3 h-3" />驳回
                      </button>
                      <button class="flex items-center gap-1 px-2 py-1 rounded text-xs bg-red-50 text-red-600 hover:bg-red-100" @click="openHandle(r, 'delete_content')">
                        <Trash2 class="w-3 h-3" />删内容
                      </button>
                      <button class="flex items-center gap-1 px-2 py-1 rounded text-xs bg-red-50 text-red-600 hover:bg-red-100" @click="openHandle(r, 'ban_user')">
                        <Ban class="w-3 h-3" />封号
                      </button>
                    </template>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
          <EmptyState v-if="!loading && !list.length" text="暂无举报工单" />
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

    <!-- 处理弹窗 -->
    <Teleport to="body">
      <div v-if="handleModal.visible" class="fixed inset-0 z-50 flex items-center justify-center p-4" @click.self="handleModal.visible = false">
        <div class="absolute inset-0 bg-black/40"></div>
        <div class="relative bg-white rounded-2xl w-full max-w-sm p-6">
          <h3 class="text-lg font-semibold mb-2">{{ actionMap[handleModal.action] }}</h3>
          <p class="text-sm text-zinc-500 mb-3">举报对象：{{ handleModal.report ? targetText(handleModal.report) : '' }}</p>
          <label class="block text-sm text-zinc-600 mb-1">处理结果</label>
          <textarea v-model="handleModal.result" rows="3" placeholder="请填写处理结果说明"
            class="w-full px-3 py-2 rounded-lg bg-zinc-50 border border-zinc-200 focus:border-brand-500 focus:outline-none text-sm mb-4 resize-none"></textarea>
          <div class="flex gap-3">
            <button class="flex-1 py-2 rounded-full border border-zinc-200 text-zinc-600 text-sm" @click="handleModal.visible = false">取消</button>
            <button class="flex-1 py-2 rounded-full bg-brand-500 hover:bg-brand-600 text-white text-sm" @click="submitHandle">确认处理</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
