<script setup lang="ts">
/**
 * 个人中心：用户信息卡片、信誉分、功能入口、退出登录
 */
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  FileText, MessageCircle, Bookmark, Bell, Settings, Shield,
  LogOut, Camera, Loader2, ChevronRight, Edit3, Star, Users,
  ThumbsUp, MessageSquarePlus, BellRing,
} from '@lucide/vue'
import { useUserStore } from '@/stores/user'
import { useAppStore } from '@/stores/app'
import { uploadApi, tradeApi, followApi } from '@/utils/api'
import { formatTime } from '@/utils/helpers'
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
const credit = computed(() => user.value?.creditScore || 0)
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
    { label: '我的订阅', icon: BellRing, path: '/profile/subscriptions' },
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
  <div class="min-h-screen pb-24">
    <!-- 墨色海报头：方形贴纸头像 + 昵称 .ds-display + 信誉分大数字 -->
    <header class="hero px-4 pt-7 pb-8 rounded-b-[20px]">
      <div class="max-w-[960px] mx-auto">
        <div class="flex items-center gap-2">
          <span class="ds-sticker ds-sticker--coral">PROFILE</span>
          <span class="ds-label" style="color: rgb(255 255 255 / 0.45)">校园墙 · 个人中心</span>
        </div>

        <div class="mt-3 flex items-start gap-3.5">
          <!-- 方形贴纸头像 -->
          <div class="relative shrink-0">
            <div class="w-[76px] h-[76px] rounded-[16px] overflow-hidden flex items-center justify-center"
              style="background: var(--lime); border: 1.5px solid var(--paper); box-shadow: var(--shadow-hard-sm)">
              <img v-if="user?.avatar" :src="user.avatar" class="w-full h-full object-cover" alt="头像" />
              <span v-else class="ds-display text-[30px]" style="color: var(--ink)">{{ user?.nickname?.charAt(0) || '我' }}</span>
            </div>
            <label class="absolute -bottom-1.5 -right-1.5 w-7 h-7 rounded-[9px] flex items-center justify-center cursor-pointer"
              style="background: var(--paper); border: 1.5px solid var(--ink); color: var(--ink)">
              <Loader2 v-if="uploading" class="w-3.5 h-3.5 animate-spin" />
              <Camera v-else class="w-3.5 h-3.5" />
              <input type="file" accept="image/jpeg,image/png" class="hidden" @change="onAvatarChange" />
            </label>
          </div>

          <!-- 昵称 + 学号 -->
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <h1 class="ds-display text-[23px] text-white max-w-full truncate">{{ user?.nickname || '未设置' }}</h1>
              <CreditBadge :score="credit" size="sm" />
              <span v-if="userStore.isAdmin" class="ds-sticker ds-sticker--sky shrink-0">
                <Shield class="w-3 h-3" /> 管理员
              </span>
            </div>
            <div class="mt-1.5 space-y-0.5 text-[12px]" style="color: rgb(255 255 255 / 0.72)">
              <p class="truncate">学号：{{ user?.studentId || '-' }}</p>
              <p class="truncate">{{ user?.college || '未设置学院' }} · {{ user?.grade || '未设置年级' }}</p>
            </div>
          </div>

          <!-- 信誉分大数字 -->
          <div class="shrink-0 text-right pl-1">
            <div class="ds-display ds-num text-[32px] leading-none" style="color: var(--lime)">{{ credit }}</div>
            <div class="ds-label mt-1" style="color: rgb(255 255 255 / 0.45)">信誉分</div>
          </div>
        </div>

        <!-- 个性签名 -->
        <p v-if="user?.signature" class="mt-3.5 text-[13px] italic line-clamp-1" style="color: rgb(255 255 255 / 0.85)">
          "{{ user.signature }}"
        </p>
      </div>
    </header>

    <main class="max-w-[960px] mx-auto px-3 pt-3 space-y-3">
      <!-- 数据三宫格：关注 / 粉丝 / 交易评价 -->
      <section class="ds-card ds-card--flat grid grid-cols-3 overflow-hidden">
        <button class="flex flex-col items-center gap-1 py-3.5 transition active:translate-y-[1px]" @click="gotoFollow('following')">
          <span class="ds-display ds-num text-[22px] leading-none" style="color: var(--ink)">{{ followingTotal }}</span>
          <span class="ds-label">关注</span>
        </button>
        <button class="flex flex-col items-center gap-1 py-3.5 transition active:translate-y-[1px]"
          style="border-left: 1px solid var(--hairline)" @click="gotoFollow('followers')">
          <span class="ds-display ds-num text-[22px] leading-none" style="color: var(--ink)">{{ followersTotal }}</span>
          <span class="ds-label">粉丝</span>
        </button>
        <div class="flex flex-col items-center gap-1 py-3.5" style="border-left: 1px solid var(--hairline)">
          <span class="ds-display ds-num text-[22px] leading-none" style="color: var(--coral)">{{ ratingTotal }}</span>
          <span class="ds-label">评价</span>
        </div>
      </section>

      <!-- 信誉分 -->
      <section class="ds-card p-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="ds-label">信誉分</span>
            <CreditBadge :score="credit" size="md" />
          </div>
          <span class="ds-display ds-num text-[20px] leading-none" style="color: var(--ink)">{{ credit }}</span>
        </div>
        <div class="mt-3 h-2.5" style="background: var(--paper); border: 1px solid var(--ink)">
          <div class="h-full transition-all duration-500"
            :style="{ width: Math.min(credit, 100) + '%', background: 'var(--lime)' }"></div>
        </div>
        <p class="mt-2 text-[12px]" style="color: var(--ink-mute)">{{ permissionText }}</p>
      </section>

      <!-- 交易评价 -->
      <section class="ds-card p-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="ds-label">交易评价</span>
            <span v-if="ratingAvg !== null" class="text-[12px] font-bold" style="color: var(--coral)">{{ ratingAvg }} 分</span>
          </div>
          <span v-if="ratingTotal > 0" class="ds-label">共 {{ ratingTotal }} 条</span>
        </div>
        <p v-if="!ratings.length" class="mt-2 text-[12px] leading-relaxed" style="color: var(--ink-mute)">暂无交易评价，完成二手交易后可获得互评</p>
        <div v-else class="mt-1">
          <div v-for="r in ratings.slice(0, 3)" :key="r.id" class="flex items-start gap-2.5 py-2.5"
            style="border-top: 1px solid var(--hairline)">
            <div class="w-7 h-7 rounded-[8px] flex-shrink-0 overflow-hidden flex items-center justify-center"
              style="background: var(--paper); border: 1px solid var(--hairline); color: var(--ink-mute)">
              <img v-if="r.rater?.avatar" :src="r.rater.avatar" class="w-full h-full object-cover" alt="" />
              <span v-else class="text-[12px] font-bold">{{ r.rater?.nickname?.charAt(0) || '匿' }}</span>
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span class="text-[12.5px] font-semibold truncate" style="color: var(--ink)">{{ r.rater?.nickname || '匿名用户' }}</span>
                <div class="flex gap-px">
                  <Star v-for="i in 5" :key="i" class="w-3 h-3"
                    :style="{ color: i <= r.rating ? 'var(--coral)' : 'var(--hairline)', fill: i <= r.rating ? 'var(--coral)' : 'none' }" />
                </div>
                <span class="ml-auto ds-num text-[11px] flex-shrink-0" style="color: var(--ink-mute)">{{ formatTime(r.createdAt) }}</span>
              </div>
              <p v-if="r.comment" class="mt-0.5 text-[12px] leading-relaxed line-clamp-2" style="color: var(--ink-soft)">{{ r.comment }}</p>
              <p class="mt-0.5 text-[11px] truncate" style="color: var(--ink-mute)">来自「{{ r.postTitle }}」</p>
            </div>
          </div>
        </div>
      </section>

      <!-- 关注与粉丝 -->
      <section ref="followSectionRef" class="ds-card p-4 scroll-mt-20">
        <div class="flex items-center gap-2 mb-3">
          <Users class="w-4 h-4" style="color: var(--violet)" />
          <span class="text-[15px] font-extrabold" style="color: var(--ink)">关注与粉丝</span>
          <div class="ml-auto flex items-center gap-1.5">
            <button class="ds-chip !py-1 !px-3 !text-[12px]"
              :class="{ 'is-active': followTab === 'following' }"
              @click="switchFollowTab('following')">关注 {{ followingTotal }}</button>
            <button class="ds-chip !py-1 !px-3 !text-[12px]"
              :class="{ 'is-active': followTab === 'followers' }"
              @click="switchFollowTab('followers')">粉丝 {{ followersTotal }}</button>
          </div>
        </div>
        <p v-if="!followLoading && !followUsers.length" class="py-2 text-[12px] leading-relaxed" style="color: var(--ink-mute)">
          {{ followTab === 'following' ? '还没有关注的人，去帖子详情关注感兴趣的作者吧' : '还没有粉丝，多发帖互动会被更多人关注' }}
        </p>
        <div v-else>
          <div v-for="u in followUsers" :key="u.id" class="flex items-center gap-2.5 py-2.5"
            style="border-top: 1px solid var(--hairline)">
            <div class="w-9 h-9 rounded-[10px] flex items-center justify-center overflow-hidden flex-shrink-0"
              style="background: var(--sky); color: var(--ink)">
              <img v-if="u.avatar" :src="u.avatar" class="w-full h-full object-cover" alt="" />
              <span v-else class="text-[14px] font-bold">{{ u.nickname?.charAt(0) || '友' }}</span>
            </div>
            <span class="flex-1 min-w-0 truncate text-[13px] font-semibold" style="color: var(--ink)">{{ u.nickname || '用户' }}</span>
            <CreditBadge :score="u.creditScore || 0" size="sm" />
          </div>
        </div>
        <button v-if="followHasMore" class="ds-btn ds-btn--sm w-full mt-3" :disabled="followLoading"
          @click="loadFollowList()">
          {{ followLoading ? '加载中...' : '加载更多' }}
        </button>
      </section>

      <!-- 功能入口：墨线行 + 右侧箭头 -->
      <section class="ds-card overflow-hidden">
        <button v-for="item in menuItems" :key="item.path || item.label"
          class="w-full flex items-center gap-3 px-4 py-3.5 border-b last:border-0 transition active:translate-y-[1px]"
          style="border-color: var(--hairline)"
          @click="onMenuClick(item)">
          <div class="w-8 h-8 rounded-[9px] flex items-center justify-center flex-shrink-0"
            style="background: var(--paper); border: 1px solid var(--hairline); color: var(--ink)">
            <component :is="item.icon" class="w-4 h-4" />
          </div>
          <span class="flex-1 text-left text-[13.5px] font-semibold" style="color: var(--ink-soft)">{{ item.label }}</span>
          <span v-if="item.badge > 0" class="ds-num px-1.5 py-0.5 text-[11px] font-bold min-w-[20px] text-center"
            style="background: var(--coral); color: var(--card); border-radius: 999px">{{ item.badge }}</span>
          <ChevronRight class="w-4 h-4 shrink-0" style="color: var(--ink-mute)" />
        </button>
      </section>

      <!-- 退出登录：描边危险色 -->
      <button class="ds-btn w-full"
        style="color: var(--coral); border-color: var(--coral); background: var(--card); box-shadow: none; border-radius: 14px"
        @click="showLogout = true">
        <LogOut class="w-4 h-4" /> 退出登录
      </button>
    </main>

    <ConfirmDialog :visible="showLogout" content="确定要退出登录吗？" confirm-text="退出" danger
      @confirm="confirmLogout" @cancel="showLogout = false" />

    <FeedbackDialog v-model:visible="showFeedback" />
  </div>
</template>

