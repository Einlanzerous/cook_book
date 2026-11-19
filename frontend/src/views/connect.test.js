/**
 * COOK-41: the Connect screen is public and read-only. It must not wait for a
 * session and must draw no write controls. COOK-15: it shows the URL, client
 * configs and a health test.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('../services/api', () => ({
  meApi: { get: vi.fn() },
  recipeApi: { getById: vi.fn() },
  healthApi: { get: vi.fn() },
  mcpApi: { status: vi.fn() }
}))

import { routes, requireAccess } from '../router'
import { meApi, healthApi, mcpApi } from '../services/api'

describe('Connect screen', () => {
  const route = routes.find((r) => r.path === '/connect')
  const load = async () => mount((await route.component()).default)
  const runTest = async (wrapper) => {
    await wrapper.findAll('button').find((b) => b.text() === 'Test connection').trigger('click')
    await flushPromises()
  }

  beforeEach(() => vi.clearAllMocks())

  it('is not behind any access requirement, so signed out it renders at once', async () => {
    setActivePinia(createPinia())
    expect(route).toBeTruthy()
    expect(route.meta?.needs).toBeUndefined()
    expect(await requireAccess({ meta: route.meta, params: {} })).toBe(true)
    expect(meApi.get).not.toHaveBeenCalled()
  })

  it('renders with no write controls or write links', async () => {
    const wrapper = await load()
    expect(wrapper.text()).toContain('Let your agent cook from the book.')
    expect(wrapper.findAll('input, textarea, select, form')).toHaveLength(0)
    const labels = wrapper.findAll('button').map((b) => b.text())
    expect(labels.filter((l) => /save|add recipe|create|delete|edit/i.test(l))).toEqual([])
    const hrefs = wrapper.findAll('a').map((a) => a.attributes('href'))
    expect(hrefs.filter((h) => /\/(create|edit)\b/.test(h || ''))).toEqual([])
  })

  it('shows the gateway URL and switches client configs', async () => {
    const wrapper = await load()
    expect(wrapper.get('[data-testid=server-url]').text()).toBe('https://heitan.zerogravity.industries/mcp/commonplace.read')
    await wrapper.findAll('[role=tab]')[2].trigger('click')
    expect(wrapper.get('[data-testid=config]').text()).toContain('claude mcp add --transport http commonplace https://heitan')
  })

  const HEALTH = { data: { status: 'ok', version: '2.4.1', sha: '1a195d1abcdef' } }

  it('running: shows the app build and the live tool count, and claims nothing about heitan', async () => {
    healthApi.get.mockResolvedValue(HEALTH)
    mcpApi.status.mockResolvedValue({ data: { enabled: true, tools: 4 } })
    const wrapper = await load()
    expect(wrapper.text()).toContain('Not tested yet')
    await runTest(wrapper)
    expect(wrapper.text()).toContain('Commonplace MCP server is running')
    expect(wrapper.text()).toContain('4 available')
    expect(wrapper.text()).toContain('2.4.1')
    expect(wrapper.text()).toContain('1a195d1')
    expect(wrapper.text()).not.toMatch(/Connected/)
  })

  it('off: says MCP not enabled, shows the app is up and no tool count', async () => {
    healthApi.get.mockResolvedValue(HEALTH)
    mcpApi.status.mockResolvedValue({ data: { enabled: false } })
    const wrapper = await load()
    await runTest(wrapper)
    expect(wrapper.text()).toContain('MCP not enabled')
    expect(wrapper.text()).not.toContain('Tools')
    expect(wrapper.text()).not.toContain('running')
    expect(wrapper.text()).toContain('2.4.1')
  })

  it('reports failure when the app does not answer', async () => {
    healthApi.get.mockRejectedValue(new Error('down'))
    mcpApi.status.mockRejectedValue(new Error('down'))
    const wrapper = await load()
    await runTest(wrapper)
    expect(wrapper.text()).toContain('Could not check')
  })

  it('clears the copy timer on unmount', async () => {
    vi.useFakeTimers()
    const spy = vi.spyOn(globalThis, 'clearTimeout')
    const wrapper = await load()
    await wrapper.findAll('button').find((b) => b.text() === 'Copy').trigger('click')
    await flushPromises()
    spy.mockClear()
    wrapper.unmount()
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
    vi.useRealTimers()
  })
})
