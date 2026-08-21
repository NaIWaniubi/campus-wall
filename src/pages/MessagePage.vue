<script setup lang="ts">
/**
 * 消息通知：Tab切换、列表、标记已读
 */
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft, MessageCircle, Heart, Bell, CheckCheck } from 'lucide-vue-next'
import { messageApi } from '@/utils/api'
import { useAppStore } from '@/stores/app'
import { formatTime } from '@/utils/helpers'
import { toast } from '@/utils/request'
import EmptyState from '@/components/EmptyState.vue'

const router = useRouter()
const appStore = useAppStore()

const tabs = [
  { key: 'all', label: '全部' },
  { key: 'comment', label: '评论' },
  { key: 'like', label: '点赞' },
  { key: 'system', label: '系统通知' },
]
const activeTab = ref('all')
const list = ref<any[]>([])
const loading = ref(true)

function typeMeta(type: string) {
  if (type === 'comment') return { icon: MessageCircle, color: 'text-brand-500', bg: 'bg-brand-50' }
  if (type === 'like') return { icon: Heart, color: 'text-red-500', bg: 'bg-red-50' }
  return { icon: Bell, color: 'text-amber-500', bg: 'bg-amber-50' }
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
  if ((msg.type === 'comment' || msg.type === 'like') && msg.postId) {
    router.push(`/post/${msg.postId}`)
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

onMounted(load)
</script>

<template>
  <div class="min-h-screen bg-zinc-50 pb-6">
    <header class="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-zinc-100">
      <div class="max-w-[960px] mx-auto flex items-center h-14 px-3">
        <button class="p-2 -ml-2 text-zinc-600 hover:text-zinc-900" @click="router.back()">
          <ArrowLeft class="w-5 h-5" />
        </button>
        <span class="ml-1 font-medium text-zinc-900 flex-1">消息</span>
        <button class="flex items-center gap-1 px-2.5 py-1 rounded-full bg-brand-50 text-brand-600 text-xs hover:bg-brand-100 transition"
          @click="readAll">
          <CheckCheck class="w-3.5 h-3.5" /> 全部已读
        </button>
      </div>
      <!-- Tab -->
      <div class="max-w-[960px] mx-auto px-3 flex items-center gap-1 h-11">
        <button v-for="t in tabs" :key="t.key"
          class="relative px-3 py-2 text-sm whitespace-nowrap transition"
          :class="activeTab === t.key ? 'text-brand-600 font-medium' : 'text-zinc-500 hover:text-zinc-800'"
          @click="switchTab(t.key)">
          {{ t.label }}
          <span v-if="activeTab === t.key" class="absolute left-1/2 -translate-x-1/2 bottom-0 w-6 h-0.5 bg-brand-500 rounded-full"></span>
        </button>
      </div>
    </header>

    <main class="max-w-[960px] mx-auto px-4 py-3 space-y-2">
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
            <p class="text-sm text-zinc-800 post-content" :class="!msg.isRead ? 'font-medium' : ''">{{ msg.content }}</p>
            <span class="text-xs text-zinc-400">{{ formatTime(msg.createdAt) }}</span>
          </div>
          <span v-if="!msg.isRead" class="w-2 h-2 rounded-full bg-red-500 mt-1.5 flex-shrink-0"></span>
        </button>

        <EmptyState v-if="!list.length" text="暂无消息" />
      </template>
    </main>
  </div>
</template>
