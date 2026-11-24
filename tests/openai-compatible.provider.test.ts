import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenAiCompatibleProvider, type OpenAiCompatibleOptions } from '../src/ai/openai-compatible.provider.js';
import { AiError, type AiJsonRequest } from '../src/ai/ai.provider.js';

const options: OpenAiCompatibleOptions = {
  baseUrl: 'https://api.groq.com/openai/v1',
  apiKey: 'test-key',
  model: 'openai/gpt-oss-120b',
  reasoningEffort: 'low',
};

function request(signal: AbortSignal = new AbortController().signal): AiJsonRequest {
  return { systemPrompt: 'system', userPrompt: 'user', jsonSchema: { type: 'object' }, signal };
}

function mockFetch(response: Response | Error) {
  const fetchMock = vi.fn(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const ok = (content: string | null) => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });

async function captureError(promise: Promise<unknown>): Promise<AiError> {
  const error = await promise.then(
    () => null,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(AiError);
  return error as AiError;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('OpenAiCompatibleProvider', () => {
  it('sends a strict json_schema request and returns the message content', async () => {
    const fetchMock = mockFetch(ok('{"intent":"other"}'));

    const result = await new OpenAiCompatibleProvider(options).generateJson(request());

    expect(result).toBe('{"intent":"other"}');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer test-key' });
    expect(JSON.parse(String(init.body))).toEqual({
      model: 'openai/gpt-oss-120b',
      temperature: 0,
      messages: [
        { role: 'system', content: 'system' },
        { role: 'user', content: 'user' },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'customer_request', strict: true, schema: { type: 'object' } },
      },
      reasoning_effort: 'low',
    });
  });

  it('omits reasoning_effort when it is not configured', async () => {
    const fetchMock = mockFetch(ok('{}'));
    await new OpenAiCompatibleProvider({ ...options, reasoningEffort: null }).generateJson(request());
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).not.toHaveProperty('reasoning_effort');
  });

  it('treats 429 as a non-retryable rate limit', async () => {
    mockFetch(new Response('{"error":{"message":"Rate limit reached"}}', { status: 429 }));
    const error = await captureError(new OpenAiCompatibleProvider(options).generateJson(request()));
    expect(error).toMatchObject({ kind: 'rate_limit', retryable: false });
  });

  it('treats 5xx as retryable and 4xx as final', async () => {
    mockFetch(new Response('upstream error', { status: 503 }));
    expect(await captureError(new OpenAiCompatibleProvider(options).generateJson(request()))).toMatchObject({
      kind: 'api',
      retryable: true,
    });

    mockFetch(new Response('invalid api key', { status: 401 }));
    expect(await captureError(new OpenAiCompatibleProvider(options).generateJson(request()))).toMatchObject({
      kind: 'api',
      retryable: false,
    });
  });

  it('reports an empty answer as an invalid response', async () => {
    mockFetch(ok(null));
    const error = await captureError(new OpenAiCompatibleProvider(options).generateJson(request()));
    expect(error.kind).toBe('invalid_response');
  });

  it('reports an aborted request as a timeout', async () => {
    const controller = new AbortController();
    controller.abort();
    mockFetch(new DOMException('aborted', 'AbortError'));
    const error = await captureError(new OpenAiCompatibleProvider(options).generateJson(request(controller.signal)));
    expect(error.kind).toBe('timeout');
  });
});
