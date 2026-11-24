/**
 * Minimal contract an LLM vendor has to fulfil. Swapping Gemini for another
 * provider means writing one more class implementing this interface.
 */
export interface AiProvider {
  generateJson(request: AiJsonRequest): Promise<string>;
}

export interface AiJsonRequest {
  systemPrompt: string;
  userPrompt: string;
  jsonSchema: unknown;
  signal: AbortSignal;
}

export type AiErrorKind = 'timeout' | 'api' | 'invalid_response';

export class AiError extends Error {
  constructor(
    readonly kind: AiErrorKind,
    message: string,
    readonly retryable: boolean,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'AiError';
  }
}
