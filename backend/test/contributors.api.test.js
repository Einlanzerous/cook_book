/**
 * COOK-11 contributor API over HTTP (supertest) against a migrated scratch
 * Postgres. Skipped without COOK_TEST_DATABASE_URL.
 */
import request from 'supertest';
import { it, expect, beforeAll, afterAll, vi } from 'vitest';
import { describeDb, createScratchDb } from './helpers/db.js';
import { createApp } from '../src/app.js';
import { summariseSources } from '../src/services/contributors.js';
import { describe } from 'vitest';

describe('summariseSources', () => {
  it('groups on lower(trim(source)), drops manual/blank, sorts by count', () => {
    const out = summariseSources([
      { source: 'HelloFresh' },
      { source: ' hellofresh ' },
      { source: 'manual' },
      { source: 'Manual' },
      { source: '  ' },
      { source: null },
      { source: 'NYT Cooking' },
      { source: 'Grandma Ada’s card', n: 3 }
    ]);
    expect(out).toEqual([
      { name: 'Grandma Ada’s card', count: 3 },
      { name: 'HelloFresh', count: 2 },
      { name: 'NYT Cooking', count: 1 }
    ]);
  });
});

describeDb('contributors API', () => {
  let db;
  let app;
  let mara;
  let wren;

  const recipe = (title, source, contributorId, createdAt) =>
    db.prisma.recipe.create({ data: { title, source, contributorId, ...(createdAt && { createdAt }) } });

  beforeAll(async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    db = await createScratchDb();
    app = createApp({ prisma: db.prisma });
    mara = await db.prisma.contributor.create({
      data: { name: 'Mara Okafor', bio: 'Weeknight bowls.', joinedAt: new Date('2026-02-03T18:00:00Z'), email: 'm@example.com' }
    });
    wren = await db.prisma.contributor.create({ data: { name: 'Wren Ellis' } });
    await recipe('Bibimbap', 'HelloFresh', mara.id, new Date('2026-03-01'));
    await recipe('Pie', 'hellofresh ', mara.id, new Date('2026-03-02'));
    await recipe('Chowder', 'Grandma Ada’s card', mara.id, new Date('2026-03-03'));
    await recipe('Toast', 'manual', mara.id, new Date('2026-03-04'));
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await db?.drop();
  });

  describe('GET /api/contributors', () => {
    it('lists every cook with counts, ordered by name, with no PII', async () => {
      const res = await request(app).get('/api/contributors');
      expect(res.status).toBe(200);
      expect(res.body.map((c) => c.name)).toEqual(['magos', 'Mara Okafor', 'Wren Ellis']);
      const m = res.body.find((c) => c.name === 'Mara Okafor');
      expect(m).toMatchObject({ id: mara.id, bio: 'Weeknight bowls.', portraitUrl: null, recipeCount: 4, sourceCount: 2 });
      expect(new Date(m.joinedAt).toISOString()).toBe('2026-02-03T18:00:00.000Z');
      expect(m).not.toHaveProperty('email');
      expect(m).not.toHaveProperty('externalId');
    });

    it('shows a cook with no recipes as zeroes', async () => {
      const res = await request(app).get('/api/contributors');
      expect(res.body.find((c) => c.name === 'Wren Ellis')).toMatchObject({ recipeCount: 0, sourceCount: 0 });
    });
  });

  describe('GET /api/contributors/:id', () => {
    it('returns the profile: stats, cited sources, and recipes in list shape, newest first', async () => {
      const res = await request(app).get(`/api/contributors/${mara.id}`);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        id: mara.id,
        name: 'Mara Okafor',
        bio: 'Weeknight bowls.',
        recipeCount: 4,
        sourceCount: 2,
        stats: { recipes: 4, sources: 2 }
      });
      expect(new Date(res.body.stats.since).toISOString()).toBe('2026-02-03T18:00:00.000Z');
      expect(res.body.sources).toEqual([
        { name: 'HelloFresh', count: 2 },
        { name: 'Grandma Ada’s card', count: 1 }
      ]);
      expect(res.body.recipes.map((r) => r.title)).toEqual(['Toast', 'Chowder', 'Pie', 'Bibimbap']);
      const first = res.body.recipes[0];
      expect(first).toHaveProperty('sourceLabel', null);
      expect(first).toHaveProperty('ingredients');
      expect(first).toHaveProperty('tags');
      expect(first.contributor).toMatchObject({ id: mara.id, name: 'Mara Okafor' });
      expect(res.body.recipes.find((r) => r.title === 'Pie').sourceLabel).toBe('HelloFresh');
      expect(res.body).not.toHaveProperty('email');
    });

    it('renders a cook with no recipes', async () => {
      const res = await request(app).get(`/api/contributors/${wren.id}`);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ recipeCount: 0, sourceCount: 0, sources: [], recipes: [], stats: { recipes: 0, sources: 0 } });
    });

    it('404s for an unknown id', async () => {
      const res = await request(app).get('/api/contributors/nope');
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/contributors', () => {
    it('creates a cook with just a name', async () => {
      const res = await request(app).post('/api/contributors').send({ name: '  Theo Brandt ' });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ name: 'Theo Brandt', bio: null, portraitUrl: null, recipeCount: 0, sourceCount: 0 });
      expect(res.body.id).toBeTruthy();
      expect(res.body.joinedAt).toBeTruthy();
      expect((await request(app).get(`/api/contributors/${res.body.id}`)).status).toBe(200);
    });

    it('stores optional bio, portraitUrl, email, externalId (email/externalId not echoed)', async () => {
      const res = await request(app)
        .post('/api/contributors')
        .send({ name: 'Ines Rojas', bio: 'Noodles.', portraitUrl: 'https://x.test/i.jpg', email: 'i@example.com', externalId: 'sub-1' });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ bio: 'Noodles.', portraitUrl: 'https://x.test/i.jpg' });
      const row = await db.prisma.contributor.findUnique({ where: { id: res.body.id } });
      expect(row).toMatchObject({ email: 'i@example.com', externalId: 'sub-1' });
    });

    it('409s on a case-insensitive duplicate name', async () => {
      const res = await request(app).post('/api/contributors').send({ name: 'mara OKAFOR' });
      expect(res.status).toBe(409);
    });

    it('409s on a duplicate email', async () => {
      const res = await request(app).post('/api/contributors').send({ name: 'Someone Else', email: 'm@example.com' });
      expect(res.status).toBe(409);
    });

    it.each([[{}], [{ name: '   ' }], [{ name: 42 }], [{ name: 'Ok', bio: 5 }]])('400s on invalid body %j', async (body) => {
      const res = await request(app).post('/api/contributors').send(body);
      expect(res.status).toBe(400);
    });

    it('has no DELETE endpoint', async () => {
      const res = await request(app).delete(`/api/contributors/${mara.id}`);
      expect(res.status).not.toBe(200);
      expect(res.status).not.toBe(204);
      expect(await db.prisma.contributor.findUnique({ where: { id: mara.id } })).not.toBeNull();
    });
  });
});
