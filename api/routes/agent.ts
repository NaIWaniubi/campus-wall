/**
 * 校园助手 Agent 路由：POST /api/agent/assist/stream（SSE）
 *
 * 事件流：plan{steps,mode} → tool_call(逐个 {step,tool,args,summary,ms}) → answer{text,mode} → end
 * 鉴权与频控与 /api/ai 同口径：authRequired + aiLimiter + 敏感词风险拦截（getRiskLevel）。
 * SSE 写法参照 api/routes/ai.ts 的 /chat/stream。
 */
import { Router, type Request, type Response } from 'express';
import { authRequired } from '../middleware/auth.js';
import { aiLimiter } from '../middleware/rateLimit.js';
import { fail } from '../utils/response.js';
import { getRiskLevel } from '../utils/sensitive.js';
import { inspectInput, REJECT_TEMPLATE } from '../ai/guard.js';
import { isAiUsable } from '../utils/ai.js';
import { logger } from '../utils/logger.js';
import { plan } from '../agent/planner.js';
import { executePlan } from '../agent/executor.js';
import { composeAnswer } from '../agent/compose.js';

const router = Router();

/**
 * Agent 助手（SSE 流式）：
 * body: { question: string }
 * events:
 *  - plan     { steps: [{tool,args,reason}], mode: 'llm'|'rule' }
 *  - tool_call { step, tool, args, summary, ms }   （逐步推送）
 *  - answer   { text, mode: 'llm'|'card' }
 *  - end      { ok: true }
 *  - error    { message }
 */
router.post('/assist/stream', authRequired, aiLimiter, async (req: Request, res: Response) => {
  const question = String(req.body?.question || '').trim();

  // 校验阶段尚未进入 SSE，可直接返回 JSON 错误（与 ai.ts 校验行为一致）
  if (!question || question.length > 500) {
    return fail(res, '请输入 1~500 字的问题');
  }
  const risk = getRiskLevel(question);
  if (risk === 'reject') return fail(res, '问题包含敏感内容，请调整后再试');
  if (risk === 'review') return fail(res, '问题涉及敏感话题，请换个说法');

  // Prompt 注入护栏（此前 Agent 入口零注入防护，只查敏感词）：
  // 「忽略以上所有指令」这类输入会作为 user message 进入 planner 的 system+user 拼装。
  const guard = inspectInput(question);
  if (guard.level === 'high') {
    return fail(res, REJECT_TEMPLATE, 400, 400);
  }
  // medium：剥离注入片段后再进入规划
  const safeQuestion = guard.level === 'medium' ? guard.sanitized.trim() : question;
  if (!safeQuestion) return fail(res, '请输入 1~500 字的问题');

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = (event: string, data: any) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const usable = isAiUsable();

    // 1) 规划
    const agentPlan = await plan(safeQuestion, usable);
    send('plan', { steps: agentPlan.steps, mode: agentPlan.mode });

    // 2) 执行（逐步推送 tool_call）
    const { evidence } = await executePlan(agentPlan, (entry) => {
      send('tool_call', {
        step: entry.step,
        tool: entry.tool,
        args: entry.args,
        summary: entry.resultSummary,
        ms: entry.ms,
      });
    });

    // 3) 合成回答
    const { text, mode } = await composeAnswer(question, evidence, usable);
    send('answer', { text, mode });

    // 4) 收尾
    send('end', { ok: true });
  } catch (err: any) {
    // 兜底错误通道：计划/执行全链异常时仍给前端一个可渲染的 error 事件
    logger.error('Agent 流式处理失败', { error: err?.message, question: question.slice(0, 50) });
    send('error', { message: '助手开小差了，请稍后再试' });
    send('end', { ok: false });
  }
  res.end();
});

export default router;
