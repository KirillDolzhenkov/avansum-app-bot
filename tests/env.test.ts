import { describe, expect, it } from 'vitest';
import { loadAiConfig, loadEnv } from '../src/config/env.js';

describe('loadAiConfig', () => {
  it('defaults to the openai provider with Groq settings', () => {
    expect(loadAiConfig({ AI_API_KEY: 'k' })).toEqual({
      provider: 'openai',
      apiKey: 'k',
      baseUrl: 'https://api.groq.com/openai/v1',
      model: 'openai/gpt-oss-120b',
      reasoningEffort: null,
    });
  });

  it('treats blank variables as not set', () => {
    expect(loadAiConfig({ AI_PROVIDER: ' ', AI_API_KEY: 'k', AI_MODEL: '', AI_BASE_URL: '' })).toMatchObject({
      provider: 'openai',
      model: 'openai/gpt-oss-120b',
      baseUrl: 'https://api.groq.com/openai/v1',
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

  it('uses the same AI_API_KEY and AI_MODEL for Gemini with its own default model', () => {
    expect(loadAiConfig({ AI_PROVIDER: 'gemini', AI_API_KEY: 'g' })).toEqual({
      provider: 'gemini',
      apiKey: 'g',
      model: 'gemini-3.8-flash',
    });
    expect(loadAiConfig({ AI_PROVIDER: 'gemini', AI_API_KEY: 'g', AI_MODEL: 'gemini-3.5-flash-lite' })).toMatchObject({
      model: 'gemini-3.5-flash-lite',
    });
  });

  it('requires AI_API_KEY for every provider', () => {
    expect(() => loadAiConfig({})).toThrow('AI_API_KEY is required');
    expect(() => loadAiConfig({ AI_PROVIDER: 'gemini' })).toThrow('AI_API_KEY is required');
  });

  it('no longer accepts vendor-specific GEMINI_API_KEY', () => {
    expect(() => loadAiConfig({ AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'g' })).toThrow('AI_API_KEY is required');
  });

  it('rejects unknown providers and reasoning levels', () => {
    expect(() => loadAiConfig({ AI_PROVIDER: 'claude', AI_API_KEY: 'k' })).toThrow('AI_PROVIDER');
    expect(() => loadAiConfig({ AI_API_KEY: 'k', AI_REASONING_EFFORT: 'max' })).toThrow('AI_REASONING_EFFORT');
  });
});

describe('loadEnv', () => {
  it('requires BOT_TOKEN', () => {
    expect(() => loadEnv({ AI_API_KEY: 'k' })).toThrow('BOT_TOKEN is required');
    expect(loadEnv({ BOT_TOKEN: 't', AI_API_KEY: 'k' }).ai.provider).toBe('openai');
  });
});
