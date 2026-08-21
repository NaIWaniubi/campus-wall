<script setup lang="ts">
/**
 * 数据看板：指标卡片 + 7天趋势 + 板块/学院分布
 */
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  LayoutDashboard, Users, FileCheck, MessageSquare, Flag, LayoutGrid,
  Home, LogOut, Shield, UserPlus, FileText, AlertCircle, CheckCircle, Megaphone,
} from 'lucide-vue-next'
import { adminApi } from '@/utils/api'
import { useUserStore } from '@/stores/user'

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

const stats = ref<any>(null)
const loading = ref(true)

const cards = computed(() => {
  const c = stats.value?.cards || {}
  return [
    { label: '用户总量', value: c.totalUsers ?? 0, icon: Users, color: 'text-brand-600 bg-brand-50' },
    { label: '今日新增', value: c.todayUsers ?? 0, icon: UserPlus, color: 'text-blue-600 bg-blue-50' },
    { label: '帖子总量', value: c.totalPosts ?? 0, icon: FileText, color: 'text-amber-600 bg-amber-50' },
    { label: '评论总量', value: c.totalComments ?? 0, icon: MessageSquare, color: 'text-purple-600 bg-purple-50' },
    { label: '待审核/举报', value: (c.pendingPosts ?? 0) + (c.pendingReports ?? 0), icon: AlertCircle, color: 'text-red-600 bg-red-50' },
    { label: '审核通过率', value: (c.auditPassRate ?? 0) + '%', icon: CheckCircle, color: 'text-emerald-600 bg-emerald-50' },
  ]
})

const trendMax = computed(() => {
  const t = stats.value?.trend || []
  return Math.max(1, ...t.map((d: any) => d.posts))
})
const sectionMax = computed(() => Math.max(1, ...(stats.value?.sectionDist || []).map((s: any) => s.count)))
const collegeMax = computed(() => Math.max(1, ...(stats.value?.collegeDist || []).map((s: any) => s.count)))

function barWidth(count: number, max: number) {
  return max > 0 ? Math.max(2, (count / max) * 100) : 0
}

async function load() {
  loading.value = true
  try {
    const res: any = await adminApi.stats()
    stats.value = res.data
  } catch {
    // 错误已由拦截器 toast
  } finally {
    loading.value = false
  }
}

function onLogout() {
  userStore.logout()
  router.replace('/admin/login')
}
function isActive(path: string) {
  return router.currentRoute.value.path === path
}

onMounted(load)
</script>

