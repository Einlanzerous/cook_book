/**
 * COOK-41: the Connect screen is public and read-only. It must not wait for a
 * session and must draw no write controls.
 */
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('../services/api', () => ({
  meApi: { get: vi.fn() },
  recipeApi: { getById: vi.fn() }
}))

import { routes, requireAccess } from '../router'
import { meApi } from '../services/api'

describe('Connect screen', () => {
  const route = routes.find((r) => r.path === '/connect')

  it('is not behind any access requirement, so signed out it renders at once', async () => {
    setActivePinia(createPinia())
    expect(route).toBeTruthy()
    expect(route.meta?.needs).toBeUndefined()
    expect(await requireAccess({ meta: route.meta, params: {} })).toBe(true)
    expect(meApi.get).not.toHaveBeenCalled()
  })

  it('renders with no write controls or write links', async () => {
    const view = (await route.component()).default
    const wrapper = mount(view, { props: route.props })
    expect(wrapper.text()).toContain('Let your agent cook from the book.')
    expect(wrapper.findAll('button, input, textarea, select, form')).toHaveLength(0)
    const hrefs = wrapper.findAll('a').map((a) => a.attributes('href'))
    expect(hrefs.filter((h) => /\/(create|edit)\b/.test(h || ''))).toEqual([])
  })
})
