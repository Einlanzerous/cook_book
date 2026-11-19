import { describe, it, expect } from 'vitest'
import { bundleUrl, clientConfigs, BUNDLES } from './connect'

describe('connect configs', () => {
  const url = bundleUrl(BUNDLES[0])
  it('points at the heitan read bundle', () => {
    expect(url).toBe('https://heitan.zerogravity.industries/mcp/commonplace.read')
  })
  it('builds the three client configs from the URL', () => {
    const [claude, desktop, code] = clientConfigs(url)
    expect(claude.text).toBe(url)
    expect(JSON.parse(desktop.text).mcpServers.commonplace.args).toEqual(['-y', 'mcp-remote', url])
    expect(code.text).toBe(`claude mcp add --transport http commonplace ${url}`)
  })
})
