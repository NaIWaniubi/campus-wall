<script setup lang="ts">
/**
 * AI 助手悬浮组件：基于官网内容答疑 + 论坛相关讨论推荐
 * 支持流式输出（SSE）、本地历史、Markdown 渲染、论坛引用角标
 */
import { ref, reactive, nextTick, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Bot, X, Send, Loader2, MessagesSquare, ChevronRight, Trash2 } from '@lucide/vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { aiApi, type AiForumItem } from '@/utils/api'
import { useUserStore } from '@/stores/user'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  forums?: AiForumItem[]
  streaming?: boolean // 正在流式输出中（按纯文本渲染）
}

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

const open = ref(false)
const loading = ref(false)
const input = ref('')
const confirmClear = ref(false)
const messages = ref<ChatMessage[]>([])

const suggestions = ['怎么发帖？', '信誉分怎么算？', '匿名发布有什么规则？']

// 仅登录用户可用；管理后台不显示
const visible = computed(() => userStore.isLoggedIn && !route.path.startsWith('/admin'))

// ---------- 本地历史（按用户隔离，上限 50 条） ----------
const STORE_KEY = computed(() => `ai-chat-history-${userStore.user?.id ?? 0}`)

function welcomeMessage(): ChatMessage {
  return {
    role: 'assistant',
    content:
      '你好，我是校园墙 AI 助手 👋 可以问我平台使用问题（发帖、匿名、信誉分等），也会为你推荐论坛里的相关讨论。',
  }
}

function loadHistory() {
  try {
    const raw = localStorage.getItem(STORE_KEY.value)
    const list = raw ? (JSON.parse(raw) as ChatMessage[]) : []
    messages.value =
      Array.isArray(list) && list.length ? list : [welcomeMessage()]
  } catch {
    messages.value = [welcomeMessage()]
  }
}

function saveHistory() {
  try {
    // 流式中的消息不落盘，完成后再存
    const done = messages.value.filter((m) => !m.streaming).slice(-50)
    localStorage.setItem(STORE_KEY.value, JSON.stringify(done))
  } catch {
    // 存储满等异常忽略
  }
}

watch(STORE_KEY, loadHistory)
onMounted(loadHistory)

async function toggleOpen() {
  if (!userStore.isLoggedIn) {
    router.push({ path: '/login', query: { redirect: route.fullPath } })
    return
  }
  open.value = !open.value
  if (open.value) scrollToBottom()
}

function scrollToBottom() {
  nextTick(() => {
    const list = document.getElementById('ai-chat-list')
    if (list) list.scrollTop = list.scrollHeight
  })
}

function clearChat() {
  if (!confirmClear.value) {
    confirmClear.value = true
    setTimeout(() => (confirmClear.value = false), 3000)
    return
  }
  confirmClear.value = false
  messages.value = [welcomeMessage()]
  saveHistory()
}

// ---------- Markdown 渲染 + 论坛引用角标 ----------
marked.setOptions({ breaks: true, gfm: true })

function renderMarkdown(content: string): string {
  const html = marked.parse(content, { async: false }) as string
  let safe = DOMPurify.sanitize(html)
  // [论坛N] → 可点击角标（编号对应 forums 数组序号）
  safe = safe.replace(/\[论坛(\d+)\]/g, (_, n: string) => {
    return `<sup class="ai-cite" data-post-id="${n}">[论坛${n}]</sup>`
  })
  return safe
}

function onContentClick(e: MouseEvent) {
  const el = (e.target as HTMLElement).closest?.('.ai-cite') as HTMLElement | null
  if (!el) return
  const n = parseInt(el.dataset.postId || '', 10)
  // 从所在助手消息里找对应论坛卡片
  const idx = (el.closest('[data-msg-idx]') as HTMLElement | null)?.dataset.msgIdx
  const msg = idx != null ? messages.value[Number(idx)] : null
  const forum = msg?.forums?.[n - 1]
  if (forum) goPost(forum.id)
}

// ---------- 发送（SSE 流式，失败回退非流式） ----------
function buildRequestMessages(): { role: 'user' | 'assistant'; content: string }[] {
  return messages.value
    .filter((m) => !m.forums || m.role === 'user') // 欢迎语与降级提示不进上下文
    .slice(-7)
    .map((m) => ({ role: m.role, content: m.content }))
}

