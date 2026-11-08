/**
 * COOK-23 criteria 1 and 8: the write gate. One app-level writeGuard, mounted
 * before express.json(), closes every write route by default. This walks the
 * registry (each router's own stack) so a new write route fails the test
 * until it is listed here AND answers 401 without a session.
 */
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express from 'express';
import { describeDb, createScratchDb } from './helpers/db.js';
import { createTestApp } from './helpers/auth.js';
import { createApiRegistry } from '../src/app.js';

// The hand-maintained list of every write route. Adding a write route means
// adding it here, which is the point: it is a deliberate act.
const EXPECTED_WRITES = [
  'DELETE /api/recipes/:id',
  'POST /api/import/hellofresh',
  'POST /api/import/hellofresh/preview',
  'POST /api/recipes',
  'PUT /api/recipes/:id'
];

const SAFE = new Set(['get', 'head', 'options']);

function discover(registry) {
  const found = [];
  for (const { path: mount, router } of registry) {
    for (const layer of router.stack) {
      if (!layer.route) continue;
      for (const [method, on] of Object.entries(layer.route.methods)) {
        if (on && !SAFE.has(method)) found.push(`${method.toUpperCase()} /api${mount}${layer.route.path === '/' ? '' : layer.route.path}`);
      }
    }
  }
  return found.sort();
}

describe('createApiRegistry', () => {
  it('records what is mounted on the single api router', () => {
    const { apiRouter, mountApi, registry } = createApiRegistry();
    const r = express.Router();
    mountApi('/x', r);
    expect(registry).toEqual([{ path: '/x', router: r }]);
    expect(apiRouter.stack).toHaveLength(1);
  });
});

