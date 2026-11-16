/**
 * COOK-49 criterion 5 (unit): the MCP audience and port boot checks.
 */
import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config.js';

const access = {
  CF_ACCESS_TEAM_DOMAIN: 'zero-gravity-industries.cloudflareaccess.com',
  CF_ACCESS_AUD: 'aud123',
  PUBLIC_ORIGIN: 'https://commonplace.zerogravity.industries'
};
const dev = { AUTH_MODE: 'dev', PUBLIC_ORIGIN: 'http://localhost:5173', DEV_AUTH_EMAIL: 'dev@example.com' };

describe('loadConfig: MCP (COOK-49)', () => {
  it('leaves the gateway audience unset by default and defaults MCP_PORT to 4002', () => {
    const c = loadConfig(access);
    expect(c.gatewayAudience).toBeUndefined();
    expect(c.mcpPort).toBe(4002);
  });

  it('accepts one distinct gateway audience and an explicit port', () => {
    const c = loadConfig({ ...access, CF_ACCESS_GATEWAY_AUD: ' gw-aud ', MCP_PORT: '4100' });
    expect(c.gatewayAudience).toBe('gw-aud');
    expect(c.mcpPort).toBe(4100);
  });

  it('refuses a gateway audience equal to the web audience', () => {
    expect(() => loadConfig({ ...access, CF_ACCESS_GATEWAY_AUD: 'aud123' })).toThrow(/must differ from CF_ACCESS_AUD/);
  });

  it.each(['a,b', 'a b', 'a, b', 'a\tb'])('refuses more than one value (%j)', (value) => {
    expect(() => loadConfig({ ...access, CF_ACCESS_GATEWAY_AUD: value })).toThrow(/exactly one audience/);
  });

  it('treats a blank gateway audience as unset', () => {
    expect(loadConfig({ ...access, CF_ACCESS_GATEWAY_AUD: '   ' }).gatewayAudience).toBeUndefined();
  });

  it.each(['abc', '0', '70000', '40.5', '-1'])('refuses MCP_PORT=%s', (value) => {
    expect(() => loadConfig({ ...access, MCP_PORT: value })).toThrow(/MCP_PORT/);
  });

  it('refuses an MCP_PORT equal to the web PORT', () => {
    expect(() => loadConfig({ ...access, PORT: '4002' })).toThrow(/must differ from PORT/);
  });

  it('dev mode carries a port but never a gateway audience', () => {
    const c = loadConfig({ ...dev, CF_ACCESS_GATEWAY_AUD: 'gw' });
    expect(c.mcpPort).toBe(4002);
    expect(c.gatewayAudience).toBeUndefined();
  });
});
