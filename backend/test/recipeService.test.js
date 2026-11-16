/**
 * COOK-47: the recipe service layer (searchRecipes, getRecipe, createRecipe),
 * the write length caps, and the optional filters on GET /api/search.
 *
 * The cap tests with a stub client need no database. The rest use a real
 * scratch Postgres and are skipped without COOK_TEST_DATABASE_URL.
 */
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { describeDb, createScratchDb } from './helpers/db.js';
import { createTestApp, authed } from './helpers/auth.js';
import { searchRecipes, getRecipe, createRecipe, assertWithinLimits, LIMITS } from '../src/services/recipes.js';
import { HttpError } from '../src/services/recipeWrite.js';

const rep = (n) => 'x'.repeat(n);
const valid = (over = {}) => ({ title: 'Soup', ingredients: [{ name: 'Water' }], directions: ['Boil'], tags: ['Quick'], ...over });

// Each case is a body that must be rejected, and the field it is rejected for.
const overLimit = [
  ['title', { title: rep(LIMITS.title + 1) }],
  ['source', { source: rep(LIMITS.source + 1) }],
  ['ingredient name', { ingredients: [{ name: rep(LIMITS.ingredientText + 1) }] }],
  ['ingredient amount', { ingredients: [{ name: 'a', amount: rep(LIMITS.ingredientText + 1) }] }],
  ['direction (string)', { directions: [rep(LIMITS.directionText + 1)] }],
  ['direction (object)', { directions: [{ instruction: rep(LIMITS.directionText + 1) }] }],
  ['ingredient count', { ingredients: Array.from({ length: LIMITS.ingredients + 1 }, () => ({ name: 'a' })) }],
  ['direction count', { directions: Array.from({ length: LIMITS.directions + 1 }, () => 'step') }],
  ['tag count', { tags: Array.from({ length: LIMITS.tags + 1 }, (_, i) => `t${i}`) }],
  ['tag length', { tags: [rep(LIMITS.tagLength + 1)] }]
];

