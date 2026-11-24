import type { LlmDimension, LlmExtraction, LlmProduct } from '../schemas/llm.schema.js';

/**
 * Drops every value the LLM returned that cannot be found in the customer's
 * message. This is the main protection against hallucinated data: Zod checks
 * the shape of the answer, grounding checks that the content is real.
 */

const NUMBER_WORDS: Record<string, number> = {
  один: 1, одна: 1, одно: 1, одну: 1, одного: 1, одной: 1, метр: 1, метра: 1,
  два: 2, две: 2, пара: 2, пару: 2,
  три: 3, четыре: 4, пять: 5, шесть: 6, семь: 7, восемь: 8, девять: 9, десять: 10,
  полтора: 1.5, полторы: 1.5,
  пол: 0.5, полметра: 0.5,
};

const PHONE_LIKE = /\+?\d[\d\s\-()]{7,}\d/g;

export interface GroundingResult {
  extraction: LlmExtraction;
  /** Human-readable descriptions of discarded values, for logs. */
  discarded: string[];
}

export function groundExtraction(extraction: LlmExtraction, message: string): GroundingResult {
  const discarded: string[] = [];
  const text = message.toLowerCase();
  const numbers = collectNumbers(text);

  const products = extraction.products.map((product) => groundProduct(product, text, numbers, discarded));

  const { name, phoneRaw, email } = extraction.customer;
  const customer = {
    name: keepIf(name, (value) => isNameInText(value, text), 'name', discarded),
    phoneRaw: keepIf(phoneRaw, (value) => isPhoneInText(value, message), 'phone', discarded),
    email: keepIf(email, (value) => text.includes(value.toLowerCase()), 'email', discarded),
  };

  return { extraction: { ...extraction, products, customer }, discarded };
}

function groundProduct(product: LlmProduct, text: string, numbers: Set<number>, discarded: string[]): LlmProduct {
  return {
    ...product,
    type: keepIf(product.type, (value) => isTypeInText(value, text), 'type', discarded),
    width: groundDimension(product.width, numbers, 'width', discarded),
    height: groundDimension(product.height, numbers, 'height', discarded),
    quantity: keepIf(product.quantity, (value) => numbers.has(value), 'quantity', discarded),
  };
}

function groundDimension(
  dimension: LlmDimension | null,
  numbers: Set<number>,
  label: string,
  discarded: string[],
): LlmDimension | null {
  if (dimension === null) return null;
  if (numbers.has(dimension.value)) return dimension;
  discarded.push(`${label}=${dimension.value}`);
  return null;
}

function keepIf<T>(value: T | null, isGrounded: (value: T) => boolean, label: string, discarded: string[]): T | null {
  if (value === null) return null;
  if (isGrounded(value)) return value;
  discarded.push(`${label}=${String(value)}`);
  return null;
}

/** All numbers mentioned in the text, digits and words. Phone numbers are excluded so their digits don't pass as sizes. */
export function collectNumbers(text: string): Set<number> {
  const result = new Set<number>();
  const withoutPhones = text.replace(PHONE_LIKE, (match) => (match.replace(/\D/g, '').length >= 9 ? ' ' : match));
  for (const match of withoutPhones.matchAll(/\d+(?:[.,]\d+)?/g)) {
    result.add(Number(match[0].replace(',', '.')));
  }
  for (const match of withoutPhones.matchAll(/\d+/g)) {
    result.add(Number(match[0]));
  }
  for (const word of words(withoutPhones)) {
    const value = NUMBER_WORDS[word];
    if (value !== undefined) result.add(value);
  }
  return result;
}

function words(text: string): string[] {
  return text.split(/[^\p{L}]+/u).filter(Boolean);
}

/** Russian words change endings ("окно" / "окна" / "окон"), so we compare stems. */
function stem(word: string): string {
  return word.length <= 4 ? word.slice(0, 3) : word.slice(0, word.length - 2);
}

function isTypeInText(type: string, text: string): boolean {
  const typeWords = words(type.toLowerCase()).filter((word) => word.length >= 3);
  if (typeWords.length === 0) return false;
  const textWords = words(text);
  return typeWords.every((typeWord) => textWords.some((textWord) => textWord.startsWith(stem(typeWord))));
}

function isNameInText(name: string, text: string): boolean {
  const nameWords = words(name.toLowerCase());
  if (nameWords.length === 0) return false;
  const textWords = words(text);
  return nameWords.every((nameWord) => textWords.some((textWord) => textWord.startsWith(stem(nameWord))));
}

function isPhoneInText(phone: string, message: string): boolean {
  const phoneDigits = phone.replace(/\D/g, '');
  return phoneDigits.length > 0 && message.replace(/\D/g, '').includes(phoneDigits);
}