async function send(text?: string) {
  const content = (text ?? input.value).trim()
  if (!content || loading.value) return
  input.value = ''
  confirmClear.value = false

  messages.value.push({ role: 'user', content })
  const reply = reactive({ role: 'assistant', content: '', streaming: true, forums: [] }) as ChatMessage
  messages.value.push(reply)
  loading.value = true
  scrollToBottom()

  let gotDelta = false
  let ok = false
  try {
    const resp = await fetch('/api/ai/chat/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: userStore.token ? `Bearer ${userStore.token}` : '',
      },
      body: JSON.stringify({ message: content, history: buildRequestMessages().slice(0, -1) }),
    })
    if (!resp.ok || !resp.body) throw new Error(`HTTP ${resp.status}`)

    const reader = resp.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const frames = buffer.split('\n\n')
      buffer = frames.pop() || ''
      for (const frame of frames) {
        const eventLine = frame.split('\n').find((l) => l.startsWith('event:'))
        const dataLine = frame.split('\n').find((l) => l.startsWith('data:'))
        if (!dataLine) continue
        const event = eventLine?.slice(6).trim() || 'message'
        let data: any
        try {
          data = JSON.parse(dataLine.slice(5).trim())
        } catch {
          continue
        }
        if (event === 'forums') {
          reply.forums = data || []
          scrollToBottom()
        } else if (event === 'delta') {
          gotDelta = true
          reply.content += data.t || ''
          scrollToBottom()
        } else if (event === 'done') {
          ok = true
        } else if (event === 'error') {
          reply.content = reply.content || data.message || '抱歉，我暂时出了点问题。'
          ok = true
        }
      }
    }
    if (!gotDelta && !ok) throw new Error('空响应')
  } catch {
    // 流式失败且尚未收到任何增量 → 回退非流式接口
    if (!gotDelta) {
      try {
        const res: any = await aiApi.chat({
          message: content,
          history: buildRequestMessages().slice(0, -1),
        })
        const data = res.data || res
        reply.content = data.reply
        reply.forums = data.forums || []
        ok = true
      } catch {
        /* 落到统一兜底文案 */
      }
    }
    if (!ok) reply.content = reply.content || '抱歉，我暂时出了点问题，请稍后再试。'
  } finally {
    reply.streaming = false
    loading.value = false
    saveHistory()
    scrollToBottom()
  }
}

function goPost(id: number) {
  open.value = false
  router.push(`/post/${id}`)
}
</script>

