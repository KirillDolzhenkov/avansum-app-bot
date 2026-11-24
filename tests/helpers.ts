import type { Extractor } from '../src/ai/ai.service.js';
import type { ParseRequestContext } from '../src/ai/prompts/parse-request.prompt.js';
import type { LlmDimension, LlmExtraction, LlmProduct } from '../src/schemas/llm.schema.js';

export function dim(value: number, unit: LlmDimension['unit'] = null): LlmDimension {
  return { value, unit, raw: String(value) };
}

export function product(partial: Partial<LlmProduct>): LlmProduct {
  return { targetIndex: null, type: null, width: null, height: null, quantity: null, quantityRaw: null, ...partial };
}

export function extraction(partial: Partial<Omit<LlmExtraction, 'customer'>> & { customer?: Partial<LlmExtraction['customer']> }): LlmExtraction {
  return {
    intent: 'request',
    products: [],
    customerQuestion: null,
    ambiguities: [],
    ...partial,
    customer: { name: null, phoneRaw: null, email: null, ...partial.customer },
  };
}

/** Returns a prepared LLM answer for each known message, like a perfectly predictable model. */
export class FakeExtractor implements Extractor {
  readonly calls: Array<{ message: string; context: ParseRequestContext }> = [];

  constructor(private readonly answers: Record<string, LlmExtraction | Error>) {}

  async extract(message: string, context: ParseRequestContext): Promise<LlmExtraction> {
    this.calls.push({ message, context });
    const answer = this.answers[message];
    if (answer === undefined) throw new Error(`No fake answer for message: ${message}`);
    if (answer instanceof Error) throw answer;
    return answer;
  }
}
