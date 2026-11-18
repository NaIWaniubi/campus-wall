/**
 * 校园助手 Agent · 规划器（planner）
 *
 * 两级策略：
 * 1. LLM 可用（isAiUsable，含熔断判断）：让模型输出 JSON 计划 {steps:[{tool,args,reason}]}，
 *    ≤4 步，解析失败/工具名非法 → 自动降级到规则 planner（自主决策的第二层保险）；
 * 2. LLM 不可用：纯规则 planner —— 关键词路由到预设工具链，零外部依赖、毫秒级出计划。
 */
import { chatWithAI, isAiUsable, type AiMessage, buildModelChain  } from '../utils/ai.js';
import { describeTools, extractQuestionKeywords, TOOLS } from './tools.js';
import { logger } from '../utils/logger.js';

export interface PlanStep {
  tool: string;
  args: Record<string, unknown>;
  /** 该步骤的目的（LLM 给出或规则生成），前端时间线展示 */
  reason: string;
}

export interface AgentPlan {
  steps: PlanStep[];
  mode: 'llm' | 'rule';
}

/** 计划步数上限：防 LLM 输出失控（executor 还有轮数上限双保险） */
export const MAX_PLAN_STEPS = 4;

/* ==========================================================================
 * 规则 planner：关键词路由
 * ========================================================================== */

/** 问题中的失物招领意图词（与 matchLostFound 方向推断词一致） */
const LF_RE = /失物|招领|捡到|捡了|丢了|丢了什么|寻物|遗失|拾到|拾获|不见了/;
/** 简报/热点意图词 */
const BRIEF_RE = /今天|今日|热点|动态|简报|热闹|新闻|概况|怎么样/;

/**
 * 从问题中抽出 matchLostFound 的关键词：
 * 复用 tools 的英文词块 + 中文 2 字滑窗规则，再补一步「滑窗拼接还原」兜底——
 * 纯滑窗会把「校园卡」切成「校园/园卡」，对 LIKE 匹配仍有效，但补充整词命中更稳。
 */
function keywordsFromQuestion(question: string): string[] {
  const base = extractQuestionKeywords(question);
  // 连续中文片段整词（长度 2~6）优先加入：比滑窗对齐更好
  const chineseChunks = (question.match(/[\u4e00-\u9fa5]{2,6}/g) || [])
    .map((c) => c.trim())
    .filter((c) => c.length >= 2 && !/捡到|丢失|失物|招领|寻物|请问|帮忙|一下|有没有|今天|昨天/.test(c));
  const merged = [...new Set([...chineseChunks, ...base])];
  return merged.slice(0, 8);
}

/**
 * 规则 planner：按意图关键词映射到预设工具链（顺序即执行顺序）。
 * - 失物招领意图 → matchLostFound（抽问题关键词）+ searchPosts（全站兜底检索）
 * - 简报意图     → getCampusStats（24h 数据）+ searchPosts（拿最热话题正文）
 * - 其余         → searchPosts 单步
 */
export function rulePlan(question: string): AgentPlan {
  const q = String(question || '');

  if (LF_RE.test(q)) {
    const keywords = keywordsFromQuestion(q);
    return {
      mode: 'rule',
      steps: [
        { tool: 'matchLostFound', args: { keywords }, reason: '识别到失物招领意图，先做关键词匹配' },
        { tool: 'searchPosts', args: { query: keywords[0] || q.slice(0, 12), limit: 5 }, reason: '全站检索相关帖子补充上下文' },
      ],
    };
  }

  if (BRIEF_RE.test(q)) {
    return {
      mode: 'rule',
      steps: [
        { tool: 'getCampusStats', args: {}, reason: '获取 24h 校园动态统计' },
        { tool: 'searchPosts', args: { query: q.replace(/[？?！!。]/g, '').slice(0, 12) || '热点', limit: 5 }, reason: '检索相关热门帖子' },
      ],
    };
  }

  // 兜底：单步帖子检索
  const query = q.replace(/[？?！!。]/g, '').trim().slice(0, 20) || '最新';
  return {
    mode: 'rule',
    steps: [{ tool: 'searchPosts', args: { query, limit: 5 }, reason: '检索与问题相关的帖子' }],
  };
}

/* ==========================================================================
 * LLM planner
 * ========================================================================== */

/** 校验并截断 LLM 计划：工具名必须在注册表内、步数 ≤ MAX_PLAN_STEPS、args 必须是对象 */
function sanitizeLlmPlan(raw: unknown): PlanStep[] | null {
  if (!raw || typeof raw !== 'object') return null;
  const stepsRaw = (raw as any).steps;
  if (!Array.isArray(stepsRaw) || stepsRaw.length === 0) return null;

  const steps: PlanStep[] = [];
  for (const s of stepsRaw.slice(0, MAX_PLAN_STEPS)) {
    if (!s || typeof s !== 'object') return null;
    const tool = String((s as any).tool || '');
    if (!TOOLS[tool]) return null; // 未注册的工具名 → 整个计划按非法降级
    const args = (s as any).args;
    if (args === undefined || args === null) {
      steps.push({ tool, args: {}, reason: String((s as any).reason || '').slice(0, 80) });
    } else if (args && typeof args === 'object' && !Array.isArray(args)) {
      steps.push({ tool, args, reason: String((s as any).reason || '').slice(0, 80) });
    } else {
      return null;
    }
  }
  return steps;
}

/** 从模型输出文本中打捞 JSON 对象（ tolerate ```json 围栏 / 前后噪声） */
function parsePlanJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1]! : text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

/**
 * 生成执行计划。
 * @param question 用户问题
 * @param usable  LLM 是否可用（复用 utils/ai 的 isAiUsable 结果；false 直接走规则）
 */
export async function plan(question: string, usable?: boolean): Promise<AgentPlan> {
  const q = String(question || '').trim();
  const canLlm = usable === undefined ? isAiUsable() : usable;

  if (canLlm && q) {
    try {
      const prompt: AiMessage[] = [
        {
          role: 'system',
          content:
            '你是校园墙助手的规划器。根据用户问题，从可用工具中选择 1~4 个组成执行计划，' +
            '只输出 JSON（不要多余文字），格式：{"steps":[{"tool":"工具名","args":{...},"reason":"简短中文原因"}]}。\n' +
            '可用工具：\n' +
            describeTools() +
            '\n要求：步骤尽可能少；不确定就只用 searchPosts。',
        },
        { role: 'user', content: q.slice(0, 300) },
      ];
      // 规划是小输出任务：给足预算但压低 maxTokens，失败快速降级
      // 第三参传 [] 会让模型链为空 → for 循环零次迭代 → 恒抛「无可用模型」，
      // LLM 规划路径从未触网（实测 plan.mode 恒为 rule）。改用默认模型链。
      const raw = await chatWithAI(prompt, 512, buildModelChain(), { budgetMs: 12_000, perModelTimeoutMs: 10_000 });
      const parsed = parsePlanJson(raw);
      const steps = sanitizeLlmPlan(parsed);
      if (steps && steps.length) {
        return { steps, mode: 'llm' };
      }
      logger.info('Agent LLM 计划非法，降级规则规划', { question: q.slice(0, 50) });
    } catch (err: any) {
      logger.info('Agent LLM 规划失败，降级规则规划', { error: err?.message });
    }
  }

  return rulePlan(q);
}
