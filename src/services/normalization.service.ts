import type { LlmDimension } from '../schemas/llm.schema.js';

type Unit = 'mm' | 'cm' | 'm';

const MM_PER_UNIT: Record<Unit, number> = { mm: 1, cm: 10, m: 1000 };

/** Anything outside this range is almost certainly a typo or a misread unit. */
const MIN_SIZE_MM = 100;
const MAX_SIZE_MM = 10_000;
const MAX_QUANTITY = 1000;

export type SizeResult =
  | { ok: true; width: number | null; height: number | null }
  | { ok: false; problem: string };

/**
 * Converts raw dimensions to millimetres. Without an explicit unit:
 * value >= 300 -> mm, 30..299 -> cm, below 30 -> ambiguous.
 * Width and height must resolve to the same unit, otherwise the pair is ambiguous ("150х2000").
 */
export function normalizeSize(width: LlmDimension | null, height: LlmDimension | null): SizeResult {
  if (width === null && height === null) return { ok: true, width: null, height: null };

  const explicitUnit = width?.unit ?? height?.unit ?? null;
  const widthUnit = width ? (width.unit ?? explicitUnit ?? guessUnit(width.value)) : null;
  const heightUnit = height ? (height.unit ?? explicitUnit ?? guessUnit(height.value)) : null;

  const describe = [width?.value, height?.value].filter((value) => value !== undefined).join(' и ');

  if ((width && !widthUnit) || (height && !heightUnit)) {
    return { ok: false, problem: `Не понял единицы измерения для «${describe}». Укажите, пожалуйста, в мм или см.` };
  }
  if (width && height && widthUnit !== heightUnit && !width.unit && !height.unit) {
    return { ok: false, problem: `Размеры «${describe}» выглядят несогласованно. Укажите, пожалуйста, ширину и высоту в мм или см.` };
  }

  const widthMm = width && widthUnit ? toMm(width.value, widthUnit) : null;
  const heightMm = height && heightUnit ? toMm(height.value, heightUnit) : null;

  for (const value of [widthMm, heightMm]) {
    if (value !== null && (value < MIN_SIZE_MM || value > MAX_SIZE_MM)) {
      return { ok: false, problem: `Размер ${value} мм выглядит нереальным. Проверьте, пожалуйста, ширину и высоту.` };
    }
  }

  return { ok: true, width: widthMm, height: heightMm };
}

function guessUnit(value: number): Unit | null {
  if (value >= 300) return 'mm';
  if (value >= 30) return 'cm';
  return null;
}

function toMm(value: number, unit: Unit): number {
  return Math.round(value * MM_PER_UNIT[unit]);
}

export type QuantityResult = { ok: true; quantity: number | null } | { ok: false; problem: string };

export function normalizeQuantity(quantity: number | null): QuantityResult {
  if (quantity === null) return { ok: true, quantity: null };
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
    return { ok: false, problem: `Количество «${quantity}» выглядит некорректным. Сколько штук нужно?` };
  }
  return { ok: true, quantity };
}

export function normalizeName(name: string | null): string | null {
  const trimmed = name?.trim();
  if (!trimmed) return null;
  return trimmed
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

export function normalizeType(type: string | null): string | null {
  const trimmed = type?.trim().toLowerCase();
  return trimmed ? trimmed : null;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email: string | null): { ok: true; email: string | null } | { ok: false; problem: string } {
  const trimmed = email?.trim().toLowerCase();
  if (!trimmed) return { ok: true, email: null };
  if (!EMAIL.test(trimmed)) return { ok: false, problem: `Email «${email}» выглядит некорректным.` };
  return { ok: true, email: trimmed };
}
