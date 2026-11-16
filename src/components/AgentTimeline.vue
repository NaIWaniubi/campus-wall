<script setup lang="ts">
/**
 * 校园助手 Agent · 时间线 UI
 * 展示：规划步骤 → 工具执行卡片（工具名 + 参数 + 耗时 + 结果摘要）→ 结论回答。
 * planMode === 'rule' 时打「规则模式」徽标（LLM 降级或离线兜底的自主决策路径）。
 * 独立组件，由父级传入 useAgentStream 的状态，不接入 AiAssistant.vue。
 */
import { computed } from 'vue'
import type { AgentPlanStep, AgentToolCall, AgentPhase } from '@/composables/useAgentStream'

const props = defineProps<{
  phase: AgentPhase
  planSteps: AgentPlanStep[]
  planMode: 'llm' | 'rule'
  toolCalls: AgentToolCall[]
  answer: string
  answerMode: 'llm' | 'card'
  error: string
}>()

/** 阶段 → 中文标签 */
const phaseLabel = computed(() => {
  switch (props.phase) {
    case 'idle': return '待提问'
    case 'planning': return '正在规划…'
    case 'running': return '正在调用工具…'
    case 'answering': return '正在整理回答…'
    case 'done': return '已完成'
    case 'error': return '出错了'
    default: return ''
  }
})

/** 计划步骤是否已执行（对照 toolCalls 的 step 序号） */
const isStepDone = (idx: number) => props.toolCalls.some((t) => t.step === idx + 1)

/** 工具名 → 展示名（中文别名，时间线更友好） */
function toolLabel(tool: string): string {
  const map: Record<string, string> = {
    searchPosts: '帖子检索',
    queryPost: '帖子详情',
    getCampusStats: '校园动态统计',
    matchLostFound: '失物招领匹配',
  }
  return map[tool] || tool
}

/** 参数 → 短摘要（避免长 JSON 撑爆卡片） */
function argsPreview(args: Record<string, unknown>): string {
  try {
    const s = JSON.stringify(args)
    return s.length > 60 ? `${s.slice(0, 59)}…` : s
  } catch {
    return ''
  }
}
</script>

<template>
  <div class="agent-timeline space-y-3 text-sm">
    <!-- 状态徽标行 -->
    <div class="flex items-center gap-2">
      <span
        class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
        :class="phase === 'error' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'"
      >
        {{ phaseLabel }}
      </span>
      <span
        v-if="planMode === 'rule' && planSteps.length"
        class="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700"
        title="LLM 不可用，按关键词规则自动规划"
      >
        规则模式
      </span>
    </div>

    <!-- 错误提示 -->
    <div v-if="phase === 'error' && error" class="rounded-lg bg-red-50 px-3 py-2 text-red-600">
      {{ error }}
    </div>

    <!-- 时间线主体 -->
    <ol v-if="planSteps.length" class="relative ml-3 space-y-3 border-l-2 border-gray-200 pl-4">
      <!-- 计划步骤节点 -->
      <li v-for="(step, idx) in planSteps" :key="`plan-${idx}`" class="relative">
        <span
          class="absolute -left-[21px] top-1 flex h-4 w-4 items-center justify-center rounded-full border-2 text-[10px] font-bold"
          :class="isStepDone(idx) ? 'border-blue-500 bg-blue-500 text-white' : 'border-gray-300 bg-white text-gray-400'"
        >
          {{ idx + 1 }}
        </span>
        <div class="leading-relaxed">
          <span class="font-medium text-gray-800">{{ toolLabel(step.tool) }}</span>
          <span class="ml-1 text-xs text-gray-500">{{ step.reason }}</span>
        </div>

        <!-- 对应的工具执行卡片 -->
        <div
          v-for="call in toolCalls.filter((t) => t.step === idx + 1)"
          :key="`call-${call.step}`"
          class="mt-1.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2"
        >
          <div class="flex items-center justify-between gap-2">
            <span class="text-xs font-medium text-gray-700">
              <span class="mr-1">🔧</span>{{ toolLabel(call.tool) }}
              <code class="ml-1 rounded bg-gray-200 px-1 text-[10px] text-gray-600">{{ call.tool }}</code>
            </span>
            <span class="shrink-0 text-xs text-gray-400">{{ call.ms }}ms</span>
          </div>
          <div class="mt-1 truncate text-xs text-gray-500" :title="argsPreview(call.args)">
            参数: <code>{{ argsPreview(call.args) }}</code>
          </div>
          <div class="mt-1 text-xs leading-relaxed text-gray-600">{{ call.summary }}</div>
        </div>
      </li>
    </ol>

    <!-- 结论回答 -->
    <div
      v-if="answer"
      class="rounded-lg px-3 py-2 leading-relaxed"
      :class="answerMode === 'llm' ? 'bg-blue-50 text-gray-800' : 'bg-gray-100 text-gray-700 whitespace-pre-line'"
    >
      <div class="mb-1 text-xs font-medium" :class="answerMode === 'llm' ? 'text-blue-600' : 'text-gray-500'">
        {{ answerMode === 'llm' ? 'AI 结论' : '站内检索结果' }}
      </div>
      {{ answer }}
    </div>
  </div>
</template>
