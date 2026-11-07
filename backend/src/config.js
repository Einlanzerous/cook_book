/**
 * Runtime configuration for sign-in (COOK-23), validated once at boot.
 *
 * Nothing here reads process.env at import: `loadConfig(env)` takes the
 * environment as a parameter so tests can build any configuration. It throws
 * on anything unsafe or incomplete, which is the point: there is no mode in
 * which writes are open, and a misconfigured process refuses to start.
 */

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export class ConfigError extends Error {}

function parseOrigin(value, name) {
  let u;
  try {
    u = new URL(value);
  } catch {
    throw new ConfigError(`${name} must be an origin such as https://host (got ${JSON.stringify(value)})`);
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') {
    throw new ConfigError(`${name} must be an http(s) origin`);
  }
  return u;
}

function parseTeamDomain(value) {
  // A bare host such as zero-gravity-industries.cloudflareaccess.com
  if (!value || !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(value)) {
    throw new ConfigError('CF_ACCESS_TEAM_DOMAIN must be a bare host name such as team.cloudflareaccess.com');
  }
  return value.toLowerCase();
}

export function loadConfig(env = process.env) {
  const authMode = env.AUTH_MODE || 'access';
  if (authMode !== 'access' && authMode !== 'dev') {
    throw new ConfigError(`AUTH_MODE must be "access" or "dev" (got ${JSON.stringify(authMode)})`);
  }

  const publicOriginRaw = env.PUBLIC_ORIGIN;
  if (!publicOriginRaw) throw new ConfigError('PUBLIC_ORIGIN is required');
  const publicUrl = parseOrigin(publicOriginRaw, 'PUBLIC_ORIGIN');

  const sessionDays = env.SESSION_DAYS === undefined || env.SESSION_DAYS === '' ? 30 : Number(env.SESSION_DAYS);
  if (!Number.isFinite(sessionDays) || sessionDays <= 0) {
    throw new ConfigError('SESSION_DAYS must be a positive number');
  }

  const ssoEnabled = env.SSO_ENABLED === undefined ? true : String(env.SSO_ENABLED).toLowerCase() !== 'false';

  const config = {
    authMode,
    publicOrigin: publicUrl.origin,
    sessionDays,
    ssoEnabled,
    // The cookie name carries the __Host- prefix only where the browser will
    // accept it (HTTPS, Secure, Path=/, no Domain). Dev is plain http.
    secureCookie: authMode === 'access',
    cookieName: authMode === 'access' ? '__Host-cb_session' : 'cb_session'
  };

  if (authMode === 'dev') {
    // Two independent guards: NODE_ENV alone is not enough because the
    // production image does not set it.
    if (env.NODE_ENV === 'production') {
      throw new ConfigError('AUTH_MODE=dev is refused when NODE_ENV=production');
    }
    if (!LOOPBACK_HOSTS.has(publicUrl.hostname)) {
      throw new ConfigError('AUTH_MODE=dev is refused unless PUBLIC_ORIGIN is a loopback host (localhost, 127.0.0.1, ::1)');
    }
    if (!env.DEV_AUTH_EMAIL || !env.DEV_AUTH_EMAIL.includes('@')) {
      throw new ConfigError('AUTH_MODE=dev requires DEV_AUTH_EMAIL');
    }
    config.devAuthEmail = env.DEV_AUTH_EMAIL.trim().toLowerCase();
    return config;
  }

  // access mode: DEV_AUTH_EMAIL alone enables nothing, and is ignored here.
  config.teamDomain = parseTeamDomain(env.CF_ACCESS_TEAM_DOMAIN);
  if (!env.CF_ACCESS_AUD || !env.CF_ACCESS_AUD.trim()) {
    throw new ConfigError('CF_ACCESS_AUD is required');
  }
  config.audience = env.CF_ACCESS_AUD.trim();
  return config;
}
