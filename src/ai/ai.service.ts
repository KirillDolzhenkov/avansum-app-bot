import { z } from 'zod';
import { AiError, type AiProvider } from './ai.provider.js';
import { LlmExtractionSchema, type LlmExtraction } from '../schemas/llm.schema.js';
import {
  PARSE_REQUEST_SYSTEM_PROMPT,
  buildParseRequestUserPrompt,
  type ParseRequestContext,
} from './prompts/parse-request.prompt.js';
import { logger } from '../logger.js';

/** What the business logic depends on. Tests replace it with a fake. */
export interface Extractor {
  extract(message: string, context: ParseRequestContext): Promise<LlmExtraction>;
}

/**
 * Zod adds `minimum/maximum: ±Number.MAX_SAFE_INTEGER` to every `.int()`.
 * Strict structured-output modes may reject such bounds, and they carry no meaning, so we drop them.
 */
export function toProviderSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(toProviderSchema);
  if (schema === null || typeof schema !== 'object') return schema;

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === '$schema') continue;
    if ((key === 'minimum' || key === 'maximum') && Math.abs(Number(value)) === Number.MAX_SAFE_INTEGER) continue;
    result[key] = toProviderSchema(value);
  }
  return result;
}

const extractionJsonSchema = toProviderSchema(z.toJSONSchema(LlmExtractionSchema, { target: 'draft-07' }));

export class AiService implements Extractor {
  constructor(
    private readonly provider: AiProvider,
    private readonly timeoutMs = 20_000,
    private readonly maxAttempts = 2,
  ) {}

  async extract(message: string, context: ParseRequestContext): Promise<LlmExtraction> {
    const userPrompt = buildParseRequestUserPrompt(message, context);
    let lastError: AiError | undefined;

    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      try {
        const raw = await this.provider.generateJson({
          systemPrompt: PARSE_REQUEST_SYSTEM_PROMPT,
          userPrompt,
          jsonSchema: extractionJsonSchema,
          signal: AbortSignal.timeout(this.timeoutMs),
        });
        return parseExtraction(raw);
      } catch (error) {
        lastError = error instanceof AiError ? error : new AiError('api', 'Unexpected AI failure', true, { cause: error });
        logger.warn(`AI attempt ${attempt}/${this.maxAttempts} failed: ${lastError.kind} — ${lastError.message}`);
        if (!lastError.retryable) break;
      }
    }
    throw lastError ?? new AiError('api', 'AI extraction failed', false);
  }
}

export function parseExtraction(raw: string): LlmExtraction {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (error) {
    throw new AiError('invalid_response', 'Model returned invalid JSON', true, { cause: error });
  }
  const result = LlmExtractionSchema.safeParse(json);
  if (!result.success) {
    throw new AiError('invalid_response', `Model response failed validation: ${z.prettifyError(result.error)}`, true);
  }
  return result.data;
}
