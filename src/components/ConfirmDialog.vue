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
import { nextTick, onUnmounted, ref, watch } from 'vue'

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

// 打开状态下组件被卸载（如路由跳转强制关闭）时移除监听，
// 否则 keydown 泄漏在 document 上，Esc 会对已销毁实例 emit('cancel')
onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
      @click.self="emit('cancel')"
    >
      <div class="absolute inset-0 bg-black/50" aria-hidden="true"></div>
      <div
        class="relative w-full max-w-sm ds-card p-6 animate-scale-in"
        style="box-shadow: var(--shadow-hard-lg)"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-desc"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="flex items-center gap-2.5 min-w-0">
            <span
              aria-hidden="true"
              class="shrink-0 w-2.5 h-2.5 rounded-full"
              :style="{
                background: danger ? 'var(--coral)' : 'var(--lime)',
                border: '1.5px solid var(--ink)'
              }"
            ></span>
            <h3
              id="confirm-dialog-title"
              class="ds-title truncate"
              style="color: var(--ink)"
            >{{ title || '提示' }}</h3>
          </div>
          <button
            type="button"
            class="ds-icon-btn shrink-0 -mt-1 -mr-1"
            aria-label="关闭确认弹窗"
            @click="emit('cancel')"
          >
            <X class="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <div class="ds-hairline my-4"></div>

        <p
          id="confirm-dialog-desc"
          class="text-[13.5px] leading-relaxed"
          :style="
            danger
              ? 'color: var(--ink-soft); border-left: 3px solid var(--coral); padding-left: 10px'
              : 'color: var(--ink-soft)'
          "
        >{{ content }}</p>

        <div class="flex gap-3 mt-6">
          <button type="button" class="ds-btn flex-1" @click="emit('cancel')">
            {{ cancelText || '取消' }}
          </button>
          <button
            ref="confirmBtnRef"
            type="button"
            :class="['ds-btn flex-1', danger ? 'ds-btn--danger' : 'ds-btn--primary']"
            @click="emit('confirm')"
          >
            {{ confirmText || '确定' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
