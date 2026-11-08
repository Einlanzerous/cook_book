/**
 * COOK-12: GET /api/recipes/random and the shared pickRandomRecipe service.
 * Real scratch Postgres; skipped without COOK_TEST_DATABASE_URL.
 */
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { describeDb, createScratchDb } from './helpers/db.js';
import { createTestApp } from './helpers/auth.js';
import { pickRandomRecipe } from '../src/services/randomRecipe.js';

describeDb('random recipe', () => {
  let db;
  let app;

  beforeAll(async () => {
    db = await createScratchDb();
    app = (await createTestApp(db.prisma)).app;
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await db?.drop();
  });
  beforeEach(async () => {
    await db.prisma.recipe.deleteMany();
  });

  const make = (title, over = {}) => db.prisma.recipe.create({ data: { title, ...over } });
  const get = (qs = '') => request(app).get(`/api/recipes/random${qs}`);

  it('returns the presented recipe and the match count', async () => {
    const r = await make('Soup', { totalMinutes: 20, servings: 4, source: 'hellofresh' });
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.body.matches).toBe(1);
    expect(res.body.recipe).toMatchObject({ id: r.id, title: 'Soup', totalMinutes: 20, sourceLabel: 'HelloFresh' });
    expect(res.body.recipe).toHaveProperty('contributor');
  });

  it('is not shadowed by GET /api/recipes/:id', async () => {
    await make('Only');
    expect((await get()).body.recipe.title).toBe('Only');
  });

  it('answers recipe:null, matches:0 for an empty library', async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ recipe: null, matches: 0 });
  });

  describe('no repeat', () => {
    it('never returns an excluded recipe while another exists', async () => {
      const a = await make('A');
      const b = await make('B');
      for (let i = 0; i < 15; i++) {
        expect((await get(`?exclude=${a.id}`)).body.recipe.id).toBe(b.id);
        expect((await get(`?exclude=${b.id}`)).body.recipe.id).toBe(a.id);
      }
    });

    it('with ten recipes, excluding the last pick never repeats it over many rerolls', async () => {
      for (let i = 0; i < 10; i++) await make(`R${i}`);
      let last = null;
      for (let i = 0; i < 40; i++) {
        const res = await get(last ? `?exclude=${last}` : '');
        if (last) expect(res.body.recipe.id).not.toBe(last);
        last = res.body.recipe.id;
      }
    });

    it('one-recipe library: the exclusion is soft and the only recipe is returned', async () => {
      const only = await make('Only');
      const res = await get(`?exclude=${only.id}`);
      expect(res.status).toBe(200);
      expect(res.body.recipe.id).toBe(only.id);
      expect(res.body.matches).toBe(1);
    });

    it('zero vegetarian recipes: recipe null, even when exclude is given', async () => {
      const meat = await make('Steak');
      const res = await get(`?vegetarian=1&exclude=${meat.id}`);
      expect(res.body).toEqual({ recipe: null, matches: 0 });
    });

    it('one vegetarian recipe among many: soft exclusion returns it again', async () => {
      await make('Steak');
      const veg = await make('Salad', { vegetarian: true });
      const res = await get(`?vegetarian=true&exclude=${veg.id}`);
      expect(res.body.recipe.id).toBe(veg.id);
      expect(res.body.matches).toBe(1);
    });

    it('accepts exclude as a comma list and as a repeated parameter', async () => {
      const [a, b, c] = [await make('A'), await make('B'), await make('C')];
      for (let i = 0; i < 8; i++) {
        expect((await get(`?exclude=${a.id},${b.id}`)).body.recipe.id).toBe(c.id);
        expect((await get(`?exclude=${a.id}&exclude=${b.id}`)).body.recipe.id).toBe(c.id);
      }
    });

    it('ignores unknown ids in exclude', async () => {
      const a = await make('A');
      expect((await get('?exclude=does-not-exist')).body.recipe.id).toBe(a.id);
    });
  });

  describe('filters', () => {
    it('vegetarian uses the column, not tags', async () => {
      await make('Tagged veg only', {
        vegetarian: false,
        tags: { connectOrCreate: { where: { name: 'Vegetarian' }, create: { name: 'Vegetarian' } } }
      });
      const veg = await make('Column veg', { vegetarian: true });
      for (let i = 0; i < 8; i++) {
        const res = await get('?vegetarian=1');
        expect(res.body.recipe.id).toBe(veg.id);
        expect(res.body.recipe.vegetarian).toBe(true);
      }
      expect((await get('?vegetarian=1')).body.matches).toBe(1);
    });

    it('vegetarian absent or 0 means anything', async () => {
      await make('A', { vegetarian: true });
      await make('B');
      expect((await get()).body.matches).toBe(2);
      expect((await get('?vegetarian=0')).body.matches).toBe(2);
    });

    it('maxMinutes uses totalMinutes and leaves out recipes with no time at all', async () => {
      const quick = await make('Quick', { totalMinutes: 25 });
      await make('Slow', { totalMinutes: 90 });
      await make('Unknown');
      const res = await get('?maxMinutes=30');
      expect(res.body.matches).toBe(1);
      expect(res.body.recipe.id).toBe(quick.id);
      expect((await get('?maxMinutes=25')).body.matches).toBe(1);
      expect((await get('?maxMinutes=24')).body).toEqual({ recipe: null, matches: 0 });
    });

    it('a NULL total falls back to prep + cook, as the library and presentRecipe do (row written by the previous image)', async () => {
      const old = await make('Old image row', { prepTime: 5, cookTime: 10 });
      await make('Old but slow', { prepTime: 30, cookTime: 40 });
      expect(old.totalMinutes).toBeNull();
      const res = await get('?maxMinutes=30');
      expect(res.body.matches).toBe(1);
      expect(res.body.recipe.id).toBe(old.id);
      expect((await get('?maxMinutes=14')).body.matches).toBe(0);
    });

    it('a NULL total with only one of prep/cook set counts the missing part as 0', async () => {
      const prepOnly = await make('Prep only', { prepTime: 10 });
      await make('Cook only slow', { cookTime: 50 });
      const res = await get('?maxMinutes=30');
      expect(res.body.matches).toBe(1);
      expect(res.body.recipe.id).toBe(prepOnly.id);
    });

    it('combines vegetarian and maxMinutes', async () => {
      await make('Quick meat', { totalMinutes: 15 });
      await make('Slow veg', { totalMinutes: 80, vegetarian: true });
      const both = await make('Quick veg', { totalMinutes: 15, vegetarian: true });
      const res = await get('?vegetarian=1&maxMinutes=30');
      expect(res.body.recipe.id).toBe(both.id);
    });
  });

  it('actually varies: over many draws every recipe turns up', async () => {
    for (let i = 0; i < 4; i++) await make(`R${i}`);
    const seen = new Set();
    for (let i = 0; i < 60; i++) seen.add((await get()).body.recipe.title);
    expect(seen.size).toBe(4);
  });

  it('picks by offset: the injected rng chooses the position', async () => {
    const all = [await make('A'), await make('B'), await make('C')].map((r) => r.id).sort();
    expect((await pickRandomRecipe(db.prisma, {}, () => 0)).recipe.id).toBe(all[0]);
    expect((await pickRandomRecipe(db.prisma, {}, () => 0.99999)).recipe.id).toBe(all[2]);
    // rng at the very top of its range cannot run off the end
    expect((await pickRandomRecipe(db.prisma, {}, () => 1)).recipe.id).toBe(all[2]);
    // the offset is into the pool *after* exclusion
    const r = await pickRandomRecipe(db.prisma, { exclude: [all[0]] }, () => 0);
    expect(r.recipe.id).toBe(all[1]);
  });

  describe('validation', () => {
    it.each(['abc', '0', '-5', '1.5', '10;drop'])('maxMinutes=%s is a 400', async (v) => {
      const res = await get(`?maxMinutes=${encodeURIComponent(v)}`);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/maxMinutes/);
    });

    it('rejects more than 50 excluded ids', async () => {
      const ids = Array.from({ length: 51 }, (_, i) => `id${i}`).join(',');
      expect((await get(`?exclude=${ids}`)).status).toBe(400);
    });
  });
});
