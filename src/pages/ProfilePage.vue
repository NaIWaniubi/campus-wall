<script setup lang="ts">
/**
 * 个人中心：用户信息卡片、信誉分、功能入口、退出登录
 */
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  FileText, MessageCircle, Bookmark, Bell, Settings, Shield,
  LogOut, Camera, Loader2, ChevronRight, Edit3, Star, Users,
  ThumbsUp, MessageSquarePlus,
} from '@lucide/vue'
import { useUserStore } from '@/stores/user'
import { useAppStore } from '@/stores/app'
import { uploadApi, tradeApi, followApi } from '@/utils/api'
import { creditColor, formatTime } from '@/utils/helpers'
import { toast } from '@/utils/request'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import CreditBadge from '@/components/CreditBadge.vue'
import FeedbackDialog from '@/components/FeedbackDialog.vue'

const router = useRouter()
const userStore = useUserStore()
const appStore = useAppStore()

const showLogout = ref(false)
const uploading = ref(false)
const showFeedback = ref(false)

// 交易互评（展示最近 3 条）
const ratings = ref<any[]>([])
const ratingTotal = ref(0)
const ratingAvg = ref<number | null>(null)

async function loadTradeRatings() {
  try {
    const res: any = await tradeApi.ratingsOf(userStore.user!.id)
    ratings.value = res.data.list || []
    ratingTotal.value = res.data.total || 0
    ratingAvg.value = res.data.avg ?? null
  } catch {
    // 静默失败，不打扰主页
  }
}

// ---------- 关注 / 粉丝 ----------
const followingTotal = ref(0)
const followersTotal = ref(0)
// 主卡数字：各取 pageSize=1 拿 total，最省流量
async function loadFollowCounts() {
  try {
    const [f1, f2]: any[] = await Promise.all([
      followApi.followingList(userStore.user!.id, { page: 1, pageSize: 1 }),
      followApi.followersList(userStore.user!.id, { page: 1, pageSize: 1 }),
    ])
    followingTotal.value = f1.data?.total || 0
    followersTotal.value = f2.data?.total || 0
  } catch {
    // 静默失败，不打扰主页
  }
}

type FollowTab = 'following' | 'followers'
const followTab = ref<FollowTab>('following')
const followUsers = ref<any[]>([])
const followLoading = ref(false)
const followPage = ref(1)
const followHasMore = ref(false)

async function loadFollowList(reset = false) {
  if (followLoading.value) return
  followLoading.value = true
  const page = reset ? 1 : followPage.value + 1
  try {
    const api = followTab.value === 'following' ? followApi.followingList : followApi.followersList
    const res: any = await api(userStore.user!.id, { page, pageSize: 20 })
    const incoming = res.data?.list || []
    followUsers.value = reset ? incoming : [...followUsers.value, ...incoming]
    followPage.value = res.data?.page || page
    followHasMore.value = !!res.data?.hasMore
  } catch {
    // 错误已由拦截器 toast
  } finally {
    followLoading.value = false
  }
}

function switchFollowTab(t: FollowTab) {
  if (followTab.value === t) return
  followTab.value = t
  loadFollowList(true)
}

