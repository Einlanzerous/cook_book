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
import { isHelloFreshUrl } from '../src/routes/importPreview.js';

const html = fs.readFileSync(new URL('./fixtures/hellofresh-recipe.html', import.meta.url), 'utf8');
const URL_ = 'https://www.hellofresh.com/recipes/synthetic-bibimbap';

const prisma = new Proxy({}, { get: () => { throw new Error('preview must not touch the database'); } });
const app = createApp({ prisma });
const post = (body) => request(app).post('/api/import/hellofresh/preview').send(body);

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

  it('turns a failed fetch into a 400 with the message', async () => {
    axios.get.mockImplementation(() => Promise.reject(new Error('getaddrinfo ENOTFOUND')));
    const res = await post({ url: URL_ });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Failed to fetch recipe/);
  });
});

describe('isHelloFreshUrl', () => {
  it('accepts hellofresh.com and subdomains only', () => {
    expect(isHelloFreshUrl('https://www.hellofresh.com/recipes/x')).toBe(true);
    expect(isHelloFreshUrl('http://hellofresh.com/x')).toBe(true);
    expect(isHelloFreshUrl('https://nothellofresh.com/x')).toBe(false);
  });
});
