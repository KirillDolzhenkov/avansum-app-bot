import { z } from 'zod';

/**
 * What the LLM is allowed to return. Values are raw, exactly as written by the
 * customer: no unit conversion, no phone formatting. All interpretation happens
 * in application code.
 */

export const LlmDimensionSchema = z.object({
  value: z.number().describe('Number exactly as written by the customer, not converted'),
  unit: z
    .enum(['mm', 'cm', 'm'])
    .nullable()
    .describe('Unit only if the customer stated it explicitly, otherwise null'),
  raw: z.string().describe('Fragment of the message this value was taken from'),
});

export const LlmProductSchema = z.object({
  targetIndex: z
    .number()
    .int()
    .nullable()
    .describe('Index of the draft product this data refers to, or null for a new product'),
  type: z.string().nullable().describe('Product type in Russian, nominative case, lowercase'),
  width: LlmDimensionSchema.nullable(),
  height: LlmDimensionSchema.nullable(),
  quantity: z.number().int().nullable(),
  quantityRaw: z.string().nullable().describe('Fragment of the message the quantity was taken from'),
});

export const LlmIntentSchema = z.enum(['request', 'answer', 'confirm', 'cancel', 'question', 'other']);

export const LlmExtractionSchema = z.object({
  intent: LlmIntentSchema,
  products: z.array(LlmProductSchema),
  customer: z.object({
    name: z.string().nullable(),
    phoneRaw: z.string().nullable().describe('Phone exactly as written, without reformatting'),
    email: z.string().nullable(),
  }),
  customerQuestion: z.string().nullable().describe('A question the customer asked, e.g. about price'),
  ambiguities: z.array(z.string()).describe('Short Russian descriptions of what is unclear'),
});

export type LlmDimension = z.infer<typeof LlmDimensionSchema>;
export type LlmProduct = z.infer<typeof LlmProductSchema>;
export type LlmIntent = z.infer<typeof LlmIntentSchema>;
export type LlmExtraction = z.infer<typeof LlmExtractionSchema>;
