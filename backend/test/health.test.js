import { describe, it, expect, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

describe('GET /api/health', () => {
  const saved = { APP_VERSION: process.env.APP_VERSION, GIT_SHA: process.env.GIT_SHA };
  afterEach(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it('reports status ok plus the build identity from the environment', async () => {
    process.env.APP_VERSION = '1.2.3';
    process.env.GIT_SHA = 'a'.repeat(40);
    const res = await request(createApp({ prisma: {} })).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', version: '1.2.3', sha: 'a'.repeat(40) });
  });

  it('still answers when the image carries no identity', async () => {
    process.env.APP_VERSION = '';
    process.env.GIT_SHA = '';
    const res = await request(createApp({ prisma: {} })).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.version).toBe('dev');
  });
});
