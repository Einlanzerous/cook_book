/**
 * Verification of the Cloudflare Access assertion (COOK-23).
 *
 * Only the signed JWT counts. The Cf-Access-Authenticated-User-Email header
 * and every other Cf-* header are never read: anything that can reach this
 * port can forge them.
 *
 * The key source is a parameter (`jwks`): production passes a
 * createRemoteJWKSet built ONCE at boot (see boot.js), tests pass a
 * createLocalJWKSet. The returned function is exported so the future MCP
 * server (COOK-13) can reuse it.
 */
import { jwtVerify, errors } from 'jose';

export class AccessError extends Error {
  constructor(reason, cause) {
    super(`access assertion rejected: ${reason}`);
    this.reason = reason;
    this.cause = cause;
  }
}

/**
 * Returns a logger that emits for `key` at most once per `cooldownMs`. jose
 * has no such feature; the JWKS failure path uses this so a down certs
 * endpoint cannot flood the log. `now` is injectable for tests.
 */
export function logOncePerCooldown(key, cooldownMs, now = Date.now, log = console.error) {
  let last;
  return function logIt(...args) {
    const t = now();
    if (last !== undefined && t - last < cooldownMs) return false;
    last = t;
    log(...args);
    return true;
  };
}

// Problems with the token itself. Anything else (network, a non-200 from the
// certs URL, a timeout) is the key source failing, which fails closed too.
const TOKEN_PROBLEMS = [
  errors.JWSInvalid,
  errors.JWTInvalid,
  errors.JWSSignatureVerificationFailed,
  errors.JWKSNoMatchingKey,
  errors.JWKSMultipleMatchingKeys,
  errors.JOSENotSupported
];

function reasonFor(err) {
  if (err instanceof errors.JWTExpired) return 'expired';
  if (err instanceof errors.JOSEAlgNotAllowed) return 'bad_alg';
  if (err instanceof errors.JWTClaimValidationFailed) {
    if (err.claim === 'aud') return 'bad_aud';
    if (err.claim === 'iss') return 'bad_iss';
    if (err.claim === 'exp' || err.claim === 'nbf') return 'expired';
    return 'bad_claim';
  }
  if (TOKEN_PROBLEMS.some((C) => err instanceof C)) return 'bad_signature';
  return 'jwks_unavailable';
}

export function createAccessVerifier({ teamDomain, audience, jwks, logJwksFailure = logOncePerCooldown('jwks', 60_000) }) {
  const issuer = `https://${teamDomain}`;
  return async function verifyAccessAssertion(jwt) {
    if (!jwt || typeof jwt !== 'string') throw new AccessError('missing');
    let payload;
    try {
      ({ payload } = await jwtVerify(jwt, jwks, {
        algorithms: ['RS256'],
        issuer,
        audience,
        clockTolerance: 30
      }));
    } catch (err) {
      const reason = reasonFor(err);
      if (reason === 'jwks_unavailable') logJwksFailure(`auth.jwks fetch failed: ${err.message}`);
      throw new AccessError(reason, err);
    }
    const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
    if (!email) throw new AccessError('no_email'); // service tokens carry none
    if (typeof payload.sub !== 'string' || !payload.sub) throw new AccessError('no_sub');
    return { email, sub: payload.sub };
  };
}
