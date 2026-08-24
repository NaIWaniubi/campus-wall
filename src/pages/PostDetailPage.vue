<script setup lang="ts">
/**
 * 帖子详情页：内容展示、互动、评论楼中楼、举报、删除
 */
import { ref, reactive, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, MoreHorizontal, Heart, MessageCircle, Bookmark, Flag, Eye, Trash2, Share2, X, Send, Flame, Loader2, ChevronLeft, ChevronRight, MessagesSquare, UserPlus, UserCheck, Star } from '@lucide/vue'
import { useUserStore } from '@/stores/user'
import { postApi, commentApi, conversationApi, followApi, tradeApi } from '@/utils/api'
import { formatTime } from '@/utils/helpers'
import { toast } from '@/utils/request'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

const postId = computed(() => Number(route.params.id))
const post = ref<any>(null)
const comments = ref<any[]>([])
const loading = ref(true)
const commentText = ref('')
const replyTarget = ref<any>(null) // 回复目标评论
const expandedReplies = ref<Set<number>>(new Set())
const showMoreMenu = ref(false)
const showReportSheet = ref(false)
const showDeleteDialog = ref(false)
const previewIndex = ref(-1)
// 九宫格用服务端缩略图，点击预览用原图；缩略图缺失时回退原图
const gridImages = computed(() =>
  (post.value?.images || []).map((img: string, i: number) => post.value?.thumbImages?.[i] || img)
)
function onThumbError(e: Event, fallback: string) {
  const el = e.target as HTMLImageElement
  if (el.src.endsWith('.thumb.webp')) el.src = fallback
}
const commentInputRef = ref<HTMLInputElement | null>(null)
// 失物招领智能匹配：与本帖相似的候选帖列表
const matches = ref<any[]>([])
// 从消息中心匹配通知跳入（?showMatches=1）：定位并短暂高亮匹配卡片
const matchesCardRef = ref<HTMLElement | null>(null)
const matchesHighlighted = ref(false)

const reportReasons = ['垃圾广告', '人身攻击', '色情低俗', '违法违规', '其他']
const commentPosting = ref(false)
// 后端返回 isMine 字段，匿名帖子也能正确判断作者身份，用于显示删除按钮
const isAuthor = computed(() => !!post.value?.isMine)
const isPending = computed(() => post.value?.status === 'pending')
const canInteract = computed(() => !isPending.value)
// 未登录时也禁用评论输入，提示登录
const canComment = computed(() => userStore.isLoggedIn && !isPending.value)

// ---------- 作者互动：私信 / 关注 ----------
// 非匿名且非本人时才展示（匿名作者不可私信/关注，避免暴露身份）
const canInteractWithAuthor = computed(() =>
  !!post.value && !post.value.isAnonymous && !isAuthor.value && !!post.value.author?.id && !isPending.value
)
// 作者信息区可点击跳转他人主页（匿名帖不暴露身份）
const canViewAuthorProfile = computed(() => !!post.value && !post.value.isAnonymous && !!post.value.author?.id)
function goAuthorProfile() {
  if (!canViewAuthorProfile.value) return
  router.push(`/user/${post.value.author.id}`)
}
const showFollowBtn = computed(() => canInteractWithAuthor.value)
const showDmBtn = computed(() => userStore.isLoggedIn && canInteractWithAuthor.value)
const followFollowing = ref(false)
const followBusy = ref(false)

async function loadFollowStatus() {
  if (!showDmBtn.value) return
  try {
    const res: any = await followApi.followStatus(post.value.author.id)
    followFollowing.value = !!res.data.following
  } catch {
    // 静默失败，按钮按未关注处理
  }
}

function goLogin() {
  router.push({ path: '/login', query: { redirect: route.fullPath } })
}

async function toggleFollow() {
  if (!userStore.isLoggedIn || !canInteractWithAuthor.value) return goLogin()
  if (followBusy.value) return
  followBusy.value = true
  const prev = followFollowing.value
  followFollowing.value = !prev // 乐观更新，失败回滚
  try {
    const res: any = await followApi.followToggle(post.value.author.id)
    followFollowing.value = !!res.data.following
  } catch {
    followFollowing.value = prev
  } finally {
    followBusy.value = false
  }
}

async function startChat() {
  if (!userStore.isLoggedIn || !canInteractWithAuthor.value) return goLogin()
  if (followBusy.value) return
  followBusy.value = true
  try {
    const res: any = await conversationApi.create(post.value.author.id)
    router.push({ path: '/message', query: { tab: 'chat', conv: res.data.id } })
  } catch {
    // 错误已由拦截器 toast
  } finally {
    followBusy.value = false
  }
}

