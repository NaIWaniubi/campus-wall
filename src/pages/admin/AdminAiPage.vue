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
  <div class="max-w-5xl mx-auto space-y-4">
    <!-- 页头（后台已有顶部条，这里只做章节头） -->
    <div class="ds-section-head">
      <span class="ds-section-head__num">AI</span>
      <h1 class="ds-title">AI 设置</h1>
      <span class="ds-section-head__line"></span>
      <p class="text-[12px] shrink-0" style="color: var(--ink-mute)">知识库 · 模型 · 用量</p>
    </div>

    <div v-if="loading" class="space-y-3">
      <div v-for="i in 3" :key="i" class="ds-card ds-card--flat p-4 h-24 skeleton"></div>
    </div>

    <template v-else>
      <!-- 01 调用统计 -->
      <section class="grid grid-cols-2 gap-3">
        <div class="ds-card p-4">
          <p class="ds-label" style="color: var(--ink-mute)">今日提问</p>
          <p class="ds-display ds-num text-[30px] mt-1 leading-none" style="color: var(--ink)">{{ stats.today }}</p>
        </div>
        <div class="ds-card p-4">
          <p class="ds-label" style="color: var(--ink-mute)">累计提问</p>
          <p class="ds-display ds-num text-[30px] mt-1 leading-none" style="color: var(--ink)">{{ stats.total }}</p>
        </div>
      </section>

      <!-- 02 模型设置 -->
      <section class="ds-card p-4 md:p-5">
        <div class="ds-section-head mb-2">
          <span class="ds-section-head__num">01</span>
          <h3 class="ds-title">回答模型</h3>
          <span class="ds-section-head__line"></span>
        </div>
        <p class="text-[12px] mb-3" style="color: var(--ink-mute)">主模型限流或下架时自动回退到其他免费模型</p>
        <div class="flex flex-col sm:flex-row gap-2">
          <select v-model="modelForm.model" aria-label="从预置模型中选择" class="ds-input flex-1 min-w-0 !h-10">
            <option value="">默认（内置免费模型链）</option>
            <option v-for="m in modelForm.presetModels" :key="m" :value="m">{{ m }}</option>
            <option v-if="modelForm.model && !modelForm.presetModels.includes(modelForm.model)" :value="modelForm.model">
              {{ modelForm.model }}（当前自定义）
            </option>
          </select>
          <input v-model="modelForm.model" placeholder="或输入任意模型名" aria-label="自定义模型名" class="ds-input flex-1 min-w-0 !h-10" />
          <button
            type="button"
            class="ds-btn ds-btn--primary !h-10 shrink-0"
            :disabled="savingModel" @click="saveModel">
            <Save class="w-4 h-4" /> {{ savingModel ? '保存中…' : '保存' }}
          </button>
        </div>
      </section>

      <!-- 03 知识库编辑 -->
      <section class="ds-card p-4 md:p-5">
        <div class="ds-section-head mb-2">
          <span class="ds-section-head__num">02</span>
          <h3 class="ds-title">官网内容知识库</h3>
          <span class="ds-section-head__line"></span>
          <span v-if="kbDirty" class="ds-tag shrink-0" style="color: var(--coral); border-color: var(--coral)">未保存的修改</span>
        </div>
        <p class="text-[12px] mb-3" style="color: var(--ink-mute)">AI 助手仅依据此内容回答平台类问题（Markdown 格式，上限 64KB），保存后立即生效</p>
        <textarea v-model="knowledge" rows="16" spellcheck="false" aria-label="知识库内容"
          class="ds-input font-mono !text-[12.5px] resize-y"
          @input="kbDirty = true"></textarea>
        <div class="flex items-center justify-between mt-3">
          <span class="text-[11.5px] ds-num" style="color: var(--ink-mute)">{{ knowledge.length }} 字符</span>
          <div class="flex gap-2">
            <button
              type="button"
              class="ds-btn !py-2"
              :disabled="loading || !kbDirty" @click="load">
              <RotateCcw class="w-4 h-4" /> 撤销修改
            </button>
            <button
              type="button"
              class="ds-btn ds-btn--primary !py-2"
              :disabled="savingKb || !kbDirty" @click="saveKnowledge">
              <Save class="w-4 h-4" /> {{ savingKb ? '保存中…' : '保存知识库' }}
            </button>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>
