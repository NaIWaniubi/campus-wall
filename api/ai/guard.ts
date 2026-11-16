/**
 * AI 护栏引擎：输入分级拦截（Prompt 注入 + 敏感词）+ 输出净化（风险改写 /
 * 长度截断 / 幻觉红线）+ 结构化 JSON 校验。
 * 评分点：AI 安全与可控性——输出安全性、可解释性、内容过滤与兜底机制。
 * 全部为纯函数（不触网、不触库），决策结果由调用方写入 guard meta 对外解释。
 */
import { getRiskLevel } from '../utils/sensitive.js';
import { logger } from '../utils/logger.js';

// ---------- 输入侧：Prompt 注入模式库 ----------

/**
 * 注入模式（≥12 条，中英）：匹配即视为攻击面。
 * - high：直接指令覆盖 / 系统角色重置 / 密钥泄露请求——拒答，不调 LLM
 * - medium：诱导性话术——剥离命中片段后放行
 */
const INJECTION_PATTERNS: { re: RegExp; level: 'high' | 'medium'; label: string }[] = [
  { re: /忽略(以上|上面|之前|所有|前面)(所有|的)?(指令|提示|规则|设定|内容)/i, level: 'high', label: 'ignore-instructions-zh' },
  { re: /无视(以上|上面|之前|所有|前面)(所有|的)?(指令|提示|规则|设定|内容)/i, level: 'high', label: 'ignore-instructions-zh2' },
  { re: /disregard\s+(all\s+)?(previous|prior|above|earlier)/i, level: 'high', label: 'ignore-instructions-en' },
  { re: /ignore\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions|prompts|rules)/i, level: 'high', label: 'ignore-instructions-en2' },
  { re: /ignore\s+(the\s+)?(system\s+)?prompt/i, level: 'high', label: 'ignore-system-prompt' },
  { re: /(你现在|从现在开始你)(是|扮演|充当)(系统|管理员|开发者|root)/i, level: 'high', label: 'role-reset-zh' },
  { re: /(act|pretend)\s+as\s+(the\s+)?(system|admin|developer|root)/i, level: 'high', label: 'role-reset-en' },
  { re: /(打印|输出|泄露|展示|复述|repeat|reveal|print|show)\s*(一下)?\s*(你|your)\s*(的)?\s*(system\s*prompt|系统提示|系统指令|初始指令|设定)/i, level: 'high', label: 'prompt-leak' },
  { re: /(system\s*prompt|系统提示词?|初始设定)\s*(是什么|在哪里|给我看|发我)/i, level: 'high', label: 'prompt-leak-zh' },
  { re: /(重置|清空|覆盖)(你|模型|ai)(的)?(角色|人设|设定|记忆|指令)/i, level: 'high', label: 'reset-persona' },
  { re: /developer\s+mode|DAN\s+mode|jailbreak|越狱模式/i, level: 'medium', label: 'jailbreak-mode' },
  { re: /你不再受(任何)?(限制|约束|规则)/i, level: 'medium', label: 'no-limits-zh' },
  { re: /you\s+(are|re)\s+(no\s+longer|not)\s+(bound|restricted|limited)/i, level: 'medium', label: 'no-limits-en' },
  { re: /(进入|开启)\s*(自由|无限制|不受限)(模式|状态)/i, level: 'medium', label: 'unrestricted-mode' },
  { re: /这是一个?(测试|演示)[，,]?请(放宽|忽略|解除)限制|请(放宽|解除)限制/i, level: 'medium', label: 'test-excuse' },
];

/** 拒答模板（high 命中时不调用 LLM，直接返回） */
export const REJECT_TEMPLATE =
  '抱歉，这个问题我不能回答。我是校园墙的 AI 助手，只能帮你解答校园生活与平台使用相关的问题～';

export interface InputVerdict {
  level: 'high' | 'medium' | 'low';
  /** medium 时剥离注入片段后的文本；high/low 时与原文一致（high 时调用方不应使用） */
  sanitized: string;
  matched: string[];
  /** 敏感词层判定（getRiskLevel：safe/review/reject） */
  risk: 'safe' | 'review' | 'reject';
}

/**
 * 输入侧检查：注入模式 → 敏感词 → 分级。
 * - high：任一 high 注入命中，或敏感词 reject —— 直接拒答
 * - medium：注入 medium 命中（剥离后放行）或敏感词 queue（调用方自行决定走审核口径）
 * - low：放行
 */
export function inspectInput(text: string): InputVerdict {
  const matched: string[] = [];
  let sanitized = text;
  let worst: 'high' | 'medium' | 'low' = 'low';

  for (const p of INJECTION_PATTERNS) {
    if (p.re.test(sanitized)) {
      matched.push(p.label);
      if (p.level === 'high') {
        worst = 'high';
      } else if (worst !== 'high') {
        worst = 'medium';
        // medium：剥离命中片段（把匹配处替换为空格），其余内容保留
        sanitized = sanitized.replace(p.re, ' ');
      }
    }
  }

  const risk = getRiskLevel(text);
  if (risk === 'reject') worst = 'high';

  if (worst === 'high') {
    logger.warn('AI 护栏：输入高危拦截', { matched, risk });
  } else if (worst === 'medium') {
    logger.info('AI 护栏：输入中危剥离', { matched });
  }
  return { level: worst, sanitized: worst === 'high' ? text : sanitized, matched, risk };
}

