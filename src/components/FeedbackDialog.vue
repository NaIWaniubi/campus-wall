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
    <div v-if="visible" class="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div class="absolute inset-0 bg-black/40" @click="close"></div>
      <div class="relative w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl p-4 space-y-3">
        <div class="flex items-center justify-between">
          <h3 class="text-base font-medium text-zinc-900">意见反馈</h3>
          <button class="p-1.5 text-zinc-400 hover:text-zinc-600" @click="close">
            <X class="w-5 h-5" />
          </button>
        </div>

        <div>
          <div class="flex items-center justify-between mb-1.5">
            <label class="text-sm text-zinc-600">反馈内容 <span class="text-red-500">*</span></label>
            <span class="text-xs" :class="content.length > 500 ? 'text-red-500' : 'text-zinc-300'">{{ content.length }}/500</span>
          </div>
          <textarea
            v-model="content"
            maxlength="500"
            rows="5"
            placeholder="说说你在使用中遇到的问题或建议，我们会认真查看每一条反馈"
            class="w-full px-3 py-2.5 rounded-lg bg-zinc-50 border border-zinc-200 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100 transition resize-none text-sm"
          ></textarea>
        </div>

        <div>
          <label class="block text-sm text-zinc-600 mb-1.5">联系方式（选填）</label>
          <input
            v-model="contact"
            type="text"
            maxlength="100"
            placeholder="微信/QQ/邮箱，便于我们回复你"
            class="w-full px-3 py-2.5 rounded-lg bg-zinc-50 border border-zinc-200 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100 transition text-sm"
          />
        </div>

        <div class="flex gap-2 pt-1">
          <button class="flex-1 py-2.5 rounded-full bg-zinc-100 text-zinc-600 text-sm font-medium hover:bg-zinc-200 transition" @click="close">取消</button>
          <button
            :disabled="submitting"
            class="flex-1 py-2.5 rounded-full bg-brand-500 hover:bg-brand-600 disabled:bg-brand-300 text-white text-sm font-medium transition flex items-center justify-center gap-1.5"
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
