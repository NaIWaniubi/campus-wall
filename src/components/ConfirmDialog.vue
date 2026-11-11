<script setup lang="ts">
/**
 * 确认弹窗组件
 *
 * 可访问性：
 * - role="dialog" + aria-modal + aria-labelledby/aria-describedby
 * - Esc 关闭；打开时焦点移到确认按钮，关闭后归还触发元素
 * - 关闭按钮有可访问名称
 */
import { X } from '@lucide/vue'
import { nextTick, ref, watch } from 'vue'

const props = defineProps<{
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

const confirmBtnRef = ref<HTMLButtonElement | null>(null)
let lastActive: HTMLElement | null = null

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.stopPropagation()
    emit('cancel')
  }
}

watch(
  () => props.visible,
  async (v) => {
    if (v) {
      lastActive = document.activeElement as HTMLElement | null
      document.addEventListener('keydown', onKeydown)
      await nextTick()
      confirmBtnRef.value?.focus()
    } else {
      document.removeEventListener('keydown', onKeydown)
      lastActive?.focus?.()
      lastActive = null
    }
  }
)
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
      @click.self="emit('cancel')"
    >
      <div class="absolute inset-0 bg-black/40"></div>
      <div
        class="relative bg-white rounded-2xl w-full max-w-sm p-6 animate-scale-in"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-desc"
      >
        <button
          class="absolute top-3 right-3 text-zinc-400 hover:text-zinc-600"
          aria-label="关闭"
          @click="emit('cancel')"
        >
          <X class="w-5 h-5" />
        </button>
        <h3 id="confirm-dialog-title" class="text-lg font-semibold text-zinc-900 mb-2">{{ title || '提示' }}</h3>
        <p id="confirm-dialog-desc" class="text-sm text-zinc-600 mb-6">{{ content }}</p>
        <div class="flex gap-3">
          <button
            class="flex-1 py-2.5 rounded-full text-sm font-medium border border-zinc-200 text-zinc-600 hover:bg-zinc-50 transition-colors"
            @click="emit('cancel')"
          >
            {{ cancelText || '取消' }}
          </button>
          <button
            ref="confirmBtnRef"
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
