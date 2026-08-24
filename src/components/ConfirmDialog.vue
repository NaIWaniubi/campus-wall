<script setup lang="ts">
/**
 * 确认弹窗组件
 */
import { X } from '@lucide/vue'

defineProps<{
  visible: boolean
  title?: string
  content: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
}>()

const emit = defineEmits<{
  confirm: []
  cancel: []
}>()
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in" @click.self="emit('cancel')">
      <div class="absolute inset-0 bg-black/40"></div>
      <div class="relative bg-white rounded-2xl w-full max-w-sm p-6 animate-scale-in">
        <button class="absolute top-3 right-3 text-zinc-400 hover:text-zinc-600" @click="emit('cancel')">
          <X class="w-5 h-5" />
        </button>
        <h3 class="text-lg font-semibold text-zinc-900 mb-2">{{ title || '提示' }}</h3>
        <p class="text-sm text-zinc-600 mb-6">{{ content }}</p>
        <div class="flex gap-3">
          <button
            class="flex-1 py-2.5 rounded-full text-sm font-medium border border-zinc-200 text-zinc-600 hover:bg-zinc-50 transition-colors"
            @click="emit('cancel')"
          >
            {{ cancelText || '取消' }}
          </button>
          <button
            :class="[
              'flex-1 py-2.5 rounded-full text-sm font-medium text-white transition-colors',
              danger ? 'bg-red-500 hover:bg-red-600' : 'bg-brand-500 hover:bg-brand-600'
            ]"
            @click="emit('confirm')"
          >
            {{ confirmText || '确定' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

