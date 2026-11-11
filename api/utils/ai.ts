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

async function toApiError(resp: Response): Promise<Error> {
  const json: any = await resp.json().catch((): null => null);
  return new Error(json?.error?.message || `AI 服务响应异常 (${resp.status})`);
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
        // reasoning 模型（nemotron 系）会先输出 reasoning 再出 content，
        // 1024 常常只够 thinking，导致 content 为空被判「未返回有效内容」而整链失败
        max_tokens: Math.max(maxTokens, 2048),
        temperature: 0.6,
        ...(onDelta ? { stream: true } : {}),
      }),
    });
    if (!resp.ok) throw await toApiError(resp);

    if (!onDelta) {
      const json: any = await resp.json().catch((): null => null);
      const choice = json?.choices?.[0];
      const content = choice?.message?.content || choice?.text;
      if (typeof content !== 'string' || !content.trim()) throw new Error('AI 未返回有效内容');
      return content.trim();
    }
    return await consumeStream(resp, onDelta);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 非流式调用：按模型链依次尝试，全部失败抛最后一个错误
 */
export async function chatWithAI(
  messages: AiMessage[],
  maxTokens = 1024,
  models: string[] = buildModelChain()
): Promise<string> {
  if (!isAiEnabled()) throw new Error('AI 未配置');
  let lastError: Error = new Error('无可用模型');
  for (const model of models) {
    try {
      return await requestOnce(model, messages, maxTokens);
    } catch (err: any) {
      lastError = err;
      logger.error('AI 模型调用失败', { model, error: err?.message });
    }
  }
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
  models: string[] = buildModelChain()
): Promise<string> {
  if (!isAiEnabled()) throw new Error('AI 未配置');
  let lastError: Error = new Error('无可用模型');
  for (const model of models) {
    let started = false;
    try {
      return await requestOnce(model, messages, maxTokens, (t) => {
        started = true;
        onDelta(t);
      });
    } catch (err: any) {
      lastError = err;
      logger.error('AI 流式模型调用失败', { model, error: err?.message });
      if (started) throw err;
    }
  }
  throw lastError;
}
