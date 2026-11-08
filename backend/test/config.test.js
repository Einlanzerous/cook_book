/**
 * COOK-23 criterion 6: config guards. Unit tests on the config module; no
 * claim is made about a Dockerfile NODE_ENV.
 */
import { describe, it, expect } from 'vitest';
import { loadConfig, ConfigError } from '../src/config.js';

const access = {
  CF_ACCESS_TEAM_DOMAIN: 'zero-gravity-industries.cloudflareaccess.com',
  CF_ACCESS_AUD: 'aud123',
  PUBLIC_ORIGIN: 'https://commonplace.zerogravity.industries'
};
const dev = { AUTH_MODE: 'dev', PUBLIC_ORIGIN: 'http://localhost:5173', DEV_AUTH_EMAIL: 'Dev@Example.com' };

describe('loadConfig: access mode (the default)', () => {
  it('accepts a complete configuration with the 30-day default', () => {
    const c = loadConfig(access);
    expect(c).toMatchObject({
      authMode: 'access',
      publicOrigin: 'https://commonplace.zerogravity.industries',
      teamDomain: 'zero-gravity-industries.cloudflareaccess.com',
      audience: 'aud123',
      sessionDays: 30,
      ssoEnabled: true,
      secureCookie: true,
      cookieName: '__Host-cb_session'
    });
  });

  it.each([
    ['CF_ACCESS_TEAM_DOMAIN missing', { CF_ACCESS_TEAM_DOMAIN: undefined }],
    ['CF_ACCESS_TEAM_DOMAIN malformed', { CF_ACCESS_TEAM_DOMAIN: 'https://team.example.com/path' }],
    ['CF_ACCESS_AUD missing', { CF_ACCESS_AUD: undefined }],
    ['CF_ACCESS_AUD blank', { CF_ACCESS_AUD: '  ' }],
    ['PUBLIC_ORIGIN missing', { PUBLIC_ORIGIN: undefined }],
    ['PUBLIC_ORIGIN malformed', { PUBLIC_ORIGIN: 'commonplace' }],
    ['PUBLIC_ORIGIN not http(s)', { PUBLIC_ORIGIN: 'ftp://commonplace.example' }],
    ['SESSION_DAYS nonsense', { SESSION_DAYS: 'soon' }],
    ['AUTH_MODE unknown', { AUTH_MODE: 'open' }]
  ])('refuses to start: %s', (_name, over) => {
    expect(() => loadConfig({ ...access, ...over })).toThrow(ConfigError);
  });

  it('with nothing set at all, refuses to start (there is no open mode)', () => {
    expect(() => loadConfig({})).toThrow(ConfigError);
  });

  it('setting DEV_AUTH_EMAIL alone enables nothing', () => {
    const c = loadConfig({ ...access, DEV_AUTH_EMAIL: 'me@example.com' });
    expect(c.authMode).toBe('access');
    expect(c.devAuthEmail).toBeUndefined();
    expect(() => loadConfig({ DEV_AUTH_EMAIL: 'me@example.com', PUBLIC_ORIGIN: 'http://localhost:5173' })).toThrow(ConfigError);
  });

  it('honours SESSION_DAYS and SSO_ENABLED=false', () => {
    expect(loadConfig({ ...access, SESSION_DAYS: '7' }).sessionDays).toBe(7);
    expect(loadConfig({ ...access, SSO_ENABLED: 'false' }).ssoEnabled).toBe(false);
    expect(loadConfig({ ...access, SSO_ENABLED: 'true' }).ssoEnabled).toBe(true);
  });
});

describe('loadConfig: AUTH_MODE=dev has two independent guards', () => {
  it('works on a loopback origin outside production and lower-cases the identity', () => {
    const c = loadConfig(dev);
    expect(c).toMatchObject({ authMode: 'dev', devAuthEmail: 'dev@example.com', secureCookie: false, cookieName: 'cb_session' });
  });

  it.each(['http://localhost:5173', 'http://127.0.0.1:3000', 'http://[::1]:3000'])('accepts loopback %s', (origin) => {
    expect(() => loadConfig({ ...dev, PUBLIC_ORIGIN: origin })).not.toThrow();
  });

  it('guard 1: refused when NODE_ENV=production', () => {
    expect(() => loadConfig({ ...dev, NODE_ENV: 'production' })).toThrow(/NODE_ENV=production/);
  });

  it('guard 2: refused when PUBLIC_ORIGIN is not loopback, even without NODE_ENV (the image does not set it)', () => {
    expect(() => loadConfig({ ...dev, PUBLIC_ORIGIN: 'https://commonplace.zerogravity.industries' })).toThrow(/loopback/);
    expect(() => loadConfig({ ...dev, PUBLIC_ORIGIN: 'http://localhost.evil.test' })).toThrow(/loopback/);
  });

  it('requires DEV_AUTH_EMAIL', () => {
    expect(() => loadConfig({ ...dev, DEV_AUTH_EMAIL: undefined })).toThrow(/DEV_AUTH_EMAIL/);
  });
});
