import { describe, expect, it } from 'vitest';
import { loadAiConfig, loadEnv } from '../src/config/env.js';

describe('loadAiConfig', () => {
  it('defaults to Gemini so existing deployments keep working', () => {
    expect(loadAiConfig({ GEMINI_API_KEY: 'g' })).toEqual({
      provider: 'gemini',
      apiKey: 'g',
      model: 'gemini-3.8-flash',
    });
  });

  it('treats blank variables as not set', () => {
    expect(loadAiConfig({ AI_PROVIDER: ' ', GEMINI_API_KEY: 'g', GEMINI_MODEL: '' })).toMatchObject({
      provider: 'gemini',
      model: 'gemini-3.8-flash',
    });
  });

  it('uses Groq defaults for the openai provider', () => {
    expect(loadAiConfig({ AI_PROVIDER: 'openai', AI_API_KEY: 'k' })).toEqual({
      provider: 'openai',
      apiKey: 'k',
      baseUrl: 'https://api.groq.com/openai/v1',
      model: 'openai/gpt-oss-120b',
      reasoningEffort: null,
    });
  });

  it('reads custom openai settings and trims the trailing slash', () => {
    expect(
      loadAiConfig({
        AI_PROVIDER: 'OpenAI',
        AI_API_KEY: 'k',
        AI_BASE_URL: 'https://api.cerebras.ai/v1/',
        AI_MODEL: 'gpt-oss-120b',
        AI_REASONING_EFFORT: 'low',
      }),
    ).toMatchObject({ baseUrl: 'https://api.cerebras.ai/v1', model: 'gpt-oss-120b', reasoningEffort: 'low' });
  });

  it('requires only the key of the selected provider', () => {
    expect(() => loadAiConfig({ AI_PROVIDER: 'openai' })).toThrow('AI_API_KEY is required');
    expect(() => loadAiConfig({ AI_PROVIDER: 'openai', AI_API_KEY: 'k' })).not.toThrow();
    expect(() => loadAiConfig({})).toThrow('GEMINI_API_KEY is required');
  });

  it('rejects unknown providers and reasoning levels', () => {
    expect(() => loadAiConfig({ AI_PROVIDER: 'claude', GEMINI_API_KEY: 'g' })).toThrow('AI_PROVIDER');
    expect(() => loadAiConfig({ AI_PROVIDER: 'openai', AI_API_KEY: 'k', AI_REASONING_EFFORT: 'max' })).toThrow(
      'AI_REASONING_EFFORT',
    );
  });
});

describe('loadEnv', () => {
  it('requires BOT_TOKEN', () => {
    expect(() => loadEnv({ GEMINI_API_KEY: 'g' })).toThrow('BOT_TOKEN is required');
    expect(loadEnv({ BOT_TOKEN: 't', AI_PROVIDER: 'openai', AI_API_KEY: 'k' }).ai.provider).toBe('openai');
  });
});
