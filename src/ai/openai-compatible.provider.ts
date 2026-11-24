import { AiError, type AiJsonRequest, type AiProvider } from './ai.provider.js';

export interface OpenAiCompatibleOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  reasoningEffort: 'low' | 'medium' | 'high' | null;
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string | null } }>;
}

/**
 * Any OpenAI-compatible Chat Completions API: Groq, Cerebras, Mistral,
 * OpenRouter, Ollama. Uses plain fetch, so no vendor SDK is needed.
 */
export class OpenAiCompatibleProvider implements AiProvider {
  constructor(private readonly options: OpenAiCompatibleOptions) {}

  async generateJson({ systemPrompt, userPrompt, jsonSchema, signal }: AiJsonRequest): Promise<string> {
    const { baseUrl, apiKey, model, reasoningEffort } = this.options;
    const body = {
      model,
      temperature: 0,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'customer_request', strict: true, schema: jsonSchema },
      },
      ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
    };

    let response: Response;
    try {
      response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
        signal,
      });
    } catch (error) {
      if (signal.aborted) throw new AiError('timeout', 'AI request timed out', true, { cause: error });
      throw new AiError('api', 'AI request failed', true, { cause: error });
    }

    if (!response.ok) {
      const details = (await response.text().catch(() => '')).slice(0, 1000);
      if (response.status === 429) {
        throw new AiError('rate_limit', `AI rate limit exceeded: ${details}`, false);
      }
      throw new AiError('api', `AI API error ${response.status}: ${details}`, response.status >= 500);
    }

    let data: ChatCompletionResponse;
    try {
      data = (await response.json()) as ChatCompletionResponse;
    } catch (error) {
      throw new AiError('invalid_response', 'AI API returned a non-JSON body', true, { cause: error });
    }
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new AiError('invalid_response', 'AI API returned an empty response', true);
    return content;
  }
}
