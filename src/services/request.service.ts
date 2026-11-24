import type { Extractor } from '../ai/ai.service.js';
import type { LlmExtraction } from '../schemas/llm.schema.js';
import {
  emptyDraft,
  emptyProduct,
  type Customer,
  type CustomerRequest,
  type Draft,
  type MissingField,
  type Product,
} from '../schemas/request.schema.js';
import type { ConversationService } from './conversation.service.js';
import { groundExtraction } from './grounding.service.js';
import {
  normalizeEmail,
  normalizeName,
  normalizeQuantity,
  normalizeSize,
  normalizeType,
} from './normalization.service.js';
import { normalizePhone } from './phone.service.js';
import { logger } from '../logger.js';

export type Reply =
  | { kind: 'not_request'; hadQuestion: boolean }
  | { kind: 'clarify'; request: CustomerRequest; question: string; notes: string[] }
  | { kind: 'confirm'; request: CustomerRequest; notes: string[] }
  | { kind: 'confirmed'; request: CustomerRequest }
  | { kind: 'nothing_to_confirm' }
  | { kind: 'cancelled'; hadDraft: boolean }
  | { kind: 'invalid_input'; reason: 'empty' | 'too_long' }
  | { kind: 'error' };

const MAX_MESSAGE_LENGTH = 2000;

/** Data from one message after grounding and normalization, before merging into the draft. */
interface Patch {
  products: Array<{ targetIndex: number | null; product: Product }>;
  customer: Customer;
}

export class RequestService {
  constructor(
    private readonly extractor: Extractor,
    private readonly conversations: ConversationService,
  ) {}

  async handleMessage(chatId: number, text: string): Promise<Reply> {
    const message = text.trim();
    if (!message) return { kind: 'invalid_input', reason: 'empty' };
    if (message.length > MAX_MESSAGE_LENGTH) return { kind: 'invalid_input', reason: 'too_long' };

    const session = this.conversations.get(chatId);

    let extraction: LlmExtraction;
    try {
      extraction = await this.extractor.extract(message, {
        draft: session?.draft ?? null,
        pendingQuestion: session?.pendingQuestion ?? null,
      });
    } catch (error) {
      logger.error(`AI extraction failed for chat ${chatId}`, error);
      return { kind: 'error' };
    }

    const grounded = groundExtraction(extraction, message);
    if (grounded.discarded.length > 0) {
      logger.warn(`Discarded values not found in the message: ${grounded.discarded.join(', ')}`);
    }
    const data = grounded.extraction;

    if (data.intent === 'cancel') return this.cancel(chatId);
    if (data.intent === 'confirm' && session?.state === 'awaiting_confirmation') return this.confirm(chatId);

    const notes: string[] = [];
    const patch = buildPatch(data, notes);
    const hasData = patchHasData(patch);
    const asksQuestion = data.intent === 'question' || data.customerQuestion !== null;

    if (!session) {
      const isRequest = data.intent === 'request' || data.intent === 'answer' || hasData;
      if (!isRequest) return { kind: 'not_request', hadQuestion: asksQuestion };
    }

    let draft = session ? structuredClone(session.draft) : emptyDraft();
    let pendingField = session?.pendingField ?? null;

    if (session && data.intent === 'request' && hasData && patch.products.some((p) => p.product.type !== null)) {
      draft = emptyDraft();
      pendingField = null;
      notes.push('Начинаю новую заявку вместо незавершённой. Если это дополнение — напишите /cancel и отправьте всё одним сообщением.');
    }

    if (session && !hasData && notes.length === 0) {
      notes.push('Не нашёл в сообщении данных для заявки.');
    }
    if (asksQuestion) {
      notes.push('Стоимость и детали рассчитает менеджер после оформления заявки.');
    }
    for (const ambiguity of data.ambiguities) {
      notes.push(`Неясно: ${ambiguity}`);
    }

    mergePatch(draft, patch, pendingField);
    return this.decide(chatId, draft, notes);
  }

  confirm(chatId: number): Reply {
    const session = this.conversations.get(chatId);
    if (!session) return { kind: 'nothing_to_confirm' };
    if (session.state !== 'awaiting_confirmation') {
      return this.decide(chatId, session.draft, ['Заявка ещё не заполнена.']);
    }
    const request = toCustomerRequest(session.draft, []);
    logger.info(`Request confirmed in chat ${chatId}`, request);
    this.conversations.delete(chatId);
    return { kind: 'confirmed', request };
  }

  cancel(chatId: number): Reply {
    return { kind: 'cancelled', hadDraft: this.conversations.delete(chatId) };
  }

  private decide(chatId: number, draft: Draft, notes: string[]): Reply {
    const missing = findMissing(draft);
    const request = toCustomerRequest(draft, missing);
    const [next] = missing;

    if (!next) {
      this.conversations.save(chatId, { state: 'awaiting_confirmation', draft, pendingQuestion: null, pendingField: null });
      return { kind: 'confirm', request, notes };
    }

    const question = questionFor(next, draft);
    this.conversations.save(chatId, { state: 'collecting', draft, pendingQuestion: question, pendingField: next });
    return { kind: 'clarify', request, question, notes };
  }
}

