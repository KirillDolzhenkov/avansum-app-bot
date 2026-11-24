import type { AiConfig } from '../config/env.js';
import type { AiProvider } from './ai.provider.js';
import { GeminiProvider } from './gemini.provider.js';
import { OpenAiCompatibleProvider } from './openai-compatible.provider.js';

export function createProvider(config: AiConfig): AiProvider {
  switch (config.provider) {
    case 'gemini':
      return new GeminiProvider(config.apiKey, config.model);
    case 'openai':
      return new OpenAiCompatibleProvider(config);
  }
}
