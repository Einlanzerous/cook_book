/**
 * COOK-10: POST /api/import/hellofresh/preview parses without saving.
 * axios is mocked with the saved HTML fixture: no network, and no database
 * (the prisma stub throws if the route touches it).
 */
import fs from 'node:fs';
import request from 'supertest';
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('axios', () => ({ default: { get: vi.fn() } }));
import axios from 'axios';
import { createApp } from '../src/app.js';
import { createAuthKit } from './helpers/auth.js';
import { isHelloFreshUrl } from '../src/routes/importPreview.js';

const html = fs.readFileSync(new URL('./fixtures/hellofresh-recipe.html', import.meta.url), 'utf8');
const URL_ = 'https://www.hellofresh.com/recipes/synthetic-bibimbap';

// The preview itself never touches the database; only the session lookup does,
// and it is served from this stub of one live session.
const live = { contributor: { id: 'c1', name: 'Tester' }, revokedAt: null, expiresAt: new Date(Date.now() + 1e9) };
const prisma = new Proxy({}, {
  get: (_, prop) => {
    if (prop === 'session') return { findUnique: async () => live };
    throw new Error('preview must not touch the database');
  }
});
const kit = await createAuthKit();
const app = createApp({ prisma, config: kit.config, verifyAccess: kit.verifyAccess, log: () => {} });
const cookie = `${kit.config.cookieName}=anything`;
const post = (body) => request(app).post('/api/import/hellofresh/preview').set('Cookie', cookie).send(body);

describe('POST /api/import/hellofresh/preview', () => {
  beforeEach(() => { axios.get.mockReset(); });

  it('returns the parsed recipe, ready to save, without touching the database', async () => {
    axios.get.mockResolvedValue({ data: html });
    const res = await post({ url: URL_ });
    expect(res.status).toBe(200);
    expect(axios.get).toHaveBeenCalledTimes(1);
    expect(res.body).toMatchObject({
      source: 'HelloFresh', sourceUrl: URL_,
      totalMinutes: 30, prepTime: 10, cookTime: 20, timeSplitEstimated: true,
      category: 'Main Course', cuisine: 'Korean', vegetarian: false, tags: ['Beef']
    });
    expect(res.body.title).toBeTruthy();
    expect(res.body.ingredients.length).toBeGreaterThan(0);
    for (const i of res.body.ingredients) expect(Object.keys(i).sort()).toEqual(['amount', 'name', 'unit']);
    expect(res.body.directions[0]).toMatchObject({ stepNumber: 1, heading: null });
    expect(typeof res.body.directions[0].instruction).toBe('string');
  });

  it('requires a URL', async () => {
    expect((await post({})).status).toBe(400);
    expect((await post({ url: '  ' })).status).toBe(400);
    expect(axios.get).not.toHaveBeenCalled();
  });

  it('rejects non-HelloFresh hosts without fetching', async () => {
    for (const url of ['https://example.com/r', 'https://evil.test/?hellofresh.com', 'https://hellofresh.com.evil.test/x', 'ftp://hellofresh.com/x', 'not a url']) {
      const res = await post({ url });
      expect(res.status, url).toBe(400);
      expect(res.body.error).toMatch(/hellofresh\.com/);
    }
    expect(axios.get).not.toHaveBeenCalled();
  });

  it('requires a session (stated default D1)', async () => {
    const res = await request(app).post('/api/import/hellofresh/preview').send({ url: URL_ });
    expect(res.status).toBe(401);
    expect(axios.get).not.toHaveBeenCalled();
  });

  it('turns a failed fetch into a 400 with a FIXED message, never the raw error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    axios.get.mockImplementation(() => Promise.reject(new Error('getaddrinfo ENOTFOUND internal.example')));
    const res = await post({ url: URL_ });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Could not fetch or read that recipe page.');
    expect(JSON.stringify(res.body)).not.toMatch(/getaddrinfo|ENOTFOUND|internal/);
    vi.restoreAllMocks();
  });

  it('refuses an http: URL without fetching', async () => {
    const res = await post({ url: 'http://www.hellofresh.com/recipes/x' });
    expect(res.status).toBe(400);
    expect(axios.get).not.toHaveBeenCalled();
  });
});

describe('isHelloFreshUrl', () => {
  it('accepts hellofresh.com and subdomains only', () => {
    expect(isHelloFreshUrl('https://www.hellofresh.com/recipes/x')).toBe(true);
    expect(isHelloFreshUrl('http://hellofresh.com/x')).toBe(false); // https only (COOK-23)
    expect(isHelloFreshUrl('https://nothellofresh.com/x')).toBe(false);
  });
});
