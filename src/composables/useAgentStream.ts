/**
 * 校园助手 Agent · SSE 流式请求 composable
 *
 * 状态机：idle → planning（收到 plan 事件）→ running（收到 tool_call）→ answering（收到 answer）→ done
 * 任一阶段出错进入 error（含网络失败 / HTTP 非 2xx / SSE error 事件）。
 * 独立组件配套（AgentTimeline.vue），不与 AiAssistant.vue 耦合（那是 RAG agent 的地盘）。
 */
import { ref, computed } from 'vue'
import { useUserStore } from '@/stores/user'

/** 一次工具调用的时间线条目（与后端 tool_call 事件字段一致） */
export interface AgentToolCall {
  step: number
  tool: string
  args: Record<string, unknown>
  summary: string
  ms: number
}

/** 计划步骤（plan 事件的 steps 元素） */
export interface AgentPlanStep {
  tool: string
  args: Record<string, unknown>
  reason: string
}

export type AgentPhase = 'idle' | 'planning' | 'running' | 'answering' | 'done' | 'error'

export function useAgentStream() {
  const userStore = useUserStore()

  const phase = ref<AgentPhase>('idle')
  const planSteps = ref<AgentPlanStep[]>([])
  /** plan.mode：'llm' | 'rule'（规则模式前端打「规则模式」徽标） */
  const planMode = ref<'llm' | 'rule'>('rule')
  const toolCalls = ref<AgentToolCall[]>([])
  const answer = ref('')
  /** answer.mode：'llm'（模型合成）| 'card'（卡片兜底） */
  const answerMode = ref<'llm' | 'card'>('card')
  const error = ref('')

  const busy = computed(() => phase.value === 'planning' || phase.value === 'running' || phase.value === 'answering')

  function reset() {
    phase.value = 'idle'
    planSteps.value = []
    planMode.value = 'rule'
    toolCalls.value = []
    answer.value = ''
    answerMode.value = 'card'
    error.value = ''
  }

  /**
   * 发起一次 Agent 助手请求并消费 SSE 流。
   * 服务端事件：plan → tool_call×N → answer → end（或 error）。
   */
  async function ask(question: string): Promise<void> {
    reset()
    if (!question.trim()) {
      phase.value = 'error'
      error.value = '请输入问题'
      return
    }
    phase.value = 'planning'

    try {
      const resp = await fetch('/api/agent/assist/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: userStore.token ? `Bearer ${userStore.token}` : '',
        },
        body: JSON.stringify({ question }),
      })
      if (!resp.ok) {
        // 校验类错误（频控/敏感词）返回 JSON {message}
        let msg = `HTTP ${resp.status}`
        try {
          const j: any = await resp.json()
          if (j?.message) msg = j.message
        } catch {
          /* 非 JSON 响应，用默认文案 */
        }
        throw new Error(msg)
      }
      if (!resp.body) throw new Error('响应无内容')

      const reader = resp.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let sawEnd = false

      const handleEvent = (event: string, data: any) => {
        switch (event) {
          case 'plan':
            phase.value = 'planning'
            planMode.value = data?.mode === 'llm' ? 'llm' : 'rule'
            planSteps.value = Array.isArray(data?.steps) ? data.steps : []
            break
          case 'tool_call':
            phase.value = 'running'
            toolCalls.value.push({
              step: Number(data?.step ?? toolCalls.value.length + 1),
              tool: String(data?.tool ?? ''),
              args: (data?.args ?? {}) as Record<string, unknown>,
              summary: String(data?.summary ?? ''),
              ms: Number(data?.ms ?? 0),
            })
            break
          case 'answer':
            phase.value = 'answering'
            answer.value = String(data?.text ?? '')
            answerMode.value = data?.mode === 'llm' ? 'llm' : 'card'
            break
          case 'error':
            error.value = String(data?.message ?? '助手处理失败')
            phase.value = 'error'
            break
          case 'end':
            sawEnd = true
            // error 事件已把 phase 置为 error，此处不覆盖
            if (error.value === '') phase.value = 'done'
            break
        }
      }

      // SSE 解析：按「event: x\ndata: {...}\n\n」分帧（与后端 send() 格式对应）
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const frames = buffer.split('\n\n')
        buffer = frames.pop() || ''
        for (const frame of frames) {
          let event = 'message'
          let data = ''
          for (const line of frame.split('\n')) {
            if (line.startsWith('event:')) event = line.slice(6).trim()
            else if (line.startsWith('data:')) data += line.slice(5).trim()
          }
          if (!data) continue
          try {
            handleEvent(event, JSON.parse(data))
          } catch {
            /* 忽略非 JSON 帧（心跳等） */
          }
        }
      }

      // 流关闭但没收到 end/error：按异常收尾
      if (!sawEnd && error.value === '') {
        phase.value = 'done'
      }
    } catch (err: any) {
      error.value = err?.message || '网络异常，请稍后再试'
      phase.value = 'error'
    }
  }

  return {
    phase,
    busy,
    planSteps,
    planMode,
    toolCalls,
    answer,
    answerMode,
    error,
    ask,
    reset,
  }
}
