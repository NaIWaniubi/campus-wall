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
  if (type === 'comment') return { icon: MessageCircle, color: 'text-brand-500', bg: 'bg-brand-50' }
  if (type === 'like') return { icon: Heart, color: 'text-red-500', bg: 'bg-red-50' }
  // 失物匹配：related_id 即对方帖子 id
  if (type === 'match') return { icon: MapPin, color: 'text-emerald-500', bg: 'bg-emerald-50' }
  // 每日板块摘要
  if (type === 'digest') return { icon: Newspaper, color: 'text-violet-500', bg: 'bg-violet-50' }
  return { icon: Bell, color: 'text-amber-500', bg: 'bg-amber-50' }
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

// ChatPanel 轮询到新消息/发送消息后静默刷新会话列表（节流 2s，避免高频重拉）
let convRefreshTimer: ReturnType<typeof setTimeout> | null = null
function onConvActivity() {
  if (convRefreshTimer !== null) return
  convRefreshTimer = setTimeout(() => {
    convRefreshTimer = null
    if (view.value === 'chat') loadConvs(true)
  }, 2000)
}

onMounted(() => {
  load()
  if (view.value === 'chat') loadConvs()
})
onUnmounted(() => {
  if (convRefreshTimer !== null) {
    clearTimeout(convRefreshTimer)
    convRefreshTimer = null
  }
})
</script>

