/** COOK-14: the schema.org/Recipe mapper, no database. */
import { describe, it, expect } from 'vitest';
import { jsonLdToRecipeBody, bodyFromJsonLd, parseIsoDuration, findRecipeNode } from '../src/services/recipeJsonLd.js';
import { HttpError } from '../src/services/recipeWrite.js';
import { promptRecipe, helloFreshLike, withSections, inGraph } from './fixtures/jsonld.js';

describe('parseIsoDuration', () => {
  it.each([
    ['PT1H15M', 75], ['PT30M', 30], ['PT2H', 120], ['P1DT2H', 1560], ['PT90S', 2], ['PT0M', 0], ['pt5m', 5]
  ])('%s -> %s', (iso, minutes) => expect(parseIsoDuration(iso)).toBe(minutes));
  it.each([['45 minutes'], [''], [null], ['P'], ['PT'], ['PT99999H']])('%j -> null', (v) => expect(parseIsoDuration(v)).toBeNull());
});

describe('the "Test run for MCP" prompt shape', () => {
  const body = jsonLdToRecipeBody(promptRecipe);

  it('maps scalars, times, category, cuisine, vegetarian and the url', () => {
    expect(body).toMatchObject({
      title: 'Lemon Lentil Soup',
      description: 'A bright, quick soup.',
      imageUrl: 'https://example.com/lentil.jpg',
      sourceUrl: 'https://example.com/lentil-soup',
      servings: 4,
      prepTime: 10,
      cookTime: 35,
      totalMinutes: 45,
      category: 'Soup',
      cuisine: 'Mediterranean',
      vegetarian: true
    });
  });

  it('splits ingredient strings with the existing parser (fractions, ranges, glyphs)', () => {
    expect(body.ingredients).toEqual([
      { amount: '1 1/2', unit: 'cups', name: 'red lentils' },
      { amount: '2', unit: 'cloves', name: 'garlic, minced' },
      { amount: '1-2', unit: 'tbsp', name: 'olive oil' },
      { amount: '1/2', unit: 'tsp', name: 'cumin' },
      { amount: null, unit: null, name: 'salt to taste' }
    ]);
  });

  it('keeps an unparseable ingredient whole as the name', () => {
    expect(jsonLdToRecipeBody({ '@type': 'Recipe', name: 'x', recipeIngredient: ['A splash of whatever'] }).ingredients)
      .toEqual([{ amount: null, unit: null, name: 'A splash of whatever' }]);
  });

  it('maps keywords to de-duplicated tags and never reads author for source', () => {
    expect(body.tags).toEqual(['lentil', 'soup', 'weeknight']);
    expect(body.source).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain('Gran');
  });

  it('maps string instructions to directions without headings', () => {
    expect(body.directions.map((d) => d.instruction)).toEqual([
      'Saute the garlic in the oil.',
      'Add lentils and 4 cups water; simmer 25 minutes.',
      'Finish with lemon.'
    ]);
    expect(body.directions.every((d) => d.heading === null)).toBe(true);
  });
});

describe('a HelloFresh-like page', () => {
  const body = jsonLdToRecipeBody(helloFreshLike);
  it('keeps only the total when prep and cook are absent (no invented split)', () => {
    expect(body.totalMinutes).toBe(30);
    expect(body).not.toHaveProperty('prepTime');
    expect(body).not.toHaveProperty('cookTime');
  });
  it('takes the first image, numeric yield, array category and cuisine, HowToStep text', () => {
    expect(body).toMatchObject({ imageUrl: 'https://img.example.com/a.jpg', servings: 2, category: 'Dinner', cuisine: 'American' });
    expect(body.directions.map((d) => d.instruction)).toEqual(['Cook the rice.', 'Sear the chicken.']);
    expect(body.ingredients[0]).toEqual({ amount: '2', unit: null, name: 'Chicken Breast' });
    expect(body).not.toHaveProperty('vegetarian');
  });
});

