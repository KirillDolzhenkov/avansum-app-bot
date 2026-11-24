import { describe, expect, it } from 'vitest';
import { normalizeEmail, normalizeName, normalizeQuantity, normalizeSize } from '../src/services/normalization.service.js';
import { dim } from './helpers.js';

describe('normalizeSize', () => {
  it.each([
    ['mm explicit', dim(1000, 'mm'), dim(1200, 'mm'), 1000, 1200],
    ['cm explicit', dim(70, 'cm'), dim(210, 'cm'), 700, 2100],
    ['m explicit', dim(1, 'm'), dim(1.5, 'm'), 1000, 1500],
    ['unit on one side applies to both', dim(70), dim(210, 'cm'), 700, 2100],
    ['no unit, large numbers -> mm', dim(1000), dim(1200), 1000, 1200],
    ['no unit, medium numbers -> cm', dim(70), dim(210), 700, 2100],
  ])('%s', (_label, width, height, expectedWidth, expectedHeight) => {
    expect(normalizeSize(width, height)).toEqual({ ok: true, width: expectedWidth, height: expectedHeight });
  });

  it('keeps a single dimension', () => {
    expect(normalizeSize(dim(900), null)).toEqual({ ok: true, width: 900, height: null });
  });

  it.each([
    ['mixed guesses', dim(150), dim(2000)],
    ['too small to guess', dim(1.2), dim(1.4)],
    ['unrealistic', dim(5, 'mm'), dim(10, 'mm')],
    ['too big', dim(50, 'm'), dim(2, 'm')],
  ])('rejects %s', (_label, width, height) => {
    expect(normalizeSize(width, height).ok).toBe(false);
  });
});

describe('other normalizers', () => {
  it('quantity must be a positive integer', () => {
    expect(normalizeQuantity(2)).toEqual({ ok: true, quantity: 2 });
    expect(normalizeQuantity(null)).toEqual({ ok: true, quantity: null });
    expect(normalizeQuantity(0).ok).toBe(false);
    expect(normalizeQuantity(5000).ok).toBe(false);
  });

  it('capitalizes names', () => {
    expect(normalizeName('анна')).toBe('Анна');
    expect(normalizeName('иванов ПЁТР')).toBe('Иванов Пётр');
    expect(normalizeName('  ')).toBeNull();
  });

  it('validates email', () => {
    expect(normalizeEmail('Ivan@Mail.by')).toEqual({ ok: true, email: 'ivan@mail.by' });
    expect(normalizeEmail('ivan@').ok).toBe(false);
  });
});
