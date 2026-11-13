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
    <div v-if="visible" class="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fade-in">
      <div class="absolute inset-0 bg-black/50" aria-hidden="true"></div>
      <div
        class="relative w-full max-w-sm ds-card overflow-hidden animate-scale-in"
        style="box-shadow: var(--shadow-hard-lg)"
        role="dialog"
        aria-modal="true"
        aria-labelledby="announcement-title"
      >
        <div class="px-5 pt-6 pb-7 text-center" style="background: var(--ink); color: var(--paper)">
          <span class="ds-sticker ds-sticker--coral">NOTICE</span>
          <div
            class="w-14 h-14 mx-auto mt-4 mb-3 rounded-[14px] flex items-center justify-center"
            style="background: var(--lime); border: 1.5px solid var(--ink); box-shadow: var(--shadow-hard-sm); color: var(--ink)"
          >
            <Megaphone class="w-7 h-7" aria-hidden="true" />
          </div>
          <h3 id="announcement-title" class="ds-display text-[20px]" style="color: var(--paper)">官方公告</h3>
        </div>
        <div class="p-5">
          <h4 class="ds-title mb-2" style="color: var(--ink)">{{ announcement?.title }}</h4>
          <p class="text-[13.5px] leading-relaxed whitespace-pre-wrap mb-3" style="color: var(--ink-soft)">{{ announcement?.content }}</p>
          <div class="ds-hairline mb-3"></div>
          <p class="ds-label mb-4">{{ formatTime(announcement?.createdAt) }}</p>
          <button type="button" class="ds-btn ds-btn--primary w-full !py-3" @click="handleAck">
            我已知晓
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