<template>
  <template v-if="visible">
    <!-- 悬浮按钮 -->
    <button
      v-if="!open"
      class="fixed bottom-24 right-4 z-40 flex items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/30 transition active:scale-95"
      style="height: 52px; width: 52px"
      @click="toggleOpen"
    >
      <Bot class="h-6 w-6" />
    </button>

    <!-- 聊天面板 -->
    <div
      v-else
      class="fixed inset-x-3 bottom-3 z-50 flex max-h-[75vh] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-zinc-200 sm:inset-x-auto sm:right-4 sm:w-96"
    >
      <!-- 头部 -->
      <div class="flex items-center justify-between bg-emerald-500 px-4 py-3 text-white">
        <div class="flex items-center gap-2">
          <Bot class="h-5 w-5" />
          <span class="text-sm font-semibold">AI 助手</span>
          <span class="rounded-full bg-white/20 px-2 py-0.5 text-[10px]">基于官网内容</span>
        </div>
        <div class="flex items-center gap-1">
          <button
            class="rounded-full p-1 transition hover:bg-white/20"
            :class="confirmClear ? 'bg-white/25' : ''"
            :title="confirmClear ? '再点一次确认清空' : '清空对话'"
            @click="clearChat"
          >
            <Trash2 class="h-4 w-4" />
          </button>
          <button class="rounded-full p-1 transition hover:bg-white/20" @click="open = false">
            <X class="h-5 w-5" />
          </button>
        </div>
      </div>

      <!-- 消息列表 -->
      <div id="ai-chat-list" class="flex-1 space-y-3 overflow-y-auto bg-zinc-50 px-3 py-3">
        <div
          v-for="(msg, i) in messages"
          :key="i"
          class="flex"
          :class="msg.role === 'user' ? 'justify-end' : 'justify-start'"
        >
          <div class="max-w-[85%] space-y-2" :data-msg-idx="i">
            <!-- 完成后按 Markdown 渲染；流式中按纯文本渲染避免半截标签闪烁 -->
            <div
              v-if="msg.role === 'assistant' && !msg.streaming"
              class="ai-md rounded-2xl rounded-bl-sm bg-white px-3 py-2 text-sm leading-relaxed text-zinc-800 ring-1 ring-zinc-200"
              @click="onContentClick"
              v-html="renderMarkdown(msg.content)"
            ></div>
            <div
              v-else
              class="whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm leading-relaxed"
              :class="
                msg.role === 'user'
                  ? 'rounded-br-sm bg-emerald-500 text-white'
                  : 'rounded-bl-sm bg-white text-zinc-800 ring-1 ring-zinc-200'
              "
              >{{ msg.content }}<span v-if="msg.streaming && !msg.content" class="text-zinc-400">…</span></div
            >

            <!-- 论坛相关回答卡片（标注：来自论坛回答） -->
            <div v-if="msg.forums && msg.forums.length" class="space-y-2">
              <div class="flex items-center gap-1 pl-1 text-[11px] text-zinc-400">
                <MessagesSquare class="h-3.5 w-3.5" />
                <span>论坛里的相关讨论</span>
              </div>
              <button
                v-for="forum in msg.forums"
                :key="`${forum.id}-${forum.commentId ?? 'p'}`"
                class="block w-full rounded-xl bg-white p-3 text-left ring-1 ring-zinc-200 transition active:bg-zinc-50"
                @click="goPost(forum.id)"
              >
                <div class="flex items-center gap-2">
                  <span
                    class="rounded-full px-2 py-0.5 text-[10px] font-medium"
                    :class="
                      forum.type === 'comment' ? 'bg-sky-100 text-sky-700' : 'bg-amber-100 text-amber-700'
                    "
                  >
                    来自论坛回答{{ forum.type === 'comment' ? ' · 评论' : '' }}
                  </span>
                  <span class="text-[11px] text-zinc-400">{{ forum.section }}</span>
                </div>
                <p class="mt-1.5 line-clamp-1 text-sm font-medium text-zinc-800">{{ forum.title }}</p>
                <p class="mt-0.5 line-clamp-2 text-xs text-zinc-500">{{ forum.excerpt }}</p>
                <div class="mt-1.5 flex items-center justify-between text-[11px] text-zinc-400">
                  <span>{{ forum.likeCount }} 赞 · {{ forum.commentCount }} 回复</span>
                  <span class="flex items-center text-emerald-600">
                    去查看/回复 <ChevronRight class="h-3.5 w-3.5" />
                  </span>
                </div>
              </button>
            </div>
          </div>
        </div>

        <!-- 推荐问题（仅首轮展示） -->
        <div v-if="messages.length <= 1 && !loading" class="flex flex-wrap gap-2 pt-1">
          <button
            v-for="s in suggestions"
            :key="s"
            class="rounded-full bg-white px-3 py-1.5 text-xs text-emerald-600 ring-1 ring-emerald-200 transition active:bg-emerald-50"
            @click="send(s)"
          >
            {{ s }}
          </button>
        </div>
      </div>

      <!-- 输入区 -->
      <div class="flex items-center gap-2 border-t border-zinc-100 bg-white px-3 py-2.5">
        <input
          v-model="input"
          class="flex-1 rounded-full bg-zinc-100 px-4 py-2 text-sm outline-none placeholder:text-zinc-400"
          placeholder="输入你的问题…"
          maxlength="500"
          :disabled="loading"
          @keydown.enter="send()"
        />
        <button
          class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white transition active:scale-95 disabled:opacity-50"
          :disabled="loading || !input.trim()"
          @click="send()"
        >
          <Loader2 v-if="loading" class="h-4 w-4 animate-spin" />
          <Send v-else class="h-4 w-4" />
        </button>
      </div>
    </div>
  </template>
</template>

<style>
.ai-md p {
  margin: 0.25rem 0;
}
.ai-md p:first-child {
  margin-top: 0;
}
.ai-md p:last-child {
  margin-bottom: 0;
}
.ai-md ul,
.ai-md ol {
  margin: 0.25rem 0;
  padding-left: 1.25rem;
}
.ai-md ul {
  list-style: disc;
}
.ai-md ol {
  list-style: decimal;
}
.ai-md code {
  background: #f4f4f5;
  border-radius: 4px;
  padding: 0.1em 0.35em;
  font-size: 0.85em;
}
.ai-cite {
  color: #059669;
  cursor: pointer;
  font-weight: 600;
}
.ai-cite:hover {
  text-decoration: underline;
}
</style>
