import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import AppHeader from './AppHeader.vue'
import { useMe } from '../../stores/me'
import { meApi, authApi } from '../../services/api'

vi.mock('../../services/api', () => ({
  meApi: { get: vi.fn() },
  authApi: { logout: vi.fn() },
  recipeApi: { getAll: vi.fn(), search: vi.fn() },
  tagApi: { getAll: vi.fn() }
}))

const mara = { id: 'c-mara', name: 'Mara Okafor' }
const reply = (contributor, signInAvailable = true) => ({ data: { contributor, signInAvailable } })

async function mountHeader(path = '/') {
  const pinia = createPinia()
  const router = createRouter({
    history: createMemoryHistory(),
    routes: ['/', '/contributors', '/connect', '/create', '/recipe/r1'].map((p) => ({ path: p, component: { template: '<div/>' } }))
  })
  router.push(path)
  await router.isReady()
  const wrapper = mount(AppHeader, { global: { plugins: [pinia, router] } })
  await flushPromises()
  return { wrapper, router, me: useMe(pinia) }
}

const links = (w) => w.findAll('a').map((a) => a.text())
const hrefs = (w) => w.findAll('a').map((a) => a.attributes('href'))

beforeEach(() => {
  vi.resetAllMocks()
})

describe('AppHeader, signed out', () => {
  it('shows Recipes, Contributors, Connect and the picker, but no Add recipe and no /create link', async () => {
    meApi.get.mockResolvedValue(reply(null))
    const { wrapper } = await mountHeader()
    expect(links(wrapper)).toEqual(expect.arrayContaining(['Recipes', 'Contributors', 'Connect']))
    expect(wrapper.text()).toContain('What the F#@K should I make?')
    expect(links(wrapper)).not.toContain('Add recipe')
    expect(hrefs(wrapper)).not.toContain('/create')
    expect(wrapper.find('[data-test="identity"]').exists()).toBe(false)
  })

  it('shows a quiet Sign in link to /auth/sso?next=<current path>', async () => {
    meApi.get.mockResolvedValue(reply(null))
    const { wrapper } = await mountHeader('/recipe/r1')
    const a = wrapper.find('[data-test="sign-in"]')
    expect(a.text()).toBe('Sign in')
    expect(a.attributes('href')).toBe('/auth/sso?next=%2Frecipe%2Fr1')
  })

  it('renders NO sign-in link at all when signInAvailable is false', async () => {
    meApi.get.mockResolvedValue(reply(null, false))
    const { wrapper } = await mountHeader()
    expect(wrapper.find('[data-test="sign-in"]').exists()).toBe(false)
    expect(links(wrapper)).toEqual(expect.arrayContaining(['Recipes', 'Contributors', 'Connect']))
  })

  it('a failed /api/me is treated as signed out: no Add recipe, no sign-in link', async () => {
    meApi.get.mockRejectedValue(new Error('network'))
    const { wrapper, me } = await mountHeader()
    expect(me.me).toBeNull()
    expect(links(wrapper)).not.toContain('Add recipe')
    expect(wrapper.find('[data-test="sign-in"]').exists()).toBe(false)
  })
})

describe('AppHeader, signed in', () => {
  it('shows Add recipe, "Filed as <you>" and Sign out, and no Sign in link', async () => {
    meApi.get.mockResolvedValue(reply(mara))
    const { wrapper } = await mountHeader()
    expect(links(wrapper)).toContain('Add recipe')
    expect(hrefs(wrapper)).toContain('/create')
    expect(wrapper.get('[data-test="identity"]').text()).toContain('Filed as Mara Okafor')
    expect(wrapper.find('[data-test="sign-out"]').text()).toBe('Sign out')
    expect(wrapper.find('[data-test="sign-in"]').exists()).toBe(false)
    expect(links(wrapper)).toEqual(expect.arrayContaining(['Recipes', 'Contributors', 'Connect']))
  })

  it('Sign out calls POST /auth/logout with no body, clears the identity and returns to the recipe list', async () => {
    meApi.get.mockResolvedValue(reply(mara))
    authApi.logout.mockResolvedValue({ status: 204 })
    const { wrapper, router, me } = await mountHeader('/contributors')
    await wrapper.get('[data-test="sign-out"]').trigger('click')
    await flushPromises()
    expect(authApi.logout).toHaveBeenCalledTimes(1)
    expect(authApi.logout).toHaveBeenCalledWith()
    expect(me.me).toBeNull()
    expect(router.currentRoute.value.path).toBe('/')
    expect(links(wrapper)).not.toContain('Add recipe')
    expect(wrapper.find('[data-test="sign-in"]').exists()).toBe(true)
  })

  it('still signs out locally if the logout request fails', async () => {
    meApi.get.mockResolvedValue(reply(mara))
    authApi.logout.mockRejectedValue(new Error('offline'))
    const { wrapper, me } = await mountHeader()
    await wrapper.get('[data-test="sign-out"]').trigger('click')
    await flushPromises()
    expect(me.me).toBeNull()
  })
})
