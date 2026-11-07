import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import RecipeForm from './RecipeForm.vue'
import ImportFromLink from '../import/ImportFromLink.vue'
import { useMe } from '../../stores/me'
import { importApi, recipeApi, tagApi } from '../../services/api'

vi.mock('../../services/api', () => ({
  importApi: { previewHelloFresh: vi.fn() },
  recipeApi: { create: vi.fn(), update: vi.fn(), getAll: vi.fn() },
  tagApi: { getAll: vi.fn() },
  meApi: { get: vi.fn() },
  authApi: { logout: vi.fn() }
}))

const expired = { response: { status: 401, data: { error: 'Sign in to contribute' } } }

async function setup(component, path = '/create?tab=write') {
  const pinia = createPinia()
  setActivePinia(pinia)
  useMe(pinia).me = { id: 'c1', name: 'Mara Okafor' }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: ['/', '/create', '/recipe/:id'].map((p) => ({ path: p, component: { template: '<div/>' } }))
  })
  router.push(path)
  await router.isReady()
  const wrapper = mount(component, { global: { plugins: [pinia, router] } })
  await flushPromises()
  return { wrapper, router }
}

async function fillAndSubmit(wrapper) {
  await wrapper.find('#title').setValue('Toast')
  await wrapper.find('#source').setValue('Me')
  await wrapper.find('input[aria-label="Ingredient"]').setValue('Bread')
  await wrapper.find('textarea[aria-label="Step"]').setValue('Toast it.')
  await wrapper.find('form').trigger('submit')
  await flushPromises()
}

beforeEach(() => {
  vi.resetAllMocks()
  sessionStorage.clear()
  tagApi.getAll.mockResolvedValue({ data: [] })
})

describe('401 on save: the draft survives the sign-in round trip', () => {
  it('shows "Filed as <you>" as static text, not a picker', async () => {
    const { wrapper } = await setup(RecipeForm)
    expect(wrapper.get('[data-test="filed-as"]').text()).toContain('Mara Okafor')
    expect(wrapper.find('select').exists()).toBe(false)
  })

  it('saves the draft, shows the session-expired message and a sign-in link back to this page', async () => {
    recipeApi.create.mockRejectedValue(expired)
    const { wrapper } = await setup(RecipeForm)
    await fillAndSubmit(wrapper)
    expect(wrapper.get('[role="alert"]').text()).toMatch(/session expired/i)
    expect(wrapper.get('[data-test="session-sign-in"]').attributes('href')).toBe('/auth/sso?next=%2Fcreate%3Ftab%3Dwrite')
    const keys = Object.keys(sessionStorage)
    expect(keys).toHaveLength(1)
    expect(JSON.parse(sessionStorage.getItem(keys[0]))).toMatchObject({ title: 'Toast', source: 'Me' })
  })

  it('restores the draft when the form mounts again, and clears it after a successful submit', async () => {
    recipeApi.create.mockRejectedValueOnce(expired)
    const first = await setup(RecipeForm)
    await fillAndSubmit(first.wrapper)
    first.wrapper.unmount()

    recipeApi.create.mockResolvedValue({ data: { id: 'new1' } })
    const { wrapper, router } = await setup(RecipeForm) // after signing in again
    expect(wrapper.find('#title').element.value).toBe('Toast')
    expect(wrapper.find('#source').element.value).toBe('Me')
    expect(wrapper.find('input[aria-label="Ingredient"]').element.value).toBe('Bread')

    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(recipeApi.create).toHaveBeenCalledTimes(2)
    expect(recipeApi.create.mock.calls[1][0]).not.toHaveProperty('contributorId')
    expect(router.currentRoute.value.path).toBe('/recipe/new1')
    expect(Object.keys(sessionStorage)).toHaveLength(0)
  })

  it('a non-401 failure keeps the server message and saves no draft', async () => {
    recipeApi.create.mockRejectedValue({ response: { status: 500, data: { error: 'Boom' } } })
    const { wrapper } = await setup(RecipeForm)
    await fillAndSubmit(wrapper)
    expect(wrapper.get('[role="alert"]').text()).toContain('Boom')
    expect(wrapper.find('[data-test="session-sign-in"]').exists()).toBe(false)
    expect(Object.keys(sessionStorage)).toHaveLength(0)
  })

  it('the import flow keeps the pasted link across the round trip', async () => {
    importApi.previewHelloFresh.mockRejectedValue(expired)
    const first = await setup(ImportFromLink, '/create')
    await first.wrapper.find('#import-url').setValue('https://www.hellofresh.com/recipes/ramen')
    await first.wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(first.wrapper.get('[data-test="session-sign-in"]').attributes('href')).toBe('/auth/sso?next=%2Fcreate')
    first.wrapper.unmount()

    const { wrapper } = await setup(ImportFromLink, '/create')
    expect(wrapper.find('#import-url').element.value).toBe('https://www.hellofresh.com/recipes/ramen')
  })
})
