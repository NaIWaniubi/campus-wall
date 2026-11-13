/**
 * AI 助手：OpenRouter / OpenAI 兼容客户端（非流式 + SSE 流式，带免费模型回退链）
 */
import { logger } from './logger.js';

const DEFAULT_OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

export function getAiApiUrl(): string {
  const custom = process.env.AI_BASE_URL || process.env.OPENROUTER_BASE_URL;
  if (!custom) return DEFAULT_OPENROUTER_URL;
  const trimmed = custom.trim().replace(/\/+$/, '');
  return trimmed.endsWith('/chat/completions') ? trimmed : `${trimmed}/chat/completions`;
}

export function getAiApiKey(): string {
  return (process.env.AI_API_KEY || process.env.OPENROUTER_API_KEY || '').trim();
}

/**
 * 模型级路由：:free 后缀的模型固定走官方 OpenRouter（配 OPENROUTER_API_KEY 就用），
 * 其余走自定义网关（AI_BASE_URL + AI_API_KEY）。
 * 解决「自定义网关 key 失效但 OpenRouter key 有效」时整条模型链全灭的问题。
 */
const OPENROUTER_HOST = 'https://openrouter.ai/api/v1/chat/completions';

export function routeFor(model: string): { url: string; key: string } {
  const isFree = model.endsWith(':free');
  const orKey = (process.env.OPENROUTER_API_KEY || '').trim();
  if (isFree && orKey) return { url: OPENROUTER_HOST, key: orKey };
  return { url: getAiApiUrl(), key: getAiApiKey() };
}

/**
 * 端点指纹（url + key 尾 6 位，绝不回显完整 key）：用于「同一网关一旦认证失败，
 * 就不再逐个重试该网关下的其它模型」。key 尾几位足以区分不同 key，且不泄露凭据。
 */
export function endpointKeyFor(model: string): string {
  const r = routeFor(model);
  return `${r.url}|${r.key.slice(-6)}`;
}

const AUTH_ERR_RE =
  /invalid token|incorrect api key|invalid api key|unauthorized|authentication|permission denied|api key not|invalid authentication/i;

/** 是否为「网关/凭据级」认证错误（应跳过同端点其余模型，而非逐个重试） */
export function isAuthError(err: any): boolean {
  if (!err) return false;
  if (err.status === 401 || err.status === 403) return true;
  return AUTH_ERR_RE.test(String(err.message ?? err));
}

export interface AiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** 推荐预设与备选模型回退链 */
export const DEFAULT_MODELS = [
  // 主力：付费档（自定义网关配了就先用）
  'gemini-3.8-flash',
  'gemini-3.8-flash-high',
  'glm-5.3',
  'MiniMax-M3',
  'step-5-preview',
  // 兜底：OpenRouter 实测可用的免费档（2026-11-12 探测，见 DEFAULT_MODELS 注释）
  'nvidia/nemotron-3.5-lightning:free',
  'nvidia/nemotron-3.5-super-vl:free',
  'baidu/ernie-5.5-flash-preview:free',
  'thinkingmachines/inkling-2-small:free',
];

/**
 * 是否已配置 AI 能力（未配置 key 时接口返回友好提示而非报错）
 */
export function isAiEnabled(): boolean {
  return !!getAiApiKey();
}

/* ==========================================================================
 * 熔断（durability）：整条模型链都失败后，5 分钟内不再排队重试网络，
 * 直接让调用方走各自的离线兜底 —— 用户端从「白等 70 秒」变成「立刻有结果」。
 * ========================================================================== */
const BREAKER_MS = 5 * 60_000;
let breakerUntil = 0;

/** 熔断是否已恢复（到期自动放行，再试一次） */
export function aiReachable(): boolean {
  return Date.now() >= breakerUntil;
}

/** 配置具备 AI 能力 且 未处于熔断窗口 */
export function isAiUsable(): boolean {
  return isAiEnabled() && aiReachable();
}

function tripBreaker(reason: string): void {
  breakerUntil = Date.now() + BREAKER_MS;
  logger.warn('AI 熔断开启：短期连续调用失败，改用站内兜底', {
    reason,
    until: new Date(breakerUntil).toISOString(),
  });
}

function resetBreaker(): void {
  breakerUntil = 0;
}

