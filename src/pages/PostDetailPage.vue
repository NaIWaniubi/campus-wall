<script setup lang="ts">
/**
 * 帖子详情页：内容展示、互动、评论楼中楼、举报、删除
 */
import { ref, reactive, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, MoreHorizontal, Heart, MessageCircle, Bookmark, Flag, Eye, Trash2, Share2, X, Send, Flame, Loader2, ChevronLeft, ChevronRight, MessagesSquare, UserPlus, UserCheck, Star, Sparkles, ShieldAlert, ChevronDown } from '@lucide/vue'
import { useUserStore } from '@/stores/user'
import { postApi, commentApi, conversationApi, followApi, tradeApi, userApi, radarApi, aiApi, type RadarMatchItem } from '@/utils/api'
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
// ── AI 划重点（V3）：按需请求，点开才调模型，不拖慢首屏 ──
const aiSummary = ref<{ points: string[]; risk: 'low' | 'medium' | 'high'; riskNote: string | null; offline: boolean } | null>(null)
const aiSummaryOpen = ref(false)
const aiSummaryLoading = ref(false)

async function loadAiSummary() {
  if (aiSummaryLoading.value) return
  if (aiSummary.value) {
    aiSummaryOpen.value = !aiSummaryOpen.value
    return
  }
  aiSummaryOpen.value = true
  aiSummaryLoading.value = true
  try {
    const res: any = await aiApi.summarize({ postId: postId.value })
    aiSummary.value = res?.data ?? null
  } catch {
    aiSummaryOpen.value = false
    toast.info('AI 划重点暂时不可用')
  } finally {
    aiSummaryLoading.value = false
  }
}

// 从消息中心匹配通知跳入（?showMatches=1）：定位并短暂高亮匹配卡片
const matchesCardRef = ref<HTMLElement | null>(null)
const matchesHighlighted = ref(false)

const reportReasons = ['垃圾广告', '人身攻击', '色情低俗', '违法违规', '其他']
const commentPosting = ref(false)
// 后端返回 isMine 字段，匿名帖子也能正确判断作者身份，用于显示删除按钮
const isAuthor = computed(() => !!post.value?.isMine)
const isPending = computed(() => post.value?.status === 'pending')
const isRejected = computed(() => post.value?.status === 'rejected')
const isOffline = computed(() => post.value?.status === 'offline')
const canInteract = computed(() => !isPending.value)
// 未登录时也禁用评论输入，提示登录
const canComment = computed(() => userStore.isLoggedIn && !isPending.value)

// 作者 + (已发布或被驳回) + 24h 内 → 可去修改
function isWithin24h(t?: string | number) {
  const v = t ? new Date(t).getTime() : 0
  return v > 0 && Date.now() - v < 24 * 60 * 60 * 1000
}
const canEdit = computed(() => {
  if (!isAuthor.value) return false
  if (!post.value) return false
  if (!isWithin24h(post.value.createdAt)) return false
  // published 可正常编辑；rejected 走"修改重发"路径（同样 24h 限制，与 MyPostsPage 对齐）
  return post.value.status === 'published' || post.value.status === 'rejected'
})
function goEdit() {
  router.push(`/publish?edit=${postId.value}`)
}

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
const showMarkSold = ref(false)
const buyerStudentId = ref('')
const buyerPreview = ref<{ id: number; nickname: string } | null>(null)
const resolvingBuyer = ref(false)

async function resolveBuyer() {
  const sid = buyerStudentId.value.trim()
  if (!sid) { buyerPreview.value = null; return }
  resolvingBuyer.value = true
  try {
    const res: any = await userApi.lookup(sid)
    buyerPreview.value = res.data
  } catch {
    buyerPreview.value = null
  } finally {
    resolvingBuyer.value = false
  }
}

async function markSold() {
  if (markingSold.value) return
  markingSold.value = true
  try {
    const res: any = await tradeApi.complete(postId.value, buyerPreview.value?.id)
    post.value.extraFields = {
      ...(post.value.extraFields || {}),
      soldAt: res.data.soldAt,
      ...(res.data.soldTo ? { soldTo: res.data.soldTo } : {}),
    }
    showMarkSold.value = false
    toast.success(res.data.soldTo ? '已标记交易完成，可评价该买家' : '已标记交易完成')
  } catch {
    // 错误已由拦截器 toast
  } finally {
    markingSold.value = false
  }
}

// 互评状态：买家评作者 / 作者凭登记的 soldTo 评买家；每人每帖限一次
const canRateAsBuyer = computed(() => userStore.isLoggedIn && !isAuthor.value && !!soldAt.value && post.value?.status === 'published' && !hasRated.value)
const soldTo = computed(() => Number(post.value?.extraFields?.soldTo) || 0)
const canRateAsSeller = computed(() => userStore.isLoggedIn && isAuthor.value && !!soldAt.value && !!soldTo.value && !hasRated.value)
const hasRated = ref(false)
const showRateDialog = ref(false)
const rateScore = ref(0)
const rateComment = ref('')
const rateSubmitting = ref(false)

async function loadTradeState() {
  if (!userStore.isLoggedIn || !isTradeSection.value || !soldAt.value) return
  try {
    const res: any = await tradeApi.myRating(postId.value)
    hasRated.value = !!res.data.hasRated
  } catch {}
}

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
    // 作者评买家：自动带登记的 soldTo；买家评作者：后端固定指向帖子作者
    await tradeApi.rate(postId.value, {
      rating: rateScore.value,
      comment: rateComment.value.trim(),
      ...(canRateAsSeller.value ? { targetUserId: soldTo.value } : {}),
    })
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

// 加载失败类型：404 → 真不存在（强制回首页并明确提示）；网络/超时 → 留在原页给重试按钮
type FetchPostErrorKind = 'not-found' | 'network' | 'timeout' | 'other'
function classifyError(e: any): FetchPostErrorKind {
  if (e?.response?.status === 404) return 'not-found'
  // 后端约定 res.code === 404 也代表资源不存在（response 拦截器会 reject）
  if (e?.code === 404) return 'not-found'
  if (e?.code === 'ECONNABORTED' || /timeout/i.test(String(e?.message || ''))) return 'timeout'
  if (!e?.response) return 'network'
  return 'other'
}
const loadError = ref<FetchPostErrorKind | null>(null)