describeDb('write gate coverage (criterion 1)', () => {
  let db; let t;
  beforeAll(async () => {
    db = await createScratchDb();
    t = await createTestApp(db.prisma);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterAll(async () => { vi.restoreAllMocks(); await db?.drop(); });

  it('the discovered write-route set equals the hand-maintained list', () => {
    expect(discover(t.app.locals.apiRegistry)).toEqual(EXPECTED_WRITES);
  });

  it('every discovered write route answers 401 without a session cookie, with a body and without', async () => {
    for (const route of discover(t.app.locals.apiRegistry)) {
      const [method, pattern] = route.split(' ');
      const url = pattern.replace(':id', 'some-id');
      const bare = await request(t.app)[method.toLowerCase()](url);
      expect(bare.status, `${route} (no body)`).toBe(401);
      const withBody = await request(t.app)[method.toLowerCase()](url).set('Content-Type', 'application/json').send({ title: 'x', url: 'https://www.hellofresh.com/x' });
      expect(withBody.status, `${route} (json body)`).toBe(401);
      expect(withBody.body).toEqual({ error: 'Sign in to contribute' });
    }
    expect(await db.prisma.recipe.count()).toBe(0);
  });

  it('is closed by default: POST to a path nobody mounted is 401, not 404', async () => {
    for (const m of ['post', 'put', 'patch', 'delete']) {
      expect((await request(t.app)[m]('/api/does-not-exist')).status, m).toBe(401);
    }
  });

  it('the allowlist of public writes is empty: reads stay public', async () => {
    for (const url of ['/api/recipes', '/api/tags', '/api/contributors', '/api/search?q=x', '/api/health', '/api/me']) {
      expect((await request(t.app).get(url)).status, url).toBe(200);
    }
  });
});

describeDb('cross-origin and content-type controls, in order (criterion 8)', () => {
  let db; let t; let cookie; let parserRuns; let app;
  beforeAll(async () => {
    db = await createScratchDb();
    parserRuns = vi.fn();
    const json = express.json();
    t = await createTestApp(db.prisma, { appOptions: { jsonParser: (req, res, next) => { parserRuns(); json(req, res, next); } } });
    app = t.app;
    cookie = await t.signIn('guard@example.com', 'sub-guard');
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterAll(async () => { vi.restoreAllMocks(); await db?.drop(); });

  const post = () => request(app).post('/api/recipes');

  it('(1) a foreign Origin is 403, even with a valid session', async () => {
    parserRuns.mockClear(); // the sign-in GET in beforeAll went through the parser
    const res = await post().set('Cookie', cookie).set('Origin', 'https://evil.test').set('Content-Type', 'application/json').send({ title: 'x' });
    expect(res.status).toBe(403);
    expect(parserRuns).not.toHaveBeenCalled();
    expect(await db.prisma.recipe.count()).toBe(0);
  });

  it.each(['cross-site', 'same-site'])('(1) Sec-Fetch-Site: %s is 403', async (site) => {
    const res = await post().set('Cookie', cookie).set('Sec-Fetch-Site', site).set('Content-Type', 'application/json').send({ title: 'x' });
    expect(res.status).toBe(403);
  });

  it('the matching Origin and Sec-Fetch-Site: same-origin pass; no Origin at all (non-browser) passes this step', async () => {
    const ok = await post().set('Cookie', cookie).set('Origin', 'https://commonplace.test').set('Sec-Fetch-Site', 'same-origin').set('Content-Type', 'application/json').send({ title: 'ok1' });
    expect(ok.status).toBe(201);
    const bare = await post().set('Cookie', cookie).set('Content-Type', 'application/json').send({ title: 'ok2' });
    expect(bare.status).toBe(201);
  });

  it('(2) a text/plain body is 415 and the JSON parser never ran', async () => {
    parserRuns.mockClear();
    const res = await post().set('Cookie', cookie).set('Content-Type', 'text/plain').send('{"title":"x"}');
    expect(res.status).toBe(415);
    expect(parserRuns).not.toHaveBeenCalled();
  });

  it('(2) application/json; charset=utf-8 passes', async () => {
    const res = await post().set('Cookie', cookie).set('Content-Type', 'application/json; charset=utf-8').send(JSON.stringify({ title: 'utf8' }));
    expect(res.status).toBe(201);
  });

  it('(3) an unauthenticated malformed-JSON POST is 401 and the parser never ran', async () => {
    parserRuns.mockClear();
    const res = await post().set('Content-Type', 'application/json').send('{not json');
    expect(res.status).toBe(401);
    expect(parserRuns).not.toHaveBeenCalled();
  });

  it('an authenticated malformed-JSON POST reaches the parser and is a 400', async () => {
    const res = await post().set('Cookie', cookie).set('Content-Type', 'application/json').send('{not json');
    expect(res.status).toBe(400);
  });

  it('order: a foreign origin with a bad content type is 403 (not 415), a bad content type with no session is 415 (not 401)', async () => {
    const a = await post().set('Origin', 'https://evil.test').set('Content-Type', 'text/plain').send('x');
    expect(a.status).toBe(403);
    const b = await post().set('Content-Type', 'text/plain').send('x');
    expect(b.status).toBe(415);
  });

  it('a bodyless DELETE without a cookie is 401; with a cookie it skips the content-type check', async () => {
    const mine = await post().set('Cookie', cookie).set('Content-Type', 'application/json').send({ title: 'to delete' });
    expect((await request(app).delete(`/api/recipes/${mine.body.id}`)).status).toBe(401);
    expect((await request(app).delete(`/api/recipes/${mine.body.id}`).set('Cookie', cookie)).status).toBe(204);
  });

  it('no Access-Control-Allow-Origin is ever sent (cors() is dropped)', async () => {
    for (const r of [
      request(app).get('/api/recipes').set('Origin', 'https://evil.test'),
      request(app).options('/api/recipes').set('Origin', 'https://evil.test').set('Access-Control-Request-Method', 'POST'),
      post().set('Origin', 'https://evil.test').send({})
    ]) {
      const res = await r;
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    }
  });
});