/** 调用预算：整链最多花多少时间、单模型最多等多久 */
export interface AiCallOptions {
  /** 整条模型链的总时间预算（毫秒），超出即停手交给兜底 */
  budgetMs?: number;
  /** 单个模型的等待上限（毫秒） */
  perModelTimeoutMs?: number;
  /** 后台任务专用：无视熔断窗口照常尝试（没人等待，成功反而复位熔断） */
  ignoreBreaker?: boolean;
}

/**
 * 组装本次调用的模型列表：数据库设置 > 环境变量 > 默认链
 */
export function buildModelChain(settingModel?: string | null): string[] {
  const envModel = process.env.AI_MODEL || process.env.OPENROUTER_MODEL;
  const primary = settingModel || envModel;
  const chain = primary
    ? [primary, ...DEFAULT_MODELS.filter((m) => m !== primary)]
    : [...DEFAULT_MODELS];
  if (envModel && primary !== envModel) {
    // 环境变量模型紧跟主选之后，作为第一备选
    chain.splice(1, 0, envModel);
  }
  return Array.from(new Set(chain));
}

/**
 * 从推理模型的 reasoning 尾巴里打捞 JSON：多数推理模型会把最终答案写在思考末尾
 * （```json 围栏 或 最后一个平衡的 {...} 快）。只打捞「看起来是 JSON」的内容，
 * 捞不到返回 null，让调用方按「未返回有效内容」走兜底——绝不把思考独白当答案。
 */
export function salvageJsonFromReasoning(reasoning?: string | null): string | null {
  if (!reasoning || reasoning.length < 8) return null;
  const fenced = reasoning.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced && fenced[1]!.trim().startsWith('{')) return fenced[1]!.trim();
  const start = reasoning.indexOf('{');
  const end = reasoning.lastIndexOf('}');
  if (start >= 0 && end > start + 4) {
    const slice = reasoning.slice(start, end + 1);
    // 至少要像一份键值草稿（含引号键），避免把孤立的花括号独白当 JSON
    if (/"[A-Za-z_\u4e00-\u9fa5]+"\s*:/.test(slice)) return slice;
  }
  return null;
}

async function toApiError(resp: Response): Promise<Error> {
  const json: any = await resp.json().catch((): null => null);
  const err = new Error(json?.error?.message || `AI 服务响应异常 (${resp.status})`);
  (err as any).status = resp.status;
  return err;
}

/** 解析 OpenRouter / OpenAI 兼容 SSE 流，回调内容增量；返回完整文本 */
async function consumeStream(
  resp: Response,
  onDelta?: (text: string) => void
): Promise<string> {
  const reader = resp.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === '[DONE]') continue;
      try {
        const choice = JSON.parse(payload)?.choices?.[0];
        const delta = choice?.delta?.content;
        if (typeof delta === 'string' && delta) {
          full += delta;
          onDelta?.(delta);
        }
      } catch {
        // 忽略心跳/注释等非 JSON 行
      }
    }
  }
  return full.trim();
}

async function requestOnce(
  model: string,
  messages: AiMessage[],
  maxTokens: number,
  onDelta?: (text: string) => void,
  timeoutMs = 60_000
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  // 免费档模型路由到官方 OpenRouter（key 跟模型走）
  const route = routeFor(model);
  const apiKey = route.key;
  const apiUrl = route.url;

  // reasoning 模型（OpenRouter :free 档实测为推理型）：先把 token 烧在 reasoning 上再出 content。
  // 实测严格 JSON 提示词下 2048 全部耗在思考里（finish=length、content=None），所以：
  // 1) 预算翻倍到 4096；2) 提示服务端少想（reasoning.effort=low，不支持的网关会忽略）；
  // 3) content 仍为空时，从 reasoning 尾部打捞 JSON 定界块。
  const isFreeReasoning = model.endsWith(':free');
  try {
    const resp = await fetch(apiUrl, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://campus-wall.local',
        'X-Title': 'Campus Wall AI Assistant',
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: Math.max(maxTokens, isFreeReasoning ? 4096 : 2048),
        temperature: 0.6,
        ...(isFreeReasoning ? { reasoning: { effort: 'low' } } : {}),
        ...(onDelta ? { stream: true } : {}),
      }),
    });
    if (!resp.ok) throw await toApiError(resp);

    if (!onDelta) {
      const json: any = await resp.json().catch((): null => null);
      const choice = json?.choices?.[0];
      const content =
        choice?.message?.content || choice?.text || salvageJsonFromReasoning(choice?.message?.reasoning);
      if (typeof content !== 'string' || !content.trim()) throw new Error('AI 未返回有效内容');
      return content.trim();
    }
    return await consumeStream(resp, onDelta);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 非流式调用：按模型链依次尝试，全部失败抛最后一个错误。
 * 带总时间预算与单模型超时；整链失败则开熔断，后续请求直接走兜底。
 */