// ---------- 二手交易闭环：标记已售 / 买家互评 ----------
const isTradeSection = computed(() => {
  const name = post.value?.section?.name || ''
  return name.includes('二手') || name.includes('交易')
})
const soldAt = computed(() => post.value?.extraFields?.soldAt as string | undefined)
// 作者本人 + 二手交易板块 + 未标记售出 → 可标记已售
const canMarkSold = computed(() => isAuthor.value && isTradeSection.value && !soldAt.value && post.value?.status === 'published')
const markingSold = ref(false)

async function markSold() {
  if (markingSold.value) return
  markingSold.value = true
  try {
    const res: any = await tradeApi.complete(postId.value)
    post.value.extraFields = { ...(post.value.extraFields || {}), soldAt: res.data.soldAt }
    toast.success('已标记交易完成')
  } catch {
    // 错误已由拦截器 toast
  } finally {
    markingSold.value = false
  }
}

// 买家互评：非作者 + 已登录 + 已售帖；每人每帖仅一次（重复提交由后端拦截）
const canRateAsBuyer = computed(() => userStore.isLoggedIn && !isAuthor.value && !!soldAt.value && post.value?.status === 'published')
const hasRated = ref(false)
const showRateDialog = ref(false)
const rateScore = ref(0)
const rateComment = ref('')
const rateSubmitting = ref(false)

function openRateDialog() {
  rateScore.value = 0
  rateComment.value = ''
  showRateDialog.value = true
}

async function submitRate() {
  if (!rateScore.value) return toast.error('请先选择星级')
  if (rateSubmitting.value) return
  rateSubmitting.value = true
  try {
    await tradeApi.rate(postId.value, { rating: rateScore.value, comment: rateComment.value.trim() })
    hasRated.value = true
    showRateDialog.value = false
    toast.success('评价成功，感谢你的反馈')
  } catch (e: any) {
    // 错误已由拦截器 toast；重复评价时记住状态隐藏入口
    if (String(e?.message || '').includes('已评价')) hasRated.value = true
  } finally {
    rateSubmitting.value = false
  }
}

async function fetchPost() {
  loading.value = true
  try {
    const res: any = await postApi.detail(postId.value)
    post.value = res.data
    loadFollowStatus()
  } catch {
    toast.error('帖子不存在或已删除')
    router.replace('/')
  } finally {
    loading.value = false
  }
}

async function fetchComments() {
  try {
    const res: any = await commentApi.list(postId.value)
    comments.value = res.data || []
  } catch {
    comments.value = []
  }
}

async function fetchMatches() {
  try {
    const res: any = await postApi.matches(postId.value)
    matches.value = res.data || []
  } catch {
    matches.value = []
  }
}

async function toggleLike() {
  if (!userStore.isLoggedIn) return router.push({ path: '/login', query: { redirect: route.fullPath } })
  if (!canInteract.value) return toast.info('帖子审核中，暂不可互动')
  try {
    const res: any = await postApi.like(postId.value)
    post.value.liked = res.data.liked
    post.value.likeCount = res.data.likeCount
  } catch {}
}

async function toggleFavorite() {
  if (!userStore.isLoggedIn) return router.push({ path: '/login', query: { redirect: route.fullPath } })
  if (!canInteract.value) return toast.info('帖子审核中，暂不可互动')
  try {
    const res: any = await postApi.favorite(postId.value)
    post.value.favorited = res.data.favorited
    post.value.favoriteCount = res.data.favoriteCount
  } catch {}
}

async function toggleCommentLike(c: any) {
  if (!userStore.isLoggedIn) return goLogin() // 带 redirect 回跳，与同页其他登录墙一致（eng-publish 补修）
  try {
    const res: any = await commentApi.like(c.id)
    c.liked = res.data.liked
    c.likeCount = res.data.likeCount
  } catch {}
}

