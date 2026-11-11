<script setup lang="ts">
/**
 * 管理后台布局：左侧导航 + 顶部当前管理员标识 + 退出/返回前台
 */
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  LayoutDashboard, FileCheck, MessageSquare, Flag, Users,
  LayoutGrid, Inbox, Megaphone, Bot, Home, LogOut, Shield,
} from '@lucide/vue'
import { useUserStore } from '@/stores/user'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

// 权限矩阵与后端对齐：superOnly 项仅超管可见；section_admin 只见 内容审核/评论管理/举报处理
const navItems: { name: string; path: string; icon: any; superOnly?: boolean }[] = [
  { name: '数据总览', path: '/admin', icon: LayoutDashboard, superOnly: true },
  { name: '帖子治理', path: '/admin/posts', icon: FileCheck },
  { name: '评论管理', path: '/admin/comments', icon: MessageSquare },
  { name: '举报处理', path: '/admin/reports', icon: Flag },
  { name: '用户管理', path: '/admin/users', icon: Users, superOnly: true },
  { name: '板块管理', path: '/admin/sections', icon: LayoutGrid, superOnly: true },
  { name: '意见反馈', path: '/admin/feedbacks', icon: Inbox, superOnly: true },
  { name: '公告管理', path: '/admin/announcements', icon: Megaphone, superOnly: true },
  { name: 'AI 助手', path: '/admin/ai', icon: Bot, superOnly: true },
]

const visibleNav = computed(() =>
  userStore.isSuperAdmin ? navItems : navItems.filter((item) => !item.superOnly)
)

const roleLabel = computed(() => (userStore.isSuperAdmin ? '超级管理员' : '板块管理员'))
const currentTitle = computed(() => (route.meta.title as string) || '管理后台')

function isActive(path: string) {
  return route.path === path
}

function onLogout() {
  userStore.logout()
  router.replace('/admin/login')
}
</script>

<template>
  <div class="min-h-screen bg-zinc-50">
    <!-- 桌面侧边栏 -->
    <aside class="hidden md:flex flex-col w-[200px] fixed inset-y-0 left-0 bg-white border-r border-zinc-100 z-20">
      <div class="h-14 flex items-center px-4 border-b border-zinc-100">
        <Shield class="w-5 h-5 text-brand-500 mr-2" />
        <span class="font-semibold text-zinc-900 text-sm">校园墙后台</span>
      </div>
      <nav class="flex-1 py-2 px-2 space-y-0.5 overflow-y-auto">
        <router-link
          v-for="item in visibleNav"
          :key="item.path"
          :to="item.path"
          class="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition"
          :class="isActive(item.path) ? 'bg-brand-50 text-brand-600 font-medium' : 'text-zinc-600 hover:bg-zinc-50'"
        >
          <component :is="item.icon" class="w-4 h-4" />
          {{ item.name }}
        </router-link>
      </nav>
      <div class="p-2 border-t border-zinc-100 space-y-0.5">
        <router-link to="/" class="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-zinc-600 hover:bg-zinc-50">
          <Home class="w-4 h-4" /> 返回前台
        </router-link>
        <button
          class="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-zinc-600 hover:bg-red-50 hover:text-red-500"
          @click="onLogout"
        >
          <LogOut class="w-4 h-4" /> 退出登录
        </button>
      </div>
    </aside>

    <div class="md:ml-[200px] min-h-screen flex flex-col">
      <!-- 顶部栏 -->
      <header class="h-14 bg-white border-b border-zinc-100 flex items-center justify-between px-4 md:px-6 sticky top-0 z-10">
        <h1 class="font-medium text-zinc-900">{{ currentTitle }}</h1>
        <div class="flex items-center gap-3">
          <div class="flex items-center gap-2">
            <img
              v-if="userStore.user?.avatar"
              :src="userStore.user.avatar"
              class="w-7 h-7 rounded-full object-cover"
              alt=""
            />
            <div
              v-else
              class="w-7 h-7 rounded-full bg-brand-100 text-brand-600 flex items-center justify-center text-xs font-semibold"
            >
              {{ (userStore.user?.nickname || '管')[0] }}
            </div>
            <span class="text-sm text-zinc-700 hidden sm:inline">{{ userStore.user?.nickname }}</span>
            <!-- 昵称恰好等于角色名时（如超管默认昵称「超级管理员」）不再重复展示角色标签 -->
            <span
              v-if="userStore.user?.nickname !== roleLabel"
              class="px-1.5 py-0.5 rounded bg-brand-50 text-brand-600 text-xs whitespace-nowrap"
            >{{ roleLabel }}</span>
          </div>
          <router-link to="/" class="text-sm text-zinc-500 hover:text-brand-600 hidden sm:inline">返回前台</router-link>
          <button class="flex items-center gap-1 text-sm text-zinc-500 hover:text-red-500" @click="onLogout">
            <LogOut class="w-4 h-4" /> 退出
          </button>
        </div>
      </header>

      <!-- 移动端导航 -->
      <div class="md:hidden bg-white border-b border-zinc-100 sticky top-14 z-10">
        <div class="flex items-center gap-1 px-2 h-11 overflow-x-auto scrollbar-hide">
          <router-link
            v-for="item in visibleNav"
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

      <!-- 子页面 -->
      <main class="flex-1 p-4 md:p-6">
        <router-view />
      </main>
    </div>
  </div>
</template>
