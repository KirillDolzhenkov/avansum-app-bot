import { describe, expect, it } from 'vitest';
import { collectNumbers, groundExtraction } from '../src/services/grounding.service.js';
import { dim, extraction, product } from './helpers.js';

describe('collectNumbers', () => {
  it('finds digits, decimals and number words', () => {
    const numbers = collectNumbers('окно метр на полтора, две штуки, 1,5 м и 1000х1200');
    for (const value of [1, 1.5, 2, 1000, 1200]) expect(numbers.has(value)).toBe(true);
  });

  it('ignores digits inside phone numbers', () => {
    const numbers = collectNumbers('окно, тел +375 29 000-00-21');
    expect(numbers.has(21)).toBe(false);
    expect(numbers.has(29)).toBe(false);
  });

  it('does not read "сантиметров" as "метр"', () => {
    expect(collectNumbers('70 сантиметров').has(1)).toBe(false);
  });
});

describe('groundExtraction', () => {
  it('keeps values present in the message, including inflected words', () => {
    const msg = 'Нужно два окна 1000х1200, звонить Павлу +375 29 000-00-21, pavel@mail.by';
    const result = groundExtraction(
      extraction({
        products: [product({ type: 'окно', width: dim(1000), height: dim(1200), quantity: 2 })],
        customer: { name: 'Павел', phoneRaw: '+375 29 000-00-21', email: 'pavel@mail.by' },
      }),
      msg,
    );
    expect(result.discarded).toEqual([]);
  });

  it('discards everything that is not in the message', () => {
    const result = groundExtraction(
      extraction({
        products: [product({ type: 'окно пластиковое', width: dim(700), height: dim(2100), quantity: 1 })],
        customer: { name: 'Иван', phoneRaw: '+375291112233', email: 'a@b.by' },
      }),
      'окно 70 на 210 см',
    );
    expect(result.extraction.products[0]).toMatchObject({ type: null, width: null, height: null, quantity: null });
    expect(result.extraction.customer).toEqual({ name: null, phoneRaw: null, email: null });
  });
});
