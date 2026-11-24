import { ApiError, GoogleGenAI } from '@google/genai';
import { AiError, type AiJsonRequest, type AiProvider } from './ai.provider.js';

export class GeminiProvider implements AiProvider {
  private readonly client: GoogleGenAI;

  constructor(
    apiKey: string,
    private readonly model: string,
  ) {
    this.client = new GoogleGenAI({ apiKey });
  }

  async generateJson({ systemPrompt, userPrompt, jsonSchema, signal }: AiJsonRequest): Promise<string> {
    try {
      const response = await this.client.models.generateContent({
        model: this.model,
        contents: userPrompt,
        config: {
          systemInstruction: systemPrompt,
          temperature: 0,
          responseMimeType: 'application/json',
          responseJsonSchema: jsonSchema,
          abortSignal: signal,
        },
      });
      const text = response.text;
      if (!text) {
        throw new AiError('invalid_response', 'Gemini returned an empty response', true);
      }
      return text;
    } catch (error) {
      if (error instanceof AiError) throw error;
      if (signal.aborted) {
        throw new AiError('timeout', 'Gemini request timed out', true, { cause: error });
      }
      if (error instanceof ApiError) {
        if (error.status === 429) {
          throw new AiError('rate_limit', `Gemini rate limit exceeded: ${error.message}`, false, { cause: error });
        }
        throw new AiError('api', `Gemini API error ${error.status}: ${error.message}`, error.status >= 500, {
          cause: error,
        });
      }
      throw new AiError('api', 'Gemini request failed', true, { cause: error });
    }
  }
}
