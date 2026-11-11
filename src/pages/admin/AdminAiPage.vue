<script setup lang="ts">
/**
 * AI 设置：官网知识库在线编辑、模型切换、调用量统计
 */
import { ref, reactive, onMounted } from 'vue'
import { Save, RotateCcw } from '@lucide/vue'
import { adminAiApi } from '@/utils/api'
import { toast } from '@/utils/request'

const loading = ref(true)
const savingKb = ref(false)
const savingModel = ref(false)

const knowledge = ref('')
const kbDirty = ref(false)
const stats = ref({ today: 0, total: 0 })

const modelForm = reactive({
  model: '',
  presetModels: [] as string[],
})

async function load() {
  loading.value = true
  try {
    const [kbRes, settingRes, statsRes] = await Promise.all([
      adminAiApi.getKnowledge(),
      adminAiApi.getSettings(),
      adminAiApi.stats(),
    ])
    const kb: any = kbRes.data || kbRes
    const st: any = settingRes.data || settingRes
    const sp: any = statsRes.data || statsRes
    knowledge.value = kb.content || ''
    kbDirty.value = false
    modelForm.model = st.model || ''
    modelForm.presetModels = st.presetModels || []
    stats.value = { today: sp.today ?? 0, total: sp.total ?? 0 }
  } catch {
    // 错误已由拦截器 toast
  } finally {
    loading.value = false
  }
}

async function saveKnowledge() {
  if (!knowledge.value.trim()) {
    toast.error('知识库内容不能为空')
    return
  }
  savingKb.value = true
  try {
    await adminAiApi.saveKnowledge(knowledge.value)
    kbDirty.value = false
    toast.success('知识库已保存，立即生效')
  } catch {
  } finally {
    savingKb.value = false
  }
}

async function saveModel() {
  savingModel.value = true
  try {
    const res: any = await adminAiApi.saveSettings(modelForm.model.trim())
    const data = res.data || res
    modelForm.model = data.model || ''
    toast.success(res.message || data?.message || '已保存')
  } catch {
  } finally {
    savingModel.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="max-w-5xl mx-auto p-4 lg:p-6 space-y-4">
        <!-- 页头 -->
        <div>
          <h1 class="text-xl lg:text-2xl font-bold text-zinc-900">AI 设置</h1>
          <p class="text-sm text-zinc-500 mt-1">AI 助手的知识库、模型与用量管理</p>
        </div>

        <div v-if="loading" class="space-y-2">
          <div v-for="i in 3" :key="i" class="bg-white rounded-xl p-4 h-24 skeleton"></div>
        </div>

        <template v-else>
          <!-- 调用统计 -->
          <div class="grid grid-cols-2 gap-3">
            <div class="bg-white rounded-xl p-4 shadow-sm">
              <p class="text-xs text-zinc-500">今日提问</p>
              <p class="text-2xl font-bold text-zinc-900 mt-1">{{ stats.today }}</p>
            </div>
            <div class="bg-white rounded-xl p-4 shadow-sm">
              <p class="text-xs text-zinc-500">累计提问</p>
              <p class="text-2xl font-bold text-zinc-900 mt-1">{{ stats.total }}</p>
            </div>
          </div>

          <!-- 模型设置 -->
          <div class="bg-white rounded-xl p-4 shadow-sm">
            <h3 class="font-medium text-zinc-900 mb-1">回答模型</h3>
            <p class="text-xs text-zinc-500 mb-3">主模型限流或下架时自动回退到其他免费模型</p>
            <div class="flex flex-col sm:flex-row gap-2">
              <select v-model="modelForm.model"
                class="flex-1 h-10 px-3 rounded-lg border border-zinc-200 focus:border-brand-500 focus:outline-none text-sm bg-white">
                <option value="">默认（内置免费模型链）</option>
                <option v-for="m in modelForm.presetModels" :key="m" :value="m">{{ m }}</option>
                <option v-if="modelForm.model && !modelForm.presetModels.includes(modelForm.model)" :value="modelForm.model">
                  {{ modelForm.model }}（当前自定义）
                </option>
              </select>
              <input v-model="modelForm.model" placeholder="或输入任意 OpenRouter 模型名"
                class="flex-1 h-10 px-3 rounded-lg border border-zinc-200 focus:border-brand-500 focus:outline-none text-sm" />
              <button
                class="h-10 px-4 rounded-full bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium flex items-center justify-center gap-1.5 disabled:opacity-50 flex-shrink-0"
                :disabled="savingModel" @click="saveModel">
                <Save class="w-4 h-4" /> {{ savingModel ? '保存中…' : '保存' }}
              </button>
            </div>
          </div>

          <!-- 知识库编辑 -->
          <div class="bg-white rounded-xl p-4 shadow-sm">
            <div class="flex items-center justify-between mb-1">
              <h3 class="font-medium text-zinc-900">官网内容知识库</h3>
              <span v-if="kbDirty" class="text-xs text-amber-600">未保存的修改</span>
            </div>
            <p class="text-xs text-zinc-500 mb-3">AI 助手仅依据此内容回答平台类问题（Markdown 格式，上限 64KB），保存后立即生效</p>
            <textarea v-model="knowledge" rows="16" spellcheck="false"
              class="w-full px-3 py-2 rounded-lg border border-zinc-200 focus:border-brand-500 focus:outline-none text-sm font-mono resize-y"
              @input="kbDirty = true"></textarea>
            <div class="flex items-center justify-between mt-3">
              <span class="text-xs text-zinc-400">{{ knowledge.length }} 字符</span>
              <div class="flex gap-2">
                <button
                  class="px-4 py-2 rounded-full text-sm border border-zinc-200 text-zinc-600 flex items-center gap-1.5 disabled:opacity-50"
                  :disabled="loading || !kbDirty" @click="load">
                  <RotateCcw class="w-4 h-4" /> 撤销修改
                </button>
                <button
                  class="px-4 py-2 rounded-full text-sm bg-brand-500 hover:bg-brand-600 text-white font-medium flex items-center gap-1.5 disabled:opacity-50"
                  :disabled="savingKb || !kbDirty" @click="saveKnowledge">
                  <Save class="w-4 h-4" /> {{ savingKb ? '保存中…' : '保存知识库' }}
                </button>
              </div>
            </div>
          </div>
        </template>
  </div>
</template>
