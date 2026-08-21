<script setup lang="ts">
/**
 * 空状态组件
 */
import { Inbox } from 'lucide-vue-next'

defineProps<{
  text?: string
  actionText?: string
}>()

const emit = defineEmits<{ action: [] }>()
</script>

<template>
  <div class="flex flex-col items-center justify-center py-16 px-4">
    <div class="w-24 h-24 rounded-full bg-gradient-to-br from-brand-50 to-brand-100 flex items-center justify-center mb-5 shadow-sm">
      <Inbox class="w-12 h-12 text-brand-300" />
    </div>
    <p class="text-zinc-500 text-sm font-medium mb-5">{{ text || '暂无数据' }}</p>
    <button
      v-if="actionText"
      class="px-6 py-2.5 bg-brand-500 text-white rounded-full text-sm font-medium hover:bg-brand-600 active:bg-brand-700 transition-colors shadow-sm shadow-brand-500/25"
      @click="emit('action')"
    >
      {{ actionText }}
    </button>
  </div>
</template>
