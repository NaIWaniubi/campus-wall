<script setup lang="ts">
/**
 * 评论管理：关键词搜索 + 列表 + 删除违规评论
 */
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  LayoutDashboard, Users, FileCheck, MessageSquare, Flag, LayoutGrid,
  Home, LogOut, Shield, Search, Trash2, ChevronLeft, ChevronRight, Heart, Megaphone,
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
const total = ref(0)
const page = ref(1)
const pageSize = 20
const loading = ref(false)
const keyword = ref('')

async function load() {
  loading.value = true
  try {
    const res: any = await adminApi.comments({
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

function onSearch() { page.value = 1; load() }
function prevPage() { if (page.value > 1) { page.value--; load() } }
function nextPage() { if (page.value * pageSize < total.value) { page.value++; load() } }
const totalPages = () => Math.max(1, Math.ceil(total.value / pageSize))

const deleteDialog = reactive({ visible: false, comment: null as any })
function openDelete(c: any) { deleteDialog.comment = c; deleteDialog.visible = true }
async function confirmDelete() {
  deleteDialog.visible = false
  if (!deleteDialog.comment) return
  const id = deleteDialog.comment.id
  try {
    await adminApi.deleteComment(id)
    toast.success('评论已删除')
    list.value = list.value.filter((c) => c.id !== id)
    total.value = Math.max(0, total.value - 1)
    // 当前页删空且不在第一页时，自动回到上一页
    if (list.value.length === 0 && page.value > 1) {
      page.value = Math.max(1, page.value - 1)
      load()
    }
    deleteDialog.comment = null
  } catch {}
}

function goPost(postId: number) {
  if (postId) router.push(`/post/${postId}`)
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
        <h1 class="font-medium text-zinc-900">评论管理</h1>
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
        <div class="bg-white rounded-xl p-3 border border-zinc-100 shadow-sm flex items-center gap-2">
          <div class="relative flex-1">
            <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input v-model="keyword" placeholder="搜索评论内容"
              class="w-full pl-9 pr-3 py-2 rounded-lg bg-zinc-50 border border-zinc-200 focus:border-brand-500 focus:outline-none text-sm"
              @keyup.enter="onSearch" />
          </div>
          <button class="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-sm font-medium" @click="onSearch">搜索</button>
        </div>

        <!-- 表格 -->
        <div class="bg-white rounded-xl border border-zinc-100 shadow-sm overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-zinc-500 text-xs bg-zinc-50 border-b border-zinc-100">
                <th class="text-left px-3 py-2 font-medium">评论内容</th>
                <th class="text-left px-3 py-2 font-medium">所属帖子</th>
                <th class="text-left px-3 py-2 font-medium">评论人</th>
                <th class="text-left px-3 py-2 font-medium">点赞</th>
                <th class="text-left px-3 py-2 font-medium">时间</th>
                <th class="text-left px-3 py-2 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="c in list" :key="c.id" class="border-b border-zinc-50 hover:bg-zinc-50/50 align-top">
                <td class="px-3 py-2 max-w-[280px]">
                  <p class="text-zinc-700 line-clamp-2">{{ c.content }}</p>
                  <span v-if="c.isAnonymous" class="inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] bg-zinc-100 text-zinc-500">匿名</span>
                </td>
                <td class="px-3 py-2">
                  <button v-if="c.post?.id" class="text-brand-600 hover:underline truncate max-w-[160px] block text-left" @click="goPost(c.post.id)">
                    {{ c.post.title || '已删除' }}
                  </button>
                  <span v-else class="text-zinc-400">已删除</span>
                </td>
                <td class="px-3 py-2 text-zinc-600 whitespace-nowrap">
                  {{ c.isAnonymous ? '匿名用户' : (c.author?.nickname || '-') }}
                </td>
                <td class="px-3 py-2 text-zinc-600">
                  <span class="inline-flex items-center gap-0.5"><Heart class="w-3 h-3 text-red-400" />{{ c.likeCount }}</span>
                </td>
                <td class="px-3 py-2 text-zinc-400 whitespace-nowrap">{{ formatTime(c.createdAt) }}</td>
                <td class="px-3 py-2">
                  <button class="flex items-center gap-1 px-2 py-1 rounded text-xs bg-red-50 text-red-600 hover:bg-red-100" @click="openDelete(c)">
                    <Trash2 class="w-3 h-3" />删除
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
          <EmptyState v-if="!loading && !list.length" text="暂无评论" />
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

    <ConfirmDialog :visible="deleteDialog.visible" content="确定删除该评论吗？删除后不可恢复" confirm-text="删除" danger
      @confirm="confirmDelete" @cancel="deleteDialog.visible = false" />
  </div>
</template>
