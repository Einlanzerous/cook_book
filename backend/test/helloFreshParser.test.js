/**
 * COOK-27: the HelloFresh parser reads the whole leading quantity token, then
 * the unit, then the name. Fixtures are the real corrupt strings from the
 * 2026-11-06 prod survey (what the importer should have received). No network.
 */
import fs from 'node:fs';
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('axios', () => ({ default: { get: vi.fn() } }));
import axios from 'axios';
import { parseHelloFreshUrl, parseIngredientString, cleanDirection } from '../src/services/helloFreshParser.js';
import { deriveQuantity } from '../src/services/quantity.js';

const p = parseIngredientString;

describe('parseIngredientString: prod survey patterns', () => {
  it.each([
    // [input, amount, unit, name, quantity]
    ['1/2 cup Israeli Couscous', '1/2', 'cup', 'Israeli Couscous', 0.5],      // was 1 + "/2 cup ..."
    ['3/4 cup Jasmine Rice', '3/4', 'cup', 'Jasmine Rice', 0.75],             // was 3 + "/4 cup ..."
    ['1.5 ounce Tomato Paste', '1.5', 'ounce', 'Tomato Paste', 1.5],          // was 1 + ".5 ounce ..."
    ['2.5 ounce Spinach', '2.5', 'ounce', 'Spinach', 2.5],                    // was 2 + ".5 ounce ..."
    ['10 ounce Ground Beef', '10', 'ounce', 'Ground Beef', 10],               // was 1 + "0 ounce ..."
    ['1 thumb Ginger', '1', 'thumb', 'Ginger', 1],                            // was name "thumb Ginger", NULL unit
    ['2 unit Lemon', '2', null, 'Lemon', 2],                                  // placeholder unit -> NULL
    ['4 unit Scallions', '4', null, 'Scallions', 4],
    ['1 unit Zucchini', '1', null, 'Zucchini', 1],
    ['Salt', null, null, 'Salt', null],
    ['Pepper', null, null, 'Pepper', null]
  ])('%s', (input, amount, unit, name, quantity) => {
    const r = p(input);
    expect(r).toEqual({ amount, unit, name });
    expect(deriveQuantity(r.amount)).toBe(quantity);
  });

  it('"(tsp) " prefix moves into the unit', () => {
    expect(p('teaspoon (tsp) Cumin')).toEqual({ amount: null, unit: 'teaspoon', name: 'Cumin' });
    expect(p('1 teaspoon (tsp) Cumin')).toEqual({ amount: '1', unit: 'teaspoon', name: 'Cumin' });
    expect(p('2 (tsp) Chili Flakes')).toEqual({ amount: '2', unit: 'teaspoon', name: 'Chili Flakes' });
    expect(p('(tsp) Paprika')).toEqual({ amount: null, unit: 'teaspoon', name: 'Paprika' });
  });
});

describe('parseIngredientString: quantity tokens', () => {
  it.each([
    ['2 cup Rice', '2', 2],
    ['1.5 lb Beef', '1.5', 1.5],
    ['.5 cup Cream', '.5', 0.5],
    ['1/3 cup Sugar', '1/3', 1 / 3],
    ['1 1/2 tbsp Soy Sauce', '1 1/2', 1.5],
    ['1  1 / 2 tbsp Soy Sauce', '1 1/2', 1.5],
    ['1½ tbsp Soy Sauce', '1 1/2', 1.5],       // not 11/2
    ['1 ½ tbsp Soy Sauce', '1 1/2', 1.5],
    ['½ cup Milk', '1/2', 0.5],
    ['¾ cup Milk', '3/4', 0.75],
    ['⅓ cup Milk', '1/3', 1 / 3],
    ['2⅔ cup Flour', '2 2/3', 2 + 2 / 3]
  ])('%s', (input, amount, quantity) => {
    const r = p(input);
    expect(r.amount).toBe(amount);
    expect(r.unit).not.toBeNull();
    expect(r.name).toMatch(/^[A-Z][A-Za-z ]+$/);
    expect(deriveQuantity(r.amount)).toBeCloseTo(quantity, 10);
  });

  it('ranges keep the text; quantity is null', () => {
    for (const s of ['2-3 clove Garlic', '2 - 3 clove Garlic', '2–3 clove Garlic']) {
      const r = p(s);
      expect(r).toEqual({ amount: '2-3', unit: 'clove', name: 'Garlic' });
      expect(deriveQuantity(r.amount)).toBeNull();
    }
    expect(p('1 to 2 tbsp Butter')).toEqual({ amount: '1 to 2', unit: 'tbsp', name: 'Butter' });
  });

  it('does not take a unit prefix of a word as a unit', () => {
    expect(p('1 Lemon')).toEqual({ amount: '1', unit: null, name: 'Lemon' });
    expect(p('2 Garlic Clove')).toEqual({ amount: '2', unit: null, name: 'Garlic Clove' });
    expect(p('1 Gala Apple')).toEqual({ amount: '1', unit: null, name: 'Gala Apple' });
    expect(p('1 Canned Tomato')).toEqual({ amount: '1', unit: null, name: 'Canned Tomato' });
  });

  it('units are matched whole and lower-cased', () => {
    expect(p('2 Cups Rice')).toEqual({ amount: '2', unit: 'cups', name: 'Rice' });
    expect(p('100 g Feta')).toEqual({ amount: '100', unit: 'g', name: 'Feta' });
  });

  it('a unit with nothing after it becomes the name', () => {
    expect(p('2 cup')).toEqual({ amount: '2', unit: null, name: 'cup' });
  });

  it('bare names stay whole', () => {
    expect(p('Salt and pepper')).toEqual({ amount: null, unit: null, name: 'Salt and pepper' });
    expect(p('Cup of coffee')).toEqual({ amount: null, unit: null, name: 'Cup of coffee' });
  });
});

