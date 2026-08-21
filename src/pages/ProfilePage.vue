<script setup lang="ts">
/**
 * 个人中心：用户信息卡片、信誉分、功能入口、退出登录
 */
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  FileText, MessageCircle, Bookmark, Bell, Settings, Shield,
  LogOut, Camera, Loader2, ChevronRight, Edit3,
} from 'lucide-vue-next'
import { useUserStore } from '@/stores/user'
import { useAppStore } from '@/stores/app'
import { uploadApi } from '@/utils/api'
import { creditColor, creditLevel } from '@/utils/helpers'
import { toast } from '@/utils/request'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

const router = useRouter()
const userStore = useUserStore()
const appStore = useAppStore()

const showLogout = ref(false)
const uploading = ref(false)

const user = computed(() => userStore.user)
const credit = computed(() => user.value?.credit_score || 0)
const permissionText = computed(() => {
  if (!userStore.canPost) return '信誉分低于60，暂不可发帖/评论'
  if (userStore.canAnonymous) return `可发帖、可匿名 · 每日上限 ${userStore.postLimit} 条`
  return `可发帖、不可匿名 · 每日上限 ${userStore.postLimit} 条`
})

const menuItems = computed(() => {
  const items: any[] = [
    { label: '我的帖子', icon: FileText, path: '/profile/posts' },
    { label: '我的评论', icon: MessageCircle, path: '/profile/comments' },
    { label: '我的收藏', icon: Bookmark, path: '/profile/favorites' },
    { label: '草稿箱', icon: Edit3, path: '/profile/drafts' },
    { label: '消息通知', icon: Bell, path: '/message', badge: appStore.unreadCount || 0 },
    { label: '账号设置', icon: Settings, path: '/profile/settings' },
  ]
  if (userStore.isAdmin) {
    items.push({ label: '管理后台', icon: Shield, path: '/admin' })
  }
  return items
})

async function onAvatarChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  if (file.size > 5 * 1024 * 1024) {
    toast.error('图片不能超过5MB')
    input.value = ''
    return
  }
  uploading.value = true
  try {
    const res: any = await uploadApi.upload(file)
    await userStore.updateProfile({ avatar: res.data.url })
    toast.success('头像已更新')
  } catch {
    // 错误已由拦截器 toast
  } finally {
    uploading.value = false
    input.value = ''
  }
}

function go(path: string) {
  router.push(path)
}

function confirmLogout() {
  showLogout.value = false
  userStore.logout()
  toast.success('已退出登录')
  router.replace('/login')
}

onMounted(() => {
  if (userStore.isLoggedIn) {
    appStore.fetchUnreadCount().catch(() => {})
  }
})
</script>

<template>
  <div class="min-h-screen bg-zinc-50 pb-6">
    <!-- 顶部用户信息卡片 -->
    <header class="bg-gradient-to-b from-brand-500 to-brand-600 text-white px-4 pt-8 pb-12">
      <div class="max-w-[960px] mx-auto">
        <div class="flex items-center gap-4">
          <!-- 头像 -->
          <div class="relative">
            <div class="w-20 h-20 rounded-full bg-gradient-to-br from-white/30 to-white/10 backdrop-blur overflow-hidden border-2 border-white/50 flex items-center justify-center shadow-lg">
              <img v-if="user?.avatar" :src="user.avatar" class="w-full h-full object-cover" alt="头像" />
              <span v-else class="text-2xl font-bold text-white drop-shadow">{{ user?.nickname?.charAt(0) || '我' }}</span>
            </div>
            <label class="absolute bottom-0 right-0 w-6 h-6 rounded-full bg-white text-brand-600 flex items-center justify-center shadow cursor-pointer">
              <Loader2 v-if="uploading" class="w-3.5 h-3.5 animate-spin" />
              <Camera v-else class="w-3.5 h-3.5" />
              <input type="file" accept="image/jpeg,image/png" class="hidden" @change="onAvatarChange" />
            </label>
          </div>
          <!-- 昵称 + 学号 -->
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-1">
              <span class="text-lg font-bold truncate">{{ user?.nickname || '未设置' }}</span>
              <span v-if="userStore.isAdmin" class="px-1.5 py-0.5 rounded bg-white/20 text-xs flex items-center gap-0.5">
                <Shield class="w-3 h-3" /> 管理员
              </span>
            </div>
            <div class="text-xs text-white/80 space-y-0.5">
              <p>学号：{{ user?.student_id || '-' }}</p>
              <p>{{ user?.college || '未设置学院' }} · {{ user?.grade || '未设置年级' }}</p>
            </div>
          </div>
        </div>
        <!-- 个性签名 -->
        <p v-if="user?.signature" class="mt-4 text-sm text-white/90 italic line-clamp-1">
          "{{ user.signature }}"
        </p>
      </div>
    </header>

    <main class="max-w-[960px] mx-auto px-4 -mt-6 space-y-4">
      <!-- 信誉分卡片 -->
      <div class="bg-white rounded-xl shadow-sm p-4">
        <div class="flex items-center justify-between mb-2">
          <div class="flex items-center gap-2">
            <span class="text-sm font-medium text-zinc-700">信誉分</span>
            <span class="text-xs px-1.5 py-0.5 rounded" :style="{ color: creditColor(credit), backgroundColor: creditColor(credit) + '20' }">
              {{ creditLevel(credit) }}
            </span>
          </div>
          <span class="text-xl font-bold" :style="{ color: creditColor(credit) }">{{ credit }}</span>
        </div>
        <div class="h-2.5 rounded-full bg-zinc-100 overflow-hidden">
          <div class="h-full rounded-full transition-all duration-500 bg-gradient-to-r from-current to-white/30" :style="{ width: Math.min(credit, 100) + '%', color: creditColor(credit), backgroundColor: creditColor(credit) }"></div>
        </div>
        <p class="text-xs text-zinc-400 mt-2">{{ permissionText }}</p>
      </div>

      <!-- 功能入口列表 -->
      <div class="bg-white rounded-xl shadow-sm overflow-hidden">
        <button v-for="item in menuItems" :key="item.path"
          class="w-full flex items-center gap-3 px-4 py-3.5 border-b border-zinc-50 last:border-0 hover:bg-zinc-50 transition active:bg-zinc-100"
          @click="go(item.path)">
          <div class="w-8 h-8 rounded-lg bg-brand-50 flex items-center justify-center flex-shrink-0">
            <component :is="item.icon" class="w-4 h-4 text-brand-500" />
          </div>
          <span class="flex-1 text-left text-sm text-zinc-700">{{ item.label }}</span>
          <span v-if="item.badge > 0" class="px-1.5 py-0.5 rounded-full bg-red-500 text-white text-xs min-w-[20px] text-center">{{ item.badge }}</span>
          <ChevronRight class="w-4 h-4 text-zinc-300" />
        </button>
      </div>

      <!-- 退出登录 -->
      <button class="w-full py-3 bg-white rounded-xl shadow-sm text-red-500 font-medium hover:bg-red-50 transition flex items-center justify-center gap-2"
        @click="showLogout = true">
        <LogOut class="w-4 h-4" /> 退出登录
      </button>
    </main>

    <ConfirmDialog :visible="showLogout" content="确定要退出登录吗？" confirm-text="退出" danger
      @confirm="confirmLogout" @cancel="showLogout = false" />
  </div>
</template>