<template>
  <div class="min-h-screen bg-zinc-50 pb-6">
    <header class="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-zinc-100">
      <div class="max-w-[960px] mx-auto flex items-center h-14 px-3">
        <button class="p-2 -ml-2 text-zinc-600 hover:text-zinc-900" @click="router.back()">
          <ArrowLeft class="w-5 h-5" />
        </button>
        <span class="ml-1 font-medium text-zinc-900 flex-1">消息</span>
        <button v-if="view === 'notice'"
          class="flex items-center gap-1 px-2.5 py-1 rounded-full bg-brand-50 text-brand-600 text-xs hover:bg-brand-100 transition"
          @click="readAll">
          <CheckCheck class="w-3.5 h-3.5" /> 全部已读
        </button>
      </div>
      <!-- 顶层 Tab：通知 / 私信 -->
      <div class="max-w-[960px] mx-auto px-3 flex items-center gap-1 h-11">
        <button v-for="t in [
            { key: 'notice', label: '通知' },
            { key: 'chat', label: '私信' },
          ]" :key="t.key"
          class="relative px-3 py-2 text-sm whitespace-nowrap transition"
          :class="view === t.key ? 'text-brand-600 font-medium' : 'text-zinc-500 hover:text-zinc-800'"
          @click="switchView(t.key as any)">
          {{ t.label }}
          <span v-if="t.key === 'chat' && chatUnread > 0"
            class="absolute -top-0.5 right-0 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] leading-4 text-center">{{ chatUnread > 99 ? '99+' : chatUnread }}</span>
          <span v-if="view === t.key" class="absolute left-1/2 -translate-x-1/2 bottom-0 w-6 h-0.5 bg-brand-500 rounded-full"></span>
        </button>
        <!-- 通知子 Tab -->
        <template v-if="view === 'notice'">
          <div class="ml-auto flex items-center gap-1 overflow-x-auto">
            <button v-for="t in tabs" :key="t.key"
              class="relative px-2.5 py-1.5 text-xs whitespace-nowrap rounded-full transition"
              :class="activeTab === t.key ? 'text-brand-600 font-medium bg-brand-50' : 'text-zinc-500 hover:text-zinc-800'"
              @click="switchTab(t.key)">
              {{ t.label }}
            </button>
          </div>
        </template>
      </div>
    </header>

    <!-- 通知列表 -->
    <main v-if="view === 'notice'" class="max-w-[960px] mx-auto px-4 py-3 space-y-2">
      <!-- 加载骨架 -->
      <div v-if="loading" class="space-y-2">
        <div v-for="i in 4" :key="i" class="bg-white rounded-xl p-3 flex items-center gap-3">
          <div class="w-9 h-9 rounded-full skeleton"></div>
          <div class="flex-1">
            <div class="h-3 w-3/4 skeleton rounded mb-2"></div>
            <div class="h-2 w-1/3 skeleton rounded"></div>
          </div>
        </div>
      </div>

      <template v-else>
        <button v-for="msg in list" :key="msg.id"
          class="w-full text-left bg-white rounded-xl p-3 flex items-start gap-3 shadow-sm hover:shadow-md transition active:bg-zinc-50"
          @click="onItemClick(msg)">
          <div class="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" :class="typeMeta(msg.type).bg">
            <component :is="typeMeta(msg.type).icon" class="w-5 h-5" :class="typeMeta(msg.type).color" />
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm text-zinc-800 post-content"
              :class="[!msg.isRead ? 'font-medium' : '', msg.type === 'digest' && !expandedDigest.has(msg.id) ? 'line-clamp-2' : '']">{{ msg.content }}</p>
            <span class="text-xs text-zinc-400">{{ formatTime(msg.createdAt) }}</span>
            <span v-if="msg.type === 'digest'" class="text-xs text-brand-600 ml-2">{{ expandedDigest.has(msg.id) ? '收起' : '展开全文' }}</span>
          </div>
          <span v-if="!msg.isRead" class="w-2 h-2 rounded-full bg-red-500 mt-1.5 flex-shrink-0"></span>
        </button>

        <EmptyState v-if="!list.length" text="暂无消息" action-text="去逛逛" @action="router.push('/')" />
      </template>
    </main>

    <!-- 私信：会话列表 + 分栏聊天 -->
    <main v-else class="max-w-[960px] mx-auto px-4 py-3">
      <div class="flex gap-3 items-stretch">
        <!-- 会话列表 -->
        <aside class="w-full sm:w-[280px] flex-shrink-0 space-y-2" :class="activeConvId ? 'hidden sm:block' : ''">
          <div v-if="convsLoading" class="space-y-2">
            <div v-for="i in 4" :key="i" class="bg-white rounded-xl p-3 flex items-center gap-3">
              <div class="w-10 h-10 rounded-full skeleton"></div>
              <div class="flex-1">
                <div class="h-3 w-20 skeleton rounded mb-2"></div>
                <div class="h-2 w-2/3 skeleton rounded"></div>
              </div>
            </div>
          </div>
          <template v-else>
            <button v-for="c in convs" :key="c.id"
              class="w-full text-left bg-white rounded-xl p-3 flex items-center gap-3 shadow-sm transition hover:shadow-md"
              :class="activeConvId === c.id ? 'ring-2 ring-brand-200' : ''"
              @click="openConv(c)">
              <div class="w-10 h-10 rounded-full bg-gradient-to-br from-brand-100 to-brand-200 flex items-center justify-center overflow-hidden flex-shrink-0">
                <img v-if="c.peer.avatar" :src="c.peer.avatar" class="w-full h-full object-cover" alt="" />
                <span v-else class="text-base font-bold text-brand-700">{{ c.peer.nickname?.charAt(0) || '友' }}</span>
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <span class="text-sm font-medium text-zinc-900 truncate">{{ c.peer.nickname || '用户' }}</span>
                  <span class="ml-auto text-[11px] text-zinc-400 flex-shrink-0">{{ formatTime(c.lastAt) }}</span>
                </div>
                <div class="flex items-center gap-2 mt-0.5">
                  <p class="text-xs text-zinc-500 truncate flex-1">{{ c.lastMessage || '暂无消息' }}</p>
                  <span v-if="c.unread > 0" class="min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] leading-[18px] text-center flex-shrink-0">{{ c.unread > 99 ? '99+' : c.unread }}</span>
                </div>
              </div>
            </button>
            <EmptyState v-if="!convs.length" text="暂无会话，去帖子详情找作者聊聊吧" action-text="去逛逛" @action="router.push('/')" />
          </template>
        </aside>

        <!-- 聊天面板 -->
        <section class="flex-1 min-w-0" :class="activeConvId ? '' : 'hidden sm:block'">
          <div class="sm:h-[calc(100vh-11rem)] sm:min-h-[420px]">
            <ChatPanel v-if="activeConv" :key="activeConv.id" :conv="activeConv" @back="activeConvId = null" @read="onConvRead" @activity="onConvActivity" />
            <div v-else class="hidden sm:flex h-full min-h-[420px] items-center justify-center bg-white rounded-xl shadow-sm">
              <EmptyState text="选择一个会话开始聊天" />
            </div>
          </div>
        </section>
      </div>
    </main>
  </div>
</template>
