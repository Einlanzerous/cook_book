/**
 * The ONE place the production key source and verifiers are built. The remote
 * JWKS (cached, rotating) is created once here and closed over; nothing else
 * may construct it. The web verifier and the MCP gateway verifier (COOK-49)
 * share it: same team, same keys, different audience.
 */
import { createRemoteJWKSet } from 'jose';
import { createAccessVerifier } from './auth/access.js';

export function buildJwks(config) {
  return createRemoteJWKSet(new URL(`https://${config.teamDomain}/cdn-cgi/access/certs`));
}

export function buildVerifier(config, jwks) {
  if (config.authMode === 'dev') {
    // AUTH_MODE=dev: DEV_AUTH_EMAIL is the verified identity. The sub is
    // derived so the real resolution and binding code runs in dev too.
    const email = config.devAuthEmail;
    return async () => ({ email, sub: `dev:${email}` });
  }
  return createAccessVerifier({ teamDomain: config.teamDomain, audience: config.audience, jwks: jwks ?? buildJwks(config) });
}

/**
 * Verifier for heitan's forwarded assertion, or null when the gateway
 * audience is unset (access mode) or in dev mode (no assertion there).
 */
export function buildGatewayVerifier(config, jwks) {
  if (config.authMode === 'dev' || !config.gatewayAudience) return null;
  return createAccessVerifier({
    teamDomain: config.teamDomain,
    audience: config.gatewayAudience,
    jwks: jwks ?? buildJwks(config)
  });
}