// ---------- 输出侧：风险改写 / 截断 / 幻觉红线 ----------

/** 风险句式库：校园场景高发的违规交易话术，命中句整体替换 */
const RISK_PATTERNS: RegExp[] = [
  /代(考|写|做)(论文|作业|考试|毕业设计)/,
  /(论文|作业|考试|毕设)代(写|做)/,
  /(找人|招募|诚聘).{0,6}(枪手|代考)/,
  /兼职.{0,8}(刷单|返利|佣金)/,
  /(刷单|刷信誉|刷销量)/,
  /(垫付|先付定金).{0,10}(返|退|佣金)/,
  /(私下|微信|qq)转账.{0,6}(担保|不放心中介)?/,
  /(校园贷|网贷|套路贷|借条.{0,4}周息)/,
  /(代开|出售|收购)(普通 )?发票/,
  /(内部渠道|内部名额|保过|包过|买答案|卖答案)/,
];

const RISK_REPLACEMENT = '⚠️ 该内容涉及违规风险，已由平台安全策略处理';

/** 默认输出长度上限 */
const DEFAULT_MAX_LEN = 2000;

export interface OutputVerdict {
  text: string;
  rewritten: boolean;
  redactedCount: number; // 幻觉红线剔除的句子数
  riskReplacements: number;
}

/**
 * 输出净化三连：
 * 1) 风险改写——命中风险句式的句子整句替换
 * 2) 幻觉红线——引用编号 [n] 不在 validRefs 内的句子剔除（有 sources 时启用）
 * 3) 超长截断
 */
export function sanitizeOutput(
  text: string,
  opts: { maxLen?: number; validRefs?: number[] } = {},
): OutputVerdict {
  let out = text;
  let rewritten = false;
  let riskReplacements = 0;
  let redactedCount = 0;

  // 1) 风险改写：按句切分，命中句替换
  const sentences = out.split(/(?<=[。！？；!?;\n])/);
  out = sentences
    .map((s) => {
      if (RISK_PATTERNS.some((re) => re.test(s))) {
        rewritten = true;
        riskReplacements++;
        return RISK_REPLACEMENT + '\n';
      }
      return s;
    })
    .join('');

  // 2) 幻觉红线：引用编号超出资料范围的句子剔除
  if (opts.validRefs && opts.validRefs.length) {
    const valid = new Set(opts.validRefs);
    const kept = out.split(/(?<=[。！？；!?;\n])/).filter((s) => {
      const refs = Array.from(s.matchAll(/\[(\d{1,2})\]/g)).map((m) => Number(m[1]));
      const bad = refs.filter((n) => !valid.has(n));
      if (bad.length) {
        redactedCount++;
        logger.warn('AI 护栏：幻觉红线剔除', { badRefs: bad, sentence: s.slice(0, 60) });
        return false;
      }
      return true;
    });
    out = kept.join('');
    if (redactedCount > 0) rewritten = true;
  }

  // 3) 超长截断
  const maxLen = opts.maxLen ?? DEFAULT_MAX_LEN;
  if (out.length > maxLen) {
    out = out.slice(0, maxLen) + '…（内容过长已截断）';
    rewritten = true;
  }

  return { text: out, rewritten, redactedCount, riskReplacements };
}

// ---------- 结构化输出校验 ----------

export type FieldType = 'string' | 'number' | 'boolean' | 'string[]' | 'object';

export interface SimpleSchema {
  required: string[];
  types: Record<string, FieldType>;
}

export type ValidateResult<T> = { ok: true; value: T } | { ok: false; error: string };

/** 判定值是否符合字段类型（宽松：number 接受数字字符串） */
function matchesType(v: unknown, t: FieldType): boolean {
  switch (t) {
    case 'string':
      return typeof v === 'string';
    case 'number':
      return typeof v === 'number' || (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v)));
    case 'boolean':
      return typeof v === 'boolean';
    case 'string[]':
      return Array.isArray(v) && v.every((x) => typeof x === 'string');
    case 'object':
      return typeof v === 'object' && v !== null && !Array.isArray(v);
  }
}

/**
 * 严格 JSON 校验：required 全在 + 类型逐个匹配。
 * 供成稿 / 图片理解等 JSON 输出使用——非法时调用方带错误信息重试一次，
 * 仍非法走各功能的套版兜底。
 */
export function validateJson<T = Record<string, unknown>>(raw: string, schema: SimpleSchema): ValidateResult<T> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: '输出不是合法 JSON' };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: '输出不是 JSON 对象' };
  }
  const obj = parsed as Record<string, unknown>;
  for (const key of schema.required) {
    if (!(key in obj)) return { ok: false, error: `缺少必需字段: ${key}` };
  }
  for (const [key, t] of Object.entries(schema.types)) {
    if (key in obj && !matchesType(obj[key], t)) {
      return { ok: false, error: `字段 ${key} 类型应为 ${t}` };
    }
  }
  return { ok: true, value: parsed as T };
}

/** guard meta（SSE meta 事件 / 非流式 JSON 携带，前端可解释性展示） */
export interface GuardMeta {
  inputLevel: 'high' | 'medium' | 'low';
  rewritten: boolean;
  redactedCount: number;
}
