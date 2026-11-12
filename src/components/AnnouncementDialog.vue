<script setup lang="ts">
/**
 * 官方公告弹窗：用户必须确认后才可继续浏览
 */
import { ref, onMounted } from 'vue'
import { Megaphone } from '@lucide/vue'
import { announcementApi } from '@/utils/api'
import { formatTime } from '@/utils/helpers'
import { useUserStore } from '@/stores/user'

defineOptions({ inheritAttrs: false })

const userStore = useUserStore()
const visible = ref(false)
const announcement = ref<any>(null)

async function checkAnnouncement() {
  if (!userStore.isLoggedIn) return
  try {
    const res: any = await announcementApi.active()
    if (res.data) {
      announcement.value = res.data
      visible.value = true
    }
  } catch {}
}

async function handleAck() {
  if (!announcement.value) return
  try {
    await announcementApi.ack(announcement.value.id)
  } catch {}
  visible.value = false
}

onMounted(() => {
  // 延迟到首屏渲染完成后再检查，避免阻塞首次交互
  setTimeout(checkAnnouncement, 300)
})
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 animate-fade-in">
      <div
        class="relative w-full max-w-sm overflow-hidden animate-scale-in"
        style="background: var(--card); border: 1.5px solid var(--ink); border-radius: 18px; box-shadow: var(--shadow-hard-lg)"
        role="dialog"
        aria-modal="true"
        aria-labelledby="announcement-title"
      >
        <div class="px-6 pt-6 pb-8 text-center" style="background: var(--ink)">
          <div class="w-14 h-14 mx-auto rounded-full bg-white/20 flex items-center justify-center mb-3">
            <Megaphone class="w-7 h-7 text-white" />
          </div>
          <h3 id="announcement-title" class="text-lg font-bold text-white">官方公告</h3>
        </div>
        <div class="p-6">
          <h4 class="font-extrabold mb-2" style="color: var(--ink)">{{ announcement?.title }}</h4>
          <p class="text-sm text-zinc-600 leading-relaxed whitespace-pre-wrap mb-3">{{ announcement?.content }}</p>
          <p class="text-xs text-zinc-400 mb-4">{{ formatTime(announcement?.createdAt) }}</p>
          <button class="w-full py-3 bg-brand-500 hover:bg-brand-600 text-white rounded-full font-medium transition-colors" @click="handleAck">
            我已知晓
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>


