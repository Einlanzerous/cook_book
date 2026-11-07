/**
 * COOK-23 criteria 5 and 12: attribution comes from the caller, and the
 * ownership rule is exactly shared/ownership-outcomes.json, which the frontend
 * tests of canEdit/canDelete read too.
 */
import fs from 'node:fs';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { describeDb, createScratchDb } from './helpers/db.js';
import { createTestApp, authed } from './helpers/auth.js';
import { canEdit, canDelete } from '../src/services/ownership.js';

const fixture = JSON.parse(fs.readFileSync(new URL('../../shared/ownership-outcomes.json', import.meta.url), 'utf8'));
const rows = fixture.outcomes[fixture.active.ownership][fixture.active.unattributed];

describe('shared/ownership-outcomes.json', () => {
  it('covers every actor x recipe combination that can occur', () => {
    const keys = rows.map((r) => `${r.actor}/${r.recipe}`).sort();
    expect(keys).toEqual([
      'author/attributed',
      'other/attributed',
      'other/unattributed',
      'signedOut/attributed',
      'signedOut/unattributed'
    ]);
  });

  it('the pure helpers agree with the fixture for every row', () => {
    for (const r of rows) {
      const me = r.actor === 'signedOut' ? null : { id: r.actor === 'author' ? 'u1' : 'u2' };
      const recipe = { contributorId: r.recipe === 'unattributed' ? null : 'u1' };
      expect(canEdit(me, recipe), `${r.actor}/${r.recipe} edit`).toBe(r.edit >= 200 && r.edit < 300);
      expect(canDelete(me, recipe), `${r.actor}/${r.recipe} delete`).toBe(r.delete >= 200 && r.delete < 300);
    }
  });
});

describeDb('ownership against the real PUT and DELETE handlers (criterion 12)', () => {
  let db; let t; let author; let other;
  beforeAll(async () => {
    db = await createScratchDb();
    t = await createTestApp(db.prisma);
    author = await t.signIn('author@example.com', 'sub-author');
    other = await t.signIn('other@example.com', 'sub-other');
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterAll(async () => { vi.restoreAllMocks(); await db?.drop(); });

  const cookieFor = (actor) => ({ author, other, signedOut: null })[actor];
  const call = (method, url, cookie, body) => {
    let r = request(t.app)[method](url);
    if (cookie) r = r.set('Cookie', cookie);
    return body ? r.set('Content-Type', 'application/json').send(body) : r;
  };

  async function recipeFor(kind) {
    const authorRow = await db.prisma.contributor.findUnique({ where: { email: 'author@example.com' } });
    return db.prisma.recipe.create({ data: { title: `r-${kind}`, contributorId: kind === 'unattributed' ? null : authorRow.id } });
  }

  for (const row of rows) {
    it(`${row.actor} x ${row.recipe}: PUT ${row.edit}, DELETE ${row.delete}`, async () => {
      const edit = await recipeFor(row.recipe);
      const put = await call('put', `/api/recipes/${edit.id}`, cookieFor(row.actor), { title: 'edited' });
      expect(put.status).toBe(row.edit);
      const after = await db.prisma.recipe.findUnique({ where: { id: edit.id } });
      expect(after.title).toBe(row.edit === 200 ? 'edited' : `r-${row.recipe}`);
      if (row.edit === 200) expect(after.contributorId).toBe(edit.contributorId); // attribution never moves

      const del = await recipeFor(row.recipe);
      const res = await call('delete', `/api/recipes/${del.id}`, cookieFor(row.actor));
      expect(res.status).toBe(row.delete);
      expect(await db.prisma.recipe.count({ where: { id: del.id } })).toBe(row.delete === 204 ? 0 : 1);
    });
  }

  it('DELETE reads first: a missing recipe is 404 BEFORE any ownership check, for the author, others, and signed in only', async () => {
    expect((await call('delete', '/api/recipes/nope', other)).status).toBe(404);
    expect((await call('delete', '/api/recipes/nope', author)).status).toBe(404);
    expect((await call('delete', '/api/recipes/nope', null)).status).toBe(401); // the gate still comes first
  });
});

describeDb('attribution (criterion 5)', () => {
  let db; let t; let cookie; let contributor;
  beforeAll(async () => {
    db = await createScratchDb();
    t = await createTestApp(db.prisma);
    cookie = await t.signIn('caller@example.com', 'sub-caller');
    contributor = await db.prisma.contributor.findUnique({ where: { email: 'caller@example.com' } });
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterAll(async () => { vi.restoreAllMocks(); await db?.drop(); });

  it('a recipe created through the browser path is attributed to the signed-in contributor', async () => {
    const res = await authed(t.app, cookie).post('/api/recipes').send({ title: 'Browser', contributorId: 'someone-else' });
    expect(res.status).toBe(201);
    expect(res.body.contributor.id).toBe(contributor.id);
  });

  it('there is no magos fallback: the caller is never silently swapped for the default contributor', async () => {
    const res = await authed(t.app, cookie).post('/api/recipes').send({ title: 'No fallback' });
    expect(res.body.contributor.name).not.toBe('magos');
  });

  it('POST /api/contributors is removed (404 signed in, 401 signed out)', async () => {
    expect((await authed(t.app, cookie).post('/api/contributors').send({ name: 'Zed' })).status).toBe(404);
    expect((await request(t.app).post('/api/contributors').send({ name: 'Zed' })).status).toBe(401);
  });
});
