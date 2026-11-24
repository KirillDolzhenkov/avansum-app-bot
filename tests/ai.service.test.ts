import { describe, expect, it } from 'vitest';
import { AiService, parseExtraction } from '../src/ai/ai.service.js';
import { AiError, type AiJsonRequest, type AiProvider } from '../src/ai/ai.provider.js';
import { extraction } from './helpers.js';

class ScriptedProvider implements AiProvider {
  readonly requests: AiJsonRequest[] = [];
  constructor(private readonly responses: Array<string | AiError>) {}

  async generateJson(request: AiJsonRequest): Promise<string> {
    this.requests.push(request);
    const next = this.responses.shift();
    if (next === undefined) throw new Error('No more scripted responses');
    if (next instanceof AiError) throw next;
    return next;
  }
}

const valid = JSON.stringify(extraction({ intent: 'other' }));

describe('AiService', () => {
  it('returns a validated extraction and sends the JSON schema', async () => {
    const provider = new ScriptedProvider([valid]);
    const result = await new AiService(provider).extract('привет', { draft: null, pendingQuestion: null });
    expect(result.intent).toBe('other');
    expect(provider.requests[0]?.jsonSchema).toMatchObject({ type: 'object' });
    expect(provider.requests[0]?.userPrompt).toContain('привет');
  });

  it('does not retry when the quota is exhausted', async () => {
    const provider = new ScriptedProvider([new AiError('rate_limit', 'quota', false), valid]);
    await expect(new AiService(provider).extract('x', { draft: null, pendingQuestion: null })).rejects.toMatchObject({
      kind: 'rate_limit',
    });
    expect(provider.requests).toHaveLength(1);
  });

  it('retries once after invalid JSON', async () => {
    const provider = new ScriptedProvider(['not json', valid]);
    const result = await new AiService(provider).extract('привет', { draft: null, pendingQuestion: null });
    expect(result.intent).toBe('other');
    expect(provider.requests).toHaveLength(2);
  });

  it('gives up after the second failure', async () => {
    const provider = new ScriptedProvider(['{}', '{}']);
    await expect(new AiService(provider).extract('x', { draft: null, pendingQuestion: null })).rejects.toMatchObject({
      kind: 'invalid_response',
    });
  });

  it('does not retry non-retryable API errors', async () => {
    const provider = new ScriptedProvider([new AiError('api', 'Gemini API error 403', false), valid]);
    await expect(new AiService(provider).extract('x', { draft: null, pendingQuestion: null })).rejects.toMatchObject({
      kind: 'api',
    });
    expect(provider.requests).toHaveLength(1);
  });
});

describe('parseExtraction', () => {
  it('rejects responses that do not match the schema', () => {
    expect(() => parseExtraction(JSON.stringify({ intent: 'buy', products: [] }))).toThrow(AiError);
  });
});
