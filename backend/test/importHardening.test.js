/**
 * COOK-23 criterion 11: HelloFresh outbound-fetch hardening. axios is mocked;
 * no network and no database.
 */
import fs from 'node:fs';
import request from 'supertest';
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('axios', () => ({ default: { get: vi.fn() } }));
import axios from 'axios';
import { createApp } from '../src/app.js';
import { fetchHelloFreshPage, parseHelloFreshUrl, ImportError, FETCH_TIMEOUT_MS, MAX_PAGE_BYTES, MAX_REDIRECTS } from '../src/services/helloFreshParser.js';
import { isHelloFreshUrl } from '../src/services/helloFreshUrl.js';
import { createAuthKit } from './helpers/auth.js';

const html = fs.readFileSync(new URL('./fixtures/hellofresh-recipe.html', import.meta.url), 'utf8');
const URL_ = 'https://www.hellofresh.com/recipes/synthetic-bibimbap';
const redirect = (to, status = 302) => ({ status, headers: { location: to }, data: '' });

beforeEach(() => {
  axios.get.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('fetchHelloFreshPage', () => {
  it('sets a timeout, a response size cap and does not let axios follow redirects itself', async () => {
    axios.get.mockResolvedValue({ status: 200, data: html });
    await fetchHelloFreshPage(URL_);
    const opts = axios.get.mock.calls[0][1];
    expect(opts).toMatchObject({ timeout: FETCH_TIMEOUT_MS, maxContentLength: MAX_PAGE_BYTES, maxBodyLength: MAX_PAGE_BYTES, maxRedirects: 0 });
    expect(FETCH_TIMEOUT_MS).toBeLessThanOrEqual(15_000);
    expect(MAX_PAGE_BYTES).toBeLessThanOrEqual(5 * 1024 * 1024);
  });

  it('follows a redirect to another HelloFresh page, re-validating the hop', async () => {
    axios.get
      .mockResolvedValueOnce(redirect('/recipes/moved'))
      .mockResolvedValueOnce({ status: 200, data: html });
    await fetchHelloFreshPage(URL_);
    expect(axios.get.mock.calls.map((c) => c[0])).toEqual([URL_, 'https://www.hellofresh.com/recipes/moved']);
  });

  it.each([
    ['another host', 'https://evil.test/recipes/x'],
    ['a look-alike host', 'https://hellofresh.com.evil.test/x'],
    ['a downgrade to http', 'http://www.hellofresh.com/recipes/x'],
    ['an internal address', 'http://169.254.169.254/latest/meta-data']
  ])('rejects a redirect to %s, without requesting it', async (_n, to) => {
    axios.get.mockResolvedValueOnce(redirect(to));
    await expect(fetchHelloFreshPage(URL_)).rejects.toThrow();
    expect(axios.get).toHaveBeenCalledTimes(1);
  });

  it('gives up after too many redirects', async () => {
    axios.get.mockResolvedValue(redirect('/again'));
    await expect(fetchHelloFreshPage(URL_)).rejects.toThrow(/redirect/);
    expect(axios.get).toHaveBeenCalledTimes(MAX_REDIRECTS + 1);
  });

  it('refuses a start URL that is not https HelloFresh', async () => {
    await expect(fetchHelloFreshPage('http://www.hellofresh.com/x')).rejects.toThrow();
    expect(axios.get).not.toHaveBeenCalled();
  });
});

describe('parseHelloFreshUrl errors are fixed strings', () => {
  it('an oversized body (axios throws) becomes an ImportError with a fixed message', async () => {
    axios.get.mockRejectedValue(Object.assign(new Error('maxContentLength size of 3145728 exceeded'), { code: 'ERR_BAD_RESPONSE' }));
    const err = await parseHelloFreshUrl(URL_).catch((e) => e);
    expect(err).toBeInstanceOf(ImportError);
    expect(err.message).toBe('Could not fetch or read that recipe page.');
    expect(err.message).not.toMatch(/maxContentLength/);
  });
});

describe('isHelloFreshUrl is https only', () => {
  it('accepts https hellofresh.com and subdomains, nothing else', () => {
    expect(isHelloFreshUrl('https://www.hellofresh.com/recipes/x')).toBe(true);
    expect(isHelloFreshUrl('https://hellofresh.com/x')).toBe(true);
    expect(isHelloFreshUrl('http://www.hellofresh.com/x')).toBe(false);
    expect(isHelloFreshUrl('https://user:pw@www.hellofresh.com/x')).toBe(false);
    expect(isHelloFreshUrl('https://hellofresh.com.evil.test/x')).toBe(false);
    expect(isHelloFreshUrl('ftp://hellofresh.com/x')).toBe(false);
  });
});

describe('the import routes', () => {
  const live = { contributor: { id: 'c1', name: 'Tester' }, revokedAt: null, expiresAt: new Date(Date.now() + 1e9) };
  async function build() {
    const kit = await createAuthKit();
    const prisma = {
      session: { findUnique: async () => live },
      recipe: { create: async () => { throw new Error('should not create'); } }
    };
    const app = createApp({ prisma, config: kit.config, verifyAccess: kit.verifyAccess, log: () => {} });
    return { app, cookie: `${kit.config.cookieName}=x` };
  }

  it('both routes return the same fixed string for a failed fetch, never the raw error', async () => {
    const { app, cookie } = await build();
    axios.get.mockRejectedValue(new Error('getaddrinfo ENOTFOUND secret.internal'));
    for (const path of ['/api/import/hellofresh', '/api/import/hellofresh/preview']) {
      const res = await request(app).post(path).set('Cookie', cookie).send({ url: URL_ });
      expect(res.status, path).toBe(400);
      expect(res.body.error, path).toBe('Could not fetch or read that recipe page.');
      expect(JSON.stringify(res.body)).not.toMatch(/ENOTFOUND|secret/);
    }
  });

  it('a redirect to a non-HelloFresh host is a 400 end to end', async () => {
    const { app, cookie } = await build();
    axios.get.mockResolvedValueOnce(redirect('https://evil.test/'));
    const res = await request(app).post('/api/import/hellofresh/preview').set('Cookie', cookie).send({ url: URL_ });
    expect(res.status).toBe(400);
    expect(axios.get).toHaveBeenCalledTimes(1);
  });

  it('an http: URL is refused before any fetch', async () => {
    const { app, cookie } = await build();
    for (const path of ['/api/import/hellofresh', '/api/import/hellofresh/preview']) {
      const res = await request(app).post(path).set('Cookie', cookie).send({ url: 'http://www.hellofresh.com/recipes/x' });
      expect(res.status, path).toBe(400);
    }
    expect(axios.get).not.toHaveBeenCalled();
  });

  it('both routes require a session (the import route and the preview route)', async () => {
    const { app } = await build();
    for (const path of ['/api/import/hellofresh', '/api/import/hellofresh/preview']) {
      expect((await request(app).post(path).send({ url: URL_ })).status, path).toBe(401);
    }
    expect(axios.get).not.toHaveBeenCalled();
  });
});
