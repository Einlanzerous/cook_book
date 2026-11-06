import { describe, it, expect } from 'vitest';
import { deriveQuantity, normalizeAmount, prepareIngredient } from '../src/services/quantity.js';

describe('deriveQuantity (criterion 4)', () => {
  it.each([
    ['2', 2],
    ['10', 10],
    ['1.5', 1.5],
    ['.5', 0.5],
    ['1/4', 0.25],
    ['3/4', 0.75],
    ['1 1/2', 1.5],
    ['2 3/4', 2.75],
    ['½', 0.5],
    ['¾', 0.75],
    ['⅓', 1 / 3],
    ['1½', 1.5],
    ['2¼', 2.25],
    ['1 ½', 1.5],
    [' 3 ', 3],
    [2, 2]
  ])('%j -> %j', (amount, expected) => {
    expect(deriveQuantity(amount)).toBeCloseTo(expected, 12);
  });

  it('keeps 1/3 as a float near 0.3333, unrounded', () => {
    const q = deriveQuantity('1/3');
    expect(q).toBeCloseTo(0.3333, 4);
    expect(q).toBe(1 / 3);
    expect(q).not.toBe(0.3333);
  });

  it.each([
    ['2-3'], ['2 - 3'], ['2 to 3'], ['a pinch'], ['pinch'], ['to taste'],
    ['1 thumb'], ['2 cloves'], ['1/0'], [''], ['   '], [null], [undefined], ['abc'], [NaN]
  ])('%j -> null (range, word, thumb-style, blank, null)', (amount) => {
    expect(deriveQuantity(amount)).toBeNull();
  });
});

describe('normalizeAmount', () => {
  it('inserts a separator so 1½ is "1 1/2", not "11/2"', () => {
    expect(normalizeAmount('1½')).toBe('1 1/2');
    expect(normalizeAmount('½')).toBe('1/2');
    expect(normalizeAmount('2 ¾')).toBe('2 3/4');
    expect(normalizeAmount('⅕')).toBe('1/5');
  });
  it('passes null through', () => {
    expect(normalizeAmount(null)).toBeNull();
  });
});

describe('prepareIngredient precedence', () => {
  it('derives quantity from amount and keeps the amount text (normalised)', () => {
    expect(prepareIngredient({ name: 'rice', amount: '1½', unit: 'cups' }))
      .toEqual({ name: 'rice', amount: '1 1/2', unit: 'cups', quantity: 1.5 });
  });
  it('derives from amount even when the client also sent a different quantity', () => {
    expect(prepareIngredient({ name: 'x', amount: '2', quantity: 9 }).quantity).toBe(2);
  });
  it('an unparseable amount wins over a sent quantity: NULL, text kept', () => {
    const r = prepareIngredient({ name: 'ginger', amount: '1 thumb', quantity: 1 });
    expect(r.quantity).toBeNull();
    expect(r.amount).toBe('1 thumb');
  });
  it('stores a finite quantity as sent only when amount is absent', () => {
    expect(prepareIngredient({ name: 'x', quantity: 2.5 }).quantity).toBe(2.5);
    expect(prepareIngredient({ name: 'x', amount: null, quantity: 2.5 }).quantity).toBe(2.5);
    expect(prepareIngredient({ name: 'x', amount: '', quantity: 2.5 }).quantity).toBe(2.5);
    expect(prepareIngredient({ name: 'x', quantity: Infinity }).quantity).toBeNull();
    expect(prepareIngredient({ name: 'x', quantity: '2' }).quantity).toBeNull();
  });
  it('null amount gives NULL quantity', () => {
    expect(prepareIngredient({ name: 'salt', amount: null, unit: null }))
      .toEqual({ name: 'salt', amount: null, unit: null, quantity: null });
  });
  it('accepts a numeric amount', () => {
    expect(prepareIngredient({ name: 'x', amount: 3 })).toMatchObject({ amount: '3', quantity: 3 });
  });
});
