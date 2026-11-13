<script setup lang="ts">
/**
 * 管理后台布局：左侧导航 + 顶部当前管理员标识 + 退出/返回前台
 * V4：墨色侧栏 + 荧光选中态，纸底内容区（控制台也要有海报体系的骨架感）
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
  <div class="min-h-screen" style="background: var(--paper)">
    <!-- 桌面侧边栏：墨色画布 -->
    <aside class="ds-poster hidden md:flex flex-col w-[208px] fixed inset-y-0 left-0 z-20">
      <div class="h-14 flex items-center px-4" style="border-bottom: 1px solid rgb(255 255 255 / 0.1)">
        <span class="w-6 h-6 rounded-[7px] flex items-center justify-center shrink-0" style="background: var(--lime)">
          <Shield class="w-3.5 h-3.5" style="color: var(--ink)" />
        </span>
        <span class="ds-display text-[15px] ml-2 text-white whitespace-nowrap">校园墙<span style="color: var(--lime)">后台</span></span>
      </div>
      <nav class="flex-1 py-3 px-2.5 space-y-1 overflow-y-auto">
        <router-link
          v-for="item in visibleNav"
          :key="item.path"
          :to="item.path"
          class="flex items-center gap-2.5 px-3 py-2 rounded-[10px] text-[13px] transition"
          :class="isActive(item.path) ? 'font-extrabold' : 'font-semibold'"
          :style="isActive(item.path)
            ? 'background: var(--lime); color: #14110F'
            : 'color: rgb(247 242 232 / 0.62)'"
        >
          <component :is="item.icon" class="w-4 h-4 shrink-0" />
          {{ item.name }}
        </router-link>
      </nav>
      <div class="p-2.5 space-y-1" style="border-top: 1px solid rgb(255 255 255 / 0.1)">
        <router-link
          to="/"
          class="flex items-center gap-2.5 px-3 py-2 rounded-[10px] text-[13px] font-semibold transition"
          style="color: rgb(247 242 232 / 0.62)"
        >
          <Home class="w-4 h-4" /> 返回前台
        </router-link>
        <button
          type="button"
          class="w-full flex items-center gap-2.5 px-3 py-2 rounded-[10px] text-[13px] font-semibold transition"
          style="color: var(--coral)"
          @click="onLogout"
        >
          <LogOut class="w-4 h-4" /> 退出登录
        </button>
      </div>
    </aside>

    <div class="md:ml-[208px] min-h-screen flex flex-col">
      <!-- 顶部栏：纸底 + 墨线 -->
      <header class="h-14 flex items-center justify-between px-4 md:px-6 sticky top-0 z-10" style="background: var(--paper); border-bottom: 1.5px solid var(--ink)">
        <h1 class="ds-display text-[18px]" style="color: var(--ink)">{{ currentTitle }}</h1>
        <div class="flex items-center gap-3">
          <div class="flex items-center gap-2">
            <img
              v-if="userStore.user?.avatar"
              :src="userStore.user.avatar"
              class="w-7 h-7 object-cover"
              style="border: 1.5px solid var(--ink); border-radius: 9px"
              alt=""
            />
            <div
              v-else
              class="w-7 h-7 flex items-center justify-center text-[12px] font-black"
              style="background: var(--lime); color: var(--ink); border: 1.5px solid var(--ink); border-radius: 9px"
            >
              {{ (userStore.user?.nickname || '管')[0] }}
            </div>
            <span class="text-sm font-semibold hidden sm:inline" style="color: var(--ink)">{{ userStore.user?.nickname }}</span>
            <!-- 昵称恰好等于角色名时（如超管默认昵称「超级管理员」）不再重复展示角色标签 -->
            <span
              v-if="userStore.user?.nickname !== roleLabel"
              class="px-1.5 py-0.5 text-[11px] font-bold whitespace-nowrap"
              style="border: 1px solid var(--line); border-radius: 6px; color: var(--ink-soft)"
            >{{ roleLabel }}</span>
          </div>
          <router-link to="/" class="text-[12.5px] font-bold underline underline-offset-2 hidden sm:inline" style="color: var(--ink-mute)">返回前台</router-link>
          <button
            type="button"
            class="ds-btn ds-btn--sm ds-btn--danger"
            @click="onLogout"
          >
            <LogOut class="w-3.5 h-3.5" /> 退出
          </button>
        </div>
      </header>

      <!-- 移动端导航：横向滚动 chips -->
      <div class="md:hidden sticky top-14 z-10" style="background: var(--paper); border-bottom: 1.5px solid var(--ink)">
        <div class="flex items-center gap-1.5 px-2.5 h-11 overflow-x-auto scrollbar-hide ds-scroll-x">
          <router-link
            v-for="item in visibleNav"
            :key="item.path"
            :to="item.path"
            class="ds-chip !py-1 !text-[11.5px] whitespace-nowrap shrink-0"
            :class="{ 'is-active': isActive(item.path) }"
          >
            <component :is="item.icon" class="w-3.5 h-3.5" /> {{ item.name }}
          </router-link>
          <router-link to="/" class="ds-chip !py-1 !text-[11.5px] whitespace-nowrap shrink-0">
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
