<script setup lang="ts">
/**
 * AI 助手悬浮组件：基于官网内容答疑 + 论坛相关讨论推荐
 * 支持流式输出（SSE）、本地历史、Markdown 渲染、论坛引用角标
 */
import { ref, reactive, nextTick, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Bot, X, Send, Loader2, MessagesSquare, ChevronRight, Trash2 } from '@lucide/vue'
import { aiApi, type AiForumItem } from '@/utils/api'
import { toast } from '@/utils/request'
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
 if (open.value) {
 void ensureMarkdown()
 scrollToBottom()
 }
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
// marked/dompurify 懒加载：助手不打开就不求值这两个库（Lighthouse 启动期 TBT 大头）。
// 加载完成前 v-html 走纯文本兜底，mdReady 触发重渲染。
let markedMod: typeof import('marked') | null = null
let purifyMod: typeof import('dompurify') | null = null
const mdReady = ref(false)

async function ensureMarkdown(): Promise<void> {
 if (markedMod && purifyMod) return
 const [m, d] = await Promise.all([import('marked'), import('dompurify')])
 m.marked.setOptions({ breaks: true, gfm: true })
 markedMod = m
 purifyMod = d
 mdReady.value = true
}

function escapeHtml(s: string): string {
 return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function renderMarkdown(content: string): string {
 void mdReady.value // 建立响应式依赖：懒加载完成后重渲染
 if (!markedMod || !purifyMod) return escapeHtml(content)
 const html = markedMod.marked.parse(content, { async: false }) as string
 let safe = purifyMod.default.sanitize(html)
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
 await ensureMarkdown()
 input.value = ''
 confirmClear.value = false

 messages.value.push({ role: 'user', content })
 const reply = reactive({ role: 'assistant', content: '', streaming: true, forums: [] }) as ChatMessage
 messages.value.push(reply)
 loading.value = true
 scrollToBottom()

 let gotDelta = false
 let ok = false
 let httpStatus = 0
 let networkFail = false
 try {
 const resp = await fetch('/api/ai/chat/stream', {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 Authorization: userStore.token ? `Bearer ${userStore.token}` : '',
 },
 body: JSON.stringify({ message: content, history: buildRequestMessages().slice(0, -1) }),
 })
 httpStatus = resp.status
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
 // 未收到任何 HTTP 响应 = 网络层失败（fetch 直接 reject）
 networkFail = httpStatus === 0
 // 401/403：token 过期或无权限——与 axios 拦截器同款处理（登出 + 带 redirect 回登录页），不回退非流式
 if (httpStatus === 401 || httpStatus === 403) {
 if (httpStatus === 401) {
 userStore.logout()
 toast.error('登录已过期，请重新登录')
 router.push({ path: '/login', query: { redirect: route.fullPath } })
 } else {
 toast.error('无权使用 AI 助手')
 }
 reply.content = httpStatus === 401 ? '登录已过期，请重新登录后再来继续对话～' : '当前账号无权使用 AI 助手。'
 return
 }
 // 流式失败且尚未收到任何增量 → 回退非流式接口（401/403 已在上面处理，axios 层错误亦有 toast）
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
 if (!ok) {
 // 区分网络错 / 服务端错，给出可行动的文案
 if (networkFail) reply.content = reply.content || '网络异常，请检查网络连接后再试。'
 else if (httpStatus >= 500) reply.content = reply.content || 'AI 服务暂时不可用，请稍后再试。'
 else reply.content = reply.content || '抱歉，我暂时出了点问题，请稍后再试。'
 }
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
 class="sa-fab fixed right-4 z-40 flex items-center justify-center transition active:scale-95"
 style="height: 52px; width: 52px"
 @click="toggleOpen"
 >
 <Bot class="h-6 w-6" />
 </button>

 <!-- 聊天面板 -->
 <div
 v-else
 class="fixed inset-x-3 bottom-3 z-50 flex max-h-[75vh] flex-col overflow-hidden md:inset-x-auto md:right-4 md:w-96"
 style="background: var(--card); border: 1.5px solid var(--ink); border-radius: 18px; box-shadow: var(--shadow-hard-lg)"
 >
 <!-- 头部 -->
 <div class="ds-poster flex items-center justify-between px-4 py-3">
 <div class="flex items-center gap-2">
 <Bot class="h-5 w-5" />
 <span class="text-sm font-semibold">AI 助手</span>
 <span class="ds-label on-poster-accent">官网知识库</span>
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
 <div id="ai-chat-list" class="flex-1 space-y-3 overflow-y-auto px-3 py-3" style="background: var(--paper)">
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
 class="ai-md rounded-[14px] px-3 py-2 text-[13.5px] leading-relaxed"
 style="background: var(--card); color: var(--ink); border: 1.5px solid var(--ink); box-shadow: var(--shadow-hard-sm)"
 @click="onContentClick"
 v-html="renderMarkdown(msg.content)"
 ></div>
 <div
 v-else
 class="whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm leading-relaxed"
 :class="
 msg.role === 'user'
 ? 'rounded-br-sm ds-bubble-user'
 : 'rounded-bl-sm ds-bubble-ai'
 "
 >{{ msg.content }}<span v-if="msg.streaming && !msg.content" style="color: var(--ink-mute)">…</span></div
 >

 <!-- 论坛相关回答卡片（标注：来自论坛回答） -->
 <div v-if="msg.forums && msg.forums.length" class="space-y-2">
 <div class="flex items-center gap-1 pl-1 text-[11px]" style="color: var(--ink-mute)">
 <MessagesSquare class="h-3.5 w-3.5" />
 <span>论坛里的相关讨论</span>
 </div>
 <button
 v-for="forum in msg.forums"
 :key="`${forum.id}-${forum.commentId ?? 'p'}`"
 class="block w-full p-3 text-left transition active:translate-x-[1px] active:translate-y-[1px]"
 style="background: var(--card); border: 1.5px solid var(--ink); border-radius: 12px; box-shadow: 2px 2px 0 var(--ink)"
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
 <span class="text-[11px]" style="color: var(--ink-mute)">{{ forum.section }}</span>
 </div>
 <p class="mt-1.5 line-clamp-1 text-sm font-medium" style="color: var(--ink)">{{ forum.title }}</p>
 <p class="mt-0.5 line-clamp-2 text-xs" style="color: var(--ink-mute)">{{ forum.excerpt }}</p>
 <div class="mt-1.5 flex items-center justify-between text-[11px]" style="color: var(--ink-mute)">
 <span>{{ forum.likeCount }} 赞 · {{ forum.commentCount }} 回复</span>
 <span class="flex items-center" style="color: var(--violet)">
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
 class="ds-chip !text-[11.5px] !py-1.5"
 @click="send(s)"
 >
 {{ s }}
 </button>
 </div>
 </div>

 <!-- 输入区 -->
 <div class="flex items-center gap-2 px-3 py-2.5" style="border-top: 1.5px solid var(--ink); background: var(--card)">
 <input
 v-model="input"
 class="ds-input !rounded-full !py-2 !text-[13px]"
 placeholder="输入你的问题…"
 maxlength="500"
 :disabled="loading"
 @keydown.enter="send()"
 />
 <button
 class="ds-ink-btn flex h-9 w-9 shrink-0 items-center justify-center transition active:translate-y-[1px] disabled:opacity-50"
 style="border-radius: 12px"
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
