<script setup lang="ts">
/**
 * 移动端底部 TabBar：首页 / 话题 / 发布 / 消息 / 我的
 * 逐项对齐原生小程序 app.json 的 tabBar（color #A4B0BE、selectedColor #16A085、白底）。
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
          class="flex-1 flex flex-col items-center justify-center gap-0.5 transition active:scale-95"
          :aria-current="isActive(t.key) ? 'page' : undefined"
          :aria-label="t.label"
          @click="go(t.to, t.key)"
        >
          <span class="relative">
            <component
              :is="t.icon"
              class="w-[22px] h-[22px] transition-transform"
              :style="isActive(t.key)
                ? { color: 'var(--color-brand-400)', filter: 'drop-shadow(0 4px 8px rgba(22,160,133,.35))', transform: 'translateY(-1px)' }
                : { color: '#A4B0BE' }"
            />
            <span
              v-if="t.key === 'message' && appStore.unreadCount > 0"
              class="absolute -top-1 -right-1.5 w-2 h-2 bg-red-500 rounded-full"
            ></span>
          </span>
          <span class="text-[10px] leading-none transition-colors"
            :style="isActive(t.key)
              ? { background: 'var(--grad-aurora-soft)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', fontWeight: 700 }
              : { color: '#A4B0BE', fontWeight: 400 }"
          >{{ t.label }}</span>
        </button>
      </div>
    </nav>
  </template>
</template>