describe('HowToSection', () => {
  const { directions } = jsonLdToRecipeBody(withSections);
  it('puts the section name on its first step as the heading', () => {
    expect(directions).toEqual([
      { instruction: 'Mix the batter.', heading: 'Cake' },
      { instruction: 'Bake for 30 minutes.', heading: null },
      { instruction: 'Whip the cream.', heading: 'Frosting' },
      { instruction: 'Stack and frost.', heading: null }
    ]);
  });
});

describe('wrappers', () => {
  it('finds the Recipe in an @graph, with a multi-type @type, and splits a multi-line string', () => {
    const body = jsonLdToRecipeBody(inGraph);
    expect(body.title).toBe('Graph Pancakes');
    expect(body.directions.map((d) => d.instruction)).toEqual(['Mix.', 'Fry.']);
  });
  it('accepts an array, and the JSON as text', () => {
    expect(findRecipeNode([{ '@type': 'WebPage' }, promptRecipe])).toBe(promptRecipe);
    expect(jsonLdToRecipeBody(JSON.stringify(promptRecipe)).title).toBe('Lemon Lentil Soup');
  });
  it('finds a Recipe under WebPage.mainEntity and with a prefixed @type', () => {
    expect(jsonLdToRecipeBody({ '@type': 'WebPage', mainEntity: { '@type': 'schema:Recipe', name: 'Deep' } }).title).toBe('Deep');
  });
  it('keeps a HowToStep own text ahead of its child directions', () => {
    const { directions } = jsonLdToRecipeBody({
      '@type': 'Recipe', name: 'x',
      recipeInstructions: [{ '@type': 'HowToStep', name: 'Prep', text: 'Prep everything', itemListElement: [{ '@type': 'HowToDirection', text: 'Chop' }] }]
    });
    expect(directions).toEqual([{ instruction: 'Prep everything', heading: 'Prep' }, { instruction: 'Chop', heading: null }]);
  });
  it('treats VeganDiet as vegetarian', () => {
    expect(jsonLdToRecipeBody({ '@type': 'Recipe', name: 'x', suitableForDiet: ['https://schema.org/VeganDiet'] }).vegetarian).toBe(true);
  });
  it('ignores unknown fields', () => {
    expect(jsonLdToRecipeBody({ '@type': 'Recipe', name: 'x', aggregateRating: { ratingValue: 5 }, nutrition: {}, video: 'v' }).title).toBe('x');
  });
});

describe('refusals and drops', () => {
  const bad = (input, msg) => {
    try {
      bodyFromJsonLd(input, 's');
    } catch (e) {
      expect(e).toBeInstanceOf(HttpError);
      expect(e.status).toBe(400);
      expect(e.message).toMatch(msg);
      return;
    }
    throw new Error('expected a refusal');
  };
  it('refuses non-JSON text, no Recipe, two Recipes, and a Recipe with no name', () => {
    bad('{nope', /not valid JSON/);
    bad({ '@type': 'WebSite' }, /no schema.org\/Recipe/);
    bad([{ '@type': 'Recipe', name: 'a' }, { '@type': 'Recipe', name: 'b' }], /more than one/);
    bad({ '@type': 'Recipe' }, /no name/);
    bad(42, /no schema.org\/Recipe/);
  });
  it('drops non-http urls, absurd yields and keywords past the tag caps', () => {
    const body = jsonLdToRecipeBody({
      '@type': 'Recipe', name: 'x', image: 'javascript:alert(1)', url: 'ftp://x', recipeYield: '5000',
      keywords: Array.from({ length: 30 }, (_, i) => `k${i}`).concat('y'.repeat(101)).join(',')
    });
    expect(body).not.toHaveProperty('imageUrl');
    expect(body).not.toHaveProperty('sourceUrl');
    expect(body).not.toHaveProperty('servings');
    expect(body.tags).toHaveLength(20);
  });
  it('adds the caller source and nothing else', () => {
    expect(bodyFromJsonLd(promptRecipe, 'Gran').source).toBe('Gran');
  });
});
