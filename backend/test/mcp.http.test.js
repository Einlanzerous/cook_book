/**
 * COOK-49, no database: the listener's auth gate, the Host rule, the
 * stateless transport, startMcp's off switch, /healthz and the stdio build.
 * Every refusal case runs against a prisma that fails the test if touched.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateKeyPair } from 'jose';
import request from 'supertest';
import { describe, it, expect, afterEach } from 'vitest';
import { createApp } from '../src/app.js';
import { startMcp } from '../src/mcp/http.js';
import { createAuthKit } from './helpers/auth.js';
import { createMcpKit, rawPost, untouchablePrisma, INITIALIZE, GATEWAY_AUD } from './helpers/mcp.js';

const TOOLS_CALL = { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'create_recipe', arguments: { title: 'x', source: 'y' } } };
const A = 'Cf-Access-Jwt-Assertion';

describe('MCP listener: access mode', () => {
  let kit;
  const guard = untouchablePrisma();
  afterEach(async () => {
    await kit?.close();
    kit = undefined;
  });

  it('criterion 18: initialize with Host: cook_book:4002 and a valid gateway assertion succeeds', async () => {
    kit = await createMcpKit({ prisma: guard.prisma });
    const jwt = await kit.assertion();
    const res = await rawPost(kit.url, [[A, jwt], ['Host', 'cook_book:4002']], INITIALIZE);
    expect(res.status).toBe(200);
    expect(res.body).toContain('"protocolVersion"');
    expect(res.body).toContain('commonplace');
    expect(guard.touched).toEqual([]);
  });

  it('criterion 18: a sessionless server/discover answers 400 with no tool or database access', async () => {
    kit = await createMcpKit({ prisma: guard.prisma });
    const jwt = await kit.assertion();
    const res = await rawPost(kit.url, [[A, jwt], ['Host', 'cook_book:4002']], { jsonrpc: '2.0', id: 7, method: 'server/discover', params: {} });
    expect(res.status).toBe(400);
    expect(kit.logs.filter((l) => l.startsWith('mcp.call'))).toEqual([]);
    expect(guard.touched).toEqual([]);
  });

  it('an SDK client connects with the assertion, lists five tools, and keeps no session', async () => {
    kit = await createMcpKit({ prisma: guard.prisma });
    const client = await kit.connect(await kit.assertion());
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(['create_recipe', 'get_recipe', 'list_contributors', 'random_recipe', 'search_recipes']);
    expect(client.transport.sessionId).toBeUndefined();
    await client.close();
  });

  describe('criterion 4: refused before any tool runs', () => {
    const cases = [
      ['no assertion', async () => [], 'missing'],
      ['two assertion headers', async (k) => { const j = await k.assertion(); return [[A, j], [A, j]]; }, 'multiple'],
      ['a bad signature', async (k) => {
        const { privateKey } = await generateKeyPair('RS256');
        return [[A, await k.sign({ email: 'a@b.c', sub: 's' }, { key: privateKey, aud: GATEWAY_AUD })]];
      }, 'bad_signature'],
      ['an expired assertion', async (k) => [[A, await k.assertion(undefined, { exp: Math.floor(Date.now() / 1000) - 300 })]], 'expired'],
      ['the web AUD', async (k) => [[A, await k.sign({ email: 'a@b.c', sub: 's' }, { aud: k.AUD })]], 'bad_aud'],
      ['an unknown AUD', async (k) => [[A, await k.sign({ email: 'a@b.c', sub: 's' }, { aud: 'someone-else' })]], 'bad_aud'],
      ['no email claim', async (k) => [[A, await k.assertion({ sub: 'svc' })]], 'no_email'],
      ['a forged email header alone', async () => [['Cf-Access-Authenticated-User-Email', 'ann@example.com']], 'missing'],
      ['a forged email header beside a bad assertion', async () => [['Cf-Access-Authenticated-User-Email', 'ann@example.com'], [A, 'not-a-jwt']], 'bad_signature'],
      ['garbage as the assertion', async () => [[A, 'x.y.z']], 'bad_signature']
    ];
    it.each(cases)('%s', async (_name, headers, reason) => {
      kit = await createMcpKit({ prisma: guard.prisma });
      const res = await rawPost(kit.url, await headers(kit), TOOLS_CALL);
      expect(res.status).toBe(401);
      expect(JSON.parse(res.body).error.message).toBe('Unauthorized'); // one body for every reason
      expect(kit.logs).toContain(`mcp.auth reject reason=${reason}`);
      expect(kit.logs.filter((l) => l.startsWith('mcp.call'))).toEqual([]);
      expect(guard.touched).toEqual([]);
    });

    it('GET and DELETE are refused without an assertion too, and an unauthenticated body is never parsed', async () => {
      kit = await createMcpKit({ prisma: guard.prisma });
      const bad = await rawPost(kit.url, [], '{not json');
      expect(bad.status).toBe(401);
      expect((await fetch(kit.url)).status).toBe(401);
      expect((await fetch(kit.url, { method: 'DELETE' })).status).toBe(401);
    });

    it('an authenticated GET is a 405 (stateless: no stream, no session)', async () => {
      kit = await createMcpKit({ prisma: guard.prisma });
      const res = await fetch(kit.url, { headers: { [A]: await kit.assertion() } });
      expect(res.status).toBe(405);
    });

    it('the reject log is rate-limited per reason', async () => {
      kit = await createMcpKit({ prisma: guard.prisma, deps: { rejectCooldownMs: 60_000 } });
      for (let i = 0; i < 5; i++) await rawPost(kit.url, [], TOOLS_CALL);
      expect(kit.logs.filter((l) => l === 'mcp.auth reject reason=missing')).toHaveLength(1);
    });

    it('a request body over 100kb is refused', async () => {
      kit = await createMcpKit({ prisma: guard.prisma });
      const big = { ...TOOLS_CALL, params: { name: 'create_recipe', arguments: { title: 'x'.repeat(120_000), source: 'y' } } };
      const res = await rawPost(kit.url, [[A, await kit.assertion()]], big);
      expect(res.status).toBe(413);
    });
  });

  it('GET /healthz answers {status, version, sha} without an assertion', async () => {
    kit = await createMcpKit({ prisma: guard.prisma, deps: { identity: { version: '9.9.9', sha: 'a'.repeat(40) } } });
    const res = await fetch(new URL('/healthz', kit.url));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok', version: '9.9.9', sha: 'a'.repeat(40) });
  });

  it('serves nothing but /mcp and /healthz', async () => {
    kit = await createMcpKit({ prisma: guard.prisma });
    expect((await fetch(new URL('/api/recipes', kit.url))).status).toBe(404);
  });
});

describe('startMcp: the off switch (criterion 5)', () => {
  it('returns null and logs once in access mode with CF_ACCESS_GATEWAY_AUD unset; the web app still serves /api/health', async () => {
    const kit = await createAuthKit(); // no gateway audience
    const logs = [];
    const mcp = await startMcp(kit.config, { prisma: untouchablePrisma().prisma, verifyGateway: null, log: (l) => logs.push(l) });
    expect(mcp).toBeNull();
    expect(logs).toEqual(['mcp: disabled (CF_ACCESS_GATEWAY_AUD unset)']);
    const app = createApp({ prisma: untouchablePrisma().prisma, config: kit.config, verifyAccess: kit.verifyAccess, log: () => {} });
    expect((await request(app).get('/api/health')).status).toBe(200);
  });
});

describe('MCP listener: dev mode', () => {
  const dev = { AUTH_MODE: 'dev', PUBLIC_ORIGIN: 'http://localhost:5173', DEV_AUTH_EMAIL: 'dev@example.com' };
  let kit;
  afterEach(async () => {
    await kit?.close();
  });

  it('binds 127.0.0.1 only and needs no assertion', async () => {
    kit = await createMcpKit({ prisma: untouchablePrisma().prisma, env: dev });
    expect(kit.mcp.server.address().address).toBe('127.0.0.1');
    const client = await kit.connect();
    expect((await client.listTools()).tools).toHaveLength(5);
    await client.close();
  });
});

describe('a port that cannot be bound', () => {
  const dev = { AUTH_MODE: 'dev', PUBLIC_ORIGIN: 'http://localhost:5173', DEV_AUTH_EMAIL: 'dev@example.com' };
  let first;
  afterEach(async () => {
    await first?.close();
  });

  it('dev mode logs and carries on without MCP', async () => {
    first = await createMcpKit({ prisma: untouchablePrisma().prisma, env: dev });
    const kit = await createAuthKit(dev);
    const logs = [];
    const mcp = await startMcp(kit.config, { prisma: untouchablePrisma().prisma, log: (l) => logs.push(l), port: first.mcp.port });
    expect(mcp).toBeNull();
    expect(logs.join('\n')).toMatch(/mcp: disabled \(cannot listen on 127\.0\.0\.1:\d+: EADDRINUSE/);
  });

  it('access mode refuses to boot', async () => {
    first = await createMcpKit({ prisma: untouchablePrisma().prisma });
    const kit = await createAuthKit({ CF_ACCESS_GATEWAY_AUD: GATEWAY_AUD });
    await expect(
      startMcp(kit.config, { prisma: untouchablePrisma().prisma, verifyGateway: async () => ({}), log: () => {}, port: first.mcp.port })
    ).rejects.toMatchObject({ code: 'EADDRINUSE' });
  });
});

describe('criterion 15: stdio.js', () => {
  const stdio = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/mcp/stdio.js');

  it('answers initialize and tools/list with no DATABASE_URL and no Prisma', async () => {
    const env = { ...process.env };
    delete env.DATABASE_URL;
    delete env.COOK_TEST_DATABASE_URL;
    const child = spawn(process.execPath, [stdio], { env, stdio: ['pipe', 'pipe', 'pipe'] });
    const lines = [];
    let buf = '';
    child.stdout.on('data', (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        lines.push(JSON.parse(buf.slice(0, i)));
        buf = buf.slice(i + 1);
      }
    });
    const send = (m) => child.stdin.write(`${JSON.stringify(m)}\n`);
    send(INITIALIZE);
    send({ jsonrpc: '2.0', method: 'notifications/initialized' });
    send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'list_contributors', arguments: {} } });
    const start = Date.now();
    while (lines.length < 3 && Date.now() - start < 8000) await new Promise((r) => setTimeout(r, 25));
    child.kill();
    expect(lines.find((l) => l.id === 1).result.serverInfo.name).toBe('commonplace');
    const tools = lines.find((l) => l.id === 2).result.tools;
    expect(tools.map((t) => t.name).sort()).toEqual(['create_recipe', 'get_recipe', 'list_contributors', 'random_recipe', 'search_recipes']);
    expect(lines.find((l) => l.id === 3).result.isError).toBe(true);
  });
});
