/**
 * 校园助手 Agent · 回答合成器（compose）
 *
 * 有 LLM：把 evidence 喂给 chatWithAI 生成中文回答（提示词约束：仅基于工具结果、引用工具名）；
 * 无 LLM：把 evidence 拼成结构化卡片文本（每条「🔧 tool名：摘要」）。
 * 输出一律经 sanitizeOutput 清洗；guard 引擎未就绪时用本地最小实现兜底。
 */
import { chatWithAI, isAiUsable, type AiMessage } from '../utils/ai.js';
import { logger } from '../utils/logger.js';
import type { EvidenceEntry } from './executor.js';

/* ==========================================================================
 * 输出清洗：api/ai/guard.ts 尚未存在（guard agent 并行开发中），
 * 先用本地最小实现——剥离常见注入标记与控制字符。
 * 待与 guard 引擎合并：合并后此处改为 import { sanitizeOutput } from '../ai/guard.js'。
 * ========================================================================== */

export function sanitizeOutput(text: string): string {
  return String(text || '')
    // 剥离模型可被诱导输出的角色扮演标记
    .replace(/<\/?(system|assistant|user|im_start|im_end)>/gi, '')
    // 剥离常见提示词注入包裹
    .replace(/\[INST\]|\[\/INST\]|<<SYS>>|<<\/SYS>>/gi, '')
    // 控制字符（保留换行/制表）
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .trim();
}

/* ==========================================================================
 * 证据序列化
 * ========================================================================== */

/** evidence → 喂给 LLM 的编号文本块（限制总长，防 token 爆炸） */
function evidenceBlock(evidence: EvidenceEntry[]): string {
  return evidence
    .slice(0, 6)
    .map((e, i) => {
      let dataText: string;
      try {
        dataText = JSON.stringify(e.data);
      } catch {
        dataText = String(e.data);
      }
      // 每条证据截 600 字，6 条上限即 3.6k 字符，与 1024 token 回答预算匹配
      return `[证据${i + 1}｜来自工具 ${e.tool}]\n${dataText.slice(0, 600)}`;
    })
    .join('\n\n');
}

/* ==========================================================================
 * 卡片式兜底（无 LLM）
 * ========================================================================== */

/** 无证据时的兜底文案 */
export const EMPTY_EVIDENCE_HINT = '校园墙里暂时没有找到与这个问题直接相关的信息，换个关键词试试，或直接到各板块逛一逛。';

/** evidence → 结构化卡片文本：每条一行「🔧 tool名：摘要」 */
export function composeCardText(evidence: EvidenceEntry[]): string {
  if (!evidence.length) return EMPTY_EVIDENCE_HINT;
  const lines = evidence.slice(0, 6).map((e) => `🔧 ${e.tool}：${e.summary}`);
  return ['【站内检索结果】', ...lines, '', '以上为工具实时查询的校园墙数据，仅供参考。'].join('\n');
}

/* ==========================================================================
 * LLM 合成
 * ========================================================================== */

/**
 * 合成中文回答。
 * @param question 原始问题
 * @param evidence executor 收集的证据
 * @param usable   LLM 可用性（route 已算过则传入，避免重复判断）
 * @returns { text, mode: 'llm' | 'card' }
 */
export async function composeAnswer(
  question: string,
  evidence: EvidenceEntry[],
  usable?: boolean
): Promise<{ text: string; mode: 'llm' | 'card' }> {
  const canLlm = usable === undefined ? isAiUsable() : usable;

  if (canLlm && evidence.length) {
    try {
      const messages: AiMessage[] = [
        {
          role: 'system',
          content:
            '你是校园墙助手。回答规则：\n' +
            '1. 仅基于下面给出的工具查询结果回答，不要编造任何不在结果里的信息；\n' +
            '2. 引用信息时注明来自哪个工具（如「据 searchPosts 结果」）；\n' +
            '3. 用简体中文，简洁友好，控制在 300 字以内；\n' +
            '4. 结果为空或与问题无关时，如实说明站内暂无相关信息。\n\n' +
            `工具查询结果：\n${evidenceBlock(evidence)}`,
        },
        { role: 'user', content: String(question || '').slice(0, 300) },
      ];
      const raw = await chatWithAI(messages, 1024, [], { budgetMs: 30_000, perModelTimeoutMs: 20_000 });
      const text = sanitizeOutput(raw);
      if (text) return { text, mode: 'llm' };
      logger.info('Agent LLM 合成输出为空，回退卡片');
    } catch (err: any) {
      logger.info('Agent LLM 合成失败，回退卡片', { error: err?.message });
    }
  }

  return { text: sanitizeOutput(composeCardText(evidence)), mode: 'card' };
}
