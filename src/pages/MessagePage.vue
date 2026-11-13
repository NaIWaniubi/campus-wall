<script setup lang="ts">
/**
 * 消息中心：顶层「通知 / 私信」双 Tab
 * 通知：Tab切换、列表、标记已读；私信：会话列表 + 同页分栏 ChatPanel
 */
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, MessageCircle, Heart, Bell, CheckCheck, MapPin, Newspaper } from '@lucide/vue'
import { messageApi, conversationApi } from '@/utils/api'
import { useAppStore } from '@/stores/app'
import { useChatSocket } from '@/composables/useChatSocket'
import { formatTime } from '@/utils/helpers'
import { toast } from '@/utils/request'
import EmptyState from '@/components/EmptyState.vue'
import ChatPanel from '@/components/ChatPanel.vue'

const route = useRoute()
const router = useRouter()
const appStore = useAppStore()

const view = ref<'notice' | 'chat'>((route.query.tab as string) === 'chat' ? 'chat' : 'notice')

// ---------- 通知 ----------
const tabs = [
  { key: 'all', label: '全部' },
  { key: 'comment', label: '评论' },
  { key: 'like', label: '点赞' },
  { key: 'match', label: '匹配' },
  { key: 'digest', label: '摘要' },
  { key: 'system', label: '系统通知' },
]
const activeTab = ref('all')
const list = ref<any[]>([])
const loading = ref(true)

function typeMeta(type: string) {
  // 颜色是语义提示（评论=紫 / 点赞=珊瑚 / 匹配=天蓝 / 摘要=荧光 / 系统=墨），供图标底色使用
  if (type === 'comment') return { icon: MessageCircle, tone: 'var(--violet)' }
  if (type === 'like') return { icon: Heart, tone: 'var(--coral)' }
  // 失物匹配：related_id 即对方帖子 id
  if (type === 'match') return { icon: MapPin, tone: 'var(--sky)' }
  // 每日板块摘要
  if (type === 'digest') return { icon: Newspaper, tone: 'var(--lime)' }
  return { icon: Bell, tone: 'var(--ink)' }
}

