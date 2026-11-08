/**
 * Test kit for signed-in requests (COOK-23). A real RS256 key pair backs a
 * local JWKS, so tests mint genuine Access-style assertions and exercise the
 * production verifier (createAccessVerifier) end to end.
 */
import request from 'supertest';
import { SignJWT, exportJWK, generateKeyPair, createLocalJWKSet } from 'jose';
import { createApp } from '../../src/app.js';
import { createAccessVerifier } from '../../src/auth/access.js';
import { loadConfig } from '../../src/config.js';
import { buildVerifier } from '../../src/boot.js';

export const TEAM = 'team.cloudflareaccess.example.com';
export const AUD = 'test-aud-0123456789';
export const ORIGIN = 'https://commonplace.test';

export const baseEnv = {
  AUTH_MODE: 'access',
  CF_ACCESS_TEAM_DOMAIN: TEAM,
  CF_ACCESS_AUD: AUD,
  PUBLIC_ORIGIN: ORIGIN
};

export async function createAuthKit(envOverrides = {}) {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(publicKey)), kid: 'test-key', alg: 'RS256', use: 'sig' };
  const jwks = createLocalJWKSet({ keys: [jwk] });
  const config = loadConfig({ ...baseEnv, ...envOverrides });
  const verifyAccess = createAccessVerifier({ teamDomain: TEAM, audience: AUD, jwks, logJwksFailure: () => {} });

  async function sign(claims = {}, { key = privateKey, alg = 'RS256', aud = AUD, iss = `https://${TEAM}`, exp = '10m', kid = 'test-key' } = {}) {
    let jwt = new SignJWT(claims).setProtectedHeader({ alg, kid }).setIssuedAt().setIssuer(iss).setAudience(aud);
    if (exp !== null) jwt = jwt.setExpirationTime(exp);
    return jwt.sign(key);
  }

  return { config, jwks, privateKey, publicKey, verifyAccess, sign };
}

/**
 * app + helpers. `signIn(email, sub?)` goes through GET /auth/sso with a real
 * assertion and returns the Cookie header value to send on later requests.
 */
export async function createTestApp(prisma, { env, appOptions } = {}) {
  const kit = await createAuthKit(env);
  const app = createApp({ prisma, config: kit.config, verifyAccess: kit.config.authMode === 'dev' ? buildVerifier(kit.config) : kit.verifyAccess, log: () => {}, ...appOptions });

  async function signInResponse(email, sub = `sub-${email}`, next) {
    const jwt = await kit.sign({ email, sub });
    return request(app).get(next ? `/auth/sso?next=${encodeURIComponent(next)}` : '/auth/sso').set('Cf-Access-Jwt-Assertion', jwt);
  }

  async function signIn(email, sub) {
    const res = await signInResponse(email, sub);
    if (res.status !== 302) throw new Error(`sign-in failed: ${res.status} ${JSON.stringify(res.body)}`);
    return cookieFrom(res);
  }

  return { app, kit, config: kit.config, signIn, signInResponse };
}

/** "name=value" for the session cookie in a response, or null. */
export function cookieFrom(res) {
  const set = res.headers['set-cookie'];
  if (!set) return null;
  const line = [].concat(set).find((c) => /^(__Host-)?cb_session=/.test(c));
  return line ? line.split(';')[0] : null;
}

/** A body with a session cookie and the JSON content type. */
export const withCookie = (req, cookie) => req.set('Cookie', cookie);

/** supertest with a session cookie on every request: authed(app, cookie).post(url) */
export function authed(app, cookie) {
  const m = (method) => (url) => request(app)[method](url).set('Cookie', cookie);
  return { get: m('get'), post: m('post'), put: m('put'), delete: m('delete') };
}
