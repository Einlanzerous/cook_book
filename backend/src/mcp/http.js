/**
 * The MCP HTTP listener (COOK-49): a plain Express app on its own internal
 * port (MCP_PORT, default 4002) that mounts only POST /mcp and GET /healthz.
 * It is a heitan backend: heitan verifies the caller's Cloudflare Access
 * assertion, forwards it byte for byte, and this listener verifies it again
 * against heitan's audience (CF_ACCESS_GATEWAY_AUD).
 *
 * Deliberately NOT the SDK's createMcpExpressApp(): its default host check
 * rejects `Host: cook_book:4002`, which is what heitan sends over
 * construct_net, and every bundle came up unavailable in the COOK-13 spike.
 * No host check here: the port is not published and not routed (Traefik never
 * sees it), and the JWT audience is the gate, as on every other construct_net
 * backend.
 *
 * Stateless: a fresh McpServer and transport per request, closed when the
 * response closes (sessionIdGenerator: undefined). heitan sends `server/discover`
 * first and expects a 400, then initialize; the transport answers that 400
 * for a sessionless request that is not an initialize.
 */
import express from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { AccessError, logOncePerCooldown } from '../auth/access.js';
import { resolveBuildIdentity } from '../buildIdentity.js';
import { createMcpServer } from './server.js';

const ASSERTION_HEADER = 'cf-access-jwt-assertion';
const REJECT_LOG_COOLDOWN_MS = 10_000;

const rpcError = (code, message) => ({ jsonrpc: '2.0', error: { code, message }, id: null });

/**
 * The Express app, separately from listening, so tests can drive it.
 * `caller` is resolved per request by `authenticate`.
 */
export function createMcpApp(config, deps) {
  const {
    prisma,
    verifyGateway,
    log = console.log,
    rng,
    createRecipe,
    rejectCooldownMs = REJECT_LOG_COOLDOWN_MS,
    identity = resolveBuildIdentity()
  } = deps;

  // mcp.auth reject lines are rate-limited per reason, the way the JWKS
  // failure log is, so a flood of bad assertions cannot flood the log.
  const limiters = new Map();
  const logReject = (reason) => {
    if (!limiters.has(reason)) limiters.set(reason, logOncePerCooldown(reason, rejectCooldownMs, Date.now, log));
    limiters.get(reason)(`mcp.auth reject reason=${reason}`);
  };

  // Status choice (heitan classifies a backend's reply): 401 for any
  // assertion problem, with ONE fixed body whatever the reason, so the reason
  // is learnable only from our log. heitan treats 401/403 as class `auth`:
  // never retried, which is right for a bad or missing assertion. The one
  // exception is the key source being down (jwks_unavailable): that is ours,
  // not the caller's, so 503 ("http_unavailable", retried) is the honest answer.
  const reject = (res, reason) => {
    logReject(reason);
    res.set('Cache-Control', 'no-store');
    if (reason === 'jwks_unavailable') return res.status(503).json(rpcError(-32003, 'Service unavailable'));
    return res.status(401).json(rpcError(-32001, 'Unauthorized'));
  };

  async function authenticate(req, res, next) {
    if (config.authMode === 'dev') {
      // Same two guards as the web app (loopback PUBLIC_ORIGIN, not production)
      // were enforced by loadConfig; the listener also binds loopback only.
      req.caller = { email: config.devAuthEmail, sub: `dev:${config.devAuthEmail}` };
      return next();
    }
    try {
      // Exactly one assertion header. headersDistinct keeps repeats apart
      // (req.headers would join them with ", "). No other Cf-* header is read.
      const values = req.headersDistinct[ASSERTION_HEADER] ?? [];
      if (values.length === 0) return reject(res, 'missing');
      if (values.length > 1) return reject(res, 'multiple');
      req.caller = await verifyGateway(values[0]);
      return next();
    } catch (err) {
      if (err instanceof AccessError) return reject(res, err.reason);
      return next(err);
    }
  }

  const app = express();
  app.disable('x-powered-by');

  // Health is unauthenticated, like /api/health: build identity only.
  app.get('/healthz', (req, res) => res.json({ status: 'ok', ...identity }));

  // Authenticate BEFORE parsing the body: an unauthenticated caller gets no
  // body parsing, no server, no database.
  app.use('/mcp', authenticate);
  app.use('/mcp', express.json({ limit: '100kb' }));

  app.post('/mcp', async (req, res) => {
    // heitan's go-sdk client opens with `server/discover` (protocol 2026-07-28)
    // and falls back to initialize on a 400. This SDK would answer 200 with a
    // JSON-RPC method-not-found, which the client does not read as "unsupported",
    // so say 400 explicitly. Nothing is built and nothing is read for it.
    const messages = Array.isArray(req.body) ? req.body : [req.body];
    if (messages.some((m) => m?.method === 'server/discover')) {
      return res.status(400).json(rpcError(-32600, 'server/discover is not supported; send initialize'));
    }
    const server = createMcpServer({
      prisma,
      caller: req.caller,
      publicOrigin: config.publicOrigin,
      log,
      rng,
      createRecipe,
      version: identity.version
    });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => {
      transport.close().catch(() => {});
      server.close().catch(() => {});
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      log(`mcp.error transport name=${err?.name ?? 'Error'}`);
      if (!res.headersSent) res.status(500).json(rpcError(-32603, 'Internal error'));
    }
  });

  // Stateless: no standalone SSE stream (GET) and no session to delete.
  const notAllowed = (req, res) => res.status(405).set('Allow', 'POST').json(rpcError(-32000, 'Method not allowed'));
  app.get('/mcp', notAllowed);
  app.delete('/mcp', notAllowed);

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err?.status >= 400 && err?.status < 500 ? err.status : 500;
    if (status === 500) log(`mcp.error http name=${err?.name ?? 'Error'}`);
    res.status(status).json(status === 500 ? rpcError(-32603, 'Internal error') : rpcError(status === 413 ? -32600 : -32700, status === 413 ? 'Request too large' : 'Bad request'));
  });

  return app;
}

/**
 * The seam index.js calls. Returns null when MCP is off, else
 * `{ server, port, close }` once listening.
 *
 * Off: access mode with CF_ACCESS_GATEWAY_AUD unset (logged once). In dev mode
 * it is always on, bound to 127.0.0.1, and the caller is DEV_AUTH_EMAIL.
 *
 * @param {object} config  loadConfig() result
 * @param {object} deps    { prisma, verifyGateway, log?, port?, rng?, createRecipe?, identity? }
 */
export async function startMcp(config, deps) {
  const log = deps.log ?? console.log;
  if (config.authMode !== 'dev' && !config.gatewayAudience) {
    log('mcp: disabled (CF_ACCESS_GATEWAY_AUD unset)');
    return null;
  }
  if (config.authMode !== 'dev' && typeof deps.verifyGateway !== 'function') {
    throw new Error('startMcp: access mode with CF_ACCESS_GATEWAY_AUD set needs a gateway verifier');
  }

  const app = createMcpApp(config, { ...deps, log });
  const host = config.authMode === 'dev' ? '127.0.0.1' : '0.0.0.0';
  const port = deps.port ?? config.mcpPort;

  const server = await new Promise((resolve, reject) => {
    const s = app.listen(port, host, () => resolve(s));
    s.once('error', reject);
  });
  const bound = server.address().port;
  log(`mcp: listening on ${host}:${bound} (auth mode: ${config.authMode})`);
  return {
    server,
    port: bound,
    close: () => new Promise((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections?.();
    })
  };
}
