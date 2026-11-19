/** COOK-14: POST /api/import/jsonld against a real scratch Postgres. */
import request from 'supertest';
import { it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { describeDb, createScratchDb } from './helpers/db.js';
import { createTestApp, authed } from './helpers/auth.js';
import { LIMITS } from '../src/services/recipes.js';
import { promptRecipe, helloFreshLike, inGraph } from './fixtures/jsonld.js';

describeDb('POST /api/import/jsonld', () => {
  let db;
  let app;
  let me; // authed client
  beforeAll(async () => {
    db = await createScratchDb();
    const t = await createTestApp(db.prisma);
    app = t.app;
    const m = await db.prisma.contributor.findFirst({ where: { name: 'magos' } });
    await db.prisma.contributor.update({ where: { id: m.id }, data: { email: 'magos@example.com' } });
    const cookie = await t.signIn('magos@example.com');
    me = () => authed(app, cookie);
  });
  afterAll(async () => { await db?.drop(); });
  beforeEach(async () => { await db.prisma.recipe.deleteMany(); });

  it('is closed without a session and writes nothing', async () => {
    const res = await request(app).post('/api/import/jsonld').send({ jsonld: promptRecipe, source: 'Gran' });
    expect(res.status).toBe(401);
    expect(await db.prisma.recipe.count()).toBe(0);
  });

  it('creates the recipe under the signed-in caller and presents it like POST /api/recipes', async () => {
    const res = await me().post('/api/import/jsonld').send({ jsonld: promptRecipe, source: 'Gran' }).expect(201);
    expect(res.body).toMatchObject({
      title: 'Lemon Lentil Soup', source: 'Gran', servings: 4, totalMinutes: 45, vegetarian: true, category: 'Soup', cuisine: 'Mediterranean'
    });
    expect(res.body.contributor.name).toBe('magos');
    expect(res.body.ingredients).toHaveLength(5);
    expect(res.body.directions.map((d) => d.stepNumber)).toEqual([1, 2, 3]);
    await request(app).get(`/api/recipes/${res.body.id}`).expect(200);
  });

  it('takes a HelloFresh-like page with only a total time, and an @graph', async () => {
    const a = await me().post('/api/import/jsonld').send({ jsonld: helloFreshLike, source: 'Meal kit' }).expect(201);
    expect(a.body).toMatchObject({ totalMinutes: 30, prepTime: null, cookTime: null, timeSplitEstimated: false });
    const b = await me().post('/api/import/jsonld').send({ jsonld: JSON.stringify(inGraph), source: 'Site' }).expect(201);
    expect(b.body.title).toBe('Graph Pancakes');
  });

  it('ignores a contributorId in the body', async () => {
    const other = await db.prisma.contributor.create({ data: { name: 'Other' } });
    const res = await me().post('/api/import/jsonld').send({ jsonld: promptRecipe, source: 'Gran', contributorId: other.id }).expect(201);
    expect(res.body.contributor.name).toBe('magos');
  });

  it.each([
    ['no jsonld', { source: 'Gran' }, /jsonld is required/],
    ['no source', { jsonld: promptRecipe }, /source is required/],
    ['blank source', { jsonld: promptRecipe, source: ' ' }, /source is required/],
    ['manual source', { jsonld: promptRecipe, source: 'manual' }, /source is required/],
    ['not a Recipe', { jsonld: { '@type': 'Article' }, source: 's' }, /no schema.org\/Recipe/],
    ['bad JSON text', { jsonld: '{x', source: 's' }, /not valid JSON/],
    ['title over the cap', { jsonld: { '@type': 'Recipe', name: 'x'.repeat(LIMITS.title + 1) }, source: 's' }, /title is too long/],
    ['source over the cap', { jsonld: promptRecipe, source: 'x'.repeat(LIMITS.source + 1) }, /source is too long/],
    ['too many ingredients', { jsonld: { '@type': 'Recipe', name: 'x', recipeIngredient: Array.from({ length: LIMITS.ingredients + 1 }, () => '1 egg') }, source: 's' }, /ingredients takes at most/]
  ])('%s is a 400 and writes no row', async (_n, body, msg) => {
    const res = await me().post('/api/import/jsonld').send(body).expect(400);
    expect(res.body.error).toMatch(msg);
    expect(await db.prisma.recipe.count()).toBe(0);
  });
});
