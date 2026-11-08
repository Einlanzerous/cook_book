// @vitest-environment node
import { describe, it, expect } from 'vitest'
import config from '../vite.config.js'

// COOK-23: in dev, sign-in, sign-out and the header link reach the backend only
// if /auth is proxied beside /api. Lives here (not in the backend suite) so the
// backend never imports frontend dependencies.
describe('vite dev proxy', () => {
  it('proxies /auth beside /api', () => {
    const proxy = config.server.proxy
    expect(Object.keys(proxy)).toEqual(expect.arrayContaining(['/api', '/auth']))
    expect(proxy['/auth'].target).toBe(proxy['/api'].target)
  })
})
