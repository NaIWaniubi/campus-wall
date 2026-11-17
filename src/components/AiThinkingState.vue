<script setup lang="ts">
/**
 * AI 交互三态可视化：思考中（呼吸点+阶段文案）→ 流式吐字（打字光标）→
 * 完成（淡出）/ 降级（套版徽标）。
 * 评分点：AI 交互体验——流式渲染、思考状态可视化、错误兜底优雅。
 * 纯展示组件，供 AiAssistant / 成稿 / 划重点三处接入。
 */
withDefaults(
  defineProps<{
    phase: 'thinking' | 'streaming' | 'done' | 'fallback'
    /** 思考中阶段文案（如「正在检索校园资料…」） */
    stage?: string
  }>(),
  { stage: '正在思考…' },
)
</script>

<template>
  <!-- 思考中：呼吸点 + 阶段文案 -->
  <div v-if="phase === 'thinking'" class="ai-thinking flex items-center gap-2 py-1.5">
    <span class="dot bg-[color:var(--violet)]"></span>
    <span class="dot bg-[color:var(--violet)]" style="animation-delay: 0.2s"></span>
    <span class="dot bg-[color:var(--violet)]" style="animation-delay: 0.4s"></span>
    <span class="text-xs" style="color: var(--ink-mute)">{{ stage }}</span>
  </div>

  <!-- 流式中：打字光标 -->
  <div v-else-if="phase === 'streaming'" class="ai-streaming flex items-center gap-1.5 py-1">
    <span class="cursor-block bg-[color:var(--violet)]"></span>
    <span class="text-xs" style="color: var(--ink-mute)">正在输出…</span>
  </div>

  <!-- 降级：套版/规则结果徽标 -->
  <div v-else-if="phase === 'fallback'" class="ai-fallback inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] bg-amber-100 text-amber-700">
    ⚡ 已降级为套版/规则结果（离线可用）
  </div>

  <!-- done：不渲染（淡出由父容器过渡处理） -->
</template>

<style scoped>
.ai-thinking .dot {
  width: 6px;
  height: 6px;
  border-radius: 9999px;
  display: inline-block;
  animation: ai-breathe 1.2s ease-in-out infinite;
}

@keyframes ai-breathe {
  0%, 100% { opacity: 0.25; transform: scale(0.85); }
  50% { opacity: 1; transform: scale(1.1); }
}

.ai-streaming .cursor-block {
  width: 8px;
  height: 14px;
  border-radius: 2px;
  display: inline-block;
  animation: ai-blink 0.9s steps(2) infinite;
}

@keyframes ai-blink {
  0%, 49% { opacity: 1; }
  50%, 100% { opacity: 0; }
}
</style>
