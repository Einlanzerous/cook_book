/**
 * COOK-6 criteria 4-6, 10, 11, 12 over HTTP (supertest) against a real,
 * migrated scratch Postgres. Skipped without COOK_TEST_DATABASE_URL.
 */
import fs from 'node:fs';
import express from 'express';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { describeDb, createScratchDb } from './helpers/db.js';
import { createTestApp, authed } from './helpers/auth.js';
import { errorHandler } from '../src/middleware/errorHandler.js';

const exampleFixture = JSON.parse(
  fs.readFileSync(new URL('./fixtures/recipe-response.example.json', import.meta.url), 'utf8')
);

describeDb('recipes API', () => {
  let db;
  let app;
  let t;
  let cookie;
  let magosId;
  const me = () => authed(app, cookie);

  beforeAll(async () => {
    db = await createScratchDb();
    t = await createTestApp(db.prisma);
    app = t.app;
    // Sign in as the legacy owner: bind the email, then first sign-in binds the sub.
    const magos = await db.prisma.contributor.findFirst({ where: { name: 'magos' } }).then((m) => db.prisma.contributor.update({ where: { id: m.id }, data: { email: 'magos@example.com' } }));
    magosId = magos.id;
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
  });

  const fullBody = (over = {}) => ({
    title: 'Bibimbap',
    description: 'Mixed rice',
    servings: 2,
    prepTime: 10,
    cookTime: 20,
    source: 'HelloFresh',
    sourceUrl: 'https://www.hellofresh.com/recipes/x',
    category: 'main course',
    cuisine: 'korean',
    vegetarian: false,
    notes: 'Swap in chicken.',
    ingredients: [
      { name: 'Jasmine rice', amount: '¾', unit: 'cup' },
      { name: 'Ginger', amount: '1 thumb' },
      { name: 'Salt & pepper', amount: null }
    ],
    directions: [
      { instruction: 'Cook the rice.', heading: 'Cook the rice' },
      'Serve.'
    ],
    tags: ['beef', 'Weeknight'],
    ...over
  });

  // ---- criterion 5: shape ----
  describe('shape and compatibility (criterion 5)', () => {
    it('POST returns the full shape and matches the committed example fixture', async () => {
      const res = await me().post('/api/recipes').send(fullBody()).expect(201);
      const r = res.body;
      expect(r.contributor).toMatchObject({ id: magosId, name: 'magos', bio: null, portraitUrl: null });
      expect(Object.keys(r.contributor).sort()).toEqual(['bio', 'id', 'joinedAt', 'name', 'portraitUrl']);
      expect(r).toMatchObject({
        source: 'HelloFresh', sourceLabel: 'HelloFresh', category: 'Main Course', cuisine: 'Korean',
        vegetarian: false, prepTime: 10, cookTime: 20, totalMinutes: 30, timeSplitEstimated: false,
        notes: 'Swap in chicken.'
      });
      expect(r.ingredients.map((i) => i.quantity).sort()).toEqual([0.75].concat([null, null]).sort());
      expect(typeof r.ingredients.find((i) => i.name === 'Jasmine rice').quantity).toBe('number');
      expect(r.directions.map((d) => d.heading)).toEqual(['Cook the rice', null]);

      // Shape-compare with the committed example (values differ; keys and types must not).
      expect(shapeOf(r)).toEqual(shapeOf(exampleFixture));
    });

    it('GET list, GET one and GET /api/tags/:name/recipes share the shape', async () => {
      const created = (await me().post('/api/recipes').send(fullBody())).body;
      const one = (await me().get(`/api/recipes/${created.id}`).expect(200)).body;
      const list = (await me().get('/api/recipes').expect(200)).body;
      const byTag = (await me().get('/api/tags/Beef/recipes').expect(200)).body;
      expect(shapeOf(one)).toEqual(shapeOf(exampleFixture));
      expect(shapeOf(list[0])).toEqual(shapeOf(exampleFixture));
      expect(shapeOf(byTag[0])).toEqual(shapeOf(exampleFixture));
    });

    it('/api/search returns the same shape (contributor, sourceLabel)', async () => {
      await me().post('/api/recipes').send(fullBody());
      const res = (await me().get('/api/search').query({ q: 'bibimbap' }).expect(200)).body;
      expect(res).toHaveLength(1);
      expect(res[0].contributor.name).toBe('magos');
      expect(res[0].sourceLabel).toBe('HelloFresh');
      expect(shapeOf(res[0])).toEqual(shapeOf(exampleFixture));
    });

    it('sort=createdAt orders by creation; the default stays updatedAt', async () => {
      const a = (await me().post('/api/recipes').send({ title: 'A' })).body;
      await new Promise((r) => setTimeout(r, 15));
      const b = (await me().post('/api/recipes').send({ title: 'B' })).body;
      await new Promise((r) => setTimeout(r, 15));
      await me().put(`/api/recipes/${a.id}`).send({ description: 'touched' }).expect(200);

      const byCreated = (await me().get('/api/recipes?sort=createdAt')).body.map((r) => r.title);
      const byDefault = (await me().get('/api/recipes')).body.map((r) => r.title);
      expect(byCreated).toEqual(['B', 'A']);
      expect(byDefault).toEqual(['A', 'B']);
      expect(b.id).toBeTruthy();
    });

    it('POST without source: 201, source "manual", sourceLabel null (the web form sends none)', async () => {
      const res = await me().post('/api/recipes').send({ title: 'No source' }).expect(201);
      expect(res.body.source).toBe('manual');
      expect(res.body.sourceLabel).toBeNull();
    });

    it.each(['', '   ', null])('blank source %j is treated as manual', async (source) => {
      const res = await me().post('/api/recipes').send({ title: 'Blank', source }).expect(201);
      expect(res.body.source).toBe('manual');
      expect(res.body.sourceLabel).toBeNull();
    });

    it('source is trimmed on write; the label is derived case-insensitively; other sources show trimmed', async () => {
      const hf = await me().post('/api/recipes').send({ title: 'x', source: ' hellofresh ' }).expect(201);
      expect(hf.body.source).toBe('hellofresh');
      expect(hf.body.sourceLabel).toBe('HelloFresh');
      const nyt = await me().post('/api/recipes').send({ title: 'y', source: ' NYT Cooking ' }).expect(201);
      expect(nyt.body.source).toBe('NYT Cooking');
      expect(nyt.body.sourceLabel).toBe('NYT Cooking');
    });

    it('POST attributes the recipe to the signed-in caller (no fallback)', async () => {
      const res = await me().post('/api/recipes').send({ title: 'T' }).expect(201);
      expect(res.body.contributor.id).toBe(magosId);
    });

    it('a contributorId in a create body is ignored, never trusted', async () => {
      const ada = await db.prisma.contributor.create({ data: { name: 'Ada' } });
      const res = await me().post('/api/recipes').send({ title: 'T', contributorId: ada.id }).expect(201);
      expect(res.body.contributor.id).toBe(magosId);
      const bad = await me().post('/api/recipes').send({ title: 'T', contributorId: 'nope' }).expect(201);
      expect(bad.body.contributor.id).toBe(magosId);
    });

    it('a contributorId on PUT is ignored with a 200 (attribution is immutable, stated default D3)', async () => {
      const ada = await db.prisma.contributor.create({ data: { name: 'Ada' } });
      const r = (await me().post('/api/recipes').send({ title: 'T' })).body;
      for (const contributorId of [ada.id, 'nope', null]) {
        const put = await me().put(`/api/recipes/${r.id}`).send({ contributorId, title: 'T2' });
        expect(put.status).toBe(200);
        expect(put.body.contributor.id).toBe(magosId);
      }
    });

    it('a request body in the old shape (what the current frontend sends) still succeeds', async () => {
      const old = {
        title: 'Old form', description: 'd', imageUrl: '', servings: 4, prepTime: 5, cookTime: 10,
        ingredients: [{ name: 'flour', amount: '2', unit: 'cups' }],
        directions: ['Mix', 'Bake'],
        tags: ['Dessert']
      };
      const res = await me().post('/api/recipes').send(old).expect(201);
      expect(res.body.totalMinutes).toBe(15);
      expect(res.body.directions.map((d) => d.instruction)).toEqual(['Mix', 'Bake']);
      expect(res.body.ingredients[0].quantity).toBe(2);
      await me().put(`/api/recipes/${res.body.id}`).send(old).expect(200);
    });

    it('raw (stored) source is returned as-is; mixed-case legacy rows are tolerated', async () => {
      await db.prisma.recipe.create({ data: { title: 'legacy', source: 'hellofresh', prepTime: 5, cookTime: 10 } });
      const [r] = (await me().get('/api/recipes')).body;
      expect(r.source).toBe('hellofresh');
      expect(r.sourceLabel).toBe('HelloFresh');
      expect(r.contributor).toBeNull();            // contributorId NULL (written by the 1.2.0 image)
      expect(r.totalMinutes).toBe(15);             // read: totalMinutes ?? prep+cook
      expect(r.timeSplitEstimated).toBe(false);
      await me().get(`/api/recipes/${r.id}`).expect(200);
      await me().put(`/api/recipes/${r.id}`).send({ title: 'edited' }).expect(200);
    });

    it('has indexes on contributorId, lower(source) and totalMinutes (pg_indexes)', async () => {
      const rows = await db.prisma.$queryRaw`SELECT indexdef FROM pg_indexes WHERE tablename = 'Recipe'`;
      const defs = rows.map((r) => r.indexdef).join('\n');
      expect(defs).toMatch(/\("contributorId"\)/);
      expect(defs).toMatch(/\("totalMinutes"\)/);
      expect(defs).toMatch(/lower\(source\)/);
    });
  });

  // ---- criterion 6 ----
  describe('PUT is a partial, transactional update (criterion 6)', () => {
    async function seeded() {
      // Ada signs in (first sign-in creates her), is renamed, and files the recipe.
      const adaCookie = await t.signIn('ada@example.com');
      const ada = await db.prisma.contributor.update({ where: { email: 'ada@example.com' }, data: { name: 'Ada' } });
      const res = await authed(app, adaCookie)
        .post('/api/recipes')
        .send(fullBody({ timeSplitEstimated: true, vegetarian: true }))
        .expect(201);
      return { ada, recipe: res.body };
    }

    it('an old-shape PUT erases no heading, contributor, category, cuisine, notes, vegetarian or timeSplitEstimated', async () => {
      const { ada, recipe } = await seeded();
      const oldShape = {
        title: 'Bibimbap (edited)', description: 'Mixed rice', imageUrl: '', servings: 2, prepTime: 10, cookTime: 20,
        ingredients: [{ name: 'Jasmine rice', amount: '1½', unit: 'cup' }, { name: 'Ginger', amount: '2', unit: 'thumb' }],
        directions: [
          { stepNumber: 1, instruction: 'Cook the rice, covered.' },
          'Serve warm.'
        ]
      };
      const res = await me().put(`/api/recipes/${recipe.id}`).send(oldShape).expect(200);
      const r = res.body;
      expect(r.title).toBe('Bibimbap (edited)');
      expect(r.directions.map((d) => d.heading)).toEqual(['Cook the rice', null]);
      expect(r.directions[0].instruction).toBe('Cook the rice, covered.');
      expect(r.contributor.id).toBe(ada.id);
      expect(r).toMatchObject({
        category: 'Main Course', cuisine: 'Korean', notes: 'Swap in chicken.',
        vegetarian: true, timeSplitEstimated: true, source: 'HelloFresh', totalMinutes: 30
      });
      expect(r.tags.map((t) => t.name).sort()).toEqual(['Beef', 'Weeknight']);
      // quantity derived from the supplied amount (1½ -> 1.5, amount text "1 1/2")
      const rice = r.ingredients.find((i) => i.name === 'Jasmine rice');
      expect(rice.quantity).toBe(1.5);
      expect(rice.amount).toBe('1 1/2');
    });

    it('omitted ingredients/directions/tags are untouched; only supplied fields change', async () => {
      const { recipe } = await seeded();
      const res = await me().put(`/api/recipes/${recipe.id}`).send({ notes: 'new tip' }).expect(200);
      expect(res.body.notes).toBe('new tip');
      expect(res.body.title).toBe('Bibimbap');
      expect(res.body.ingredients).toHaveLength(3);
      expect(res.body.directions).toHaveLength(2);
      expect(res.body.tags).toHaveLength(2);
    });

    it('explicit heading (including null) is honoured when supplied', async () => {
      const { recipe } = await seeded();
      const res = await me().put(`/api/recipes/${recipe.id}`)
        .send({ directions: [{ instruction: 'One', heading: null }, { instruction: 'Two', heading: 'Serve' }] })
        .expect(200);
      expect(res.body.directions.map((d) => d.heading)).toEqual([null, 'Serve']);
    });

    it('prepTime/cookTime without totalMinutes re-derive the stored total from the merged values', async () => {
      const { recipe } = await seeded();
      const res = await me().put(`/api/recipes/${recipe.id}`).send({ cookTime: 40 }).expect(200);
      expect(res.body).toMatchObject({ prepTime: 10, cookTime: 40, totalMinutes: 50, timeSplitEstimated: true });
    });

    it('a forced failure midway rolls everything back', async () => {
      const { recipe } = await seeded();
      const before = (await me().get(`/api/recipes/${recipe.id}`)).body;
      // The second ingredient has no name: Prisma rejects the nested create
      // AFTER the existing ingredients were deleted inside the transaction.
      const res = await me().put(`/api/recipes/${recipe.id}`).send({
        title: 'Should not stick',
        ingredients: [{ name: 'fine', amount: '1' }, { amount: '2' }],
        directions: ['gone?'],
        tags: ['Different']
      });
      expect(res.status).toBe(500);
      const after = (await me().get(`/api/recipes/${recipe.id}`)).body;
      expect(after).toEqual(before);
      expect(after.ingredients).toHaveLength(3);
      expect(after.directions).toHaveLength(2);
    });

    it('404 for an unknown recipe', async () => {
      await me().put('/api/recipes/does-not-exist').send({ title: 'x' }).expect(404);
    });
  });

  // ---- criterion 11 ----
  describe('timeSplitEstimated (criterion 11)', () => {
    it('is a stored boolean defaulting to false; prep/cook are never changed by it', async () => {
      const a = (await me().post('/api/recipes').send({ title: 'a', prepTime: 7, cookTime: 8 })).body;
      expect(a.timeSplitEstimated).toBe(false);
      const b = (await me().post('/api/recipes')
        .send({ title: 'b', prepTime: 7, cookTime: 8, timeSplitEstimated: true })).body;
      expect(b).toMatchObject({ timeSplitEstimated: true, prepTime: 7, cookTime: 8 });
    });
  });

  // ---- criterion 12 ----
  describe('tags (criterion 12)', () => {
    it('POST and PUT with prep+cook produce no time tag; no cuisine/category/Vegetarian tag either', async () => {
      const r = (await me().post('/api/recipes').send(
        { title: 't', prepTime: 10, cookTime: 10, cuisine: 'Korean', category: 'Main', vegetarian: true, tags: ['chicken'] }
      ).expect(201)).body;
      expect(r.tags.map((t) => t.name)).toEqual(['Chicken']);
      const u = (await me().put(`/api/recipes/${r.id}`).send({ prepTime: 5, cookTime: 5, tags: ['Chicken', 'soup'] }).expect(200)).body;
      expect(u.tags.map((t) => t.name).sort()).toEqual(['Chicken', 'Soup']);
      expect(await db.prisma.tag.findMany({ where: { name: { in: ['15 Minutes', '30 Minutes', 'Vegetarian', 'Korean'] } } })).toEqual([]);
    });

    it('PUT with tags omitted leaves tags unchanged; tags: [] clears them', async () => {
      const r = (await me().post('/api/recipes').send({ title: 't', tags: ['a', 'b'] })).body;
      const kept = (await me().put(`/api/recipes/${r.id}`).send({ title: 't2' }).expect(200)).body;
      expect(kept.tags.map((t) => t.name).sort()).toEqual(['A', 'B']);
      const cleared = (await me().put(`/api/recipes/${r.id}`).send({ tags: [] }).expect(200)).body;
      expect(cleared.tags).toEqual([]);
    });

    it('legacy tags already on a row are left in place', async () => {
      const r = await db.prisma.recipe.create({
        data: { title: 'legacy', tags: { create: [{ name: '30 Minutes' }, { name: 'Vegetarian' }] } }
      });
      const res = (await me().put(`/api/recipes/${r.id}`).send({ title: 'still legacy' }).expect(200)).body;
      expect(res.tags.map((t) => t.name).sort()).toEqual(['30 Minutes', 'Vegetarian']);
    });

    it('/api/tags omits tags that have no recipes (orphaned legacy rows)', async () => {
      await db.prisma.tag.create({ data: { name: 'Orphan' } });
      await me().post('/api/recipes').send({ title: 'a', tags: ['Soup'] });
      await me().post('/api/recipes').send({ title: 'b', tags: ['Soup', 'Chicken'] });
      const tags = (await me().get('/api/tags').expect(200)).body;
      expect(tags.map((t) => [t.name, t.recipeCount])).toEqual([['Soup', 2], ['Chicken', 1]]);
    });
  });
});

