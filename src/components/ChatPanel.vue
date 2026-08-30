<script setup lang="ts">
/**
 * 私信聊天面板：升序气泡（自己右/对方左）、底部输入即时上屏
 * 实时链路：WS 在线时收发走 WS（发消息乐观上屏 + ack 回填），离线自动回落 REST
 * 轮询仅作 WS 断线兜底（15s 增量），后台标签页暂停、恢复可见立即补拉一次；
 * 收到/发出新消息 emit('activity') 让父级刷新会话列表顺序与 lastMessage
 */
import { ref, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { ArrowLeft, Send } from '@lucide/vue'
import { conversationApi } from '@/utils/api'
import { useUserStore } from '@/stores/user'
import { useChatSocket } from '@/composables/useChatSocket'
import { formatTime } from '@/utils/helpers'
import EmptyState from '@/components/EmptyState.vue'

interface ChatMessage {
  id: number
  content: string
  isMine: boolean
  createdAt: string | null
  /** WS 发送未回执的乐观消息：clientMsgId，ack 后回填真实 id */
  pendingId?: string
}

const props = defineProps<{
  conv: { id: number; peer: { id: number; nickname: string; avatar: string } }
}>()
const emit = defineEmits<{
  (e: 'back'): void
  (e: 'read', convId: number): void
  (e: 'activity', convId: number): void
}>()

const userStore = useUserStore()
const { status: wsStatus, onIncoming, onAck, sendChat } = useChatSocket()

const messages = ref<ChatMessage[]>([])
const loading = ref(true)
const sending = ref(false)
const draft = ref('')
const listRef = ref<HTMLDivElement | null>(null)
let pollTimer: ReturnType<typeof setInterval> | null = null

function nearBottom() {
  const el = listRef.value
  if (!el) return true
  return el.scrollHeight - el.scrollTop - el.clientHeight < 80
}

function scrollToBottom() {
  nextTick(() => {
    if (listRef.value) listRef.value.scrollTop = listRef.value.scrollHeight
  })
}

// 后端按 id 升序分页（page=1 是最旧的一批），取最后一页拿到最近的≤100条（仅首次进入用）
async function fetchTail(): Promise<ChatMessage[]> {
  const head: any = await conversationApi.messages(props.conv.id, { page: 1, pageSize: 1 })
  const total: number = head.data?.total || 0
  const lastPage = Math.max(1, Math.ceil(total / 100))
  const res: any = await conversationApi.messages(props.conv.id, { page: lastPage, pageSize: 100 })
  return res.data?.list || []
}

// 增量拉取：只取 id 大于本地最后一条的新消息（后端升序 limit 50），单请求替代原双请求全量
async function fetchIncrement(afterId: number): Promise<{ list: ChatMessage[]; hasMore: boolean }> {
  const res: any = await conversationApi.messages(props.conv.id, { afterId })
  return { list: res.data?.list || [], hasMore: !!res.data?.hasMore }
}

function mergeIncoming(incoming: ChatMessage[]) {
  if (!incoming.length) return
  // 本地已有（含刚发送的消息）按 id 去重，仅追加新消息
  const known = new Set(messages.value.map((m) => m.id))
  let added = false
  for (const m of incoming) {
    if (known.has(m.id)) continue
    // 自己消息的其他端同步：与未回执的乐观消息内容一致时直接替换，避免临时 id 与真实 id 双条
    if (m.isMine) {
      const pIdx = messages.value.findIndex((x) => x.pendingId && x.content === m.content)
      if (pIdx >= 0) {
        messages.value.splice(pIdx, 1, { ...m })
        added = true
        continue
      }
    }
    messages.value.push(m)
    added = true
  }
  if (!added) return
  messages.value.sort((a, b) => a.id - b.id)
  // 有新消息（收到或对端）→ 父级静默刷新会话列表顺序与 lastMessage
  emit('activity', props.conv.id)
}

function lastLocalId(): number {
  return messages.value.length ? messages.value[messages.value.length - 1].id : 0
}

async function load(initial = false) {
  const stick = nearBottom()
  try {
    if (initial) {
      messages.value = await fetchTail()
    } else {
      // 单次增量超过 50 条时用新 afterId 追平剩余分页
      for (;;) {
        const r = await fetchIncrement(lastLocalId())
        mergeIncoming(r.list)
        if (!r.list.length || !r.hasMore) break
      }
    }
    emit('read', props.conv.id)
  } catch {
    // 错误已由拦截器 toast；保留已加载内容
  } finally {
    loading.value = false
    if (initial || stick) scrollToBottom()
  }
}

async function send() {
  const text = draft.value.trim()
  if (!text || sending.value) return
  sending.value = true
  try {
    if (wsStatus.value === 'open') {
      // WS 在线：乐观上屏（临时负 id），ack 后回填真实 id；失败由重连后的增量拉取兜底
      const clientMsgId = crypto.randomUUID()
      messages.value.push({
        id: -Date.now(),
        content: text,
        isMine: true,
        createdAt: new Date().toISOString(),
        pendingId: clientMsgId,
      })
      // 竞态兜底：判定在线后 socket 恰好断开（send 返回 false）→ 改走 REST 并回填乐观条目
      if (!sendChat(props.conv.peer.id, text, clientMsgId)) {
        const res: any = await conversationApi.send(props.conv.id, text)
        const idx = messages.value.findIndex((m) => m.pendingId === clientMsgId)
        if (idx >= 0) {
          messages.value[idx] = { id: res.data.id, content: text, isMine: true, createdAt: new Date().toISOString() }
        } else {
          messages.value.push({ id: res.data.id, content: text, isMine: true, createdAt: new Date().toISOString() })
        }
      }
    } else {
      const res: any = await conversationApi.send(props.conv.id, text)
      messages.value.push({
        id: res.data.id,
        content: text,
        isMine: true,
        createdAt: new Date().toISOString(),
      })
    }
    draft.value = ''
    // 发送也会改变会话顺序/lastMessage → 通知父级刷新
    emit('activity', props.conv.id)
    scrollToBottom()
  } catch {
    // 错误已由拦截器 toast
  } finally {
    sending.value = false
  }
}

// ---------- 轮询生命周期：WS 在线时停轮询，断线自动恢复兜底 ----------
function startPoll() {
  if (pollTimer !== null || document.hidden) return
  if (wsStatus.value === 'open') return // WS 实时在线，无需轮询
  pollTimer = setInterval(() => {
    if (document.hidden) return
    load(false)
  }, 15000)
}
function stopPoll() {
  if (pollTimer !== null) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}
function onVisibility() {
  if (document.hidden) {
    stopPoll()
  } else {
    load(false)
    startPoll()
  }
}

// ---------- WS 实时接入 ----------
// 本会话新消息：直接合并上屏；正在看时顺带让服务端清未读并同步红点
const offIncoming = onIncoming((m) => {
  if (m.convId !== props.conv.id) return
  const me = userStore.user?.id
  mergeIncoming([{ id: m.messageId, content: m.body, isMine: m.from === me, createdAt: m.createdAt }])
  if (!document.hidden && m.from !== me) {
    // afterId GET 顺带把服务端该会话未读清零；merge 去重保证不重复上屏
    conversationApi.messages(props.conv.id, { afterId: m.messageId }).catch(() => {})
    emit('read', props.conv.id)
  }
})
// 自己 WS 消息的服务端回执：把乐观消息的临时 id 回填为真实 id
const offAck = onAck((ack) => {
  const idx = messages.value.findIndex((m) => m.pendingId && m.pendingId === ack.clientMsgId)
  if (idx < 0) return
  messages.value[idx] = {
    id: ack.messageId,
    content: messages.value[idx].content,
    isMine: true,
    createdAt: ack.createdAt,
  }
  messages.value.sort((a, b) => a.id - b.id)
})
// WS 连接状态变化 → 停/恢复轮询兜底
const stopWatchStatus = watch(wsStatus, (s) => {
  if (s === 'open') stopPoll()
  else if (!document.hidden) startPoll()
}, { immediate: true })

onMounted(() => {
  load(true)
  startPoll()
  document.addEventListener('visibilitychange', onVisibility)
})
onUnmounted(() => {
  stopPoll()
  offIncoming()
  offAck()
  stopWatchStatus()
  document.removeEventListener('visibilitychange', onVisibility)
})
</script>

<template>
  <div class="flex flex-col h-full bg-white rounded-xl shadow-sm overflow-hidden">
    <!-- 面板头 -->
    <div class="flex items-center gap-2 px-3 h-12 border-b border-zinc-100 flex-shrink-0">
      <button class="p-1.5 -ml-1.5 text-zinc-600 hover:text-zinc-900 sm:hidden" @click="emit('back')">
        <ArrowLeft class="w-5 h-5" />
      </button>
      <div class="w-8 h-8 rounded-full bg-gradient-to-br from-brand-100 to-brand-200 flex items-center justify-center overflow-hidden flex-shrink-0">
        <img v-if="conv.peer.avatar" :src="conv.peer.avatar" class="w-full h-full object-cover" alt="" />
        <span v-else class="text-sm font-bold text-brand-700">{{ conv.peer.nickname?.charAt(0) || '友' }}</span>
      </div>
      <span class="font-medium text-zinc-900 truncate">{{ conv.peer.nickname || '用户' }}</span>
    </div>

    <!-- 消息气泡区 -->
    <div ref="listRef" class="flex-1 overflow-y-auto px-3 py-3 space-y-2 bg-zinc-50/60 min-h-[240px]">
      <div v-if="loading" class="h-full flex items-center justify-center">
        <span class="text-xs text-zinc-400">加载中...</span>
      </div>
      <template v-else>
        <EmptyState v-if="!messages.length" text="还没有消息，打个招呼吧" />
        <div v-for="m in messages" :key="m.id"
          class="flex items-end gap-2" :class="m.isMine ? 'justify-end' : 'justify-start'">
          <p v-if="m.createdAt && !m.isMine" class="text-[10px] text-zinc-300 flex-shrink-0">{{ formatTime(m.createdAt) }}</p>
          <div class="max-w-[70%] px-3 py-2 rounded-2xl text-sm leading-relaxed break-words whitespace-pre-wrap"
            :class="m.isMine ? 'bg-brand-500 text-white rounded-br-sm' : 'bg-white text-zinc-800 border border-zinc-100 rounded-bl-sm'">
            {{ m.content }}
          </div>
          <p v-if="m.createdAt && m.isMine" class="text-[10px] text-zinc-300 flex-shrink-0">{{ formatTime(m.createdAt) }}</p>
        </div>
      </template>
    </div>

    <!-- 输入区 -->
    <div class="flex items-center gap-2 p-2.5 border-t border-zinc-100 flex-shrink-0">
      <input v-model="draft" type="text" maxlength="500" placeholder="输入消息..."
        class="flex-1 h-9 px-3 rounded-full bg-zinc-100 focus:bg-white border border-transparent focus:border-brand-500 focus:outline-none text-sm transition"
        @keyup.enter="send" />
      <button :disabled="sending || !draft.trim()"
        class="w-9 h-9 rounded-full bg-brand-500 hover:bg-brand-600 disabled:bg-brand-300 text-white flex items-center justify-center flex-shrink-0 transition"
        @click="send">
        <Send class="w-4 h-4" />
      </button>
    </div>
  </div>
</template>