async function submitComment() {
  const text = commentText.value.trim()
  if (!text) return
  if (commentPosting.value) return
  if (!userStore.isLoggedIn) return router.push({ path: '/login', query: { redirect: route.fullPath } })
  if (!canInteract.value) return toast.info('帖子审核中，暂不可评论')
  if (!userStore.canComment) return toast.error('信誉分过低，暂不可评论')
  commentPosting.value = true
  try {
    if (replyTarget.value) {
      // 始终以顶级评论ID作为parent_id，保证后端能正确查询到该回复
      // 后端 formatComment 只查 parent_id = 顶级评论ID 的回复，
      // 若以回复ID作为parent_id，新回复会丢失
      const topComment = comments.value.find((c) => c.id === replyTarget.value.id) || replyTarget.value
      const targetId = topComment.id
      const res: any = await commentApi.reply(targetId, { content: text })
      if (!topComment.replies) topComment.replies = []
      topComment.replies.push(res.data)
      topComment.replyCount = (topComment.replyCount || 0) + 1
      // 自动展开回复以显示新回复；创建新 Set 触发响应式更新
      const s = new Set(expandedReplies.value)
      s.add(targetId)
      expandedReplies.value = s
      toast.success('回复成功')
    } else {
      const res: any = await commentApi.publish(postId.value, { content: text })
      // 后端按点赞数排序，新评论 likeCount=0，应放在末尾
      comments.value.push(res.data)
      post.value.commentCount++
      toast.success('评论成功')
    }
    commentText.value = ''
    replyTarget.value = null
    // 重新聚焦输入框
    await nextTick()
    commentInputRef.value?.focus()
  } catch {} finally {
    commentPosting.value = false
  }
}

function setReplyTarget(c: any) {
  replyTarget.value = c
  nextTick(() => commentInputRef.value?.focus())
}

function visibleReplies(c: any) {
  return expandedReplies.value.has(c.id) ? c.replies : (c.replies || []).slice(0, 3)
}

function toggleExpand(c: any) {
  const s = new Set(expandedReplies.value)
  if (s.has(c.id)) { s.delete(c.id) } else { s.add(c.id) }
  expandedReplies.value = s
}

// 删除评论改用 ConfirmDialog，与其他位置一致
const deleteCommentDialog = reactive({ visible: false, comment: null as any })
function openDeleteComment(c: any) {
  deleteCommentDialog.comment = c
  deleteCommentDialog.visible = true
}
async function confirmDeleteComment() {
  const c = deleteCommentDialog.comment
  if (!c) return
  deleteCommentDialog.visible = false
  try {
    await commentApi.delete(c.id)
    comments.value = comments.value.filter((x) => x.id !== c.id)
    post.value.commentCount = Math.max(0, post.value.commentCount - 1)
    toast.success('已删除')
  } catch {} finally {
    deleteCommentDialog.comment = null
  }
}

// 图片预览切换
function prevImage() {
  if (!post.value?.images?.length) return
  previewIndex.value = (previewIndex.value - 1 + post.value.images.length) % post.value.images.length
}
function nextImage() {
  if (!post.value?.images?.length) return
  previewIndex.value = (previewIndex.value + 1) % post.value.images.length
}

async function deletePost() {
  showDeleteDialog.value = false
  try {
    await postApi.delete(postId.value)
    toast.success('已删除')
    router.replace('/')
  } catch {}
}

async function submitReport(reason: string) {
  showReportSheet.value = false
  showMoreMenu.value = false
  try {
    await postApi.report(postId.value, reason)
    toast.success('举报已受理')
  } catch {}
}

function share() {
  showMoreMenu.value = false
  if (navigator.share) {
    navigator.share({ title: post.value.title, url: window.location.href }).catch(() => {})
  } else {
    navigator.clipboard?.writeText(window.location.href)
    toast.success('链接已复制')
  }
}

onMounted(async () => {
  fetchPost()
  fetchComments()
  await fetchMatches()
  document.addEventListener('click', closeMoreMenu)
  // 匹配通知跳入：滚动定位到「可能相关」卡片并短暂高亮（自动展开候选列表）
  if (route.query.showMatches === '1' && matches.value.length) {
    nextTick(() => {
      matchesCardRef.value?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      matchesHighlighted.value = true
      setTimeout(() => (matchesHighlighted.value = false), 2500)
    })
  }
})
onUnmounted(() => {
  document.removeEventListener('click', closeMoreMenu)
})

