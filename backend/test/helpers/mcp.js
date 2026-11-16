/**
 * Test kit for the MCP listener (COOK-49): gateway assertions minted with the
 * same local JWKS the auth tests use, a real SDK client over HTTP, and a raw
 * HTTP sender for the cases a client library would never produce.
 */
import http from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createAccessVerifier } from '../../src/auth/access.js';
import { startMcp } from '../../src/mcp/http.js';
import { createAuthKit, TEAM, AUD } from './auth.js';

export const GATEWAY_AUD = 'gateway-aud-9876543210';

/** A prisma stand-in that fails the test if anything touches it. */
export function untouchablePrisma() {
  const touched = [];
  const proxy = new Proxy({}, {
    get: (_t, prop) => {
      touched.push(String(prop));
      throw new Error(`prisma.${String(prop)} used`);
    }
  });
  return { prisma: proxy, touched };
}

export async function createMcpKit({ prisma, env = {}, deps = {} } = {}) {
  const kit = await createAuthKit({ CF_ACCESS_GATEWAY_AUD: GATEWAY_AUD, ...env });
  const logs = [];
  const log = (line) => logs.push(line);
  const verifyGateway =
    kit.config.authMode === 'dev'
      ? null
      : createAccessVerifier({ teamDomain: TEAM, audience: GATEWAY_AUD, jwks: kit.jwks, logJwksFailure: () => {} });
  const mcp = await startMcp(kit.config, { prisma, verifyGateway, log, port: 0, rejectCooldownMs: 0, ...deps });
  const url = new URL(`http://127.0.0.1:${mcp.port}/mcp`);

  /** An assertion for the gateway audience. */
  const assertion = (claims = { email: 'ann@example.com', sub: 'sub-ann' }, opts) =>
    kit.sign(claims, { aud: GATEWAY_AUD, ...opts });

  async function connect(jwt) {
    const client = new Client({ name: 'test', version: '1' });
    const requestInit = jwt ? { headers: { 'Cf-Access-Jwt-Assertion': jwt } } : undefined;
    await client.connect(new StreamableHTTPClientTransport(url, { requestInit }));
    return client;
  }

  return { ...kit, mcp, url, logs, assertion, connect, AUD, close: () => mcp.close() };
}

/** POST JSON-RPC with exact control of the headers (an array of [name, value] pairs). */
export function rawPost(url, headerPairs, body) {
  return new Promise((resolve, reject) => {
    const payload = typeof body === 'string' ? body : JSON.stringify(body);
    const headers = [
      ['Content-Type', 'application/json'],
      ['Accept', 'application/json, text/event-stream'],
      ['Content-Length', Buffer.byteLength(payload)],
      ...(headerPairs.some(([k]) => k.toLowerCase() === 'host') ? [] : [['Host', `${url.hostname}:${url.port}`]]),
      ...headerPairs
    ].flat();
    const req = http.request({ host: url.hostname, port: url.port, path: url.pathname, method: 'POST', headers }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.end(payload);
  });
}

export const INITIALIZE = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'raw', version: '1' } }
};

/** Parse the tool result text of an SDK callTool answer. */
export const toolJson = (res) => JSON.parse(res.content[0].text);
