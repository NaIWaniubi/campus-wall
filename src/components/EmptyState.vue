<script setup lang="ts">
/**
 * 空状态组件（V4：墨线卡 + 荧光贴纸图标 + 描边按钮）
 */
import { Inbox } from '@lucide/vue'

defineProps<{
  text?: string
  actionText?: string
}>()

const emit = defineEmits<{ action: [] }>()
</script>

<template>
  <div class="ds-card ds-card--flat flex flex-col items-center justify-center py-12 px-5 text-center">
    <div
      class="w-16 h-16 rounded-[14px] flex items-center justify-center mb-4"
      style="background: var(--lime); border: 1.5px solid var(--ink); box-shadow: var(--shadow-hard-sm)"
    >
      <Inbox class="w-8 h-8" style="color: var(--ink)" />
    </div>
    <p class="ds-label mb-1.5">NOTHING HERE YET</p>
    <p class="text-[14px] font-semibold mb-5" style="color: var(--ink-soft)">{{ text || '暂无数据' }}</p>
    <button v-if="actionText" class="ds-btn ds-btn--primary" @click="emit('action')">
      {{ actionText }}
    </button>
  </div>
</template>
