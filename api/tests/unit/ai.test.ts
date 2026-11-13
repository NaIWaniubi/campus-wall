import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  isAiEnabled,
  getAiApiUrl,
  getAiApiKey,
  buildModelChain,
  DEFAULT_MODELS,
  salvageJsonFromReasoning,
} from '../../utils/ai.js';

describe('AI Assistant Utilities', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('detects if AI is enabled based on API Key presence', () => {
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.AI_API_KEY;
    expect(isAiEnabled()).toBe(false);

    process.env.OPENROUTER_API_KEY = 'sk-or-test-key';
    expect(isAiEnabled()).toBe(true);
    expect(getAiApiKey()).toBe('sk-or-test-key');

    // AI_API_KEY takes precedence
    process.env.AI_API_KEY = 'sk-custom-ai-key';
    expect(getAiApiKey()).toBe('sk-custom-ai-key');
  });

  it('resolves API URL correctly for default and custom endpoints', () => {
    delete process.env.AI_BASE_URL;
    delete process.env.OPENROUTER_BASE_URL;
    expect(getAiApiUrl()).toBe('https://openrouter.ai/api/v1/chat/completions');

    // Custom base URL with trailing slash
    process.env.AI_BASE_URL = 'https://api.deepseek.com/v1/';
    expect(getAiApiUrl()).toBe('https://api.deepseek.com/v1/chat/completions');

    // Custom full completions URL
    process.env.AI_BASE_URL = 'https://api.siliconflow.cn/v1/chat/completions';
    expect(getAiApiUrl()).toBe('https://api.siliconflow.cn/v1/chat/completions');
  });

  it('builds prioritized and deduplicated model chain', () => {
    delete process.env.OPENROUTER_MODEL;
    delete process.env.AI_MODEL;

    // Default chain
    const defaultChain = buildModelChain();
    expect(defaultChain).toEqual(DEFAULT_MODELS);

    // Setting model overrides as primary
    const customChain = buildModelChain('deepseek/deepseek-chat');
    expect(customChain[0]).toBe('deepseek/deepseek-chat');
    expect(new Set(customChain).size).toBe(customChain.length); // no duplicates
  });
});

describe('网关级 auth 短路（V5）', () => {
  const originalEnv = { ...process.env };
  const origFetch = globalThis.fetch;
  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.AI_BASE_URL = 'https://gw.test/v1';
    process.env.AI_API_KEY = 'gwkey_abc123456';
    process.env.OPENROUTER_API_KEY = 'orkey_xyz789';
  });
  afterEach(() => {
    process.env = { ...originalEnv };
    globalThis.fetch = origFetch;
  });

  it('isAuthError 识别 401/403 与 Invalid token 类文案', async () => {
    const { isAuthError } = await import('../../utils/ai.js');
    const e401 = Object.assign(new Error('AI 服务响应异常 (401)'), { status: 401 });
    expect(isAuthError(e401)).toBe(true);
    expect(isAuthError(new Error('Invalid token (request id: 123)'))).toBe(true);
    expect(isAuthError(new Error('Incorrect API key provided'))).toBe(true);
    expect(isAuthError(new Error('upstream timeout'))).toBe(false);
    expect(isAuthError(undefined)).toBe(false);
  });

  it('endpointKeyFor：免费档与自建网关是两个端点；同网关模型指纹相同且不含完整 key', async () => {
    const { endpointKeyFor } = await import('../../utils/ai.js');
    const gw = endpointKeyFor('gemini-3.8-flash');
    const gw2 = endpointKeyFor('glm-5.3');
    const free = endpointKeyFor('nvidia/nemotron-3.5-lightning:free');
    expect(gw).toBe(gw2);
    expect(free).not.toBe(gw);
    expect(gw).not.toContain('gwkey_abc123456');
    expect(gw).toContain('123456'); // 只含尾 6 位
  });

  it('自建网关首个模型 401 后，其余同网关模型零网络调用，直接试免费档；全链失败才抛', async () => {
    const { chatWithAI } = await import('../../utils/ai.js');
    const calls: { url: string; model: string }[] = [];
    globalThis.fetch = (async (url: any, init: any) => {
      const body = JSON.parse(String(init.body));
      calls.push({ url: String(url), model: body.model });
      if (String(url).includes('gw.test')) {
        return new Response(JSON.stringify({ error: { message: 'Invalid token (request id: test)' } }), { status: 401 });
      }
      return new Response(JSON.stringify({ error: { message: 'no capacity' } }), { status: 503 });
    }) as any;

    await expect(chatWithAI([{ role: 'user', content: 'hi' }])).rejects.toThrow(/Invalid token|no capacity/);
    // 自建网关只被打 1 次（第一个模型 401 → 同端点其余 4 个被跳过）
    const gwCalls = calls.filter((c) => c.url.includes('gw.test'));
    expect(gwCalls.length).toBe(1);
    // 免费档端点全部被尝试过（4 个 :free 模型）
    const freeCalls = calls.filter((c) => c.model.endsWith(':free'));
    expect(freeCalls.length).toBe(4);
  });
});

describe('salvageJsonFromReasoning（reasoning 模型空 content 打捞）', () => {
  // 注意：cat >> 场景避免反引号，这里用字符串拼接构造围栏
  const F = '`'.repeat(3);
  it('优先取 ```json 围栏块', () => {
    const r = `先分析一堆...${F}json\n{"title":"T","content":"C"}\n${F}\n搞定`;
    expect(salvageJsonFromReasoning(r)).toBe('{"title":"T","content":"C"}');
  });
  it('无围栏时打捞首尾花括号平衡段', () => {
    const r = 'Let me think. The answer is {"title":"标题","content":"正文","tags":["a"]} done';
    const out = salvageJsonFromReasoning(r);
    expect(out).toContain('"title"');
    expect(() => JSON.parse(out!)).not.toThrow();
  });
  it('纯思考独白（无 JSON 形状）返回 null，不把独白当答案', () => {
    expect(salvageJsonFromReasoning('用户想要一个帖子，我需要先分析语义，再组织语言……')).toBeNull();
    expect(salvageJsonFromReasoning('')).toBeNull();
    expect(salvageJsonFromReasoning(undefined)).toBeNull();
    expect(salvageJsonFromReasoning('{}')).toBeNull(); // 太短不算草稿
  });
});
