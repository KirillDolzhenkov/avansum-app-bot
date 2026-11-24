import { describe, expect, it } from 'vitest';
import { normalizePhone } from '../src/services/phone.service.js';

describe('normalizePhone', () => {
  it.each([
    ['+375 29 000-00-21', '+375 (29) 000-00-21'],
    ['80290000022', '+375 (29) 000-00-22'],
    ['8 029 123-45-67', '+375 (29) 123-45-67'],
    ['+375 (44) 765-43-21', '+375 (44) 765-43-21'],
    ['375251112233', '+375 (25) 111-22-33'],
    ['+375 17 222-33-44', '+375 (17) 222-33-44'],
  ])('formats %s as %s', (raw, expected) => {
    const result = normalizePhone(raw);
    expect(result).toEqual({ ok: true, e164: expect.any(String), display: expected });
  });

  it.each([
    ['+375 29 123'],
    ['8029123'],
    ['+375 99 123-45-67'],
    ['телефон'],
    ['+375 29 000-00-21-99'],
  ])('rejects %s', (raw) => {
    expect(normalizePhone(raw).ok).toBe(false);
  });

  it('keeps foreign numbers in international format', () => {
    expect(normalizePhone('+7 912 345-67-89')).toEqual({
      ok: true,
      e164: '+79123456789',
      display: '+7 912 345 67 89',
    });
  });
});