function closeMoreMenu(e: MouseEvent) {
  if (!showMoreMenu.value) return
  const target = e.target as HTMLElement
  if (!target.closest('.more-menu-trigger') && !target.closest('.more-menu-panel')) {
    showMoreMenu.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-zinc-50 pb-20">
    <!-- 顶部导航 -->
    <header class="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-zinc-100">
      <div class="max-w-[960px] mx-auto flex items-center justify-between h-14 px-3 relative">
        <button class="p-2 -ml-2 text-zinc-600 hover:text-zinc-900" @click="router.back()">
          <ArrowLeft class="w-5 h-5" />
        </button>
        <span class="font-medium text-zinc-900">{{ post?.section?.name || '详情' }}</span>
        <button class="more-menu-trigger p-2 -mr-2 text-zinc-600 hover:text-zinc-900" @click.stop="showMoreMenu = !showMoreMenu">
          <MoreHorizontal class="w-5 h-5" />
        </button>
        <!-- 更多菜单 -->
        <div v-if="showMoreMenu" class="more-menu-panel absolute right-2 top-12 bg-white rounded-xl shadow-lg border border-zinc-100 py-1 w-32 z-30" @click.stop>
          <button class="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50" @click="share">
            <Share2 class="w-4 h-4" /> 分享
          </button>
          <button v-if="!isAuthor" class="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50" @click="showReportSheet = true; showMoreMenu = false">
            <Flag class="w-4 h-4" /> 举报
          </button>
          <button v-if="isAuthor" class="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-500 hover:bg-red-50" @click="showDeleteDialog = true; showMoreMenu = false">
            <Trash2 class="w-4 h-4" /> 删除
          </button>
        </div>
      </div>
    </header>

    <!-- 加载骨架 -->
    <main v-if="loading && !post" class="max-w-[960px] mx-auto px-4 py-4">
      <div class="flex items-center gap-3 mb-4">
        <div class="w-11 h-11 rounded-full skeleton"></div>
        <div class="flex-1">
          <div class="h-4 w-24 skeleton rounded mb-2"></div>
          <div class="h-3 w-32 skeleton rounded"></div>
        </div>
      </div>
      <div class="h-6 w-3/4 skeleton rounded mb-3"></div>
      <div class="h-4 w-full skeleton rounded mb-1"></div>
      <div class="h-4 w-5/6 skeleton rounded mb-1"></div>
      <div class="h-4 w-2/3 skeleton rounded mb-4"></div>
      <div class="flex justify-center py-8">
        <Loader2 class="w-6 h-6 text-brand-400 animate-spin" />
      </div>
    </main>

    <main v-if="post" class="max-w-[960px] mx-auto px-4 py-4">
      <!-- 作者信息（非匿名可点击跳转他人主页） -->
      <div class="flex items-center gap-3 mb-4">
        <div
          class="flex items-center gap-3 flex-1 min-w-0"
          :class="canViewAuthorProfile ? 'cursor-pointer group' : ''"
          @click="goAuthorProfile"
        >
          <div class="w-11 h-11 rounded-full bg-gradient-to-br from-brand-100 to-brand-200 flex items-center justify-center overflow-hidden flex-shrink-0 ring-2 ring-brand-50">
            <img v-if="post.author.avatar" :src="post.author.avatar" class="w-full h-full object-cover" alt="" />
            <span v-else class="text-base font-bold text-brand-700">{{ post.author.nickname?.charAt(0) || '匿' }}</span>
          </div>
          <div class="min-w-0">
            <div class="flex items-center gap-1.5">
              <span class="font-medium text-zinc-900 truncate transition-colors" :class="canViewAuthorProfile ? 'group-hover:text-brand-600' : ''">{{ post.author.nickname || '匿名用户' }}</span>
              <span v-if="post.isAnonymous" class="text-xs bg-zinc-100 text-zinc-500 px-1.5 py-0.5 rounded">匿名</span>
            </div>
            <div class="text-xs text-zinc-400 flex items-center gap-2">
              <span>{{ formatTime(post.createdAt) }}</span>
              <span>·</span>
              <span class="flex items-center gap-0.5"><Eye class="w-3 h-3" /> {{ post.viewCount }}</span>
            </div>
          </div>
        </div>
        <!-- 作者互动：私信 / 关注 -->
        <div v-if="showFollowBtn || showDmBtn" class="flex items-center gap-1.5 flex-shrink-0">
          <button
            class="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs border transition active:scale-95"
            :class="followFollowing ? 'bg-zinc-100 text-zinc-600 border-zinc-200 hover:bg-zinc-200' : 'bg-brand-50 text-brand-600 border-brand-100 hover:bg-brand-100'"
            @click="toggleFollow">
            <UserCheck v-if="followFollowing" class="w-3.5 h-3.5" />
            <UserPlus v-else class="w-3.5 h-3.5" />
            {{ followFollowing ? '已关注' : '关注' }}
          </button>
          <button
            class="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs bg-brand-500 text-white hover:bg-brand-600 transition active:scale-95"
            @click="startChat">
            <MessagesSquare class="w-3.5 h-3.5" /> 私信
          </button>
        </div>
      </div>

      <!-- 审核状态提示 -->
      <div v-if="isPending" class="bg-amber-50 border border-amber-100 rounded-xl p-3 mb-3 text-sm text-amber-700 flex items-center gap-2">
        <span class="font-medium">审核中</span>
        <span class="text-amber-600/80">帖子正在审核，审核通过后方可互动</span>
      </div>

      <!-- 标题与正文 -->
      <div class="flex items-center gap-2 mb-2">
        <h1 class="text-xl font-bold text-zinc-900 flex-1 min-w-0">{{ post.title }}</h1>
        <!-- 已售徽标：任何视角可见（对齐小程序 sold-badge） -->
        <span v-if="soldAt" class="flex-shrink-0 inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 text-xs font-medium border border-emerald-100">
          ✓ 已售出
        </span>
      </div>
      <p class="text-sm text-zinc-700 leading-relaxed post-content mb-3">{{ post.content }}</p>

      <!-- 图片九宫格 -->
      <div v-if="post.images?.length" class="grid grid-cols-3 gap-1.5 mb-3">
        <div v-for="(img, i) in gridImages" :key="i" class="aspect-square rounded-lg overflow-hidden bg-zinc-100 cursor-pointer" @click="previewIndex = Number(i)">
          <img :src="img" class="w-full h-full object-cover" loading="lazy" alt="" @error="onThumbError($event, post.images[i])" />
        </div>
      </div>

      <!-- 扩展字段 -->
      <div v-if="post.extraFields && Object.keys(post.extraFields).length" class="bg-gradient-to-br from-brand-50/80 to-brand-50/30 rounded-xl p-3.5 mb-3 text-sm space-y-1.5 border border-brand-100/50">
        <div v-if="post.extraFields.price" class="text-brand-600 font-bold text-2xl flex items-baseline gap-1 mb-1">
          <span class="text-base">¥</span>{{ post.extraFields.price }}
        </div>
        <div v-if="post.extraFields.condition" class="flex items-center gap-2">
          <span class="text-zinc-500 w-14">新旧</span>
          <span class="text-zinc-700">{{ post.extraFields.condition }}</span>
        </div>
        <div v-if="post.extraFields.contact" class="flex items-center gap-2">
          <span class="text-zinc-500 w-14">联系</span>
          <span class="text-zinc-700">{{ post.extraFields.contact }}</span>
        </div>
        <div v-if="post.extraFields.location" class="flex items-center gap-2">
          <span class="text-zinc-500 w-14">地点</span>
          <span class="text-zinc-700">{{ post.extraFields.location }}</span>
        </div>
        <div v-if="post.extraFields.time" class="flex items-center gap-2">
          <span class="text-zinc-500 w-14">时间</span>
          <span class="text-zinc-700">{{ post.extraFields.time }}</span>
        </div>
        <div v-if="post.extraFields.itemType" class="flex items-center gap-2">
          <span class="text-zinc-500 w-14">物品</span>
          <span class="text-zinc-700">{{ post.extraFields.itemType }}</span>
        </div>
        <div v-if="post.extraFields.organizer" class="flex items-center gap-2">
          <span class="text-zinc-500 w-14">主办方</span>
          <span class="text-zinc-700">{{ post.extraFields.organizer }}</span>
        </div>
      </div>

      <!-- 二手交易：作者标记已售 -->
      <div v-if="canMarkSold" class="bg-white rounded-xl p-3.5 mb-3 flex items-center justify-between shadow-sm shadow-zinc-100/50">
        <div class="min-w-0">
          <p class="text-sm font-medium text-zinc-800">物品已卖出去了？</p>
          <p class="text-xs text-zinc-400 mt-0.5">标记已售后，买家可与你互相评价</p>
        </div>
        <button
          :disabled="markingSold"
          class="flex-shrink-0 ml-3 px-4 py-2 rounded-full bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 disabled:bg-brand-300 transition active:scale-95 flex items-center gap-1.5"
          @click="markSold"
        >
          <Loader2 v-if="markingSold" class="w-4 h-4 animate-spin" />
          标记已售
        </button>
      </div>

      <!-- 二手交易：买家评价这次交易 -->
      <div v-if="soldAt && canRateAsBuyer && !hasRated" class="bg-white rounded-xl p-3.5 mb-3 flex items-center justify-between shadow-sm shadow-zinc-100/50">
        <div class="min-w-0">
          <p class="text-sm font-medium text-zinc-800">交易已完成</p>
          <p class="text-xs text-zinc-400 mt-0.5">为这次交易打个分吧（好评 +2 / 差评 -3 信誉分）</p>
        </div>
        <button
          class="flex-shrink-0 ml-3 px-4 py-2 rounded-full bg-amber-400 text-white text-sm font-medium hover:bg-amber-500 transition active:scale-95"
          @click="openRateDialog"
        >
          评价这次交易
        </button>
      </div>

      <!-- 互动栏 -->
      <div class="flex items-center justify-around bg-white rounded-2xl py-3.5 mb-4 shadow-sm shadow-zinc-100/50" :class="isPending ? 'opacity-70' : ''">
        <button class="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-full transition active:scale-95 disabled:cursor-not-allowed" :class="post.liked ? 'text-red-500 bg-red-50' : 'text-zinc-500 hover:bg-zinc-50'" :disabled="isPending" @click="toggleLike">
          <Heart class="w-5 h-5" :fill="post.liked ? 'currentColor' : 'none'" /> {{ post.likeCount }}
        </button>
        <button class="flex items-center gap-1.5 text-sm text-zinc-500 px-3 py-1.5 rounded-full hover:bg-zinc-50 transition active:scale-95">
          <MessageCircle class="w-5 h-5" /> {{ post.commentCount }}
        </button>
        <button class="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-full transition active:scale-95 disabled:cursor-not-allowed" :class="post.favorited ? 'text-brand-500 bg-brand-50' : 'text-zinc-500 hover:bg-zinc-50'" :disabled="isPending" @click="toggleFavorite">
          <Bookmark class="w-5 h-5" :fill="post.favorited ? 'currentColor' : 'none'" /> {{ post.favoriteCount }}
        </button>
        <button v-if="!isAuthor" class="flex items-center gap-1.5 text-sm text-zinc-500 px-3 py-1.5 rounded-full hover:bg-zinc-50 transition active:scale-95" @click="showReportSheet = true">
          <Flag class="w-5 h-5" /> 举报
        </button>
      </div>

      <!-- 可能相关（失物招领智能匹配）：从匹配通知跳入时定位并高亮 -->
      <div v-if="matches.length" ref="matchesCardRef" class="bg-white rounded-xl p-4 mb-4 transition-shadow duration-500" :class="matchesHighlighted ? 'ring-2 ring-brand-300 shadow-lg' : ''">
        <h3 class="font-medium text-zinc-900">可能相关</h3>
        <p class="text-xs text-zinc-400 mt-0.5 mb-1.5">以下帖子与本帖内容相似，或许正是你在找的</p>
        <button
          v-for="m in matches"
          :key="m.id"
          class="w-full text-left px-2 py-2.5 rounded-lg border-b border-zinc-50 last:border-0 hover:bg-zinc-50 transition"
          @click="router.push(`/post/${m.id}`)"
        >
          <div class="flex items-center gap-2 min-w-0">
            <span class="text-xs bg-brand-50 text-brand-600 px-1.5 py-0.5 rounded flex-shrink-0">{{ m.section }}</span>
            <span class="text-sm text-zinc-800 truncate flex-1">{{ m.title }}</span>
          </div>
          <p class="text-xs text-zinc-400 mt-0.5 truncate pl-0.5">{{ m.author }} · {{ m.excerpt }}</p>
        </button>
      </div>

      <!-- 评论区 -->
      <div class="bg-white rounded-xl p-4">
        <h3 class="font-medium text-zinc-900 mb-3">评论 {{ post.commentCount }}</h3>
        <div v-if="!comments.length" class="text-center text-sm text-zinc-400 py-6">暂无评论，快来抢沙发</div>
        <div v-for="c in comments" :key="c.id" class="py-3.5 border-b border-zinc-50 last:border-0">
          <div class="flex items-start gap-2.5">
            <div class="w-8 h-8 rounded-full bg-gradient-to-br from-brand-100 to-brand-200 flex items-center justify-center overflow-hidden flex-shrink-0 ring-2 ring-brand-50">
              <img v-if="c.author.avatar" :src="c.author.avatar" class="w-full h-full object-cover" alt="" />
              <span v-else class="text-xs font-bold text-brand-700">{{ c.author.nickname?.charAt(0) || '匿' }}</span>
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-1.5">
                <span class="text-sm font-semibold text-zinc-900">{{ c.author.nickname || '匿名用户' }}</span>
                <span v-if="c.likeCount >= 10" class="flex items-center gap-0.5 text-[10px] bg-orange-50 text-orange-500 px-1.5 py-0.5 rounded-full font-medium border border-orange-100">
                  <Flame class="w-3 h-3" /> 热门
                </span>
              </div>
              <p class="text-sm text-zinc-700 mt-1 post-content leading-relaxed">{{ c.content }}</p>
              <div class="flex items-center gap-5 mt-2 text-xs text-zinc-400">
                <span>{{ formatTime(c.createdAt) }}</span>
                <button class="flex items-center gap-1 hover:text-red-500 transition-colors" :class="c.liked ? 'text-red-500' : ''" @click="toggleCommentLike(c)">
                  <Heart class="w-3.5 h-3.5" :fill="c.liked ? 'currentColor' : 'none'" /> {{ c.likeCount }}
                </button>
                <button class="hover:text-brand-600 transition-colors" @click="setReplyTarget(c)">回复</button>
                <button v-if="c.isMine || isAuthor" class="hover:text-red-500 transition-colors" @click="openDeleteComment(c)">删除</button>
              </div>
              <!-- 楼中楼回复 -->
              <div v-if="c.replies?.length" class="mt-2.5 bg-zinc-50 rounded-xl p-3 space-y-2.5">
                <div v-for="r in visibleReplies(c)" :key="r.id" class="text-sm leading-relaxed">
                  <div class="flex items-center gap-1.5 flex-wrap">
                    <span class="font-semibold text-brand-700">{{ r.author.nickname || '匿名用户' }}</span>
                    <span class="text-zinc-600">{{ r.content }}</span>
                  </div>
                  <div class="flex items-center gap-4 mt-1 text-[11px] text-zinc-400">
                    <span>{{ formatTime(r.createdAt) }}</span>
                    <button class="flex items-center gap-0.5 hover:text-red-500 transition-colors" :class="r.liked ? 'text-red-500' : ''" @click="toggleCommentLike(r)">
                      <Heart class="w-3 h-3" :fill="r.liked ? 'currentColor' : 'none'" /> {{ r.likeCount }}
                    </button>
                    <button class="hover:text-brand-600 transition-colors" @click="setReplyTarget(r)">回复</button>
                    <button v-if="r.isMine || isAuthor" class="hover:text-red-500 transition-colors" @click="openDeleteComment(r)">删除</button>
                  </div>
                </div>
                <button v-if="c.replies.length > 3" class="text-xs text-brand-600 hover:text-brand-700 font-medium" @click="toggleExpand(c)">
                  {{ expandedReplies.has(c.id) ? '收起' : `查看更多回复(${c.replies.length})` }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>

    <!-- 底部评论输入 -->
    <div v-if="post" class="fixed bottom-0 left-0 right-0 bg-white border-t border-zinc-100 z-20" style="padding-bottom: env(safe-area-inset-bottom);">
      <div class="max-w-[960px] mx-auto flex items-center gap-2 px-3 py-2">
        <div v-if="replyTarget" class="flex items-center gap-1 text-xs text-zinc-500">
          <span>回复 @{{ replyTarget.author.nickname || '匿名' }}</span>
          <button class="text-zinc-400 hover:text-zinc-600" @click="replyTarget = null"><X class="w-3 h-3" /></button>
        </div>
        <input
          id="commentInput"
          ref="commentInputRef"
          v-model="commentText"
          type="text"
          maxlength="200"
          :disabled="!canComment"
          :placeholder="!canComment ? (!userStore.isLoggedIn ? '请先登录后评论' : '帖子审核中，暂不可评论') : (replyTarget ? '写下你的回复...' : '写下你的评论...')"
          class="flex-1 h-9 px-3 rounded-full bg-zinc-100 focus:bg-white border border-transparent focus:border-brand-500 focus:outline-none text-sm transition disabled:opacity-60"
          @keyup.enter="submitComment"
          @click="!userStore.isLoggedIn && router.push({ path: '/login', query: { redirect: route.fullPath } })"
        />
        <button :disabled="!canComment || commentPosting" class="w-9 h-9 rounded-full bg-brand-500 hover:bg-brand-600 disabled:bg-brand-300 text-white flex items-center justify-center transition" @click="submitComment">
          <Loader2 v-if="commentPosting" class="w-4 h-4 animate-spin" />
          <Send v-else class="w-4 h-4" />
        </button>
      </div>
    </div>

    <!-- 举报底部弹窗 -->
    <Teleport to="body">
      <div v-if="showReportSheet" class="fixed inset-0 z-50 flex items-end" @click.self="showReportSheet = false">
        <div class="absolute inset-0 bg-black/40"></div>
        <div class="relative w-full max-w-[960px] mx-auto bg-white rounded-t-2xl p-4 animate-slide-up">
          <h4 class="text-center font-medium text-zinc-900 mb-3">选择举报原因</h4>
          <div class="space-y-1">
            <button v-for="r in reportReasons" :key="r" class="w-full py-3 text-center text-sm text-zinc-700 hover:bg-zinc-50 rounded-lg" @click="submitReport(r)">
              {{ r }}
            </button>
          </div>
          <button class="w-full py-3 mt-2 text-center text-sm text-zinc-400 border-t border-zinc-100" @click="showReportSheet = false">取消</button>
        </div>
      </div>
    </Teleport>

    <!-- 删除确认 -->
    <ConfirmDialog :visible="showDeleteDialog" content="确定删除该帖子吗？删除后不可恢复" title="删除帖子" confirm-text="删除" danger @confirm="deletePost" @cancel="showDeleteDialog = false" />

    <!-- 图片全屏预览 -->
    <Teleport to="body">
      <div v-if="previewIndex >= 0 && post?.images?.length" class="fixed inset-0 z-50 bg-black/90 flex items-center justify-center" @click="previewIndex = -1">
        <button class="absolute top-4 right-4 text-white p-2 z-10" @click.stop="previewIndex = -1"><X class="w-6 h-6" /></button>
        <button v-if="post.images.length > 1" class="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition" @click.stop="prevImage">
          <ChevronLeft class="w-6 h-6" />
        </button>
        <img :src="post?.images[previewIndex]" class="max-w-full max-h-full object-contain" alt="" @click.stop />
        <button v-if="post.images.length > 1" class="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition" @click.stop="nextImage">
          <ChevronRight class="w-6 h-6" />
        </button>
        <div v-if="post.images.length > 1" class="absolute bottom-6 left-1/2 -translate-x-1/2 text-white/80 text-sm">{{ previewIndex + 1 }} / {{ post.images.length }}</div>
      </div>
    </Teleport>

    <!-- 删除评论确认 -->
    <ConfirmDialog :visible="deleteCommentDialog.visible" content="确定删除该评论吗？删除后不可恢复" title="删除评论" confirm-text="删除" danger
      @confirm="confirmDeleteComment" @cancel="deleteCommentDialog.visible = false; deleteCommentDialog.comment = null" />

    <!-- 交易互评弹窗 -->
    <Teleport to="body">
      <div v-if="showRateDialog" class="fixed inset-0 z-50 flex items-center justify-center p-6" @click.self="showRateDialog = false">
        <div class="absolute inset-0 bg-black/40"></div>
        <div class="relative w-full max-w-sm bg-white rounded-2xl p-5">
          <h4 class="text-center font-medium text-zinc-900">评价这次交易</h4>
          <p class="text-center text-xs text-zinc-400 mt-1">仅对方可见你的评分，评价提交后不可修改</p>
          <div class="flex justify-center gap-2 my-5">
            <button v-for="i in 5" :key="i" class="p-0.5 active:scale-90 transition" @click="rateScore = i">
              <Star class="w-8 h-8 transition-colors" :class="i <= rateScore ? 'text-amber-400 fill-amber-400' : 'text-zinc-200 hover:text-amber-200'" />
            </button>
          </div>
          <textarea
            v-model="rateComment"
            maxlength="200"
            rows="3"
            placeholder="说说这次交易的体验（选填，200 字内）"
            class="w-full px-3 py-2.5 rounded-lg bg-zinc-50 border border-zinc-200 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100 transition resize-none text-sm post-content"
          ></textarea>
          <div class="flex gap-2 mt-4">
            <button class="flex-1 py-2.5 rounded-full bg-zinc-100 text-zinc-600 text-sm font-medium hover:bg-zinc-200 transition" @click="showRateDialog = false">取消</button>
            <button
              :disabled="!rateScore || rateSubmitting"
              class="flex-1 py-2.5 rounded-full bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 disabled:bg-brand-300 transition flex items-center justify-center gap-1.5"
              @click="submitRate"
            >
              <Loader2 v-if="rateSubmitting" class="w-4 h-4 animate-spin" />
              提交评价
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