function buildPatch(data: LlmExtraction, notes: string[]): Patch {
  const products = data.products.map(({ targetIndex, type, width, height, quantity }) => {
    const product = emptyProduct();
    product.type = normalizeType(type);

    const size = normalizeSize(width, height);
    if (size.ok) {
      product.width = size.width;
      product.height = size.height;
    } else {
      notes.push(size.problem);
    }

    const qty = normalizeQuantity(quantity);
    if (qty.ok) product.quantity = qty.quantity;
    else notes.push(qty.problem);

    return { targetIndex, product };
  });

  const customer: Customer = { name: normalizeName(data.customer.name), phone: null, email: null };

  if (data.customer.phoneRaw) {
    const phone = normalizePhone(data.customer.phoneRaw);
    if (phone.ok) customer.phone = phone.display;
    else notes.push(`Телефон «${data.customer.phoneRaw}» выглядит некорректным. Проверьте, пожалуйста, номер.`);
  }

  const email = normalizeEmail(data.customer.email);
  if (email.ok) customer.email = email.email;
  else notes.push(email.problem);

  return { products, customer };
}

function productHasData(product: Product): boolean {
  return Object.values(product).some((value) => value !== null);
}

function patchHasData(patch: Patch): boolean {
  return patch.products.some((p) => productHasData(p.product)) || Object.values(patch.customer).some((v) => v !== null);
}

function assignDefined<T extends object>(target: T, source: T): void {
  for (const key of Object.keys(source) as Array<keyof T>) {
    if (source[key] !== null) target[key] = source[key];
  }
}

/** Every value in the patch is grounded in the latest message, so non-null values may overwrite the draft. */
export function mergePatch(draft: Draft, patch: Patch, pendingField: MissingField | null): void {
  for (const { targetIndex, product } of patch.products) {
    if (!productHasData(product)) continue;
    const index = resolveTarget(draft, targetIndex, product, pendingField);
    const target = index === null ? undefined : draft.products[index];
    if (target) assignDefined(target, product);
    else draft.products.push({ ...product });
  }
  assignDefined(draft.customer, patch.customer);
}

function resolveTarget(
  draft: Draft,
  targetIndex: number | null,
  product: Product,
  pendingField: MissingField | null,
): number | null {
  if (targetIndex !== null && draft.products[targetIndex]) return targetIndex;
  if (draft.products.length === 0) return null;

  const pendingIndex = pendingField && 'productIndex' in pendingField ? pendingField.productIndex : null;
  const pending = pendingIndex === null ? undefined : draft.products[pendingIndex];

  if (product.type === null) {
    if (pendingIndex !== null && pending) return pendingIndex;
    return draft.products.length === 1 ? 0 : null;
  }

  // A typed product goes into the asked-about product only if it fills gaps there,
  // otherwise it is a new line ("и ещё окно 600х800").
  if (pendingIndex !== null && pending && (pending.type === null || pending.type === product.type)) {
    const fillsOnlyGaps = (Object.keys(product) as Array<keyof Product>).every(
      (key) => product[key] === null || pending[key] === null || (key === 'type' && pending.type === product.type),
    );
    if (fillsOnlyGaps) return pendingIndex;
  }
  return null;
}

export function findMissing(draft: Draft): MissingField[] {
  const missing: MissingField[] = [];
  if (draft.products.length === 0) missing.push({ kind: 'products' });

  draft.products.forEach((product, productIndex) => {
    if (product.type === null) missing.push({ kind: 'type', productIndex });
    if (product.width === null || product.height === null) {
      missing.push({ kind: 'size', productIndex, width: product.width === null, height: product.height === null });
    }
    if (product.quantity === null) missing.push({ kind: 'quantity', productIndex });
  });

  if (draft.customer.phone === null && draft.customer.email === null) missing.push({ kind: 'contact' });
  return missing;
}

function missingPaths(field: MissingField): string[] {
  switch (field.kind) {
    case 'products':
      return ['products'];
    case 'type':
    case 'quantity':
      return [`products.${field.productIndex}.${field.kind}`];
    case 'size':
      return [
        ...(field.width ? [`products.${field.productIndex}.width`] : []),
        ...(field.height ? [`products.${field.productIndex}.height`] : []),
      ];
    case 'contact':
      return ['customer.contact'];
  }
}

function toCustomerRequest(draft: Draft, missing: MissingField[]): CustomerRequest {
  return {
    isRequest: true,
    products: draft.products,
    customer: draft.customer,
    missingFields: missing.flatMap(missingPaths),
  };
}

function productLabel(draft: Draft, index: number): string {
  const product = draft.products[index];
  const numbered = draft.products.length > 1 ? ` №${index + 1}` : '';
  return product?.type ? `${product.type}${numbered}` : `изделие${numbered || ` №${index + 1}`}`;
}

export function questionFor(field: MissingField, draft: Draft): string {
  switch (field.kind) {
    case 'products':
      return 'Какие изделия вам нужны? Укажите тип (окно, дверь, стеклопакет…), размеры и количество.';
    case 'type':
      return `Уточните тип: ${productLabel(draft, field.productIndex)} — это окно, дверь, стеклопакет или что-то другое?`;
    case 'size': {
      const label = productLabel(draft, field.productIndex);
      if (field.width && field.height) {
        return `Укажите ширину и высоту (${label}). Можно в сантиметрах или миллиметрах.`;
      }
      return `Укажите ${field.width ? 'ширину' : 'высоту'} (${label}).`;
    }
    case 'quantity':
      return `Сколько штук нужно (${productLabel(draft, field.productIndex)})?`;
    case 'contact':
      return draft.customer.name === null
        ? 'Как к вам обращаться? Оставьте, пожалуйста, телефон или email для связи.'
        : 'Оставьте, пожалуйста, телефон или email для связи.';
  }
}
