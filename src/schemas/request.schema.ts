import { z } from 'zod';

/** Domain model: what the application considers a customer request. Sizes are in millimetres. */

export const ProductSchema = z.object({
  type: z.string().nullable(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  quantity: z.number().int().positive().nullable(),
});

export const CustomerSchema = z.object({
  name: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
});

export const CustomerRequestSchema = z.object({
  isRequest: z.boolean(),
  products: z.array(ProductSchema),
  customer: CustomerSchema,
  missingFields: z.array(z.string()),
});

export type Product = z.infer<typeof ProductSchema>;
export type Customer = z.infer<typeof CustomerSchema>;
export type CustomerRequest = z.infer<typeof CustomerRequestSchema>;

/** Request being assembled across several messages. */
export interface Draft {
  products: Product[];
  customer: Customer;
}

export type MissingField =
  | { kind: 'products' }
  | { kind: 'type'; productIndex: number }
  | { kind: 'size'; productIndex: number; width: boolean; height: boolean }
  | { kind: 'quantity'; productIndex: number }
  | { kind: 'contact' };

export type SessionState = 'collecting' | 'awaiting_confirmation';

export interface Session {
  state: SessionState;
  draft: Draft;
  /** Question the bot asked last; helps the LLM interpret short answers like "два". */
  pendingQuestion: string | null;
  pendingField: MissingField | null;
  updatedAt: number;
}

export function emptyDraft(): Draft {
  return { products: [], customer: { name: null, phone: null, email: null } };
}

export function emptyProduct(): Product {
  return { type: null, width: null, height: null, quantity: null };
}
