/**
 * COOK-23 criteria 3, 4, 7, 9, 15 and 16 over HTTP against a migrated scratch
 * Postgres: the session cookie, identity resolution and binding, the session
 * lifecycle, logout and /api/me, routing ahead of the SPA catch-all, and the
 * unbound-owner safety net. Skipped without COOK_TEST_DATABASE_URL.
 */
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { describeDb, createScratchDb } from './helpers/db.js';
import { createTestApp, authed, cookieFrom } from './helpers/auth.js';
import { pruneSessions } from '../src/auth/session.js';
import { resolveContributor, IdentityConflictError, findUnboundOwners, warnUnboundOwners } from '../src/services/identity.js';

const DAY = 86_400_000;
const json = (r) => r.set('Content-Type', 'application/json');

describeDb('sign-in cookie, /auth/sso redirects (criterion 3)', () => {
  let db; let t;
  beforeAll(async () => { db = await createScratchDb(); t = await createTestApp(db.prisma); });
  afterAll(async () => { await db?.drop(); });

  it('sets a __Host- HttpOnly Secure SameSite=Lax Path=/ cookie with no Domain and Max-Age = SESSION_DAYS x 86400', async () => {
    const res = await t.signInResponse('cookie@example.com');
    expect(res.status).toBe(302);
    expect(res.headers['cache-control']).toBe('no-store');
    const line = [].concat(res.headers['set-cookie']).find((c) => c.startsWith('__Host-cb_session='));
    expect(line).toBeTruthy();
    expect(line).toMatch(/; Path=\//);
    expect(line).toMatch(/; HttpOnly/);
    expect(line).toMatch(/; Secure/);
    expect(line).toMatch(/; SameSite=Lax/);
    expect(line).toMatch(/; Max-Age=2592000(;|$)/); // 30 days
    expect(line).not.toMatch(/Domain/i);
  });

  it('the cookie value is an opaque token; only its hash is stored', async () => {
    const cookie = await t.signIn('opaque@example.com');
    const token = cookie.split('=')[1];
    expect(token.length).toBeGreaterThanOrEqual(43);
    expect(await db.prisma.session.findUnique({ where: { id: token } })).toBeNull();
    expect(await db.prisma.session.count()).toBeGreaterThan(0);
  });

  it('honours SESSION_DAYS', async () => {
    const t7 = await createTestApp(db.prisma, { env: { SESSION_DAYS: '7' } });
    const res = await t7.signInResponse('seven@example.com');
    expect([].concat(res.headers['set-cookie'])[0]).toMatch(/Max-Age=604800/);
  });

  it('the session is fixed-life from mint: expiresAt = mint + SESSION_DAYS and /api/me does not extend it', async () => {
    const cookie = await t.signIn('fixed@example.com');
    const [row] = await db.prisma.session.findMany({ where: { contributor: { email: 'fixed@example.com' } } });
    const life = row.expiresAt.getTime() - row.createdAt.getTime();
    expect(Math.abs(life - 30 * DAY)).toBeLessThan(5_000);
    await request(t.app).get('/api/me').set('Cookie', cookie);
    const again = await db.prisma.session.findUnique({ where: { id: row.id } });
    expect(again.expiresAt.getTime()).toBe(row.expiresAt.getTime());
  });

  it.each([
    ['/recipe/123?x=1', '/recipe/123?x=1'],
    ['/', '/'],
    ['https://evil.test/', '/'],
    ['//evil.test/', '/'],
    ['/\\evil.test', '/'],
    ['javascript:alert(1)', '/'],
    ['recipe/1', '/']
  ])('redirects only to a same-origin relative next: %s', async (next, expected) => {
    const res = await t.signInResponse('next@example.com', undefined, next);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(expected);
  });

  it('no next redirects to /', async () => {
    expect((await t.signInResponse('next@example.com')).headers.location).toBe('/');
  });
});

describeDb('identity resolution: sub, bound once from email (criterion 4)', () => {
  let db; let t; let logs;
  beforeAll(async () => {
    db = await createScratchDb();
    logs = [];
    t = await createTestApp(db.prisma, { appOptions: { log: (l) => logs.push(l) } });
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterAll(async () => { vi.restoreAllMocks(); await db?.drop(); });

  it('first sign-in creates a Contributor with email and externalId and a neutral placeholder name', async () => {
    await t.signIn('First@Example.com', 'sub-first');
    const c = await db.prisma.contributor.findUnique({ where: { email: 'first@example.com' } });
    expect(c).toMatchObject({ externalId: 'sub-first', bio: null, portraitUrl: null });
    expect(c.name).toMatch(/^Cook \d+$/);
    expect(c.name).not.toMatch(/first/i); // GET /api/contributors is public: never the email
  });

  it('a second sign-in reuses the row', async () => {
    await t.signIn('again@example.com', 'sub-again');
    const before = await db.prisma.contributor.count();
    await t.signIn('again@example.com', 'sub-again');
    expect(await db.prisma.contributor.count()).toBe(before);
  });

  it('two concurrent first sign-ins of the same person produce exactly one row', async () => {
    const results = await Promise.all(Array.from({ length: 6 }, () => t.signInResponse('race@example.com', 'sub-race')));
    expect(results.map((r) => r.status)).toEqual(Array(6).fill(302));
    expect(await db.prisma.contributor.count({ where: { email: 'race@example.com' } })).toBe(1);
    expect(await db.prisma.contributor.count({ where: { externalId: 'sub-race' } })).toBe(1);
  });

  it('an email-matched row with no externalId is bound to the sub on first sign-in', async () => {
    const c = await db.prisma.contributor.create({ data: { name: 'Pre Invited', email: 'invited@example.com' } });
    await t.signIn('invited@example.com', 'sub-invited');
    expect(await db.prisma.contributor.findUnique({ where: { id: c.id } })).toMatchObject({ externalId: 'sub-invited', name: 'Pre Invited' });
    expect(logs.some((l) => l.includes(`auth.contributor bound id=${c.id}`))).toBe(true);
  });

  it('two DIFFERENT subs with the same email at once: exactly one binds, the other is 403, never a rebind', async () => {
    const c = await db.prisma.contributor.create({ data: { name: 'Contested', email: 'contested@example.com' } });
    const [a, b] = await Promise.all([
      t.signInResponse('contested@example.com', 'sub-A'),
      t.signInResponse('contested@example.com', 'sub-B')
    ]);
    expect([a.status, b.status].sort()).toEqual([302, 403]);
    const winner = a.status === 302 ? 'sub-A' : 'sub-B';
    expect((await db.prisma.contributor.findUnique({ where: { id: c.id } })).externalId).toBe(winner);
    const loser = a.status === 403 ? a : b;
    expect(loser.headers['set-cookie']).toBeUndefined();
    expect(logs.some((l) => l.includes('reason=identity_conflict'))).toBe(true);
    // And the loser keeps being refused.
    const again = await t.signInResponse('contested@example.com', winner === 'sub-A' ? 'sub-B' : 'sub-A');
    expect(again.status).toBe(403);
    expect((await db.prisma.contributor.findUnique({ where: { id: c.id } })).externalId).toBe(winner);
  });

  it('an email-matched row holding a different externalId is refused the same way', async () => {
    await db.prisma.contributor.create({ data: { name: 'Held', email: 'held@example.com', externalId: 'sub-owner' } });
    const res = await t.signInResponse('held@example.com', 'sub-intruder');
    expect(res.status).toBe(403);
    expect(res.headers['set-cookie']).toBeUndefined();
    expect((await db.prisma.contributor.findUnique({ where: { email: 'held@example.com' } })).externalId).toBe('sub-owner');
  });

  it('a changed email with the same sub still finds the same contributor', async () => {
    await t.signIn('old-address@example.com', 'sub-mover');
    const before = await db.prisma.contributor.count();
    await t.signIn('new-address@example.com', 'sub-mover');
    expect(await db.prisma.contributor.count()).toBe(before);
  });

  it('a collision on Contributor_lower_name_key retries the next numeric suffix', async () => {
    const n = await db.prisma.contributor.count();
    await db.prisma.contributor.create({ data: { name: `cook ${n + 2}` } }); // the name the next create would take
    await t.signIn('suffix@example.com', 'sub-suffix');
    const c = await db.prisma.contributor.findUnique({ where: { email: 'suffix@example.com' } });
    expect(c.name).toBe(`Cook ${n + 3}`);
  });

  it('email and externalId are never settable through an HTTP body', async () => {
    const cookie = await t.signIn('body@example.com', 'sub-body');
    const me = (await request(t.app).get('/api/me').set('Cookie', cookie)).body.contributor;
    const res = await json(authed(t.app, cookie).put('/api/contributors/' + me.id)).send({ email: 'x@example.com', externalId: 'zzz' });
    expect(res.status).toBe(404);
    const row = await db.prisma.contributor.findUnique({ where: { id: me.id } });
    expect(row).toMatchObject({ email: 'body@example.com', externalId: 'sub-body' });
  });
});

describe('identity resolution: fakes for paths a real database cannot hit on demand', () => {
  const id = { email: 'a@example.com', sub: 'sub-a' };
  const p2002 = (target) => Object.assign(new Error('unique'), { code: 'P2002', meta: { target } });

  it('a collision on email/externalId at create re-reads the existing row (another request won)', async () => {
    const row = { id: 'c1', email: id.email, externalId: id.sub };
    let looked = 0;
    const prisma = {
      contributor: {
        findUnique: async () => (looked++ < 2 ? null : row),
        count: async () => 0,
        create: async () => { throw p2002(['email']); }
      }
    };
    expect(await resolveContributor(prisma, id)).toBe(row);
  });

  it('a name collision gives up after a bounded number of attempts with a 500', async () => {
    let creates = 0;
    const prisma = {
      contributor: {
        findUnique: async () => null,
        count: async () => 0,
        create: async () => { creates += 1; throw p2002(['lower(name)']); }
      }
    };
    await expect(resolveContributor(prisma, id)).rejects.toMatchObject({ status: 500 });
    expect(creates).toBe(20);
  });

  it('IdentityConflictError is what a refused binding throws', async () => {
    const prisma = { contributor: { findUnique: async ({ where }) => (where.email ? { id: 'c', externalId: 'other' } : null) } };
    await expect(resolveContributor(prisma, id)).rejects.toBeInstanceOf(IdentityConflictError);
  });
});

describeDb('Prisma P2002 meta.target shapes (verify-first row)', () => {
  let db;
  beforeAll(async () => { db = await createScratchDb(); });
  afterAll(async () => { await db?.drop(); });

  it('the raw lower(name) index reports the EXPRESSION, email and externalId report their column', async () => {
    await db.prisma.contributor.create({ data: { name: 'Ada', email: 'ada@example.com', externalId: 'sub-ada' } });
    const target = async (data) => {
      try { await db.prisma.contributor.create({ data }); } catch (e) { return [e.code, e.meta.target]; }
      return null;
    };
    expect(await target({ name: 'ADA' })).toEqual(['P2002', ['lower(name)']]);
    expect(await target({ name: 'B', email: 'ada@example.com' })).toEqual(['P2002', ['email']]);
    expect(await target({ name: 'C', externalId: 'sub-ada' })).toEqual(['P2002', ['externalId']]);
    // Several at once report only the first violated index.
    expect(await target({ name: 'ADA', email: 'ada@example.com', externalId: 'sub-ada' })).toEqual(['P2002', ['email']]);
  });
});

describeDb('AUTH_MODE=dev runs the same resolution and binding code (criterion 4)', () => {
  let db; let t;
  beforeAll(async () => {
    db = await createScratchDb();
    t = await createTestApp(db.prisma, { env: { AUTH_MODE: 'dev', PUBLIC_ORIGIN: 'http://localhost:5173', DEV_AUTH_EMAIL: 'Owner@Example.com' } });
  });
  afterAll(async () => { await db?.drop(); });

  it('identity is DEV_AUTH_EMAIL (lower-cased) with sub dev:<email>, with no JWT, and binds the magos row', async () => {
    const magos = await db.prisma.contributor.findFirst({ where: { name: 'magos' } });
    await db.prisma.contributor.update({ where: { id: magos.id }, data: { email: 'owner@example.com' } });
    const res = await request(t.app).get('/auth/sso'); // no Cf-Access-Jwt-Assertion
    expect(res.status).toBe(302);
    expect([].concat(res.headers['set-cookie'])[0]).toMatch(/^cb_session=.*Max-Age=2592000$/);
    expect([].concat(res.headers['set-cookie'])[0]).not.toMatch(/Secure|__Host/);
    expect(await db.prisma.contributor.findUnique({ where: { id: magos.id } })).toMatchObject({ externalId: 'dev:owner@example.com' });
    const created = await json(authed(t.app, cookieFrom(res)).post('/api/recipes')).send({ title: 'Dev recipe' });
    expect(created.status).toBe(201);
    expect(created.body.contributor.id).toBe(magos.id);
  });
});

describeDb('session lifecycle (criterion 7, Session table)', () => {
  let db; let t; let cookie; let contributor;
  beforeAll(async () => {
    db = await createScratchDb();
    t = await createTestApp(db.prisma);
    cookie = await t.signIn('life@example.com', 'sub-life');
    contributor = await db.prisma.contributor.findUnique({ where: { email: 'life@example.com' } });
  });
  afterAll(async () => { await db?.drop(); });

  const write = (c) => json(request(t.app).post('/api/recipes').set('Cookie', c)).send({ title: 'x' });
  const clearRecipes = () => db.prisma.recipe.deleteMany();

  it('a live session writes; an unknown one is rejected', async () => {
    expect((await write(cookie)).status).toBe(201);
    expect((await write('__Host-cb_session=nope')).status).toBe(401);
    expect((await json(request(t.app).post('/api/recipes')).send({ title: 'x' })).status).toBe(401);
    await clearRecipes();
  });

  it('an expired session is rejected', async () => {
    const c = await t.signIn('exp@example.com', 'sub-exp');
    await db.prisma.session.updateMany({ where: { contributor: { email: 'exp@example.com' } }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await write(c)).status).toBe(401);
    expect((await request(t.app).get('/api/me').set('Cookie', c)).body.contributor).toBeNull();
  });

  it('the runbook revoke SQL takes effect on the next request', async () => {
    const c = await t.signIn('revoke@example.com', 'sub-revoke');
    const who = await db.prisma.contributor.findUnique({ where: { email: 'revoke@example.com' } });
    expect((await write(c)).status).toBe(201);
    await db.prisma.$executeRawUnsafe(`UPDATE "Session" SET "revokedAt" = now() WHERE "contributorId" = '${who.id}' AND "revokedAt" IS NULL`);
    expect((await write(c)).status).toBe(401);
    // The other contributor's session is untouched.
    expect((await write(cookie)).status).toBe(201);
    await clearRecipes();
  });

  it('the pruning statement removes only rows past the 7-day window, expired and revoked alike', async () => {
    await db.prisma.session.deleteMany();
    const mk = (id, expiresAt, revokedAt = null) => ({ id, contributorId: contributor.id, expiresAt, revokedAt });
    const ago = (d) => new Date(Date.now() - d * DAY);
    const ahead = (d) => new Date(Date.now() + d * DAY);
    await db.prisma.session.createMany({
      data: [
        mk('expired-long', ago(8)),
        mk('expired-recent', ago(1)),
        mk('revoked-long', ahead(5), ago(8)),
        mk('revoked-recent', ahead(5), ago(1)),
        mk('live', ahead(5))
      ]
    });
    await pruneSessions(db.prisma);
    const left = (await db.prisma.session.findMany()).map((s) => s.id).sort();
    expect(left).toEqual(['expired-recent', 'live', 'revoked-recent']);
  });

  it('a mint prunes opportunistically, so no scheduler is needed', async () => {
    await db.prisma.session.deleteMany();
    await db.prisma.session.create({ data: { id: 'ancient', contributorId: contributor.id, expiresAt: new Date(Date.now() - 30 * DAY) } });
    await t.signIn('life@example.com', 'sub-life');
    expect(await db.prisma.session.findUnique({ where: { id: 'ancient' } })).toBeNull();
  });
});

describeDb('logout and GET /api/me (criterion 9) and routing (criterion 15)', () => {
  let db; let t; let logs;
  beforeAll(async () => {
    db = await createScratchDb();
    logs = [];
    t = await createTestApp(db.prisma, { appOptions: { log: (l) => logs.push(l) } });
  });
  afterAll(async () => { await db?.drop(); });

  it('logout with a valid session: 204, revokes the row, clears the cookie, and the session is dead', async () => {
    const cookie = await t.signIn('out@example.com', 'sub-out');
    const res = await request(t.app).post('/auth/logout').set('Cookie', cookie);
    expect(res.status).toBe(204);
    expect([].concat(res.headers['set-cookie'])[0]).toMatch(/^__Host-cb_session=; .*Max-Age=0/);
    const [row] = await db.prisma.session.findMany({ where: { contributor: { email: 'out@example.com' } } });
    expect(row.revokedAt).not.toBeNull();
    expect((await json(request(t.app).post('/api/recipes').set('Cookie', cookie)).send({ title: 'x' })).status).toBe(401);
    expect((await request(t.app).get('/api/me').set('Cookie', cookie)).body.contributor).toBeNull();
  });

  it('logout with no or an invalid session is also 204 and clears the cookie (idempotent, D6)', async () => {
    for (const set of [undefined, '__Host-cb_session=garbage']) {
      const req = request(t.app).post('/auth/logout');
      const res = await (set ? req.set('Cookie', set) : req);
      expect(res.status).toBe(204);
      expect([].concat(res.headers['set-cookie'])[0]).toMatch(/Max-Age=0/);
    }
  });

  it('a FOREIGN-ORIGIN logout is 403 and the session is NOT revoked', async () => {
    const cookie = await t.signIn('csrf@example.com', 'sub-csrf');
    const res = await request(t.app).post('/auth/logout').set('Cookie', cookie).set('Origin', 'https://evil.test');
    expect(res.status).toBe(403);
    expect((await request(t.app).get('/api/me').set('Cookie', cookie)).body.contributor).not.toBeNull();
    const same = await request(t.app).post('/auth/logout').set('Cookie', cookie).set('Origin', 'https://commonplace.test');
    expect(same.status).toBe(204);
  });

  it('GET /api/me signed out: 200, { contributor: null, signInAvailable: true }, no-store', async () => {
    const res = await request(t.app).get('/api/me');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ contributor: null, signInAvailable: true });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('GET /api/me signed in: exactly { id, name }, never an email, externalId or other field', async () => {
    const cookie = await t.signIn('me@example.com', 'sub-me');
    const res = await request(t.app).get('/api/me').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(['contributor', 'signInAvailable']);
    expect(Object.keys(res.body.contributor).sort()).toEqual(['id', 'name']);
    expect(JSON.stringify(res.body)).not.toMatch(/me@example|sub-me/);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('SSO_ENABLED=false: /auth/sso is 404 and mints nothing, /api/me says signInAvailable false, reads still work', async () => {
    const off = await createTestApp(db.prisma, { env: { SSO_ENABLED: 'false' } });
    const before = await db.prisma.session.count();
    const res = await off.signInResponse('off@example.com');
    expect(res.status).toBe(404);
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(await db.prisma.session.count()).toBe(before);
    expect((await request(off.app).get('/api/me')).body).toEqual({ contributor: null, signInAvailable: false });
    expect((await request(off.app).get('/api/recipes')).status).toBe(200);
  });

  it('/auth is registered ahead of the SPA catch-all: both routes reach the auth handlers, not index.html', async () => {
    const sso = await request(t.app).get('/auth/sso');
    expect(sso.status).toBe(401);
    expect(sso.headers['content-type']).toMatch(/json/);
    const out = await request(t.app).post('/auth/logout');
    expect(out.status).toBe(204);
  });
});

describeDb('unbound-owner safety (criterion 16)', () => {
  let db; let t;
  beforeAll(async () => { db = await createScratchDb(); t = await createTestApp(db.prisma); });
  afterAll(async () => { await db?.drop(); });

  it('warns for a contributor that owns recipes but has neither email nor externalId, not for one that owns none', async () => {
    await db.prisma.recipe.create({ data: { title: 'Legacy', contributorId: (await db.prisma.contributor.findFirst({ where: { name: 'magos' } })).id } });
    await db.prisma.contributor.create({ data: { name: 'Lurker' } }); // owns none
    const warn = vi.fn();
    const rows = await warnUnboundOwners(db.prisma, warn);
    expect(rows.map((r) => r.name)).toEqual(['magos']);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/magos.*owns 1 recipe/);
    // Once the owner binds an email the warning goes away.
    await db.prisma.contributor.updateMany({ where: { name: 'magos' }, data: { email: 'owner@example.com' } });
    expect(await findUnboundOwners(db.prisma)).toEqual([]);
  });

  // The statements below are the ones in docs/runbook.md ("Owner signed in first").
  const RECOVERY = [
    `UPDATE "Recipe" SET "contributorId" = (SELECT id FROM "Contributor" WHERE lower(name) = 'magos') WHERE "contributorId" = (SELECT id FROM "Contributor" WHERE email = 'owner@example.com')`,
    `DELETE FROM "Contributor" WHERE email = 'owner@example.com'`,
    `UPDATE "Contributor" SET email = 'owner@example.com' WHERE lower(name) = 'magos'`
  ];

  it('recovery: the owner signed in before the magos UPDATE; the UPDATE fails, the documented SQL restores the intended state', async () => {
    const db2 = await createScratchDb();
    try {
      const t2 = await createTestApp(db2.prisma);
      const magos = await db2.prisma.contributor.findFirst({ where: { name: 'magos' } });
      await db2.prisma.recipe.create({ data: { title: 'Legacy 1', contributorId: magos.id } });

      // The owner signs in first: they get a NEW contributor holding their email.
      const cookie = await t2.signIn('owner@example.com', 'sub-owner');
      const fresh = await db2.prisma.contributor.findUnique({ where: { email: 'owner@example.com' } });
      expect(fresh.id).not.toBe(magos.id);
      const made = await json(authed(t2.app, cookie).post('/api/recipes')).send({ title: 'Made since' });
      expect(made.status).toBe(201);

      // The magos email UPDATE now fails on Contributor_email_key.
      await expect(db2.prisma.$executeRawUnsafe(RECOVERY[2])).rejects.toThrow();

      // Recovery, in one transaction.
      await db2.prisma.$transaction(RECOVERY.map((sql) => db2.prisma.$executeRawUnsafe(sql)));

      // Sign in again so the bind happens on magos.
      await t2.signIn('owner@example.com', 'sub-owner');
      const owner = await db2.prisma.contributor.findUnique({ where: { email: 'owner@example.com' } });
      expect(owner).toMatchObject({ id: magos.id, externalId: 'sub-owner' });
      const titles = (await db2.prisma.recipe.findMany({ where: { contributorId: magos.id } })).map((r) => r.title).sort();
      expect(titles).toEqual(['Legacy 1', 'Made since']);
      expect(await db2.prisma.contributor.count({ where: { name: { startsWith: 'Cook' } } })).toBe(0);
    } finally {
      await db2.drop();
    }
  });
});