async function fetchPost() {
  loading.value = true
  loadError.value = null
  try {
    const res: any = await postApi.detail(postId.value)
    post.value = res.data
    loadFollowStatus()
    loadTradeState()
  } catch (e: any) {
    const kind = classifyError(e)
    loadError.value = kind
    if (kind === 'not-found') {
      // 仅真不存在才提示并强制回首页
      toast.error('帖子不存在或已删除')
      router.replace('/')
    } else if (kind === 'timeout') {
      toast.error('请求超时，请重试')
    } else if (kind === 'network') {
      toast.error('网络异常，请检查网络连接')
    } else {
      toast.error(e?.message || '加载失败')
    }
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

// ---------- 智能雷达（失物招领反向匹配，FTS5+地点/时间复合评分） ----------
const radarMatches = ref<RadarMatchItem[]>([])

async function fetchRadar() {
  try {
    const res: any = await radarApi.matches(postId.value)
    radarMatches.value = res.data?.matches || []
  } catch {
    radarMatches.value = []
  }
}

/**
 * 雷达候选去重：关键词匹配（matches）与雷达（radarMatches）会命中同一批帖子，
 * 两个区块同时展示会让同一张卡出现两次。
 * 这里只保留未被「可能相关」收录的雷达条目。
 */
const radarOnly = computed(() => {
  const shown = new Set((matches.value || []).map((m: any) => m.id))
  return (radarMatches.value || []).filter((m) => !shown.has(m.postId))
})

const radarLabel = computed(() =>
  post.value?.extraFields?.direction === 'lost' ? '招领' : '寻物'
)

// ---------- 意向出价（闪电意向撮合闭环，二手交易板块） ----------
const isTradePost = computed(() =>
  !!post.value && (String(post.value?.section?.name || '').includes('二手') || !!post.value?.extraFields?.price)
)
const offersState = ref<any>({ isSeller: false, hasAccepted: false, myOffer: null, offers: [] })
const showOfferSheet = ref(false)
const offerPrice = ref('')
const offerMessage = ref('')
const offerBusy = ref(false)

const OFFER_STATUS_LABEL: Record<string, string> = {
  pending: '待确认',
  accepted: '已锁定',
  rejected: '已拒绝',
  cancelled: '已取消',
  completed: '已完成',
}

async function fetchOffers() {
  if (!isTradePost.value || !userStore.isLoggedIn) return
  try {
    const res: any = await tradeApi.offers(postId.value)
    offersState.value = res.data || { isSeller: false, hasAccepted: false, myOffer: null, offers: [] }
  } catch {
    // 静默失败，出价区按空处理
  }
}

async function submitOffer() {
  if (!userStore.isLoggedIn) return goLogin()
  const price = Number(offerPrice.value)
  if (!Number.isFinite(price) || price <= 0) return toast.error('请输入有效的出价金额')
  offerBusy.value = true
  try {
    await tradeApi.createOffer(postId.value, { offerPrice: price, message: offerMessage.value })
    toast.success('出价已发送，等待卖家确认')
    showOfferSheet.value = false
    offerPrice.value = ''
    offerMessage.value = ''
    await fetchOffers()
  } catch {
    // 错误已由拦截器 toast
  } finally {
    offerBusy.value = false
  }
}

async function actOnOffer(offerId: number, action: 'accept' | 'reject' | 'cancel') {
  if (offerBusy.value) return
  offerBusy.value = true
  try {
    await tradeApi[`${action}Offer`](offerId)
    toast.success(action === 'accept' ? '已接受出价，交易锁定' : action === 'reject' ? '已拒绝该出价' : '已取消出价')
    await fetchOffers()
  } catch {
    // 错误已由拦截器 toast
  } finally {
    offerBusy.value = false
  }
}

// 乐观更新锁：like/favorite 独立，避免一个动作互锁另一个动作的 300ms 防抖窗口
const likeLocked = ref(false)
const favoriteLocked = ref(false)
const LIKE_DEBOUNCE_MS = 300

async function toggleLike() {
  if (!userStore.isLoggedIn) return router.push({ path: '/login', query: { redirect: route.fullPath } })
  if (!canInteract.value) return toast.info('帖子审核中，暂不可互动')
  if (likeLocked.value) return
  likeLocked.value = true
  // 1) 快照当前状态
  const oldLiked = !!post.value.liked
  const oldCount = Number(post.value.likeCount) || 0
  const newLiked = !oldLiked
  const newCount = Math.max(0, oldCount + (newLiked ? 1 : -1))
  // 2) 立即更新本地状态（用不可变替换，避免直接 mutate ref）
  post.value = { ...post.value, liked: newLiked, likeCount: newCount }
  try {
    const res: any = await postApi.like(postId.value)
    // 成功后以服务端为准再做一次不可变更新
    post.value = { ...post.value, liked: !!res.data.liked, likeCount: res.data.likeCount }
  } catch {
    // 3) 失败回滚到快照
    post.value = { ...post.value, liked: oldLiked, likeCount: oldCount }
  } finally {
    setTimeout(() => { likeLocked.value = false }, LIKE_DEBOUNCE_MS)
  }
}

async function toggleFavorite() {
  if (!userStore.isLoggedIn) return router.push({ path: '/login', query: { redirect: route.fullPath } })
  if (!canInteract.value) return toast.info('帖子审核中，暂不可互动')
  if (favoriteLocked.value) return
  favoriteLocked.value = true
  const oldFavorited = !!post.value.favorited
  const oldCount = Number(post.value.favoriteCount) || 0
  const newFavorited = !oldFavorited
  const newCount = Math.max(0, oldCount + (newFavorited ? 1 : -1))
  post.value = { ...post.value, favorited: newFavorited, favoriteCount: newCount }
  try {
    const res: any = await postApi.favorite(postId.value)
    post.value = { ...post.value, favorited: !!res.data.favorited, favoriteCount: res.data.favoriteCount }
  } catch {
    post.value = { ...post.value, favorited: oldFavorited, favoriteCount: oldCount }
  } finally {
    setTimeout(() => { favoriteLocked.value = false }, LIKE_DEBOUNCE_MS)
  }
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

/** 评论输入框点击：未登录时引导登录（输入框不再 disabled，否则 click 不会触发） */
function onCommentInputClick() {
  if (!userStore.isLoggedIn) {
    router.push({ path: '/login', query: { redirect: route.fullPath } })
  }
}

/** 互动栏「评论数」按钮：滚动到评论区并聚焦输入框 */
function scrollToComments() {
  const el = document.getElementById('comment-section')
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  if (canComment.value) nextTick(() => commentInputRef.value?.focus())
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

// 游客举报 → 引导登录（带 redirect 回跳）
function openReport() {
  if (!userStore.isLoggedIn) return router.push({ path: '/login', query: { redirect: route.fullPath } })
  showMoreMenu.value = false
  showReportSheet.value = true
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
  await fetchPost()
  fetchComments()
  await fetchMatches()
  await fetchRadar()
  await fetchOffers()
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
  <div class="min-h-screen pb-24">
    <!-- 顶部导航：墨底常驻（返回 / 板块名 / 更多） -->
    <header class="sticky top-0 z-20" style="background: var(--ink)">
      <div class="max-w-[960px] mx-auto flex items-center justify-between h-12 px-3 relative">
        <button
          class="ds-icon-btn"
          style="width:34px;height:34px;background:rgb(255 255 255 / 0.1);border-color:rgb(255 255 255 / 0.32);color:var(--card);box-shadow:none"
          aria-label="返回"
          @click="router.back()"
        >
          <ArrowLeft class="w-[18px] h-[18px]" />
        </button>
        <span class="ds-label" style="color: rgb(255 255 255 / 0.55)">{{ post?.section?.name || '详情' }}</span>
        <button
          class="more-menu-trigger ds-icon-btn"
          style="width:34px;height:34px;background:rgb(255 255 255 / 0.1);border-color:rgb(255 255 255 / 0.32);color:var(--card);box-shadow:none"
          aria-label="更多"
          @click.stop="showMoreMenu = !showMoreMenu"
        >
          <MoreHorizontal class="w-[18px] h-[18px]" />
        </button>
        <!-- 更多菜单 -->
        <div v-if="showMoreMenu" class="more-menu-panel absolute right-3 top-11 ds-card p-1 w-32 z-30" @click.stop>
          <button class="hover-paper w-full flex items-center gap-2 px-3 py-2 text-[13px] font-semibold rounded-[10px]" style="color: var(--ink)" @click="share">
            <Share2 class="w-4 h-4" /> 分享
          </button>
          <button v-if="!isAuthor" class="hover-paper w-full flex items-center gap-2 px-3 py-2 text-[13px] font-semibold rounded-[10px]" style="color: var(--ink)" @click="openReport">
            <Flag class="w-4 h-4" /> 举报
          </button>
          <button v-if="isAuthor" class="hover-paper w-full flex items-center gap-2 px-3 py-2 text-[13px] font-semibold rounded-[10px]" style="color: var(--coral)" @click="showDeleteDialog = true; showMoreMenu = false">
            <Trash2 class="w-4 h-4" /> 删除
          </button>
        </div>
      </div>
    </header>

    <!-- 墨色海报头：板块名小标签 + 标题大字 + 作者/时间行 -->
    <section v-if="post" class="hero px-4 pt-4 pb-7 rounded-b-[20px]">
      <div class="max-w-[960px] mx-auto">
        <span class="ds-sticker ds-sticker--coral" style="font-size: 11.5px">{{ post.section?.name || '详情' }}</span>

        <div class="mt-3 flex items-start gap-2.5">
          <h1 class="ds-display ds-display-lg text-white flex-1 min-w-0">{{ post.title }}</h1>
          <!-- 已售徽标：任何视角可见（对齐小程序 sold-badge） -->
          <span v-if="soldAt" class="ds-sticker ds-sticker--sky shrink-0 mt-1">✓ 已售出</span>
        </div>

        <!-- 作者 / 时间行 -->
        <div class="mt-3.5 flex items-center gap-3">
          <div
            class="flex items-center gap-2 flex-1 min-w-0"
            :class="canViewAuthorProfile ? 'cursor-pointer' : ''"
            @click="goAuthorProfile"
          >
            <div class="w-9 h-9 rounded-[10px] overflow-hidden flex items-center justify-center shrink-0"
              style="background: var(--lime); border: 1.5px solid var(--lime)">
              <img v-if="post.author.avatar" :src="post.author.avatar" class="w-full h-full object-cover" alt="" />
              <span v-else class="text-[14px] font-black" style="color: var(--ink)">{{ post.author.nickname?.charAt(0) || '匿' }}</span>
            </div>
            <div class="min-w-0">
              <div class="flex items-center gap-1.5">
                <span class="text-[13px] font-bold text-white truncate">{{ post.author.nickname || '匿名用户' }}</span>
                <span v-if="post.isAnonymous" class="shrink-0 text-[10px] px-1.5 py-0.5 rounded-[6px] text-white"
                  style="border: 1px solid rgb(255 255 255 / 0.4)">匿名</span>
              </div>
              <div class="flex items-center gap-1.5 text-[11px] ds-num" style="color: rgb(255 255 255 / 0.6)">
                <span>{{ formatTime(post.createdAt) }}</span>
                <span>·</span>
                <span class="flex items-center gap-0.5"><Eye class="w-3 h-3" /> {{ post.viewCount }}</span>
              </div>
            </div>
          </div>
          <!-- 作者互动：私信 / 关注 -->
          <div v-if="showFollowBtn || showDmBtn" class="flex items-center gap-1.5 shrink-0">
            <button class="ds-btn ds-btn--sm" @click="toggleFollow">
              <UserCheck v-if="followFollowing" class="w-3.5 h-3.5" />
              <UserPlus v-else class="w-3.5 h-3.5" />
              {{ followFollowing ? '已关注' : '关注' }}
            </button>
            <button class="ds-btn ds-btn--sm" style="background: var(--lime); border-color: var(--lime); color: var(--ink)" @click="startChat">
              <MessagesSquare class="w-3.5 h-3.5" /> 私信
            </button>
          </div>
        </div>
      </div>
    </section>

    <!-- 加载骨架 -->
    <main v-if="loading && !post" class="max-w-[960px] mx-auto px-3 pt-3 space-y-3">
      <section class="ds-card p-4">
        <div class="flex items-center gap-3 mb-4">
          <div class="w-11 h-11 rounded-[12px] skeleton"></div>
          <div class="flex-1">
            <div class="h-4 w-24 skeleton rounded mb-2"></div>
            <div class="h-3 w-32 skeleton rounded"></div>
          </div>
        </div>
        <div class="h-6 w-3/4 skeleton rounded mb-3"></div>
        <div class="h-4 w-full skeleton rounded mb-1"></div>
        <div class="h-4 w-5/6 skeleton rounded mb-1"></div>
        <div class="h-4 w-2/3 skeleton rounded"></div>
      </section>
      <div class="flex justify-center py-5">
        <Loader2 class="w-6 h-6 animate-spin" style="color: var(--ink-mute)" />
      </div>
    </main>

    <!-- 加载失败（非 404 留在原页给重试按钮；404 已在 fetchPost 内强制回首页） -->
    <main v-else-if="loadError" class="max-w-[960px] mx-auto px-3 pt-3">
      <section class="ds-card p-5 text-center">
        <div class="w-12 h-12 mx-auto rounded-[12px] flex items-center justify-center mb-3"
          style="background: var(--paper); border: 1.5px solid var(--ink)">
          <Loader2 class="w-6 h-6" style="color: var(--ink-mute)" />
        </div>
        <p class="text-[13px] font-bold mb-1" style="color: var(--ink)">
          {{ loadError === 'timeout' ? '请求超时，请检查网络后重试' : '网络异常，请检查网络后重试' }}
        </p>
        <p class="ds-sub mb-4">该帖子可能仍存在，只是当前无法加载</p>
        <button class="ds-btn ds-btn--primary ds-btn--sm" @click="fetchPost">
          <Loader2 v-if="loading" class="w-4 h-4 animate-spin" />
          重新加载
        </button>
      </section>
    </main>

    <main v-if="post" class="max-w-[960px] mx-auto px-3 pt-3 space-y-3">

      <!-- 审核状态提示 -->
      <div v-if="isPending" class="ds-card p-3.5 flex items-center gap-2.5 text-[13px]">
        <span class="ds-sticker ds-sticker--sky shrink-0">审核中</span>
        <span style="color: var(--ink-soft)">帖子正在审核，审核通过后方可互动</span>
      </div>

      <!-- 被驳回状态条：仅作者可见，附驳回原因 + 去修改入口（衔接 24h 编辑窗口） -->
      <div v-if="isRejected && isAuthor" class="ds-card p-3.5 text-[13px]">
        <div class="flex items-center gap-2.5 mb-1.5">
          <span class="ds-sticker ds-sticker--coral shrink-0">已驳回</span>
          <span style="color: var(--ink-soft)">该帖子未通过审核</span>
        </div>
        <p v-if="post.rejectReason || post.reason" class="text-[12px] leading-relaxed" style="color: var(--coral)">
          驳回原因：{{ post.rejectReason || post.reason }}
        </p>
        <div class="mt-2.5 flex items-center gap-2">
          <button v-if="canEdit" class="ds-btn ds-btn--sm" @click="goEdit">去修改</button>
          <span v-else class="text-[12px]" style="color: var(--ink-mute)">已超过 24 小时修改窗口，请删除后重新发布</span>
        </div>
      </div>

      <!-- 已下架状态条（兜底） -->
      <div v-else-if="isOffline && isAuthor" class="ds-card p-3.5 text-[13px]">
        <div class="flex items-center gap-2.5">
          <span class="ds-sticker ds-sticker--sky shrink-0">已下架</span>
          <span style="color: var(--ink-soft)">该帖子已被管理员下架</span>
        </div>
        <p v-if="post.rejectReason || post.reason" class="text-[12px] mt-1" style="color: var(--ink-mute)">原因：{{ post.rejectReason || post.reason }}</p>
      </div>

      <!-- 正文卡：正文 15.5px / 行高 1.85 + 图片墨线圆角 + 扩展字段 -->
      <section class="ds-card p-4">
        <p class="detail-body post-content">{{ post.content }}</p>

        <!-- 图片九宫格 -->
        <div v-if="post.images?.length" class="grid grid-cols-3 gap-2 mt-3.5">
          <div v-for="(img, i) in gridImages" :key="i" class="aspect-square rounded-[12px] overflow-hidden cursor-pointer"
            style="border: 1.5px solid var(--ink); background: var(--card)" @click="previewIndex = Number(i)">
            <img :src="img" class="w-full h-full object-cover" loading="lazy" alt="" @error="onThumbError($event, post.images[i])" />
          </div>
        </div>

        <!-- 扩展字段 -->
        <template v-if="post.extraFields && Object.keys(post.extraFields).length">
          <div class="ds-rule my-3.5"></div>
          <div class="text-[13px] space-y-1.5">
            <div v-if="post.extraFields.price" class="ds-display text-[26px] flex items-baseline gap-1 mb-1" style="color: var(--ink)">
              <span class="text-[15px]">¥</span><span class="ds-marker">{{ post.extraFields.price }}</span>
            </div>
            <div v-if="post.extraFields.condition" class="flex items-center gap-2">
              <span class="ds-label w-14 shrink-0">新旧</span>
              <span class="truncate" style="color: var(--ink-soft)">{{ post.extraFields.condition }}</span>
            </div>
            <div v-if="post.extraFields.contact" class="flex items-center gap-2">
              <span class="ds-label w-14 shrink-0">联系</span>
              <span class="truncate" style="color: var(--ink-soft)">{{ post.extraFields.contact }}</span>
            </div>
            <div v-if="post.extraFields.location" class="flex items-center gap-2">
              <span class="ds-label w-14 shrink-0">地点</span>
              <span class="truncate" style="color: var(--ink-soft)">{{ post.extraFields.location }}</span>
            </div>
            <div v-if="post.extraFields.time" class="flex items-center gap-2">
              <span class="ds-label w-14 shrink-0">时间</span>
              <span class="truncate" style="color: var(--ink-soft)">{{ post.extraFields.time }}</span>
            </div>
            <div v-if="post.extraFields.itemType" class="flex items-center gap-2">
              <span class="ds-label w-14 shrink-0">物品</span>
              <span class="truncate" style="color: var(--ink-soft)">{{ post.extraFields.itemType }}</span>
            </div>
            <div v-if="post.extraFields.organizer" class="flex items-center gap-2">
              <span class="ds-label w-14 shrink-0">主办方</span>
              <span class="truncate" style="color: var(--ink-soft)">{{ post.extraFields.organizer }}</span>
            </div>
          </div>
        </template>
      </section>

      <!-- 二手交易：作者标记已售（可选登记买家） -->
      <section v-if="canMarkSold" class="ds-card p-4 flex items-center justify-between gap-3">
        <div class="min-w-0">
          <p class="text-[13px] font-bold" style="color: var(--ink)">物品已卖出去了？</p>
          <p class="text-[12px] mt-0.5 leading-relaxed" style="color: var(--ink-mute)">标记已售后，双方可互相评价；可登记买家账号便于定向评价</p>
        </div>
        <button
          class="ds-btn ds-btn--primary ds-btn--sm shrink-0"
          @click="showMarkSold = true; buyerStudentId = ''; buyerPreview = null"
        >
          标记已售
        </button>
      </section>

      <!-- 二手交易：买家评价这次交易 -->
      <section v-if="soldAt && canRateAsBuyer" class="ds-card p-4 flex items-center justify-between gap-3">
        <div class="min-w-0">
          <p class="text-[13px] font-bold" style="color: var(--ink)">交易已完成</p>
          <p class="text-[12px] mt-0.5 leading-relaxed" style="color: var(--ink-mute)">为这次交易打个分吧（好评 +2 / 差评 -3 信誉分）</p>
        </div>
        <button class="ds-btn ds-btn--accent ds-btn--sm shrink-0" @click="openRateDialog">
          评价这次交易
        </button>
      </section>

      <!-- 二手交易：作者评价登记的买家 -->
      <section v-if="canRateAsSeller" class="ds-card p-4 flex items-center justify-between gap-3">
        <div class="min-w-0">
          <p class="text-[13px] font-bold" style="color: var(--ink)">给这次交易的买家打个分</p>
          <p class="text-[12px] mt-0.5 leading-relaxed" style="color: var(--ink-mute)">你登记的买家可以收到你的评价</p>
        </div>
        <button class="ds-btn ds-btn--accent ds-btn--sm shrink-0" @click="openRateDialog">
          评价买家
        </button>
      </section>

      <!-- AI 划重点（V3）：一句话读懂帖子 + 交易风险提示 -->
      <section class="ds-card ai-trail overflow-hidden">
        <button
          class="w-full flex items-center gap-2.5 px-4 py-3.5 text-left"
          :aria-expanded="aiSummaryOpen"
          @click="loadAiSummary"
        >
          <span class="ds-sticker ds-sticker--violet shrink-0">
            <Sparkles class="w-3 h-3" /> AI
          </span>
          <span class="text-[14px] font-bold shrink-0" style="color: var(--ink)">AI 划重点</span>
          <span class="text-[11px] truncate" style="color: var(--ink-mute)">要点 + 风险提示</span>
          <Loader2 v-if="aiSummaryLoading" class="w-4 h-4 ml-auto shrink-0 animate-spin" style="color: var(--ink-mute)" />
          <ChevronDown v-else-if="aiSummary" class="w-4 h-4 ml-auto shrink-0 transition-transform"
            :class="aiSummaryOpen ? 'rotate-180' : ''" style="color: var(--ink-mute)" />
        </button>

        <div v-if="aiSummaryOpen" class="px-4 pb-4">
          <div v-if="aiSummaryLoading" class="space-y-2" aria-live="polite">
            <div class="h-3 rounded skeleton"></div>
            <div class="h-3 rounded skeleton w-5/6"></div>
            <div class="h-3 rounded skeleton w-2/3"></div>
          </div>
          <template v-else-if="aiSummary">
            <ul class="space-y-1.5">
              <li v-for="(pt, i) in aiSummary.points" :key="i" class="flex gap-2 text-[13px] leading-relaxed" style="color: var(--ink-soft)">
                <span class="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0" style="background: var(--violet)"></span>
                <span>{{ pt }}</span>
              </li>
            </ul>
            <div
              v-if="aiSummary.risk !== 'low' && aiSummary.riskNote"
              class="mt-2.5 flex items-start gap-2 px-3 py-2 rounded-[10px] text-white"
              :style="{ background: aiSummary.risk === 'high' ? 'var(--coral)' : 'var(--violet)' }"
            >
              <ShieldAlert class="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span class="text-[12px] leading-relaxed">{{ aiSummary.riskNote }}</span>
            </div>
            <p class="mt-2 text-[11px]" style="color: var(--ink-mute)">
              {{ aiSummary.offline ? '站内摘要模式' : 'AI 生成' }} · 仅供参考，交易请当面验货
            </p>
          </template>
        </div>
      </section>

      <!-- 互动栏：四颗等宽 ds-chip（图标 + 数字同行；激活态墨底荧光） -->
      <section class="ds-card p-2.5 flex items-center gap-1.5" :class="isPending ? 'opacity-70' : ''">
        <button
          class="ds-chip flex-1 !justify-center !py-2"
          :class="{ 'is-active': post.liked }"
          :disabled="isPending"
          :aria-pressed="!!post.liked"
          @click="toggleLike"
        >
          <Heart class="w-[17px] h-[17px]" :fill="post.liked ? 'currentColor' : 'none'" />
          <span class="ds-num">{{ post.likeCount }}</span>
        </button>
        <button class="ds-chip flex-1 !justify-center !py-2" aria-label="查看评论" @click="scrollToComments">
          <MessageCircle class="w-[17px] h-[17px]" />
          <span class="ds-num">{{ post.commentCount }}</span>
        </button>
        <button
          class="ds-chip flex-1 !justify-center !py-2"
          :class="{ 'is-active': post.favorited }"
          :disabled="isPending"
          :aria-pressed="!!post.favorited"
          @click="toggleFavorite"
        >
          <Bookmark class="w-[17px] h-[17px]" :fill="post.favorited ? 'currentColor' : 'none'" />
          <span class="ds-num">{{ post.favoriteCount }}</span>
        </button>
        <button v-if="!isAuthor" class="ds-chip flex-1 !justify-center !py-2" aria-label="举报" @click="openReport">
          <Flag class="w-[17px] h-[17px]" />
          <span class="text-[11px]">举报</span>
        </button>
      </section>

      <!-- 可能相关（失物招领智能匹配）：从匹配通知跳入时定位并高亮 -->
      <section v-if="matches.length" ref="matchesCardRef" class="ds-card p-4"
        :style="matchesHighlighted ? { boxShadow: 'var(--shadow-hard-lg)' } : {}">
        <div class="ds-section-head mb-3">
          <span class="ds-section-head__num">01</span>
          <h3 class="ds-title">可能相关</h3>
          <span class="ds-section-head__line"></span>
        </div>
        <p class="ds-sub mb-1.5">以下帖子与本帖内容相似，或许正是你在找的</p>
        <button
          v-for="m in matches"
          :key="m.id"
          class="row-link hover-paper w-full text-left px-1.5 py-2.5 rounded-[10px] transition"
          @click="router.push(`/post/${m.id}`)"
        >
          <div class="flex items-center gap-2 min-w-0">
            <span class="ds-tag shrink-0"><span class="ds-tag-dot" style="background: var(--sky)"></span>{{ m.section }}</span>
            <span class="text-[14px] truncate flex-1" style="color: var(--ink)">{{ m.title }}</span>
          </div>
          <p class="text-[12px] mt-0.5 truncate pl-0.5" style="color: var(--ink-mute)">{{ m.author }} · {{ m.excerpt }}</p>
        </button>
      </section>

      <!-- 智能雷达（失物招领反向匹配）：与上方「可能相关」合并展示，
           同一批帖子不再出现两个区块（此前雷达卡片与可能相关重复，评委观感廉价）。
           雷达提供分数与命中理由，关键词匹配提供板块与作者。 -->
      <section v-if="radarOnly.length" class="ds-card p-4">
        <div class="ds-section-head mb-3">
          <span class="ds-section-head__num">02</span>
          <h3 class="ds-title">🎯 智能雷达</h3>
          <span class="ds-section-head__line"></span>
        </div>
        <p class="ds-sub mb-1.5">另发现 {{ radarOnly.length }} 条高度相似的{{ radarLabel }}信息，按匹配度排序</p>
        <button
          v-for="m in radarOnly"
          :key="m.postId"
          class="row-link hover-paper w-full text-left px-1.5 py-2.5 rounded-[10px] transition"
          @click="router.push(`/post/${m.postId}`)"
        >
          <div class="flex items-center gap-2 min-w-0">
            <span class="ds-tag shrink-0"><span class="ds-tag-dot" style="background: var(--lime)"></span>相似度 {{ m.score }}</span>
            <span class="text-[14px] truncate flex-1" style="color: var(--ink)">{{ m.title }}</span>
          </div>
          <p class="text-[12px] mt-0.5 truncate pl-0.5" style="color: var(--ink-mute)">{{ m.reasons.join(' · ') }} · {{ m.excerpt }}</p>
        </button>
      </section>

      <!-- 意向出价（闪电意向撮合闭环，二手交易板块） -->
      <section v-if="isTradePost && userStore.isLoggedIn && !isPending" class="ds-card p-4">
        <div class="ds-section-head mb-3">
          <span class="ds-section-head__num">03</span>
          <h3 class="ds-title">意向出价</h3>
          <span class="ds-section-head__line"></span>
          <button
            v-if="!offersState.isSeller && !offersState.myOffer && !offersState.hasAccepted && !soldAt"
            class="ds-btn ds-btn--sm shrink-0"
            @click="showOfferSheet = true"
          >
            出个价
          </button>
        </div>
        <p v-if="offersState.hasAccepted && !soldAt" class="text-[12px]" style="color: var(--violet)">卖家已与买家达成交易，其余出价已冻结</p>
        <p v-else-if="soldAt" class="text-[12px]" style="color: var(--ink-mute)">该物品已售出</p>
        <div v-for="o in offersState.offers" :key="o.id" class="mt-2.5 px-3 py-2.5 rounded-[12px]"
          style="background: var(--paper); border: 1.5px solid var(--ink)">
          <div class="flex items-center gap-2 min-w-0">
            <span class="ds-num font-black" style="color: var(--violet)">¥{{ o.offerPrice }}</span>
            <span
              class="shrink-0 text-[11px] font-bold px-1.5 py-0.5 rounded-[6px]"
              :style="{
                background: (o.status === 'accepted' || o.status === 'completed') ? 'var(--violet)' : (o.status === 'pending' ? 'var(--sky)' : 'var(--paper)'),
                color: (o.status === 'accepted' || o.status === 'completed') ? 'var(--card)' : 'var(--ink-mute)',
              }"
            >{{ OFFER_STATUS_LABEL[o.status] || o.status }}</span>
            <span v-if="o.buyer" class="text-[12px] truncate" style="color: var(--ink-mute)">{{ o.buyer.nickname }}</span>
            <span class="ml-auto shrink-0 flex items-center gap-1.5" style="color: var(--ink-mute)">
              <template v-if="offersState.isSeller && o.status === 'pending'">
                <button class="ds-btn ds-btn--primary ds-btn--sm" :disabled="offerBusy" @click="actOnOffer(o.id, 'accept')">接受</button>
                <button class="act-like text-[12px] px-2 py-1 rounded-[8px] transition" :disabled="offerBusy" @click="actOnOffer(o.id, 'reject')">拒绝</button>
              </template>
              <button
                v-else-if="!offersState.isSeller && o.status === 'pending'"
                class="act-like text-[12px] px-2 py-1 rounded-[8px] transition"
                :disabled="offerBusy"
                @click="actOnOffer(o.id, 'cancel')"
              >取消</button>
            </span>
          </div>
          <p v-if="o.message" class="text-[12px] mt-1 truncate" style="color: var(--ink-mute)">附言：{{ o.message }}</p>
        </div>
        <div v-if="!offersState.offers.length && !soldAt" class="text-center text-[13px] py-4" style="color: var(--ink-mute)">还没有人出价，期待你的意向价</div>
      </section>

      <!-- 评论区：方形头像贴纸 + 墨色分隔线 -->
      <section id="comment-section" class="ds-card p-4">
        <div class="ds-section-head mb-3">
          <span class="ds-section-head__num">04</span>
          <h3 class="ds-title">评论 {{ post.commentCount }}</h3>
          <span class="ds-section-head__line"></span>
        </div>
        <div v-if="!comments.length" class="text-center text-[13px] py-6" style="color: var(--ink-mute)">暂无评论，快来抢沙发</div>
        <div v-for="c in comments" :key="c.id" class="cmt py-3.5">
          <div class="flex items-start gap-2.5">
            <div class="w-9 h-9 rounded-[10px] overflow-hidden flex items-center justify-center shrink-0"
              style="background: var(--sky); border: 1.5px solid var(--ink); box-shadow: var(--shadow-hard-sm)">
              <img v-if="c.author.avatar" :src="c.author.avatar" class="w-full h-full object-cover" alt="" />
              <span v-else class="text-[13px] font-black" style="color: var(--ink)">{{ c.author.nickname?.charAt(0) || '匿' }}</span>
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-1.5">
                <span class="text-[13px] font-bold" style="color: var(--ink)">{{ c.author.nickname || '匿名用户' }}</span>
                <span v-if="c.likeCount >= 10" class="flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-[6px] shrink-0"
                  style="background: var(--coral); color: var(--card)">
                  <Flame class="w-3 h-3" /> 热门
                </span>
              </div>
              <p class="cmt-body post-content mt-1">{{ c.content }}</p>
              <div class="flex items-center gap-5 mt-2 text-[11px]" style="color: var(--ink-mute)">
                <span class="ds-num">{{ formatTime(c.createdAt) }}</span>
                <button class="act-like flex items-center gap-1 transition-colors" :class="c.liked ? 'act-liked' : ''" @click="toggleCommentLike(c)">
                  <Heart class="w-3.5 h-3.5" :fill="c.liked ? 'currentColor' : 'none'" /> {{ c.likeCount }}
                </button>
                <button class="act-link transition-colors" @click="setReplyTarget(c)">回复</button>
                <button v-if="c.isMine || isAuthor" class="act-like transition-colors" @click="openDeleteComment(c)">删除</button>
              </div>
              <!-- 楼中楼回复 -->
              <div v-if="c.replies?.length" class="mt-2.5 p-3 rounded-[12px] space-y-2.5" style="background: var(--paper)">
                <div v-for="r in visibleReplies(c)" :key="r.id" class="text-[13px] leading-relaxed">
                  <div class="flex items-center gap-1.5 flex-wrap">
                    <span class="font-bold" style="color: var(--violet)">{{ r.author.nickname || '匿名用户' }}</span>
                    <span style="color: var(--ink-soft)">{{ r.content }}</span>
                  </div>
                  <div class="flex items-center gap-4 mt-1 text-[11px]" style="color: var(--ink-mute)">
                    <span class="ds-num">{{ formatTime(r.createdAt) }}</span>
                    <button class="act-like flex items-center gap-0.5 transition-colors" :class="r.liked ? 'act-liked' : ''" @click="toggleCommentLike(r)">
                      <Heart class="w-3 h-3" :fill="r.liked ? 'currentColor' : 'none'" /> {{ r.likeCount }}
                    </button>
                    <button class="act-link transition-colors" @click="setReplyTarget(r)">回复</button>
                    <button v-if="r.isMine || isAuthor" class="act-like transition-colors" @click="openDeleteComment(r)">删除</button>
                  </div>
                </div>
                <button v-if="c.replies.length > 3" class="act-link text-[12px] font-bold underline underline-offset-2 transition-colors" @click="toggleExpand(c)">
                  {{ expandedReplies.has(c.id) ? '收起' : `查看更多回复(${c.replies.length})` }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>

    <!-- 底部评论输入 -->
    <div v-if="post" class="fixed bottom-0 left-0 right-0 z-20"
      style="padding-bottom: env(safe-area-inset-bottom); background: var(--paper); border-top: 1.5px solid var(--ink)">
      <div class="max-w-[960px] mx-auto flex items-center gap-2 px-3 py-2">
        <div v-if="replyTarget" class="flex items-center gap-1 text-[12px] shrink-0" style="color: var(--ink-mute)">
          <span class="truncate max-w-[120px]">回复 @{{ replyTarget.author.nickname || '匿名' }}</span>
          <button class="act-like transition-colors" @click="replyTarget = null"><X class="w-3 h-3" /></button>
        </div>
        <input
          id="commentInput"
          ref="commentInputRef"
          v-model="commentText"
          type="text"
          maxlength="200"
          :disabled="isPending"
          :placeholder="!userStore.isLoggedIn ? '请先登录后评论' : (isPending ? '帖子审核中，暂不可评论' : (replyTarget ? '写下你的回复...' : '写下你的评论...'))"
          class="ds-input flex-1 min-w-0"
          aria-label="评论内容"
          @keyup.enter="submitComment"
          @click="onCommentInputClick"
        />
        <button :disabled="!canComment || commentPosting" class="ds-icon-btn shrink-0 disabled:opacity-50"
          style="background: var(--ink); border-color: var(--ink); color: var(--lime)" @click="submitComment">
          <Loader2 v-if="commentPosting" class="w-4 h-4 animate-spin" />
          <Send v-else class="w-4 h-4" />
        </button>
      </div>
    </div>

    <!-- 举报底部弹窗 -->
    <Teleport to="body">
      <div v-if="showReportSheet" class="fixed inset-0 z-50 flex items-end" @click.self="showReportSheet = false">
        <div class="absolute inset-0 bg-black/40"></div>
        <div class="ds-card animate-slide-up relative w-full max-w-[960px] mx-auto p-4" style="border-radius: 18px 18px 0 0">
          <h4 class="ds-title text-center mb-3">选择举报原因</h4>
          <div class="space-y-1">
            <button v-for="r in reportReasons" :key="r" class="hover-paper w-full py-3 text-center text-[13px] rounded-[10px]" style="color: var(--ink)" @click="submitReport(r)">
              {{ r }}
            </button>
          </div>
          <button class="w-full py-3 mt-2 text-center text-[12px]" style="color: var(--ink-mute); border-top: 1px solid var(--hairline)" @click="showReportSheet = false">取消</button>
        </div>
      </div>
    </Teleport>

    <!-- 意向出价底部弹窗 -->
    <Teleport to="body">
      <div v-if="showOfferSheet" class="fixed inset-0 z-50 flex items-end" @click.self="showOfferSheet = false">
        <div class="absolute inset-0 bg-black/40"></div>
        <div class="ds-card animate-slide-up relative w-full max-w-[960px] mx-auto p-4" style="border-radius: 18px 18px 0 0">
          <h4 class="ds-title text-center mb-1">向卖家发起意向出价</h4>
          <p class="ds-sub text-center mb-3">卖家确认后交易即锁定，双方可在私信里约定交付</p>
          <div class="ds-input flex items-center gap-2">
            <span class="font-black" style="color: var(--violet)">¥</span>
            <input
              v-model="offerPrice"
              type="number"
              min="0"
              step="0.01"
              placeholder="输入你的出价金额"
              class="flex-1 min-w-0 text-[13px] outline-none bg-transparent"
            />
          </div>
          <input
            v-model="offerMessage"
            maxlength="100"
            placeholder="附言（可选，如：可一教自提）"
            class="ds-input mt-2"
          />
          <button
            class="ds-btn ds-btn--primary w-full mt-3"
            :disabled="offerBusy || !offerPrice"
            @click="submitOffer"
          >{{ offerBusy ? '发送中…' : '发送出价' }}</button>
          <button class="w-full py-3 mt-2 text-center text-[12px]" style="color: var(--ink-mute); border-top: 1px solid var(--hairline)" @click="showOfferSheet = false">取消</button>
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

    <!-- 标记已售弹窗（可选登记买家账号） -->
    <Teleport to="body">
      <div v-if="showMarkSold" class="fixed inset-0 z-50 flex items-center justify-center p-6" @click.self="showMarkSold = false">
        <div class="absolute inset-0 bg-black/40"></div>
        <div class="ds-card relative w-full max-w-sm p-5">
          <h4 class="ds-title text-center">标记交易完成</h4>
          <p class="ds-sub text-center mt-1">可选登记买家账号，便于你之后定向评价对方</p>
          <input
            v-model="buyerStudentId"
            placeholder="买家账号（选填）"
            class="ds-input mt-4"
            @input="resolveBuyer"
          />
          <p v-if="buyerPreview" class="text-[12px] mt-1.5" style="color: var(--violet)">✓ 找到买家：{{ buyerPreview.nickname }}</p>
          <p v-else-if="buyerStudentId.trim() && !resolvingBuyer" class="text-[12px] mt-1.5" style="color: var(--ink-mute)">未找到该账号，可留空直接标记</p>
          <div class="flex gap-2 mt-4">
            <button class="ds-btn flex-1" @click="showMarkSold = false">取消</button>
            <button
              :disabled="markingSold || (buyerStudentId.trim() !== '' && !buyerPreview)"
              class="ds-btn ds-btn--primary flex-1"
              @click="markSold"
            >
              <Loader2 v-if="markingSold" class="w-4 h-4 animate-spin" />
              确认标记
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 交易互评弹窗 -->
    <Teleport to="body">
      <div v-if="showRateDialog" class="fixed inset-0 z-50 flex items-center justify-center p-6" @click.self="showRateDialog = false">
        <div class="absolute inset-0 bg-black/40"></div>
        <div class="ds-card relative w-full max-w-sm p-5">
          <h4 class="ds-title text-center">评价这次交易</h4>
          <p class="ds-sub text-center mt-1">仅对方可见你的评分，评价提交后不可修改</p>
          <div class="flex justify-center gap-2 my-5">
            <button v-for="i in 5" :key="i" class="p-0.5 active:scale-90 transition" @click="rateScore = i">
              <Star class="w-8 h-8 transition-colors"
                :style="{ color: i <= rateScore ? 'var(--coral)' : 'var(--hairline)', fill: i <= rateScore ? 'var(--coral)' : 'none' }" />
            </button>
          </div>
          <textarea
            v-model="rateComment"
            maxlength="200"
            rows="3"
            placeholder="说说这次交易的体验（选填，200 字内）"
            class="ds-input post-content resize-none"
          ></textarea>
          <div class="flex gap-2 mt-4">
            <button class="ds-btn flex-1" @click="showRateDialog = false">取消</button>
            <button
              :disabled="!rateScore || rateSubmitting"
              class="ds-btn ds-btn--primary flex-1"
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

<style scoped>
/* 详情页专属排版与分隔线：颜色/阴影全部走 token，无自定义色值 */
.detail-body { font-size: 15.5px; line-height: 1.85; color: var(--ink-soft); }
.cmt-body { font-size: 14px; line-height: 1.7; color: var(--ink-soft); }
.cmt + .cmt { border-top: 1.5px solid var(--ink); }
.row-link { border-bottom: 1px solid var(--hairline); }
.row-link:last-child { border-bottom: 0; }
.row-link:hover,
.hover-paper:hover { background: var(--paper); }
.act-liked,
.act-like:hover { color: var(--coral); }
.act-link:hover { color: var(--violet); }
</style>

