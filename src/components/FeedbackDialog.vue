<script setup lang="ts">
/**
 * 意见反馈对话框：content 必填（≤500字），contact 选填
 */
import { ref, watch } from 'vue'
import { X, Loader2 } from '@lucide/vue'
import { feedbackApi } from '@/utils/api'
import { toast } from '@/utils/request'

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{ (e: 'update:visible', v: boolean): void; (e: 'success'): void }>()

const content = ref('')
const contact = ref('')
const submitting = ref(false)

watch(() => props.visible, (v) => {
  if (v) {
    content.value = ''
    contact.value = ''
  }
})

function close() {
  emit('update:visible', false)
}

async function submit() {
  const c = content.value.trim()
  if (!c) {
    toast.error('请填写反馈内容')
    return
  }
  if (c.length > 500) {
    toast.error('反馈内容最多500字')
    return
  }
  if (contact.value.trim().length > 100) {
    toast.error('联系方式最多100字')
    return
  }
  submitting.value = true
  try {
    await feedbackApi.submit({ content: c, contact: contact.value.trim() || undefined })
    toast.success('反馈已提交，感谢你的建议')
    close()
    emit('success')
  } catch {
    // 错误已由拦截器 toast
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 sm:p-4">
      <div class="absolute inset-0 bg-black/50" aria-hidden="true" @click="close"></div>
      <div
        class="relative w-full sm:max-w-md max-h-[92vh] overflow-y-auto ds-card p-4 sm:p-5 space-y-4 animate-scale-in"
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-dialog-title"
      >
        <div class="flex items-center justify-between gap-3">
          <div class="flex items-center gap-2.5 min-w-0">
            <span class="ds-sticker ds-sticker--sky shrink-0">FEEDBACK</span>
            <h3 id="feedback-dialog-title" class="ds-title truncate" style="color: var(--ink)">意见反馈</h3>
          </div>
          <button type="button" class="ds-icon-btn shrink-0" aria-label="关闭反馈弹窗" @click="close">
            <X class="w-5 h-5" />
          </button>
        </div>

        <div class="ds-hairline"></div>

        <div>
          <div class="flex items-baseline justify-between mb-1.5">
            <label for="feedback-content" class="ds-label">
              反馈内容 <span aria-hidden="true" style="color: var(--coral)">*</span>
            </label>
            <span
              class="ds-num text-[11px] font-bold"
              :style="{ color: content.length > 500 ? 'var(--coral)' : 'var(--ink-mute)' }"
            >{{ content.length }}/500</span>
          </div>
          <textarea
            id="feedback-content"
            v-model="content"
            maxlength="500"
            rows="5"
            placeholder="说说你在使用中遇到的问题或建议，我们会认真查看每一条反馈"
            class="ds-input resize-none leading-relaxed"
          ></textarea>
        </div>

        <div>
          <label for="feedback-contact" class="ds-label block mb-1.5">联系方式（选填）</label>
          <input
            id="feedback-contact"
            v-model="contact"
            type="text"
            maxlength="100"
            placeholder="微信/QQ/邮箱，便于我们回复你"
            class="ds-input"
          />
        </div>

        <div class="flex gap-2.5 pt-1">
          <button type="button" class="ds-btn flex-1" @click="close">取消</button>
          <button
            type="button"
            :disabled="submitting"
            class="ds-btn ds-btn--primary flex-1"
            @click="submit"
          >
            <Loader2 v-if="submitting" class="w-4 h-4 animate-spin" />
            {{ submitting ? '提交中...' : '提交反馈' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