describe('cleanDirection', () => {
  it('strips the leading bullet', () => {
    expect(cleanDirection('• Cook the rice.')).toEqual(['Cook the rice.']);
    expect(cleanDirection('•Cook the rice.')).toEqual(['Cook the rice.']);
  });

  it('rejoins hard line breaks from card wrapping', () => {
    expect(cleanDirection('• Bring a large pot of salted water\nto a boil. Add the rice and\ncook until tender.'))
      .toEqual(['Bring a large pot of salted water to a boil. Add the rice and cook until tender.']);
    expect(cleanDirection('Stir\r\nwell.')).toEqual(['Stir well.']);
  });

  it('keeps real step boundaries: bullets, blank lines, numbering', () => {
    expect(cleanDirection('• Cook the rice\nuntil soft.\n• Brown the\nbeef.')).toEqual(['Cook the rice until soft.', 'Brown the beef.']);
    expect(cleanDirection('Cook the rice.\n\nBrown the beef.')).toEqual(['Cook the rice.', 'Brown the beef.']);
    expect(cleanDirection('1. Cook the rice\nuntil soft.\n2. Brown the beef.')).toEqual(['Cook the rice until soft.', 'Brown the beef.']);
  });

  it('does not treat a number mid-sentence at a wrap point as a step', () => {
    expect(cleanDirection('Cook for\n10 minutes, then\nserve.')).toEqual(['Cook for 10 minutes, then serve.']);
  });

  it('empty input gives no steps', () => {
    expect(cleanDirection('')).toEqual([]);
    expect(cleanDirection('•  ')).toEqual([]);
  });
});

describe('parseHelloFreshUrl from a saved page (end to end, no network)', () => {
  const html = fs.readFileSync(new URL('./fixtures/hellofresh-prod-patterns.html', import.meta.url), 'utf8');
  beforeEach(() => axios.get.mockReset());

  it('corrects every known prod pattern in ingredients and directions', async () => {
    axios.get.mockResolvedValue({ data: html });
    const r = await parseHelloFreshUrl('https://www.hellofresh.com/recipes/synthetic-prod-patterns');
    expect(r.ingredients).toEqual([
      { amount: '1/2', unit: 'cup', name: 'Israeli Couscous' },
      { amount: '3/4', unit: 'cup', name: 'Jasmine Rice' },
      { amount: '1.5', unit: 'ounce', name: 'Tomato Paste' },
      { amount: '2.5', unit: 'ounce', name: 'Spinach' },
      { amount: '10', unit: 'ounce', name: 'Ground Beef' },
      { amount: '1', unit: 'thumb', name: 'Ginger' },
      { amount: null, unit: 'teaspoon', name: 'Cumin' },
      { amount: '2', unit: null, name: 'Lemon' },
      { amount: '1 1/2', unit: 'tbsp', name: 'Soy Sauce' },
      { amount: '2-3', unit: 'clove', name: 'Garlic' },
      { amount: null, unit: null, name: 'Salt' },
      { amount: null, unit: null, name: 'Pepper' }
    ]);
    expect(r.directions).toEqual([
      'Bring a large pot of salted water to a boil. Add the rice and cook until tender, about 12 minutes.',
      'Heat a drizzle of oil in a pan over medium-high heat. Add the beef and cook, breaking it up, until browned.',
      'Season with salt and pepper and serve.'
    ]);
    expect(r.directions.join('')).not.toMatch(/[•\n]/);
  });
});
