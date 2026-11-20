/**
 * COOK-49 against a real scratch Postgres, through a real MCP client over HTTP
 * (criteria 1, 2, 6-10, 13) plus the scaling rule (criterion 11).
 */
import fs from 'node:fs';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { describeDb, createScratchDb } from './helpers/db.js';
import { createTestApp } from './helpers/auth.js';
import { createMcpKit, toolJson } from './helpers/mcp.js';
import { scaleRecipe, summarise, TOOL_NAMES } from '../src/mcp/server.js';
import { findBoundContributor } from '../src/mcp/caller.js';
import { LIMITS } from '../src/services/recipes.js';
import { HttpError } from '../src/services/recipeWrite.js';
import { promptRecipe, inGraph, withSections } from './fixtures/jsonld.js';

const rep = (n) => 'x'.repeat(n);
const valid = (over = {}) => ({
  title: 'Lentil soup',
  source: 'Salt Fat Acid Heat',
  ingredients: [{ name: 'Lentils', amount: '1', unit: 'cup' }],
  directions: ['Simmer'],
  tags: ['Soup'],
  ...over
});

/** callTool that folds a protocol-level validation error into the same shape as a tool error. */
async function call(client, name, args = {}) {
  try {
    const res = await client.callTool({ name, arguments: args });
    return { isError: Boolean(res.isError), text: res.content[0].text, res };
  } catch (e) {
    return { isError: true, text: e.message, res: null };
  }
}

describe('criterion 11: scaling is the web page rule (shared/quantity.js)', () => {
  const fixture = JSON.parse(fs.readFileSync(new URL('../../shared/quantity-fixture.json', import.meta.url), 'utf8'));
  // serves / base(2) = multiplier, so only whole-serving multipliers can be asked for.
  const rows = fixture.cases.flatMap((c) =>
    c.scale.filter((s) => Number.isInteger(s.multiplier * 2)).map((s) => [c, s])
  );

  it('has fixture rows to run', () => expect(rows.length).toBeGreaterThan(5));

  it.each(rows.map(([c, s]) => [`${JSON.stringify(c.amount)} x${s.multiplier}`, c, s]))('%s', (_l, c, s) => {
    const recipe = { servings: 2, ingredients: [{ name: 'x', amount: c.amount, unit: c.unit, quantity: c.quantity }] };
    const [out] = scaleRecipe(recipe, s.multiplier * 2).ingredients;
    expect({ amount: out.amount, unit: out.unit, scaled: out.scaled }).toEqual({ amount: s.amount, unit: s.unit, scaled: s.scaled });
  });

  it('a recipe with no servings scales from the web default of 2', () => {
    const [out] = scaleRecipe({ servings: null, ingredients: [{ name: 'x', amount: '1', unit: null, quantity: 1 }] }, 4).ingredients;
    expect(out.amount).toBe('2');
  });
});

describe('summary shape (criterion 13)', () => {
  it('keeps exactly id, title, minutes, vegetarian, contributor name and tags', () => {
    expect(summarise({ id: 'i', title: 't', totalMinutes: 20, vegetarian: true, contributor: { id: 'c', name: 'Ann', bio: 'b' }, tags: [{ name: 'A' }], ingredients: [1], directions: [2], description: 'd' }))
      .toEqual({ id: 'i', title: 't', minutes: 20, vegetarian: true, contributor: 'Ann', tags: ['A'] });
  });
});

