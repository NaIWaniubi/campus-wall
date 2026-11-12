<script setup lang="ts">
/**
 * 移动端底部 TabBar：首页 / 话题 / 发布 / 消息 / 我的
 * V4：激活项 = 墨色胶囊 + 荧光字（纸感海报体系），未激活为纸色底灰字。
 * 仅在 < 640px 显示，且只在主 Tab 页面出现（详情页/登录页/后台自带底部操作条，不显示）。
 */
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Home, LayoutGrid, Plus, Bell, User } from '@lucide/vue'
import { useAppStore } from '@/stores/app'
import { useUserStore } from '@/stores/user'

const route = useRoute()
const router = useRouter()
const appStore = useAppStore()
const userStore = useUserStore()

const visible = computed(() => {
  const p = route.path
  if (p.startsWith('/post/') || p.startsWith('/admin') || p === '/login' || p === '/register') return false
  if (p === '/publish') return false
  return p === '/' || p === '/topics' || p.startsWith('/section/') || p === '/message' || p === '/profile'
})

const tabs = [
  { key: 'home', label: '首页', icon: Home, to: '/' },
  { key: 'topics', label: '话题', icon: LayoutGrid, to: '/topics' },
  { key: 'publish', label: '发布', icon: Plus, to: '/publish' },
  { key: 'message', label: '消息', icon: Bell, to: '/message' },
  { key: 'profile', label: '我的', icon: User, to: '/profile' },
] as const

function isActive(key: string): boolean {
  const p = route.path
  if (key === 'home') return p === '/' || p.startsWith('/section/')
  if (key === 'topics') return p === '/topics'
  if (key === 'profile') return p.startsWith('/profile') || p === '/my-likes'
  return p === `/${key}`
}

function go(to: string, key: string) {
  if ((key === 'message' || key === 'publish') && !userStore.isLoggedIn) {
    router.push({ path: '/login', query: { redirect: to } })
    return
  }
  router.push(to)
}
</script>

<template>
  <template v-if="visible">
    <!-- 占位：避免 fixed 导航遮住页面底部内容 -->
    <div class="h-[54px] md:hidden" aria-hidden="true"></div>
    <nav
      class="bottom-nav fixed bottom-0 inset-x-0 z-30 md:hidden"
      style="padding-bottom: env(safe-area-inset-bottom)"
      aria-label="主导航"
    >
      <div class="flex items-stretch h-[54px]">
        <button
          v-for="t in tabs"
          :key="t.key"
          class="ds-tab flex-1 flex items-center justify-center transition active:scale-95"
          :class="{ 'is-active': isActive(t.key) }"
          :aria-current="isActive(t.key) ? 'page' : undefined"
          :aria-label="t.label"
          @click="go(t.to, t.key)"
        >
          <span class="ds-tab__pill">
            <span class="relative">
              <component :is="t.icon" class="w-[20px] h-[20px]" />
              <span
                v-if="t.key === 'message' && appStore.unreadCount > 0"
                class="absolute -top-1 -right-1.5 w-2 h-2 rounded-full"
                style="background: var(--coral); box-shadow: 0 0 0 1.5px var(--paper)"
              ></span>
            </span>
            <span class="text-[10.5px] font-bold leading-none whitespace-nowrap">{{ t.label }}</span>
          </span>
        </button>
      </div>
    </nav>
  </template>
</template>
