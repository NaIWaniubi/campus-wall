/**
 * AI 助手：OpenRouter 客户端（非流式 + SSE 流式，带免费模型回退链）
 */
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

export interface AiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** 默认免费模型回退链（主模型限流/下架时依次尝试） */
export const DEFAULT_MODELS = [
  'nvidia/nemotron-3-super-120b-a12b:free',
  'z-ai/glm-5.2:free',
  'nvidia/nemotron-3-nano-30b-a3b:free',
];

/**
 * 是否已配置 AI 能力（未配置 key 时接口返回友好提示而非报错）
 */
export function isAiEnabled(): boolean {
  return !!process.env.OPENROUTER_API_KEY;
}

/**
 * 组装本次调用的模型列表：数据库设置 > 环境变量 > 默认链
 */
export function buildModelChain(settingModel?: string | null): string[] {
  const envModel = process.env.OPENROUTER_MODEL;
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
  const json: any = await resp.json().catch(() => null);
  return new Error(json?.error?.message || `AI 服务响应异常 (${resp.status})`);
}

/** 解析 OpenRouter SSE 流，回调内容增量；返回完整文本 */
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
        const delta = JSON.parse(payload)?.choices?.[0]?.delta?.content;
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
  try {
    const resp = await fetch(OPENROUTER_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: maxTokens,
        temperature: 0.6,
        ...(onDelta ? { stream: true } : {}),
      }),
    });
    if (!resp.ok) throw await toApiError(resp);

    if (!onDelta) {
      const json: any = await resp.json().catch(() => null);
      const content = json?.choices?.[0]?.message?.content;
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
      console.error(`AI model ${model} failed:`, err?.message);
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
      console.error(`AI model ${model} failed:`, err?.message);
      if (started) throw err;
    }
  }
  throw lastError;
}