const followSectionRef = ref<HTMLElement | null>(null)
function gotoFollow(t: FollowTab) {
  followTab.value = t
  if (!followUsers.value.length) loadFollowList(true)
  followSectionRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

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
    { label: '我的点赞', icon: ThumbsUp, path: '/my-likes' },
    { label: '草稿箱', icon: Edit3, path: '/profile/drafts' },
    { label: '消息通知', icon: Bell, path: '/message', badge: appStore.unreadCount || 0 },
    { label: '账号设置', icon: Settings, path: '/profile/settings' },
    { label: '意见反馈', icon: MessageSquarePlus, action: 'feedback' },
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

function onMenuClick(item: any) {
  if (item.action === 'feedback') {
    showFeedback.value = true
    return
  }
  go(item.path)
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
    loadTradeRatings()
    loadFollowCounts()
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
              <CreditBadge :score="credit" size="sm" />
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
        <!-- 关注 / 粉丝 -->
        <div class="mt-3 flex items-center gap-6 text-sm">
          <button class="flex items-baseline gap-1.5 hover:opacity-80 transition" @click="gotoFollow('following')">
            <span class="text-lg font-bold">{{ followingTotal }}</span>
            <span class="text-white/80">关注</span>
          </button>
          <button class="flex items-baseline gap-1.5 hover:opacity-80 transition" @click="gotoFollow('followers')">
            <span class="text-lg font-bold">{{ followersTotal }}</span>
            <span class="text-white/80">粉丝</span>
          </button>
        </div>
      </div>
    </header>

    <main class="max-w-[960px] mx-auto px-4 -mt-6 space-y-4">
      <!-- 信誉分卡片 -->
      <div class="bg-white rounded-xl shadow-sm p-4">
        <div class="flex items-center justify-between mb-2">
          <div class="flex items-center gap-2">
            <span class="text-sm font-medium text-zinc-700">信誉分</span>
            <CreditBadge :score="credit" size="md" />
          </div>
          <span class="text-xl font-bold" :style="{ color: creditColor(credit) }">{{ credit }}</span>
        </div>
        <div class="h-2.5 rounded-full bg-zinc-100 overflow-hidden">
          <div class="h-full rounded-full transition-all duration-500 bg-gradient-to-r from-current to-white/30" :style="{ width: Math.min(credit, 100) + '%', color: creditColor(credit), backgroundColor: creditColor(credit) }"></div>
        </div>
        <p class="text-xs text-zinc-400 mt-2">{{ permissionText }}</p>
      </div>

      <!-- 交易评价 -->
      <div class="bg-white rounded-xl shadow-sm p-4">
        <div class="flex items-center justify-between mb-1">
          <div class="flex items-center gap-2">
            <span class="text-sm font-medium text-zinc-700">交易评价</span>
            <span v-if="ratingAvg !== null" class="text-xs font-medium text-amber-500">{{ ratingAvg }} 分</span>
          </div>
          <span v-if="ratingTotal > 0" class="text-xs text-zinc-400">共 {{ ratingTotal }} 条</span>
        </div>
        <p v-if="!ratings.length" class="text-xs text-zinc-400 py-2">暂无交易评价，完成二手交易后可获得互评</p>
        <div v-else class="divide-y divide-zinc-50">
          <div v-for="r in ratings.slice(0, 3)" :key="r.id" class="flex items-start gap-2.5 py-2.5">
            <div class="w-7 h-7 rounded-full bg-zinc-100 flex-shrink-0 overflow-hidden flex items-center justify-center">
              <img v-if="r.rater?.avatar" :src="r.rater.avatar" class="w-full h-full object-cover" alt="" />
              <span v-else class="text-xs text-zinc-400">{{ r.rater?.nickname?.charAt(0) || '匿' }}</span>
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span class="text-xs font-medium text-zinc-600 truncate">{{ r.rater?.nickname || '匿名用户' }}</span>
                <div class="flex gap-px">
                  <Star v-for="i in 5" :key="i" class="w-3 h-3"
                    :class="i <= r.rating ? 'text-amber-400 fill-amber-400' : 'text-zinc-200'" />
                </div>
                <span class="ml-auto text-[11px] text-zinc-300 flex-shrink-0">{{ formatTime(r.createdAt) }}</span>
              </div>
              <p v-if="r.comment" class="text-xs text-zinc-500 mt-0.5 line-clamp-2">{{ r.comment }}</p>
              <p class="text-[11px] text-zinc-300 mt-0.5 truncate">来自「{{ r.postTitle }}」</p>
            </div>
          </div>
        </div>
      </div>

      <!-- 关注 / 粉丝 -->
      <div ref="followSectionRef" class="bg-white rounded-xl shadow-sm p-4 scroll-mt-16">
        <div class="flex items-center gap-2 mb-3">
          <Users class="w-4 h-4 text-brand-500" />
          <span class="text-sm font-medium text-zinc-700">关注与粉丝</span>
          <div class="ml-auto flex items-center bg-zinc-100 rounded-full p-0.5 text-xs">
            <button class="px-3 py-1 rounded-full transition"
              :class="followTab === 'following' ? 'bg-white text-brand-600 font-medium shadow-sm' : 'text-zinc-500'"
              @click="switchFollowTab('following')">关注 {{ followingTotal }}</button>
            <button class="px-3 py-1 rounded-full transition"
              :class="followTab === 'followers' ? 'bg-white text-brand-600 font-medium shadow-sm' : 'text-zinc-500'"
              @click="switchFollowTab('followers')">粉丝 {{ followersTotal }}</button>
          </div>
        </div>
        <p v-if="!followLoading && !followUsers.length" class="text-xs text-zinc-400 py-2">
          {{ followTab === 'following' ? '还没有关注的人，去帖子详情关注感兴趣的作者吧' : '还没有粉丝，多发帖互动会被更多人关注' }}
        </p>
        <div v-else class="divide-y divide-zinc-50">
          <div v-for="u in followUsers" :key="u.id" class="flex items-center gap-2.5 py-2.5">
            <div class="w-9 h-9 rounded-full bg-gradient-to-br from-brand-100 to-brand-200 flex items-center justify-center overflow-hidden flex-shrink-0">
              <img v-if="u.avatar" :src="u.avatar" class="w-full h-full object-cover" alt="" />
              <span v-else class="text-sm font-bold text-brand-700">{{ u.nickname?.charAt(0) || '友' }}</span>
            </div>
            <span class="flex-1 min-w-0 truncate text-sm text-zinc-700">{{ u.nickname || '用户' }}</span>
            <CreditBadge :score="u.creditScore || 0" size="sm" />
          </div>
        </div>
        <button v-if="followHasMore"
          class="w-full mt-2 py-2 text-xs text-brand-600 hover:bg-brand-50 rounded-lg transition"
          :disabled="followLoading"
          @click="loadFollowList()">
          {{ followLoading ? '加载中...' : '加载更多' }}
        </button>
      </div>

      <!-- 功能入口列表 -->
      <div class="bg-white rounded-xl shadow-sm overflow-hidden">
        <button v-for="item in menuItems" :key="item.path || item.label"
          class="w-full flex items-center gap-3 px-4 py-3.5 border-b border-zinc-50 last:border-0 hover:bg-zinc-50 transition active:bg-zinc-100"
          @click="onMenuClick(item)">
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

    <FeedbackDialog v-model:visible="showFeedback" />
  </div>
</template>

