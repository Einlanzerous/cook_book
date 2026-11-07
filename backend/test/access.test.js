/**
 * COOK-23 criteria 1 and 2: the JWT rejection matrix at /auth/sso and the JWKS
 * seam. The database is a stub that throws if touched, which also proves a
 * rejected assertion mints no session.
 */
import request from 'supertest';
import { describe, it, expect } from 'vitest';
import { SignJWT, exportSPKI } from 'jose';
import { createApp } from '../src/app.js';
import { createAccessVerifier, logOncePerCooldown, AccessError } from '../src/auth/access.js';
import { createAuthKit, AUD, TEAM } from './helpers/auth.js';

const noDb = new Proxy({}, { get: () => { throw new Error('a rejected assertion must not touch the database'); } });

async function build(overrides) {
  const kit = await createAuthKit();
  const logs = [];
  const verifyAccess = overrides?.verifyAccess ?? kit.verifyAccess;
  const app = createApp({ prisma: noDb, config: kit.config, verifyAccess, log: (l) => logs.push(l) });
  return { kit, app, logs };
}

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const sso = (app, jwt) => {
  const r = request(app).get('/auth/sso');
  return jwt ? r.set('Cf-Access-Jwt-Assertion', jwt) : r;
};
const nowSec = () => Math.floor(Date.now() / 1000);

describe('GET /auth/sso: rejection matrix (each is 401, no session, no cookie)', () => {
  const good = { email: 'cook@example.com', sub: 'sub-1' };

  async function expectRejected(res, logs, reason) {
    expect(res.status).toBe(401);
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(res.headers['cache-control']).toBe('no-store');
    if (reason) expect(logs.some((l) => l.includes(`auth.sso reject reason=${reason}`))).toBe(true);
  }

  it('a forged Cf-Access-Authenticated-User-Email header with no JWT', async () => {
    const { app, logs } = await build();
    const res = await request(app).get('/auth/sso').set('Cf-Access-Authenticated-User-Email', 'owner@example.com');
    await expectRejected(res, logs, 'missing');
  });

  it('a forged email header alongside a JWT for someone else is not believed', async () => {
    const { app, kit, logs } = await build();
    const res = await sso(app, await kit.sign({ sub: 's' })).set('Cf-Access-Authenticated-User-Email', 'owner@example.com');
    await expectRejected(res, logs, 'no_email');
  });

  it('a bad signature', async () => {
    const { app, kit, logs } = await build();
    const other = await createAuthKit();
    await expectRejected(await sso(app, await kit.sign(good, { key: other.privateKey })), logs, 'bad_signature');
  });

  it('the wrong aud', async () => {
    const { app, kit, logs } = await build();
    await expectRejected(await sso(app, await kit.sign(good, { aud: 'someone-elses-app' })), logs, 'bad_aud');
  });

  it('the wrong iss (exact string match)', async () => {
    const { app, kit, logs } = await build();
    for (const iss of [`https://evil.${TEAM}`, `https://${TEAM}/`, `http://${TEAM}`, TEAM]) {
      await expectRejected(await sso(app, await kit.sign(good, { iss })), logs, 'bad_iss');
    }
  });

  it('an expired exp', async () => {
    const { app, kit, logs } = await build();
    await expectRejected(await sso(app, await kit.sign(good, { exp: nowSec() - 3600 })), logs, 'expired');
  });

  it('no email claim (a service token)', async () => {
    const { app, kit, logs } = await build();
    await expectRejected(await sso(app, await kit.sign({ sub: 'svc' })), logs, 'no_email');
  });

  it('an alg:none token', async () => {
    const { app, logs } = await build();
    const jwt = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ ...good, aud: AUD, iss: `https://${TEAM}`, exp: nowSec() + 600 })}.`;
    await expectRejected(await sso(app, jwt), logs);
  });

  it('an HS256 token signed with the JWKS public key as the HMAC secret', async () => {
    const { app, kit, logs } = await build();
    const secret = new TextEncoder().encode(await exportSPKI(kit.publicKey));
    const jwt = await new SignJWT(good).setProtectedHeader({ alg: 'HS256', kid: 'test-key' })
      .setIssuer(`https://${TEAM}`).setAudience(AUD).setExpirationTime('10m').sign(secret);
    await expectRejected(await sso(app, jwt), logs, 'bad_alg');
  });

  it('garbage', async () => {
    const { app, logs } = await build();
    await expectRejected(await sso(app, 'not.a.jwt'), logs);
    await expectRejected(await sso(app, 'x'), logs);
  });
});

describe('JWKS seam and failure logging', () => {
  it('createAccessVerifier takes the key source as a parameter and returns the verified identity', async () => {
    const kit = await createAuthKit();
    const who = await kit.verifyAccess(await kit.sign({ email: 'Cook@Example.com', sub: 'abc' }));
    expect(who).toEqual({ email: 'cook@example.com', sub: 'abc' });
  });

  it('a JWKS fetch failure is 401 (fails closed), logged through the cooldown helper', async () => {
    const kit = await createAuthKit();
    const failing = () => { throw new Error('connect ECONNREFUSED certs'); };
    const logged = [];
    const verifyAccess = createAccessVerifier({ teamDomain: TEAM, audience: AUD, jwks: failing, logJwksFailure: (m) => logged.push(m) });
    const { app, logs } = await build({ verifyAccess });
    const res = await sso(app, await kit.sign({ email: 'a@example.com', sub: 's' }));
    expect(res.status).toBe(401);
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(logs.some((l) => l.includes('reason=jwks_unavailable'))).toBe(true);
    expect(logged).toHaveLength(1);
    await expect(verifyAccess('a.b.c')).rejects.toBeInstanceOf(AccessError);
  });

  it('logOncePerCooldown: first logs, repeats inside the cooldown do not, one after it does', () => {
    let t = 1_000;
    const out = [];
    const log = logOncePerCooldown('jwks', 60_000, () => t, (m) => out.push(m));
    expect(log('one')).toBe(true);
    t += 59_999;
    expect(log('two')).toBe(false);
    t += 1;
    expect(log('three')).toBe(true);
    expect(out).toEqual(['one', 'three']);
  });
});
