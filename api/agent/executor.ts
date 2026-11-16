/**
 * 校园助手 Agent · 执行器（executor）
 *
 * 执行 planner 给出的计划：逐步调用工具，每步 try/catch（工具错误记录后继续下一步），
 * 产出 trace（时间线证据）与 evidence（供 compose 合成回答）。
 * 总工具轮数 ≤ 4 防失控（防 LLM 计划过长 / 工具卡顿叠爆预算）。
 */
import { runTool } from './tools.js';
import type { AgentPlan, PlanStep } from './planner.js';

/** 总工具轮数上限：与计划步数上限同值，executor 侧再钳一次防越界 */
export const MAX_TOOL_ROUNDS = 4;

/** 单条时间线记录：前端 AgentTimeline 直接渲染 */
export interface TraceEntry {
  step: number;          // 序号（1 起）
  tool: string;          // 工具名
  args: Record<string, unknown>;
  /** 结果摘要：序列化为 ≤200 字符，供 SSE tool_call 事件与 evidence 复用 */
  resultSummary: string;
  /** 本步耗时 ms */
  ms: number;
}

/** 合成阶段用的证据条目 */
export interface EvidenceEntry {
  tool: string;
  summary: string;
  /** 原始结果（LLM 合成时整体喂给模型） */
  data: unknown;
}

export interface ExecutionResult {
  trace: TraceEntry[];
  evidence: EvidenceEntry[];
  /** 执行了计划中的几步（被轮数上限截断时 < steps.length） */
  executed: number;
  /** 是否因轮数上限截断 */
  truncated: boolean;
}

/** 任意值 → ≤200 字摘要：对象 JSON 压缩、数组取条数+首条、字符串直接截断 */
export function summarizeResult(value: unknown, maxLen = 200): string {
  let text: string;
  if (value === null || value === undefined) {
    text = '（无结果）';
  } else if (typeof value === 'string') {
    text = value;
  } else if (Array.isArray(value)) {
    if (value.length === 0) {
      text = '（空列表，无匹配结果）';
    } else {
      const first = JSON.stringify(value[0]);
      text = `共 ${value.length} 条，首条: ${first}`;
    }
  } else {
    try {
      text = JSON.stringify(value);
    } catch {
      text = String(value);
    }
  }
  text = text.replace(/\s+/g, ' ').trim();
  return text.length > maxLen ? `${text.slice(0, maxLen - 1)}…` : text;
}

/**
 * 执行计划。
 * @param plan   planner 输出
 * @param onStep 每步完成回调（SSE 逐个推 tool_call 事件用；缺失则静默执行）
 */
export async function executePlan(
  plan: AgentPlan,
  onStep?: (entry: TraceEntry) => void
): Promise<ExecutionResult> {
  const trace: TraceEntry[] = [];
  const evidence: EvidenceEntry[] = [];

  const steps: PlanStep[] = (plan.steps || []).slice(0, MAX_TOOL_ROUNDS);
  const truncated = (plan.steps?.length || 0) > MAX_TOOL_ROUNDS;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]!;
    const startedAt = Date.now();
    try {
      const outcome = await runTool(step.tool, step.args || {});
      const ms = Date.now() - startedAt;
      const summary = outcome.ok
        ? summarizeResult(outcome.result)
        : `失败：${summarizeResult(outcome.result, 120)}`;
      const entry: TraceEntry = { step: i + 1, tool: step.tool, args: step.args || {}, resultSummary: summary, ms };
      trace.push(entry);
      if (outcome.ok) {
        evidence.push({ tool: step.tool, summary, data: outcome.result });
      }
      onStep?.(entry);
    } catch (err: any) {
      // runTool 已兜底一般错误，这里防御序列化异常等极端情况：记录后继续下一步
      const ms = Date.now() - startedAt;
      const entry: TraceEntry = {
        step: i + 1,
        tool: step.tool,
        args: step.args || {},
        resultSummary: `失败：${String(err?.message || err).slice(0, 150)}`,
        ms,
      };
      trace.push(entry);
      onStep?.(entry);
    }
  }

  return { trace, evidence, executed: trace.length, truncated };
}
