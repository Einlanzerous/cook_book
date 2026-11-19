/**
 * COOK-15: GET /api/mcp/status, the Connect screen's test. Public read, no
 * input; probes the internal MCP listener server side.
 */
import { describe, it, expect, afterEach } from 'vitest';
import http from 'node:http';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createMcpStatus, readToolCount } from '../src/mcp/status.js';
import { TOOL_DEFS } from '../src/mcp/server.js';
import { createAuthKit } from './helpers/auth.js';

const mk = async (mcpStatus) => {
  const kit = await createAuthKit();
  const opts = { prisma: {}, config: kit.config, verifyAccess: kit.verifyAccess, log: () => {} };
  return createApp(mcpStatus ? { ...opts, mcpStatus } : opts);
};

const listen = (handler) => new Promise((resolve) => {
  const s = http.createServer(handler).listen(0, '127.0.0.1', () => resolve(s));
});

describe('GET /api/mcp/status', () => {
  const servers = [];
  afterEach(async () => {
    await Promise.all(servers.splice(0).map((s) => new Promise((r) => { s.close(r); s.closeAllConnections?.(); })));
  });

  it('counts the read-only registered tools, not a constant', () => {
    const expected = Object.values(TOOL_DEFS).filter((d) => d.annotations.readOnlyHint).length;
    expect(readToolCount()).toBe(expected);
    expect(expected).toBeGreaterThan(0);
    expect(expected).toBeLessThan(Object.keys(TOOL_DEFS).length);
  });

  it('enabled: the listener answers /healthz, so it reports enabled with the read tool count', async () => {
    const s = await listen((req, res) => res.end(JSON.stringify({ status: 'ok' })));
    servers.push(s);
    const app = await mk(createMcpStatus({ getListener: () => ({ port: s.address().port }) }));
    const res = await request(app).get('/api/mcp/status');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ enabled: true, tools: readToolCount() });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('disabled: no listener handle reports enabled false and no count', async () => {
    const app = await mk(createMcpStatus({ getListener: () => null }));
    const res = await request(app).get('/api/mcp/status');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ enabled: false });
  });

  it('disabled by default when createApp is given no probe', async () => {
    const res = await request(await mk()).get('/api/mcp/status');
    expect(res.body).toEqual({ enabled: false });
  });

  it('a dead or hung listener reports enabled false within the timeout', async () => {
    const hung = await listen(() => {});
    servers.push(hung);
    const probe = createMcpStatus({ getListener: () => ({ port: hung.address().port }), timeoutMs: 100 });
    const t0 = Date.now();
    expect(await probe()).toEqual({ enabled: false });
    expect(Date.now() - t0).toBeLessThan(1500);
    const dead = await listen(() => {});
    const port = dead.address().port;
    await new Promise((r) => { dead.close(r); dead.closeAllConnections?.(); });
    expect(await createMcpStatus({ getListener: () => ({ port }) })()).toEqual({ enabled: false });
  });

  it('is a public read: no cookie needed, and a POST is still closed by the write gate', async () => {
    const app = await mk();
    expect((await request(app).get('/api/mcp/status')).status).toBe(200);
    expect((await request(app).post('/api/mcp/status')).status).toBe(401);
  });

  it('an unexpected failure is a generic 500 with no internals', async () => {
    const app = await mk(async () => { throw new Error('secret internal detail'); });
    const res = await request(app).get('/api/mcp/status');
    expect(res.status).toBe(500);
    expect(res.text).not.toContain('secret');
  });
});