describeDb('MCP tools against Postgres', () => {
  let db;
  let prisma;
  let kit;
  let ann;
  let bob;
  let cy;
  let soup;
  let salad;

  beforeAll(async () => {
    db = await createScratchDb();
    prisma = db.prisma;
    ann = await prisma.contributor.create({ data: { name: 'Ann', email: 'ann@example.com', externalId: 'sub-ann' } });
    bob = await prisma.contributor.create({ data: { name: 'Bob', email: 'bob@example.com' } }); // never signed in
    cy = await prisma.contributor.create({ data: { name: 'Cy', email: 'cy@example.com', externalId: 'web-sub-cy' } });
    soup = await prisma.recipe.create({
      data: {
        title: 'Tomato soup', servings: 2, prepTime: 5, cookTime: 20, totalMinutes: 25, vegetarian: true, source: 'Gran',
        contributorId: ann.id,
        ingredients: { create: [{ name: 'Tomatoes', amount: '1 1/2', unit: 'kg', quantity: 1.5 }, { name: 'Salt', amount: 'a pinch' }] },
        directions: { create: [{ stepNumber: 1, instruction: 'Simmer' }] },
        tags: { connectOrCreate: [{ where: { name: 'Soup' }, create: { name: 'Soup' } }] }
      }
    });
    salad = await prisma.recipe.create({
      data: {
        title: 'Chicken salad', servings: 4, totalMinutes: 15, vegetarian: false, source: 'Bob',
        contributorId: cy.id,
        ingredients: { create: [{ name: 'Chicken', amount: '2', unit: 'breasts', quantity: 2 }] },
        tags: { connectOrCreate: [{ where: { name: 'Salad' }, create: { name: 'Salad' } }] }
      }
    });
    // Enough rows to prove the 25-row cap.
    for (let i = 0; i < 30; i++) {
      await prisma.recipe.create({ data: { title: `Bulk stew ${i}`, source: 'Bulk', totalMinutes: 60, contributorId: ann.id } });
    }
  });
  afterAll(() => db.drop());
  afterEach(async () => {
    await kit?.close();
    kit = undefined;
    vi.restoreAllMocks();
  });

  const start = async (deps) => {
    kit = await createMcpKit({ prisma, deps });
    return kit;
  };
  const asAnn = async () => (await start()).connect(await kit.assertion({ email: 'ann@example.com', sub: 'sub-ann' }));
  const counts = async () => ({
    recipes: await prisma.recipe.count(),
    contributors: await prisma.contributor.count(),
    ids: (await prisma.contributor.findMany({ orderBy: { name: 'asc' } })).map((c) => [c.name, c.externalId])
  });

  describe('criterion 1: dev mode lists exactly five annotated tools', () => {
    it('lists them with the right annotations', async () => {
      kit = await createMcpKit({
        prisma,
        env: { AUTH_MODE: 'dev', PUBLIC_ORIGIN: 'http://localhost:5173', DEV_AUTH_EMAIL: 'dev@example.com' }
      });
      const client = await kit.connect();
      const { tools } = await client.listTools();
      expect(tools.map((t) => t.name).sort()).toEqual([...TOOL_NAMES].sort());
      expect(tools).toHaveLength(5);
      const by = Object.fromEntries(tools.map((t) => [t.name, t.annotations]));
      for (const n of ['search_recipes', 'get_recipe', 'random_recipe', 'list_contributors']) expect(by[n].readOnlyHint).toBe(true);
      expect(by.create_recipe.readOnlyHint).toBe(false);
      expect(by.create_recipe.destructiveHint).toBe(false);
      expect(tools.find((t) => t.name === 'create_recipe').description).toMatch(/source.*REQUIRED/s);
    });

    it('the dev caller is DEV_AUTH_EMAIL: refused until that contributor is signed in (bound), then recognised', async () => {
      kit = await createMcpKit({
        prisma,
        env: { AUTH_MODE: 'dev', PUBLIC_ORIGIN: 'http://localhost:5173', DEV_AUTH_EMAIL: 'dev@example.com' }
      });
      const client = await kit.connect();
      expect((await call(client, 'create_recipe', valid())).isError).toBe(true);
      const dev = await prisma.contributor.create({ data: { name: 'Dev', email: 'dev@example.com', externalId: 'dev:dev@example.com' } });
      const ok = await call(client, 'create_recipe', valid({ title: 'Dev dish' }));
      expect(ok.isError).toBe(false);
      expect((await prisma.recipe.findFirst({ where: { title: 'Dev dish' } })).contributorId).toBe(dev.id);
    });
  });

  describe('criterion 2: every tool, through a real client', () => {
    it('search_recipes: summaries, filters, the 25 cap, never a full recipe', async () => {
      const client = await asAnn();
      const hit = toolJson(await client.callTool({ name: 'search_recipes', arguments: { q: 'tomato' } }));
      expect(hit.recipes).toEqual([{ id: soup.id, title: 'Tomato soup', minutes: 25, vegetarian: true, contributor: 'Ann', tags: ['Soup'] }]);
      const veg = toolJson(await client.callTool({ name: 'search_recipes', arguments: { ingredient: 'chicken', vegetarian: false } }));
      expect(veg.recipes.map((r) => r.id)).toEqual([salad.id]);
      const byName = toolJson(await client.callTool({ name: 'search_recipes', arguments: { contributor: 'cy' } }));
      expect(byName.recipes.map((r) => r.id)).toEqual([salad.id]);
      const byId = toolJson(await client.callTool({ name: 'search_recipes', arguments: { contributor: cy.id } }));
      expect(byId.recipes.map((r) => r.id)).toEqual([salad.id]);
      const quick = toolJson(await client.callTool({ name: 'search_recipes', arguments: { maxMinutes: 20 } }));
      expect(quick.recipes.map((r) => r.id)).toEqual([salad.id]);
      const none = toolJson(await client.callTool({ name: 'search_recipes', arguments: {} }));
      expect(none.recipes).toEqual([]);
      const capped = toolJson(await client.callTool({ name: 'search_recipes', arguments: { q: 'stew' } }));
      expect(capped.recipes).toHaveLength(25);
      expect(Object.keys(capped.recipes[0]).sort()).toEqual(['contributor', 'id', 'minutes', 'tags', 'title', 'vegetarian']);
      expect((await call(client, 'search_recipes', { limit: 26, q: 'stew' })).isError).toBe(true);
      expect((await call(client, 'search_recipes', { q: 'a', limit: 3 })).isError).toBe(false);
      const unknown = await call(client, 'search_recipes', { contributor: 'Nobody' });
      expect(unknown.isError).toBe(true);
      expect(unknown.text).toContain('list_contributors');
    });

    it('get_recipe: full recipe, scaled when serves is given, flagged when not numeric, error when missing', async () => {
      const client = await asAnn();
      const plain = toolJson(await client.callTool({ name: 'get_recipe', arguments: { id: soup.id } }));
      expect(plain.directions).toHaveLength(1);
      expect(plain.ingredients.find((i) => i.name === 'Tomatoes').amount).toBe('1 1/2');
      const scaled = toolJson(await client.callTool({ name: 'get_recipe', arguments: { id: soup.id, serves: 4 } }));
      const tomatoes = scaled.ingredients.find((i) => i.name === 'Tomatoes');
      const salt = scaled.ingredients.find((i) => i.name === 'Salt');
      expect(tomatoes).toMatchObject({ amount: '3', unit: 'kg', scaled: true });
      expect(salt).toMatchObject({ amount: 'a pinch', scaled: false });
      const missing = await call(client, 'get_recipe', { id: 'nope' });
      expect(missing.isError).toBe(true);
      expect(missing.text).toContain('No recipe');
    });

    it('random_recipe: a pick, and a no-match result', async () => {
      const client = await asAnn();
      const none = toolJson(await client.callTool({ name: 'random_recipe', arguments: { maxMinutes: 1 } }));
      expect(none).toEqual({ recipe: null, matches: 0 });
      const veg = toolJson(await client.callTool({ name: 'random_recipe', arguments: { vegetarian: true } }));
      expect(veg.recipe.id).toBe(soup.id);
      const excl = await call(client, 'random_recipe', { exclude: Array.from({ length: 51 }, (_, i) => `id${i}`) });
      expect(excl.isError).toBe(true);
    });

    it('list_contributors: names and counts, no emails or ids of identity', async () => {
      const client = await asAnn();
      const out = toolJson(await client.callTool({ name: 'list_contributors', arguments: {} }));
      expect(out.contributors.find((c) => c.name === 'Ann').recipeCount).toBe(31);
      expect(JSON.stringify(out)).not.toMatch(/@|sub-ann|externalId|email/);
    });

    it('create_recipe: files under the caller and returns the id and public URL', async () => {
      const client = await asAnn();
      const out = toolJson(await client.callTool({ name: 'create_recipe', arguments: valid() }));
      expect(out.url).toBe(`https://commonplace.test/recipe/${out.id}`);
      const row = await prisma.recipe.findUnique({ where: { id: out.id } });
      expect(row).toMatchObject({ contributorId: ann.id, source: 'Salt Fat Acid Heat', title: 'Lentil soup' });
    });
  });

  describe('criterions 6 and 7: who create_recipe files under (read-only lookup)', () => {
    it('the sub matches a contributor: filed under them, and a contributorId argument is ignored', async () => {
      await start();
      const client = await kit.connect(await kit.assertion({ email: 'ann@example.com', sub: 'sub-ann' }));
      const res = await call(client, 'create_recipe', { ...valid({ title: 'Sub match' }), contributorId: cy.id });
      expect(res.isError).toBe(false);
      expect((await prisma.recipe.findFirst({ where: { title: 'Sub match' } })).contributorId).toBe(ann.id);
      expect(kit.logs.some((l) => /^mcp\.create recipe=\S+ contributor=\S+ matched=sub$/.test(l))).toBe(true);
    });

    it('the email matches a contributor whose externalId is already set (a different sub): accepted on the email', async () => {
      await start();
      const client = await kit.connect(await kit.assertion({ email: 'cy@example.com', sub: 'heitan-sub-cy' }));
      const res = await call(client, 'create_recipe', valid({ title: 'Email match' }));
      expect(res.isError).toBe(false);
      expect((await prisma.recipe.findFirst({ where: { title: 'Email match' } })).contributorId).toBe(cy.id);
      expect(kit.logs.some((l) => /matched=email$/.test(l))).toBe(true);
      expect((await prisma.contributor.findUnique({ where: { id: cy.id } })).externalId).toBe('web-sub-cy'); // not rebound
    });

    it('the email matches a row with NULL externalId: refused as not-yet-signed-in, and the row is NOT bound', async () => {
      await start();
      const before = await counts();
      const client = await kit.connect(await kit.assertion({ email: 'bob@example.com', sub: 'heitan-sub-bob' }));
      const res = await call(client, 'create_recipe', valid({ title: 'Should not exist' }));
      expect(res.isError).toBe(true);
      expect(res.text).toContain('https://commonplace.test/auth/sso');
      expect(res.text).toContain('not signed in');
      expect(await counts()).toEqual(before);
      expect((await prisma.contributor.findUnique({ where: { id: bob.id } })).externalId).toBeNull();
    });

    it('an unknown verified email: tool error naming /auth/sso, nothing created or bound, reads still answer', async () => {
      await start();
      const before = await counts();
      const client = await kit.connect(await kit.assertion({ email: 'stranger@example.com', sub: 'sub-stranger' }));
      const res = await call(client, 'create_recipe', valid({ title: 'Stranger dish' }));
      expect(res.isError).toBe(true);
      expect(res.text).toContain('https://commonplace.test/auth/sso');
      expect(await counts()).toEqual(before);
      const read = await call(client, 'search_recipes', { q: 'tomato' });
      expect(read.isError).toBe(false);
      expect((await call(client, 'list_contributors')).isError).toBe(false);
      expect(await counts()).toEqual(before);
    });

    it('findBoundContributor never writes: no create, update or upsert is reachable from it', async () => {
      const calls = [];
      const spy = new Proxy(prisma.contributor, {
        get: (t, p) => (['create', 'update', 'updateMany', 'upsert', 'delete', 'deleteMany'].includes(p) ? () => calls.push(p) : t[p].bind(t))
      });
      await findBoundContributor({ contributor: spy }, { email: 'bob@example.com', sub: 'x' });
      await findBoundContributor({ contributor: spy }, { email: 'ann@example.com', sub: 'y' });
      expect(calls).toEqual([]);
    });
  });

  describe('criterion 8: source is required', () => {
    it.each([
      ['missing', (b) => { delete b.source; }],
      ['blank', (b) => { b.source = '   '; }],
      ['empty', (b) => { b.source = ''; }],
      ['manual', (b) => { b.source = 'manual'; }],
      ['Manual with spaces', (b) => { b.source = '  Manual '; }]
    ])('%s is refused and no row is written', async (_n, mutate) => {
      const client = await asAnn();
      const before = await prisma.recipe.count();
      const body = valid({ title: 'No source' });
      mutate(body);
      const res = await call(client, 'create_recipe', body);
      expect(res.isError).toBe(true);
      expect(await prisma.recipe.count()).toBe(before);
    });
  });

  describe('criterion 9: caps', () => {
    const over = [
      ['title', { title: rep(LIMITS.title + 1) }],
      ['source', { source: rep(LIMITS.source + 1) }],
      ['ingredient name', { ingredients: [{ name: rep(LIMITS.ingredientText + 1) }] }],
      ['ingredient amount', { ingredients: [{ name: 'a', amount: rep(LIMITS.ingredientText + 1) }] }],
      ['direction text', { directions: [rep(LIMITS.directionText + 1)] }],
      ['direction instruction', { directions: [{ instruction: rep(LIMITS.directionText + 1) }] }],
      ['ingredient count', { ingredients: Array.from({ length: LIMITS.ingredients + 1 }, () => ({ name: 'a' })) }],
      ['direction count', { directions: Array.from({ length: LIMITS.directions + 1 }, () => 'step') }],
      ['tag count', { tags: Array.from({ length: LIMITS.tags + 1 }, (_, i) => `t${i}`) }],
      ['tag length', { tags: [rep(LIMITS.tagLength + 1)] }]
    ];
    it.each(over)('over the %s cap is refused and writes no row', async (_n, patch) => {
      const client = await asAnn();
      const before = await prisma.recipe.count();
      const res = await call(client, 'create_recipe', valid({ title: 'Cap test', ...patch }));
      expect(res.isError).toBe(true);
      expect(await prisma.recipe.count()).toBe(before);
    });

    it('a recipe exactly at the title and source caps is accepted', async () => {
      const client = await asAnn();
      const res = await call(client, 'create_recipe', valid({ title: rep(LIMITS.title), source: rep(LIMITS.source) }));
      expect(res.isError).toBe(false);
    });

    it('an HttpError from the shared service becomes a tool error carrying its message; anything else is a fixed message, detail logged without arguments', async () => {
      let boom;
      await start({ createRecipe: async () => { throw boom; } });
      const client = await kit.connect(await kit.assertion({ email: 'ann@example.com', sub: 'sub-ann' }));
      boom = new HttpError(400, 'title is too long (at most 200 characters)');
      expect(await call(client, 'create_recipe', valid())).toMatchObject({ isError: true, text: 'title is too long (at most 200 characters)' });
      boom = Object.assign(new Error('secret detail: lentils at db host'), { code: 'P1001' });
      const res = await call(client, 'create_recipe', valid());
      expect(res).toMatchObject({ isError: true, text: 'internal error' });
      const all = kit.logs.join('\n');
      expect(all).not.toContain('secret detail');
      expect(all).not.toContain('lentils');
      expect(all).toContain('mcp.error tool=create_recipe name=Error code=P1001');
    });
  });

  describe('COOK-14: create_recipe takes schema.org/Recipe JSON-LD', () => {
    it('files the prompt-shaped recipe under the caller and it reads back as the detail page needs', async () => {
      const client = await asAnn();
      const out = toolJson(await client.callTool({ name: 'create_recipe', arguments: { source: 'Gran', jsonld: promptRecipe } }));
      const got = toolJson(await client.callTool({ name: 'get_recipe', arguments: { id: out.id } }));
      expect(got).toMatchObject({
        title: 'Lemon Lentil Soup', source: 'Gran', sourceUrl: 'https://example.com/lentil-soup', servings: 4,
        prepTime: 10, cookTime: 35, totalMinutes: 45, category: 'Soup', cuisine: 'Mediterranean', vegetarian: true,
        contributor: { name: 'Ann' }
      });
      expect(got.ingredients.map((i) => [i.amount, i.unit, i.name, i.quantity])).toEqual([
        ['1 1/2', 'cups', 'red lentils', 1.5], ['2', 'cloves', 'garlic, minced', 2], ['1-2', 'tbsp', 'olive oil', null],
        ['1/2', 'tsp', 'cumin', 0.5], [null, null, 'salt to taste', null]
      ]);
      expect(got.directions).toHaveLength(3);
      expect(got.tags.map((t) => t.name).sort()).toEqual(['Lentil', 'Soup', 'Weeknight']);
    });

    it('accepts JSON text, an @graph, and sections with headings', async () => {
      const client = await asAnn();
      const a = toolJson(await client.callTool({ name: 'create_recipe', arguments: { source: 'Site', jsonld: JSON.stringify(inGraph) } }));
      expect((await prisma.recipe.findUnique({ where: { id: a.id } })).title).toBe('Graph Pancakes');
      const b = toolJson(await client.callTool({ name: 'create_recipe', arguments: { source: 'Site', jsonld: withSections } }));
      const dirs = await prisma.direction.findMany({ where: { recipeId: b.id }, orderBy: { stepNumber: 'asc' } });
      expect(dirs.map((d) => d.heading)).toEqual(['Cake', null, 'Frosting', null]);
    });

    it('still requires a source: none, blank or manual is refused and nothing is written', async () => {
      const client = await asAnn();
      const before = await prisma.recipe.count();
      for (const source of [undefined, '  ', 'manual']) {
        expect((await call(client, 'create_recipe', { source, jsonld: promptRecipe })).isError).toBe(true);
      }
      expect(await prisma.recipe.count()).toBe(before);
    });

    it('keeps the identity rules: an unbound caller is refused', async () => {
      await start();
      const client = await kit.connect(await kit.assertion({ email: 'bob@example.com', sub: 'heitan-sub-bob' }));
      const before = await prisma.recipe.count();
      const res = await call(client, 'create_recipe', { source: 'Gran', jsonld: promptRecipe });
      expect(res.text).toContain('not signed in');
      expect(await prisma.recipe.count()).toBe(before);
    });

    it('refuses jsonld together with recipe fields, a missing title, and documents with no usable Recipe', async () => {
      const client = await asAnn();
      const before = await prisma.recipe.count();
      expect((await call(client, 'create_recipe', { source: 's', jsonld: promptRecipe, title: 'x' })).text).toMatch(/either jsonld or title/);
      expect((await call(client, 'create_recipe', { source: 's' })).text).toMatch(/title is required/);
      expect((await call(client, 'create_recipe', { source: 's', jsonld: '{bad' })).text).toMatch(/not valid JSON/);
      expect((await call(client, 'create_recipe', { source: 's', jsonld: { '@type': 'Article' } })).text).toMatch(/no schema.org\/Recipe/);
      expect(await prisma.recipe.count()).toBe(before);
    });

    it.each([
      ['title', { name: rep(LIMITS.title + 1) }, /title is too long/],
      ['ingredient count', { recipeIngredient: Array.from({ length: LIMITS.ingredients + 1 }, () => '1 egg') }, /ingredients takes at most/],
      ['direction count', { recipeInstructions: Array.from({ length: LIMITS.directions + 1 }, () => 'Stir.') }, /directions takes at most/],
      ['ingredient text', { recipeIngredient: [rep(LIMITS.ingredientText + 1)] }, /too long/],
      ['direction text', { recipeInstructions: [rep(LIMITS.directionText + 1)] }, /too long/],
      ['section heading', { recipeInstructions: [{ '@type': 'HowToSection', name: rep(LIMITS.directionText + 1), itemListElement: [{ text: 'a' }] }] }, /too long/]
    ])('the %s cap still applies after mapping and writes no row', async (_n, patch, msg) => {
      const client = await asAnn();
      const before = await prisma.recipe.count();
      const res = await call(client, 'create_recipe', { source: 's', jsonld: { '@type': 'Recipe', name: 'Cap', ...patch } });
      expect(res.isError).toBe(true);
      expect(res.text).toMatch(msg);
      expect(await prisma.recipe.count()).toBe(before);
    });
  });

  describe('criterion 10: parity with REST', () => {
    it('search_recipes returns the same ids as GET /api/search for the same filters', async () => {
      const { app } = await createTestApp(prisma);
      const client = await asAnn();
      const cases = [
        [{ q: 'tomato' }, '?q=tomato'],
        [{ q: 'salad', vegetarian: false }, '?q=salad'],
        [{ ingredient: 'tomatoes' }, '?ingredient=tomatoes'],
        [{ tag: 'soup' }, '?tag=soup'],
        [{ vegetarian: true, maxMinutes: 30 }, '?vegetarian=1&maxMinutes=30'],
        [{ maxMinutes: 20 }, '?maxMinutes=20'],
        [{ contributor: cy.id }, `?contributor=${cy.id}`]
      ];
      for (const [args, qs] of cases) {
        const mcp = toolJson(await client.callTool({ name: 'search_recipes', arguments: args })).recipes.map((r) => r.id);
        const rest = (await request(app).get(`/api/search${qs}`)).body.map((r) => r.id);
        expect(mcp, qs).toEqual(rest);
        expect(mcp.length, qs).toBeGreaterThan(0);
      }
    });

    it('random_recipe returns the same pick as GET /api/recipes/random for the same filters and rng', async () => {
      const { app } = await createTestApp(prisma);
      const client = await asAnn();
      for (const rng of [0, 0.5, 0.999]) {
        vi.spyOn(Math, 'random').mockReturnValue(rng);
        const mcp = toolJson(await client.callTool({ name: 'random_recipe', arguments: { maxMinutes: 30 } }));
        const rest = (await request(app).get('/api/recipes/random?maxMinutes=30')).body;
        expect(mcp.recipe.id).toBe(rest.recipe.id);
        expect(mcp.matches).toBe(rest.matches);
        vi.restoreAllMocks();
      }
      const withRng = await start({ rng: () => 0 });
      const c2 = await withRng.connect(await withRng.assertion());
      const pick = toolJson(await c2.callTool({ name: 'random_recipe', arguments: { vegetarian: false } }));
      expect(pick.recipe).not.toBeNull();
    });
  });

  it('logs one mcp.call line per call without the email, the assertion or the arguments', async () => {
    await start();
    const jwt = await kit.assertion({ email: 'ann@example.com', sub: 'sub-ann' });
    const client = await kit.connect(jwt);
    await client.callTool({ name: 'search_recipes', arguments: { q: 'tomato-secret-term' } });
    await client.callTool({ name: 'create_recipe', arguments: valid({ title: 'Logged dish' }) });
    const calls = kit.logs.filter((l) => l.startsWith('mcp.call'));
    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatch(/^mcp\.call tool=search_recipes caller=unknown ok ms=\d+$/);
    expect(calls[1]).toMatch(/^mcp\.call tool=create_recipe caller=\S+ ok ms=\d+$/);
    const all = kit.logs.join('\n');
    expect(all).not.toContain('ann@example.com');
    expect(all).not.toContain(jwt);
    expect(all).not.toContain('tomato-secret-term');
  });
});
