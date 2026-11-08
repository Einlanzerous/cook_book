/**
 * COOK-41 read hardening: the public GET surface is anonymous, bounded, shape
 * checked, leaks no contributor identity and answers 500s with a fixed body.
 */
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { describeDb, createScratchDb } from './helpers/db.js';
import { createTestApp } from './helpers/auth.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import { MAX_LIST_RESULTS, MAX_QUERY_LENGTH, MAX_TAG_LENGTH } from '../src/middleware/readLimits.js';

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

describe('error handler body', () => {
  const run = (err) => {
    const res = { code: null, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    errorHandler(err, {}, res, () => {});
    spy.mockRestore();
    return res;
  };

  it('500 never carries err.message or a stack', () => {
    const res = run(Object.assign(new Error('Invalid `prisma.recipe.findMany()` invocation: secret'), { status: 500 }));
    expect(res.code).toBe(500);
    expect(res.body).toEqual({ error: 'Internal server error' });
    expect(run(new Error('boom')).body).toEqual({ error: 'Internal server error' });
  });

  it('keeps the 409 and 404 bodies', () => {
    expect(run({ code: 'P2002' })).toMatchObject({ code: 409, body: { error: 'A record with this value already exists' } });
    expect(run({ code: 'P2025' })).toMatchObject({ code: 404, body: { error: 'Record not found' } });
    expect(run(Object.assign(new Error('Recipe not found'), { status: 404 }))).toMatchObject({ code: 404, body: { error: 'Recipe not found' } });
  });
});

describe('public reads without a database', () => {
  it('a failing Prisma call is a 500 with the generic body on a public route', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const prisma = { recipe: { findMany: () => { throw new Error('Invalid prisma invocation at /app/secret/path'); } } };
    const { app } = await createTestApp(prisma);
    const res = await request(app).get('/api/recipes');
    spy.mockRestore();
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Internal server error' });
    expect(res.text).not.toMatch(/prisma|secret|\/app\//i);
  });

  it('serves noindex headers and a disallow-all robots.txt', async () => {
    const { app } = await createTestApp({});
    const robots = await request(app).get('/robots.txt');
    expect(robots.status).toBe(200);
    expect(robots.type).toBe('text/plain');
    expect(robots.text).toBe('User-agent: *\nDisallow: /\n');
    expect(robots.headers['x-robots-tag']).toBe('noindex, nofollow');
    expect((await request(app).get('/api/health')).headers['x-robots-tag']).toBe('noindex, nofollow');
    expect((await request(app).get('/some/spa/route')).headers['x-robots-tag']).toBe('noindex, nofollow');
  });

  it('non-string and over-long query values are 400 before Prisma is touched', async () => {
    const touched = vi.fn();
    const prisma = new Proxy({}, { get: () => new Proxy({}, { get: () => touched }) });
    const { app } = await createTestApp(prisma);
    const bad = [
      '/api/recipes?tag[a]=b',
      '/api/recipes?tag=a&tag=b',
      '/api/recipes?sort[]=x',
      '/api/recipes?tag[]=x',
      '/api/search?q[]=x',
      '/api/search?q=a&q=b',
      '/api/search?q[a][b]=c',
      '/api/recipes/random?exclude[a]=b',
      '/api/recipes/random?vegetarian[]=1',
      '/api/tags/x/recipes?foo[a]=b',
      `/api/search?q=${'a'.repeat(MAX_QUERY_LENGTH + 1)}`,
      `/api/recipes?tag=${'a'.repeat(MAX_TAG_LENGTH + 1)}`,
      `/api/tags/${'a'.repeat(MAX_TAG_LENGTH + 1)}/recipes`
    ];
    for (const url of bad) {
      const res = await request(app).get(url);
      expect(res.status, url).toBe(400);
      expect(res.body.error).toBeTruthy();
    }
    expect(touched).not.toHaveBeenCalled();
  });
});

describeDb('public reads against a database', () => {
  let db;
  let app;
  let author;
  let recipe;

  beforeAll(async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    db = await createScratchDb();
    app = (await createTestApp(db.prisma)).app;
    author = await db.prisma.contributor.create({
      data: { name: 'Mara Okafor', email: 'mara.private@example.org', externalId: 'access-sub-7f3c9d21' }
    });
    recipe = await db.prisma.recipe.create({
      data: {
        title: 'Bibimbap',
        description: 'Rice bowl.',
        contributorId: author.id,
        ingredients: { create: [{ name: 'rice', amount: '1' }] },
        directions: { create: [{ stepNumber: 1, instruction: 'Cook it.' }] },
        tags: { connectOrCreate: [{ where: { name: 'Bowls' }, create: { name: 'Bowls' } }] }
      }
    });
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await db?.drop();
  });

  const publicGets = () => [
    '/api/recipes',
    `/api/recipes/${recipe.id}`,
    '/api/recipes/random',
    '/api/tags',
    '/api/tags/Bowls/recipes',
    '/api/search?q=bibimbap',
    '/api/contributors',
    `/api/contributors/${author.id}`,
    '/api/me',
    '/api/health'
  ];

  it('every public GET answers 200 with no cookie', async () => {
    for (const url of publicGets()) {
      const res = await request(app).get(url);
      expect(res.status, url).toBe(200);
      expect(res.text.length, url).toBeGreaterThan(2);
    }
    expect((await request(app).get('/api/me')).body.contributor).toBeNull();
  });

  it('no public GET body carries an email-shaped string or an externalId', async () => {
    for (const url of publicGets()) {
      const res = await request(app).get(url);
      expect(res.text, url).not.toMatch(EMAIL_RE);
      expect(res.text, url).not.toMatch(/externalId/);
      expect(res.text, url).not.toContain('access-sub-7f3c9d21');
      expect(res.text, url).not.toContain('mara.private');
    }
    // The seeded data really is on those routes, so the checks above bite.
    expect((await request(app).get('/api/contributors')).text).toContain('Mara Okafor');
    expect((await request(app).get(`/api/recipes/${recipe.id}`)).text).toContain('Mara Okafor');
  });

  it('the three list reads are capped at MAX_LIST_RESULTS', async () => {
    const rows = Array.from({ length: MAX_LIST_RESULTS + 5 }, (_, i) => ({
      title: `Capped dish ${i}`,
      contributorId: author.id
    }));
    await db.prisma.recipe.createMany({ data: rows });
    const ids = (await db.prisma.recipe.findMany({ where: { title: { startsWith: 'Capped dish' } }, select: { id: true } }))
      .map((r) => ({ id: r.id }));
    await db.prisma.tag.update({ where: { name: 'Bowls' }, data: { recipes: { connect: ids } } });

    for (const url of ['/api/recipes', '/api/search?q=dish', '/api/tags/Bowls/recipes', '/api/recipes?tag=bowls']) {
      const res = await request(app).get(url);
      expect(res.status, url).toBe(200);
      expect(res.body, url).toHaveLength(MAX_LIST_RESULTS);
    }
    await db.prisma.recipe.deleteMany({ where: { title: { startsWith: 'Capped dish' } } });
  });

  it('a normal-length query and the existing exclude list still work', async () => {
    expect((await request(app).get('/api/search?q=rice')).body).toHaveLength(1);
    expect((await request(app).get('/api/recipes?tag=Bowls&sort=createdAt')).body).toHaveLength(1);
    expect((await request(app).get(`/api/recipes/random?exclude=${recipe.id}&exclude=x`)).status).toBe(200);
  });
});
