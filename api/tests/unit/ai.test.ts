import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  isAiEnabled,
  getAiApiUrl,
  getAiApiKey,
  buildModelChain,
  DEFAULT_MODELS,
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