<template>
  <div class="min-h-screen bg-zinc-50">
    <!-- 桌面侧边栏 -->
    <aside class="hidden md:flex flex-col w-[200px] fixed inset-y-0 left-0 bg-white border-r border-zinc-100 z-20">
      <div class="h-14 flex items-center px-4 border-b border-zinc-100">
        <Shield class="w-5 h-5 text-brand-500 mr-2" />
        <span class="font-semibold text-zinc-900 text-sm">校园墙后台</span>
      </div>
      <nav class="flex-1 py-2 px-2 space-y-0.5">
        <router-link
          v-for="item in navItems"
          :key="item.path"
          :to="item.path"
          class="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition"
          :class="isActive(item.path) ? 'bg-brand-50 text-brand-600 font-medium' : 'text-zinc-600 hover:bg-zinc-50'"
        >
          <component :is="item.icon" class="w-4 h-4" />
          {{ item.name }}
        </router-link>
      </nav>
      <div class="p-2 border-t border-zinc-100">
        <router-link to="/" class="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-zinc-600 hover:bg-zinc-50">
          <Home class="w-4 h-4" /> 返回前台
        </router-link>
      </div>
    </aside>

    <div class="md:ml-[200px]">
      <!-- 顶部栏 -->
      <header class="h-14 bg-white border-b border-zinc-100 flex items-center justify-between px-4 md:px-6 sticky top-0 z-10">
        <h1 class="font-medium text-zinc-900">数据看板</h1>
        <div class="flex items-center gap-3">
          <span class="text-sm text-zinc-600 hidden sm:inline">{{ userStore.user?.nickname }}</span>
          <button class="flex items-center gap-1 text-sm text-zinc-500 hover:text-red-500" @click="onLogout">
            <LogOut class="w-4 h-4" /> 退出
          </button>
        </div>
      </header>

      <!-- 移动端导航 -->
      <div class="md:hidden bg-white border-b border-zinc-100">
        <div class="flex items-center gap-1 px-2 h-11 overflow-x-auto scrollbar-hide">
          <router-link
            v-for="item in navItems"
            :key="item.path"
            :to="item.path"
            class="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs whitespace-nowrap"
            :class="isActive(item.path) ? 'bg-brand-50 text-brand-600 font-medium' : 'text-zinc-500'"
          >
            <component :is="item.icon" class="w-3.5 h-3.5" /> {{ item.name }}
          </router-link>
          <router-link to="/" class="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs text-zinc-500 whitespace-nowrap">
            <Home class="w-3.5 h-3.5" /> 前台
          </router-link>
        </div>
      </div>

      <div class="p-4 md:p-6 space-y-4">
        <!-- 指标卡片 -->
        <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div
            v-for="card in cards"
            :key="card.label"
            class="bg-white rounded-xl p-4 border border-zinc-100 shadow-sm"
          >
            <div class="flex items-center justify-between mb-2">
              <span class="text-xs text-zinc-500">{{ card.label }}</span>
              <div class="w-8 h-8 rounded-lg flex items-center justify-center" :class="card.color">
                <component :is="card.icon" class="w-4 h-4" />
              </div>
            </div>
            <div class="text-2xl font-bold text-zinc-900">{{ card.value }}</div>
          </div>
        </div>

        <!-- 7天趋势 -->
        <div class="bg-white rounded-xl p-4 md:p-6 border border-zinc-100 shadow-sm">
          <h2 class="text-sm font-medium text-zinc-900 mb-4">近7天发帖趋势</h2>
          <div v-if="loading" class="h-40 flex items-center justify-center text-sm text-zinc-400">加载中...</div>
          <div v-else class="space-y-1">
            <div class="flex items-end gap-2 h-40">
              <div
                v-for="d in stats?.trend || []"
                :key="d.date"
                class="flex-1 flex flex-col items-center justify-end h-full relative group"
              >
                <span class="absolute -top-5 text-xs text-zinc-500 opacity-0 group-hover:opacity-100 transition">{{ d.posts }}</span>
                <div
                  class="w-full max-w-[28px] mx-auto bg-brand-500 rounded-t hover:bg-brand-600 transition-all"
                  :style="{ height: Math.max(2, (d.posts / trendMax) * 100) + '%' }"
                ></div>
              </div>
            </div>
            <div class="flex gap-2">
              <div
                v-for="d in stats?.trend || []"
                :key="'l' + d.date"
                class="flex-1 text-center text-xs text-zinc-400"
              >
                {{ d.date.slice(5) }}
              </div>
            </div>
          </div>
        </div>

        <!-- 分布图 -->
        <div class="grid md:grid-cols-2 gap-4">
          <div class="bg-white rounded-xl p-4 md:p-6 border border-zinc-100 shadow-sm">
            <h2 class="text-sm font-medium text-zinc-900 mb-4">板块分布</h2>
            <div v-if="loading" class="text-sm text-zinc-400">加载中...</div>
            <div v-else-if="!stats?.sectionDist?.length" class="text-sm text-zinc-400 py-4 text-center">暂无数据</div>
            <div v-else class="space-y-3">
              <div v-for="s in stats.sectionDist" :key="s.name">
                <div class="flex justify-between text-sm mb-1">
                  <span class="text-zinc-600">{{ s.name }}</span>
                  <span class="text-zinc-400">{{ s.count }}</span>
                </div>
                <div class="h-2 bg-zinc-100 rounded-full overflow-hidden">
                  <div class="h-full bg-brand-500 rounded-full transition-all" :style="{ width: barWidth(s.count, sectionMax) + '%' }"></div>
                </div>
              </div>
            </div>
          </div>

          <div class="bg-white rounded-xl p-4 md:p-6 border border-zinc-100 shadow-sm">
            <h2 class="text-sm font-medium text-zinc-900 mb-4">学院分布</h2>
            <div v-if="loading" class="text-sm text-zinc-400">加载中...</div>
            <div v-else-if="!stats?.collegeDist?.length" class="text-sm text-zinc-400 py-4 text-center">暂无数据</div>
            <div v-else class="space-y-3">
              <div v-for="c in stats.collegeDist" :key="c.college">
                <div class="flex justify-between text-sm mb-1">
                  <span class="text-zinc-600 truncate mr-2">{{ c.college }}</span>
                  <span class="text-zinc-400 flex-shrink-0">{{ c.count }}</span>
                </div>
                <div class="h-2 bg-zinc-100 rounded-full overflow-hidden">
                  <div class="h-full bg-blue-500 rounded-full transition-all" :style="{ width: barWidth(c.count, collegeMax) + '%' }"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