// digest 摘要较长：默认收起两行，点击展开全文
const expandedDigest = ref<Set<number>>(new Set())
function toggleDigest(id: number) {
  const s = new Set(expandedDigest.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  expandedDigest.value = s
}

async function load() {
  loading.value = true
  try {
    const res: any = await messageApi.list(activeTab.value)
    list.value = res.data?.list || []
  } catch {
    list.value = []
  } finally {
    loading.value = false
  }
}

function switchTab(key: string) {
  if (activeTab.value === key) return
  activeTab.value = key
  load()
}

async function onItemClick(msg: any) {
  if (!msg.isRead) {
    try {
      await messageApi.read(msg.id)
      msg.isRead = true
      appStore.fetchUnreadCount().catch(() => {})
    } catch {
      // 错误已由拦截器 toast
    }
  }
  // digest：不跳转，展开/收起全文
  if (msg.type === 'digest') return toggleDigest(msg.id)
  if ((msg.type === 'comment' || msg.type === 'like') && msg.postId) {
    return router.push(`/post/${msg.postId}`)
  }
  // match：related_id 即对方帖子 id，带 showMatches 让详情页定位并展开匹配卡片
  if (msg.type === 'match' && msg.postId) {
    return router.push(`/post/${msg.postId}?showMatches=1`)
  }
}

async function readAll() {
  try {
    await messageApi.readAll()
    list.value.forEach((m) => (m.isRead = true))
    appStore.fetchUnreadCount().catch(() => {})
    toast.success('已全部标记为已读')
  } catch {
    // 错误已由拦截器 toast
  }
}

// ---------- 私信 ----------
const convs = ref<any[]>([])
const convsLoading = ref(false)
const convsLoaded = ref(false)
const activeConvId = ref<number | null>(null)
// 从帖子详情跳转过来时定位到指定会话
const pendingConvId = Number(route.query.conv) || null

const activeConv = computed(() => convs.value.find((c) => c.id === activeConvId.value) || null)
const chatUnread = computed(() => convs.value.reduce((s, c) => s + (c.unread || 0), 0))

async function loadConvs(silent = false) {
  // 静默刷新（聊天中的增量同步）不闪骨架屏，失败保留旧列表
  if (!silent) convsLoading.value = true
  try {
    const res: any = await conversationApi.list()
    convs.value = res.data || []
    // 定位指定会话（来自 PostDetailPage 私信按钮）
    if (pendingConvId && convs.value.some((c) => c.id === pendingConvId)) {
      activeConvId.value = pendingConvId
    }
  } catch {
    if (!silent) convs.value = []
  } finally {
    if (!silent) convsLoading.value = false
    convsLoaded.value = true
  }
}

function openConv(c: any) {
  activeConvId.value = c.id
}

// ChatPanel 进入会话后端已清未读，同步列表红点与全局角标
function onConvRead(convId: number) {
  const c = convs.value.find((x) => x.id === convId)
  if (c && c.unread) {
    c.unread = 0
    appStore.fetchUnreadCount().catch(() => {})
  }
}

function switchView(v: 'notice' | 'chat') {
  view.value = v
  if (v === 'chat' && !convsLoaded.value) loadConvs()
}

// ChatPanel 轮询/WS 推到新消息后静默刷新会话列表（节流 2s，避免高频重拉）
// 通知 tab 下也刷新：私信未读角标（chatUnread）需保持最新
let convRefreshTimer: ReturnType<typeof setTimeout> | null = null
function onConvActivity() {
  if (convRefreshTimer !== null) return
  convRefreshTimer = setTimeout(() => {
    convRefreshTimer = null
    if (convsLoaded.value) loadConvs(true)
  }, 2000)
}

// ---------- WS 实时接入 ----------
const { onIncoming, onNotify } = useChatSocket()
// 收到私信推送：静默刷会话列表 + 全局未读角标
const offIncoming = onIncoming(() => {
  onConvActivity()
  appStore.fetchUnreadCount().catch(() => {})
})
// 收到通知推送：全局未读角标 + 通知 tab 节流重载列表
let noticeRefreshTimer: ReturnType<typeof setTimeout> | null = null
const offNotify = onNotify(() => {
  appStore.fetchUnreadCount().catch(() => {})
  if (view.value !== 'notice' || noticeRefreshTimer !== null) return
  noticeRefreshTimer = setTimeout(() => {
    noticeRefreshTimer = null
    load()
  }, 1500)
})

onMounted(() => {
  load()
  if (view.value === 'chat') loadConvs()
})
onUnmounted(() => {
  if (convRefreshTimer !== null) {
    clearTimeout(convRefreshTimer)
    convRefreshTimer = null
  }
  if (noticeRefreshTimer !== null) {
    clearTimeout(noticeRefreshTimer)
    noticeRefreshTimer = null
  }
  offIncoming()
  offNotify()
})
</script>

<template>
  <div class="min-h-screen pb-24">
    <!-- 顶栏：简洁墨色条（返回 + 标题） -->
    <header class="hero sticky top-0 z-10">
      <div class="max-w-[960px] mx-auto flex items-center gap-2.5 h-14 px-3">
        <button
          class="shrink-0 w-9 h-9 rounded-[12px] flex items-center justify-center"
          style="border: 1.5px solid rgb(255 255 255 / 0.34); color: var(--paper)"
          aria-label="返回"
          @click="router.back()"
        >
          <ArrowLeft class="w-5 h-5" />
        </button>
        <h1 class="ds-display text-[22px]" style="color: var(--paper)">消息</h1>
      </div>
    </header>

    <!-- Tab：顶层 通知 / 私信（.ds-chip） -->
    <div class="max-w-[960px] mx-auto px-4 pt-3 space-y-2">
      <div class="flex items-center gap-2">
        <button v-for="t in [
            { key: 'notice', label: '通知' },
            { key: 'chat', label: '私信' },
          ]" :key="t.key"
          class="ds-chip"
          :class="{ 'is-active': view === t.key }"
          @click="switchView(t.key as any)">
          {{ t.label }}
          <span v-if="t.key === 'chat' && chatUnread > 0"
            class="min-w-[16px] h-4 px-1 rounded-full text-[10px] leading-4 text-center font-bold text-white"
            style="background: var(--coral)">{{ chatUnread > 99 ? '99+' : chatUnread }}</span>
        </button>
        <button v-if="view === 'notice'" class="ds-btn ds-btn--sm ml-auto shrink-0" @click="readAll">
          <CheckCheck class="w-3.5 h-3.5" /> 全部已读
        </button>
      </div>
      <!-- 通知子 Tab（.ds-chip） -->
      <div v-if="view === 'notice'" class="flex items-center gap-1.5 overflow-x-auto scrollbar-hide ds-scroll-x pb-0.5">
        <button v-for="t in tabs" :key="t.key"
          class="ds-chip !py-1 !px-2.5 !text-[11.5px]"
          :class="{ 'is-active': activeTab === t.key }"
          @click="switchTab(t.key)">
          {{ t.label }}
        </button>
      </div>
    </div>

    <!-- 通知列表：墨线卡 + .ds-hairline 分隔 -->
    <main v-if="view === 'notice'" class="max-w-[960px] mx-auto px-4 py-3">
      <!-- 加载骨架 -->
      <div v-if="loading" class="space-y-2">
        <div v-for="i in 4" :key="i" class="ds-card ds-card--flat p-3 flex items-center gap-3">
          <div class="w-9 h-9 rounded-[10px] skeleton"></div>
          <div class="flex-1">
            <div class="h-3 w-3/4 skeleton rounded mb-2"></div>
            <div class="h-2 w-1/3 skeleton rounded"></div>
          </div>
        </div>
      </div>

      <template v-else>
        <div v-if="list.length" class="ds-card overflow-hidden">
          <template v-for="(msg, i) in list" :key="msg.id">
            <div v-if="i" class="ds-hairline"></div>
            <button
              class="w-full text-left p-3 flex items-start gap-3 transition active:opacity-70"
              @click="onItemClick(msg)">
              <div class="w-9 h-9 rounded-[10px] flex items-center justify-center flex-shrink-0"
                style="background: var(--paper); border: 1.5px solid var(--ink)">
                <component :is="typeMeta(msg.type).icon" class="w-[18px] h-[18px]" style="color: var(--ink)" />
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-[13.5px] leading-relaxed post-content"
                  :class="[!msg.isRead ? 'font-bold' : '', msg.type === 'digest' && !expandedDigest.has(msg.id) ? 'line-clamp-2' : '']"
                  style="color: var(--ink)">{{ msg.content }}</p>
                <div class="flex items-center gap-2 mt-1">
                  <span class="ds-num text-[11px]" style="color: var(--ink-mute)">{{ formatTime(msg.createdAt) }}</span>
                  <span v-if="msg.type === 'digest'" class="ds-label" style="color: var(--violet)">{{ expandedDigest.has(msg.id) ? '收起' : '展开全文' }}</span>
                </div>
              </div>
              <span v-if="!msg.isRead" class="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style="background: var(--coral)"></span>
            </button>
          </template>
        </div>

        <EmptyState v-if="!list.length" text="暂无消息" action-text="去逛逛" @action="router.push('/')" />
      </template>
    </main>

    <!-- 私信：会话列表 + 分栏聊天 -->
    <main v-else class="max-w-[960px] mx-auto px-4 py-3">
      <div class="flex gap-3 items-stretch">
        <!-- 会话列表：墨线卡 + .ds-hairline 分隔 -->
        <aside class="w-full md:w-[280px] flex-shrink-0" :class="activeConvId ? 'hidden md:block' : ''">
          <div v-if="convsLoading" class="space-y-2">
            <div v-for="i in 4" :key="i" class="ds-card ds-card--flat p-3 flex items-center gap-3">
              <div class="w-10 h-10 rounded-[12px] skeleton"></div>
              <div class="flex-1">
                <div class="h-3 w-20 skeleton rounded mb-2"></div>
                <div class="h-2 w-2/3 skeleton rounded"></div>
              </div>
            </div>
          </div>
          <template v-else>
            <div v-if="convs.length" class="ds-card overflow-hidden">
              <template v-for="(c, i) in convs" :key="c.id">
                <div v-if="i" class="ds-hairline"></div>
                <button
                  class="w-full text-left p-3 flex items-center gap-3 transition active:opacity-70"
                  :style="activeConvId === c.id ? { background: 'var(--paper)', boxShadow: 'inset 3px 0 0 var(--ink)' } : {}"
                  @click="openConv(c)">
                  <div class="w-10 h-10 rounded-[12px] flex items-center justify-center overflow-hidden flex-shrink-0"
                    style="background: var(--lime); border: 1.5px solid var(--ink)">
                    <img v-if="c.peer.avatar" :src="c.peer.avatar" class="w-full h-full object-cover" alt="" />
                    <span v-else class="text-base font-bold" style="color: var(--ink)">{{ c.peer.nickname?.charAt(0) || '友' }}</span>
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2">
                      <span class="text-[13.5px] font-bold truncate" style="color: var(--ink)">{{ c.peer.nickname || '用户' }}</span>
                      <span class="ml-auto ds-num text-[11px] flex-shrink-0" style="color: var(--ink-mute)">{{ formatTime(c.lastAt) }}</span>
                    </div>
                    <div class="flex items-center gap-2 mt-0.5">
                      <p class="text-xs truncate flex-1" style="color: var(--ink-mute)">{{ c.lastMessage || '暂无消息' }}</p>
                      <span v-if="c.unread > 0"
                        class="min-w-[18px] h-[18px] px-1 rounded-full text-[10px] leading-[18px] text-center font-bold text-white flex-shrink-0"
                        style="background: var(--coral)">{{ c.unread > 99 ? '99+' : c.unread }}</span>
                    </div>
                  </div>
                </button>
              </template>
            </div>
            <EmptyState v-if="!convs.length" text="暂无会话，去帖子详情找作者聊聊吧" action-text="去逛逛" @action="router.push('/')" />
          </template>
        </aside>

        <!-- 聊天面板 -->
        <section class="flex-1 min-w-0" :class="activeConvId ? '' : 'hidden md:block'">
          <div class="md:h-[calc(100vh-11rem)] md:min-h-[420px]">
            <ChatPanel v-if="activeConv" :key="activeConv.id" :conv="activeConv" @back="activeConvId = null" @read="onConvRead" @activity="onConvActivity" />
            <div v-else class="hidden md:flex h-full min-h-[420px] items-center justify-center">
              <EmptyState text="选择一个会话开始聊天" />
            </div>
          </div>
        </section>
      </div>
    </main>
  </div>
</template>