describe('write limits (no database)', () => {
  it('accepts a body exactly at every limit', () => {
    expect(() => assertWithinLimits(valid({
      title: rep(LIMITS.title),
      source: rep(LIMITS.source),
      ingredients: Array.from({ length: LIMITS.ingredients }, () => ({ name: rep(LIMITS.ingredientText), amount: rep(LIMITS.ingredientText) })),
      directions: Array.from({ length: LIMITS.directions }, () => rep(LIMITS.directionText)),
      tags: Array.from({ length: LIMITS.tags }, () => rep(LIMITS.tagLength))
    }))).not.toThrow();
  });

  it.each(overLimit)('createRecipe rejects an over-long %s with a 400 and never writes', async (_name, over) => {
    const prisma = { recipe: { create: vi.fn() } };
    const err = await createRecipe(prisma, { id: 'c1' }, valid(over)).catch((e) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect(err.status).toBe(400);
    expect(prisma.recipe.create).not.toHaveBeenCalled();
  });

  it('takes attribution from the contributor argument, not the body', async () => {
    const prisma = { recipe: { create: vi.fn(async ({ data }) => ({ id: 'r1', title: data.title, ingredients: [], directions: [], tags: [], contributor: null })) } };
    await createRecipe(prisma, { id: 'real' }, valid({ contributorId: 'spoofed' }));
    expect(prisma.recipe.create.mock.calls[0][0].data.contributorId).toBe('real');
  });

  it('searchRecipes answers [] with no query and no filter, and rejects a bad limit', async () => {
    const prisma = { recipe: { findMany: vi.fn() } };
    expect(await searchRecipes(prisma, { q: '  ' })).toEqual([]);
    expect(prisma.recipe.findMany).not.toHaveBeenCalled();
    await expect(searchRecipes(prisma, { q: 'a', limit: 0 })).rejects.toMatchObject({ status: 400 });
  });
});

describeDb('recipe service and search filters', () => {
  let db;
  let app;
  let cookie;
  let magos;
  let other;
  const me = () => authed(app, cookie);

  beforeAll(async () => {
    db = await createScratchDb();
    const t = await createTestApp(db.prisma);
    app = t.app;
    magos = await db.prisma.contributor.findFirst({ where: { name: 'magos' } });
    await db.prisma.contributor.update({ where: { id: magos.id }, data: { email: 'magos@example.com' } });
    cookie = await t.signIn('magos@example.com');
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await db?.drop();
  });
  beforeEach(async () => {
    await db.prisma.recipe.deleteMany();
    await db.prisma.tag.deleteMany();
    await db.prisma.contributor.deleteMany({ where: { name: { not: 'magos' } } });
    other = await db.prisma.contributor.create({ data: { name: 'Other', email: 'other@example.com' } });
  });

  const make = (title, { ingredients = [], tags = [], ...rest } = {}) =>
    db.prisma.recipe.create({
      data: {
        title,
        contributorId: magos.id,
        ...rest,
        ingredients: { create: ingredients.map((name) => ({ name })) },
        tags: { connectOrCreate: tags.map((name) => ({ where: { name }, create: { name } })) }
      }
    });
  const search = async (qs) => (await request(app).get('/api/search').query(qs).expect(200)).body.map((r) => r.id).sort();
  const ids = (...rs) => rs.map((r) => r.id).sort();

  describe('GET /api/search filters', () => {
    it('keeps the plain q behaviour and the empty answer', async () => {
      const a = await make('Mushroom soup');
      await make('Pancakes');
      expect(await search({ q: 'MUSHROOM' })).toEqual(ids(a));
      expect(await search({})).toEqual([]);
      expect(await search({ q: ' ' })).toEqual([]);
    });

    it('ingredient narrows by ingredient name, alone or with q', async () => {
      const a = await make('Soup', { ingredients: ['Leek', 'Potato'] });
      const b = await make('Stew', { ingredients: ['Potato'] });
      await make('Toast', { ingredients: ['Bread'] });
      expect(await search({ ingredient: 'potato' })).toEqual(ids(a, b));
      expect(await search({ q: 'soup', ingredient: 'potato' })).toEqual(ids(a));
      expect(await search({ q: 'toast', ingredient: 'potato' })).toEqual([]);
    });

    it('tag is an exact, case-insensitive tag match', async () => {
      const a = await make('A', { tags: ['Quick'] });
      await make('B', { tags: ['Quickest'] });
      expect(await search({ tag: 'quick' })).toEqual(ids(a));
    });

    it('contributor filters by id', async () => {
      const mine = await make('Mine');
      const theirs = await make('Theirs', { contributorId: other.id });
      expect(await search({ contributor: other.id })).toEqual(ids(theirs));
      expect(await search({ q: 'm', contributor: magos.id })).toEqual(ids(mine));
      expect(await search({ contributor: 'no-such-id' })).toEqual([]);
    });

    it('maxMinutes uses the random-picker rule (total, else prep + cook, else out)', async () => {
      const fast = await make('Fast', { totalMinutes: 15 });
      const split = await make('Split', { prepTime: 5, cookTime: 10 });
      await make('Slow', { totalMinutes: 90 });
      await make('Untimed');
      expect(await search({ maxMinutes: '30' })).toEqual(ids(fast, split));
      expect(await search({ q: 'fast', maxMinutes: '30' })).toEqual(ids(fast));
    });

    it('vegetarian filters on the column', async () => {
      const v = await make('Veg', { vegetarian: true });
      await make('Meat', { vegetarian: false });
      expect(await search({ vegetarian: 'true' })).toEqual(ids(v));
      expect(await search({ q: 'e', vegetarian: '1' })).toEqual(ids(v));
    });

    it('combines every filter with AND', async () => {
      const hit = await make('Veg curry', { vegetarian: true, totalMinutes: 20, ingredients: ['Chickpea'], tags: ['Curry'] });
      await make('Slow curry', { vegetarian: true, totalMinutes: 120, ingredients: ['Chickpea'], tags: ['Curry'] });
      await make('Beef curry', { vegetarian: false, totalMinutes: 20, ingredients: ['Chickpea'], tags: ['Curry'] });
      expect(await search({ q: 'curry', ingredient: 'chick', tag: 'curry', contributor: magos.id, maxMinutes: '30', vegetarian: '1' })).toEqual(ids(hit));
    });

    it('rejects bad filter shapes with 400', async () => {
      for (const qs of [
        'maxMinutes=abc', 'maxMinutes=0', 'maxMinutes=-5', 'maxMinutes=100001',
        'ingredient[]=a', 'ingredient=a&ingredient=b', 'contributor[a]=b', 'maxMinutes[]=1',
        `ingredient=${rep(201)}`, `tag=${rep(101)}`, `contributor=${rep(101)}`
      ]) {
        const res = await request(app).get(`/api/search?${qs}`);
        expect(res.status, qs).toBe(400);
      }
    });
  });

  it('GET /api/search and searchRecipes return the same ids', async () => {
    await make('Veg curry', { vegetarian: true, totalMinutes: 20, ingredients: ['Chickpea'], tags: ['Curry'] });
    await make('Beef curry', { vegetarian: false, totalMinutes: 50, ingredients: ['Beef'], tags: ['Curry'] });
    await make('Salad', { vegetarian: true, totalMinutes: 5, ingredients: ['Lettuce'] });
    const cases = [
      [{ q: 'curry' }, { q: 'curry' }],
      [{ ingredient: 'beef' }, { ingredient: 'beef' }],
      [{ tag: 'curry', maxMinutes: '30' }, { tag: 'curry', maxMinutes: 30 }],
      [{ vegetarian: '1', contributor: magos.id }, { vegetarian: true, contributorId: magos.id }],
      [{ q: 'zzz' }, { q: 'zzz' }]
    ];
    for (const [qs, params] of cases) {
      const viaService = (await searchRecipes(db.prisma, params)).map((r) => r.id).sort();
      expect(await search(qs)).toEqual(viaService);
    }
  });

  it('searchRecipes limit caps results and defaults to the REST cap', async () => {
    for (let i = 0; i < 4; i++) await make(`Pie ${i}`);
    expect(await searchRecipes(db.prisma, { q: 'pie', limit: 2 })).toHaveLength(2);
    expect(await searchRecipes(db.prisma, { q: 'pie' })).toHaveLength(4);
    expect(await searchRecipes(db.prisma, { q: 'pie', limit: 100000 })).toHaveLength(4);
  });

  it('getRecipe returns the presented recipe or null', async () => {
    const r = await make('Toast', { source: 'hellofresh' });
    expect(await getRecipe(db.prisma, r.id)).toMatchObject({ id: r.id, title: 'Toast', sourceLabel: 'HelloFresh' });
    expect(await getRecipe(db.prisma, 'missing')).toBeNull();
  });

  it('createRecipe attributes to the contributor argument and ignores body contributorId', async () => {
    const r = await createRecipe(db.prisma, other, valid({ contributorId: magos.id }));
    expect(r.contributor.id).toBe(other.id);
    expect(await db.prisma.recipe.count()).toBe(1);
  });

  describe('write caps over HTTP write no row', () => {
    it.each(overLimit)('POST rejects an over-long %s', async (_name, over) => {
      const res = await me().post('/api/recipes').send(valid(over));
      expect(res.status).toBe(400);
      expect(await db.prisma.recipe.count()).toBe(0);
    });

    it('POST accepts a body at the limits', async () => {
      const res = await me().post('/api/recipes').send(valid({ title: rep(LIMITS.title), tags: Array.from({ length: LIMITS.tags }, (_, i) => `T${i}`) }));
      expect(res.status).toBe(201);
    });

    it.each(overLimit)('PUT rejects an over-long %s and leaves the recipe unchanged', async (_name, over) => {
      const existing = await make('Original', { ingredients: ['Salt'], tags: ['Keep'] });
      const res = await me().put(`/api/recipes/${existing.id}`).send(over);
      expect(res.status).toBe(400);
      const after = await getRecipe(db.prisma, existing.id);
      expect(after.title).toBe('Original');
      expect(after.ingredients.map((i) => i.name)).toEqual(['Salt']);
      expect(after.tags.map((t) => t.name)).toEqual(['Keep']);
    });
  });
});