// ---- criterion 10: contributor integrity (destructive; its own database) ----
describeDb('contributor integrity (criterion 10)', () => {
  let db;
  beforeAll(async () => {
    db = await createScratchDb();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await db?.drop();
  });

  it('names are unique case-insensitively at the database ("Ada" after "ada")', async () => {
    await db.prisma.contributor.create({ data: { name: 'ada' } });
    await expect(db.prisma.contributor.create({ data: { name: 'Ada' } })).rejects.toMatchObject({ code: 'P2002' });
    await expect(db.prisma.contributor.create({ data: { name: 'MAGOS' } })).rejects.toMatchObject({ code: 'P2002' });
  });

  it('a Prisma P2002 on that index is mapped to 409 by the error handler', async () => {
    const mini = express();
    mini.post('/contributors', async (req, res, next) => {
      try {
        res.status(201).json(await db.prisma.contributor.create({ data: { name: 'Bea' } }));
      } catch (e) { next(e); }
    });
    mini.use(errorHandler);
    await request(mini).post('/contributors').expect(201);
    const res = await request(mini).post('/contributors');
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already exists/);
    await db.prisma.contributor.deleteMany({ where: { name: 'Bea' } });
  });

  it('errorHandler maps P2002 directly', () => {
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    errorHandler({ code: 'P2002', meta: { target: 'x' } }, {}, res, () => {});
    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('deleting a contributor that owns recipes fails (ON DELETE RESTRICT) and the recipes survive', async () => {
    const c = await db.prisma.contributor.create({ data: { name: 'Owner' } });
    await db.prisma.recipe.create({ data: { title: 'Keep me', contributorId: c.id } });
    await expect(db.prisma.contributor.delete({ where: { id: c.id } })).rejects.toMatchObject({ code: 'P2003' });
    expect(await db.prisma.recipe.count({ where: { contributorId: c.id } })).toBe(1);
  });
});

/** Recursive key/type skeleton: arrays collapse to the shape of their first element. */
function shapeOf(v) {
  if (Array.isArray(v)) return v.length ? [shapeOf(v[0])] : [];
  if (v !== null && typeof v === 'object') {
    return Object.fromEntries(Object.keys(v).sort().map((k) => [k, shapeOf(v[k])]));
  }
  return 'value'; // nullable scalars: only the key set is part of the contract
}
