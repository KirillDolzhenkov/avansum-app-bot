import 'dotenv/config';
import { z } from 'zod';

const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';
const DEFAULT_OPENAI_BASE_URL = 'https://api.groq.com/openai/v1';
const DEFAULT_OPENAI_MODEL = 'openai/gpt-oss-120b';

/** Empty values (e.g. a blank variable in Railway) count as "not set". */
const optional = z
  .string()
  .optional()
  .transform((value) => value?.trim() || undefined);

const required = (name: string) => optional.pipe(z.string({ error: `${name} is required` }));

const GeminiConfigSchema = z
  .object({
    AI_PROVIDER: z.literal('gemini'),
    AI_API_KEY: required('AI_API_KEY'),
    AI_MODEL: optional,
  })
  .transform((env) => ({
    provider: 'gemini' as const,
    apiKey: env.AI_API_KEY,
    model: env.AI_MODEL ?? DEFAULT_GEMINI_MODEL,
  }));

const OpenAiConfigSchema = z
  .object({
    AI_PROVIDER: z.literal('openai'),
    AI_API_KEY: required('AI_API_KEY'),
    AI_BASE_URL: optional.pipe(z.url().optional()),
    AI_MODEL: optional,
    AI_REASONING_EFFORT: optional.pipe(z.enum(['low', 'medium', 'high']).optional()),
  })
  .transform((env) => ({
    provider: 'openai' as const,
    apiKey: env.AI_API_KEY,
    baseUrl: (env.AI_BASE_URL ?? DEFAULT_OPENAI_BASE_URL).replace(/\/+$/, ''),
    model: env.AI_MODEL ?? DEFAULT_OPENAI_MODEL,
    reasoningEffort: env.AI_REASONING_EFFORT ?? null,
  }));

const AiConfigSchema = z.preprocess(
  (source) => {
    const env = source as Record<string, string | undefined>;
    return { ...env, AI_PROVIDER: env.AI_PROVIDER?.trim().toLowerCase() || 'openai' };
  },
  z.discriminatedUnion('AI_PROVIDER', [GeminiConfigSchema, OpenAiConfigSchema]),
);

export type AiConfig = z.infer<typeof AiConfigSchema>;

export interface Env {
  BOT_TOKEN: string;
  ai: AiConfig;
}

function parseOrThrow<T>(schema: z.ZodType<T>, source: unknown): T {
  const result = schema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues.map((issue) => `  - ${issue.path.join('.') || 'env'}: ${issue.message}`);
    throw new Error(`Invalid environment configuration:\n${problems.join('\n')}`);
  }
  return result.data;
}

export function loadAiConfig(source: NodeJS.ProcessEnv = process.env): AiConfig {
  return parseOrThrow(AiConfigSchema, source);
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const { BOT_TOKEN } = parseOrThrow(z.object({ BOT_TOKEN: required('BOT_TOKEN') }), source);
  return { BOT_TOKEN, ai: loadAiConfig(source) };
}