export async function chatWithAI(
  messages: AiMessage[],
  maxTokens = 1024,
  models: string[] = buildModelChain(),
  opts: AiCallOptions = {}
): Promise<string> {
  if (!isAiEnabled()) throw new Error('AI 未配置');
  if (!opts.ignoreBreaker && !aiReachable()) throw new Error('AI 处于熔断窗口，本次使用站内结果');

  const started = Date.now();
  const budgetMs = opts.budgetMs ?? 30_000;
  const perModelTimeoutMs = opts.perModelTimeoutMs ?? 20_000;
  let lastError: Error = new Error('无可用模型');
  // 认证失败是网关级信号：同端点（url+key）的其余模型不必再逐个空耗预算重试
  const deadEndpoints = new Set<string>();

  for (const model of models) {
    const remain = budgetMs - (Date.now() - started);
    if (remain <= 500) break; // 预算耗尽，交给兜底，不再等
    const ep = endpointKeyFor(model);
    if (deadEndpoints.has(ep)) {
      logger.warn('AI 跳过已认证失败的网关', { model, endpoint: ep.split('|')[0] });
      continue;
    }
    try {
      const out = await requestOnce(model, messages, maxTokens, undefined, Math.min(perModelTimeoutMs, remain));
      resetBreaker();
      return out;
    } catch (err: any) {
      lastError = err;
      if (isAuthError(err)) deadEndpoints.add(ep);
      logger.error('AI 模型调用失败', { model, error: err?.message, gatewayDead: isAuthError(err) });
    }
  }
  // 空链（如 fastOnly 过滤后只剩慢档）是配置形态，不是故障，不开熔断
  if (models.length > 0) tripBreaker(lastError.message);
  throw lastError;
}

/**
 * 流式调用（SSE）：onDelta 收到增量文本；返回完整文本。
 * 一旦有增量输出就不再切换模型（避免客户端重复输出），仅在尚未输出前失败才回退。
 */
export async function chatWithAIStream(
  messages: AiMessage[],
  onDelta: (text: string) => void,
  maxTokens = 1024,
  models: string[] = buildModelChain(),
  opts: AiCallOptions = {}
): Promise<string> {
  if (!isAiEnabled()) throw new Error('AI 未配置');
  if (!aiReachable()) throw new Error('AI 处于熔断窗口，本次使用站内结果');

  const started = Date.now();
  const budgetMs = opts.budgetMs ?? 45_000;
  const perModelTimeoutMs = opts.perModelTimeoutMs ?? 30_000;
  let lastError: Error = new Error('无可用模型');
  const deadEndpoints = new Set<string>();

  for (const model of models) {
    const remain = budgetMs - (Date.now() - started);
    if (remain <= 500) break;
    const ep = endpointKeyFor(model);
    if (deadEndpoints.has(ep)) {
      logger.warn('AI 流式跳过已认证失败的网关', { model, endpoint: ep.split('|')[0] });
      continue;
    }
    let started_ = false;
    try {
      const out = await requestOnce(
        model,
        messages,
        maxTokens,
        (t) => {
          started_ = true;
          onDelta(t);
        },
        Math.min(perModelTimeoutMs, remain)
      );
      resetBreaker();
      return out;
    } catch (err: any) {
      lastError = err;
      if (isAuthError(err)) deadEndpoints.add(ep);
      logger.error('AI 流式模型调用失败', { model, error: err?.message, gatewayDead: isAuthError(err) });
      if (started_) {
        tripBreaker(err?.message ?? 'stream failed');
        throw err;
      }
    }
  }
  // 空链（如 fastOnly 过滤后只剩慢档）是配置形态，不是故障，不开熔断
  if (models.length > 0) tripBreaker(lastError.message);
  throw lastError;
}
