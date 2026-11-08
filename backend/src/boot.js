/**
 * The ONE place the production key source and verifier are built. The remote
 * JWKS (cached, rotating) is created once here and closed over; nothing else
 * may construct it.
 */
import { createRemoteJWKSet } from 'jose';
import { createAccessVerifier } from './auth/access.js';

export function buildVerifier(config) {
  if (config.authMode === 'dev') {
    // AUTH_MODE=dev: DEV_AUTH_EMAIL is the verified identity. The sub is
    // derived so the real resolution and binding code runs in dev too.
    const email = config.devAuthEmail;
    return async () => ({ email, sub: `dev:${email}` });
  }
  const jwks = createRemoteJWKSet(new URL(`https://${config.teamDomain}/cdn-cgi/access/certs`));
  return createAccessVerifier({ teamDomain: config.teamDomain, audience: config.audience, jwks });
}
