/**
 * COOK-23 owner requirement: write controls are shown only to people who can
 * use them. Component and router tests under jsdom (the repo has no browser
 * automation; the real-browser check is the named live step). The server
 * remains the enforcement.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import fixture from '../../../shared/ownership-outcomes.json'

vi.mock('../services/api', () => ({
  meApi: { get: vi.fn() },
  authApi: { logout: vi.fn() },
  recipeApi: { getAll: vi.fn(), getById: vi.fn(), search: vi.fn() },
  tagApi: { getAll: vi.fn() },
  contributorApi: { getAll: vi.fn(), getById: vi.fn() }
}))
vi.mock('vue-router', async (orig) => ({ ...(await orig()), useRouter: () => ({ push: () => {} }) }))

import HomeView from './HomeView.vue'
import RecipeDetail from '../components/recipe/RecipeDetail.vue'
import { useMe } from '../stores/me'
import { useRecipeStore } from '../stores/recipeStore'
import { meApi, recipeApi } from '../services/api'
import { routes, requireAccess } from '../router'

const stubs = { 'router-link': { props: ['to'], template: '<a :href="to"><slot /></a>' } }
const mara = { id: 'u-author', name: 'Mara Okafor' }
const hrefs = (w) => w.findAll('a').map((a) => a.attributes('href'))

const recipe = (over = {}) => ({
  id: 'r1', title: 'Bibimbap', description: 'Mix it.', servings: 2, prepTime: 10, cookTime: 20, totalMinutes: 30,
  source: 'HelloFresh', sourceLabel: 'HelloFresh', contributor: { id: 'u-author', name: 'Mara Okafor' },
  createdAt: '2026-03-12T09:30:00Z', vegetarian: false, tags: [], ingredients: [], directions: [], ...over
})

function mountHome({ signedIn, recipes }) {
  const pinia = createPinia()
  setActivePinia(pinia)
  if (signedIn) useMe(pinia).me = mara
  const store = useRecipeStore(pinia)
  store.recipes = recipes
  store.tags = []
  return mount(HomeView, { global: { plugins: [pinia], stubs } })
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('HomeView', () => {
  it('signed out, with recipes: no link to /create (hero action gone), Browse still there', () => {
    const w = mountHome({ signedIn: false, recipes: [recipe()] })
    expect(hrefs(w)).not.toContain('/create')
    expect(w.text()).not.toContain('Add a recipe')
    expect(w.text()).toContain('Browse the collection')
  })

  it('signed out, empty book: no link to /create (empty-state action gone)', () => {
    const w = mountHome({ signedIn: false, recipes: [] })
    expect(hrefs(w)).not.toContain('/create')
    expect(w.text()).not.toContain('Create Recipe')
    expect(w.text()).toContain('No recipes found')
  })

  it('signed in: both the hero action and the empty-state action link to /create', () => {
    expect(hrefs(mountHome({ signedIn: true, recipes: [recipe()] }))).toContain('/create')
    const empty = mountHome({ signedIn: true, recipes: [] })
    expect(hrefs(empty)).toContain('/create')
    expect(empty.text()).toContain('Create Recipe')
  })
})

describe('RecipeDetail Edit and Delete follow shared/ownership-outcomes.json', () => {
  const rows = fixture.outcomes[fixture.active.ownership][fixture.active.unattributed]
  const ok = (s) => s >= 200 && s < 300

  for (const row of rows) {
    it(`${row.actor} x ${row.recipe}: Edit ${ok(row.edit) ? 'shown' : 'hidden'}, Delete ${ok(row.delete) ? 'shown' : 'hidden'}`, () => {
      const pinia = createPinia()
      setActivePinia(pinia)
      if (row.actor !== 'signedOut') useMe(pinia).me = { id: row.actor === 'author' ? 'u-author' : 'u-other', name: row.actor }
      const r = recipe(row.recipe === 'unattributed' ? { contributor: null } : {})
      const w = mount(RecipeDetail, { props: { recipe: r }, global: { plugins: [pinia], stubs } })
      expect(w.find('[data-test="edit"]').exists()).toBe(ok(row.edit))
      expect(w.find('[data-test="delete"]').exists()).toBe(ok(row.delete))
    })
  }

  it('a signed-out visitor still reads the whole recipe', () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const w = mount(RecipeDetail, { props: { recipe: recipe() }, global: { plugins: [pinia], stubs } })
    expect(w.text()).toContain('Bibimbap')
    expect(w.text()).toContain('Added by Mara Okafor')
    expect(w.text()).toContain('All recipes')
  })
})

describe('route guards (meta-scoped)', () => {
  async function makeRouter(pinia) {
    setActivePinia(pinia)
    const view = { template: '<div/>' }
    const router = createRouter({
      history: createMemoryHistory(),
      routes: routes.map((r) => ({ ...r, component: view }))
    })
    router.beforeEach(requireAccess)
    return router
  }

  it('/create and /edit/:id carry route meta; nothing else does', () => {
    const needs = Object.fromEntries(routes.map((r) => [r.path, r.meta?.needs]))
    expect(needs['/create']).toBe('writer')
    expect(needs['/edit/:id']).toBe('editor')
    for (const p of ['/', '/recipe/:id', '/contributors', '/contributors/:id', '/connect']) expect(needs[p]).toBeUndefined()
  })

  it('a direct visit to /create while signed out redirects to the recipe list and never renders the form', async () => {
    meApi.get.mockResolvedValue({ data: { contributor: null, signInAvailable: true } })
    const router = await makeRouter(createPinia())
    await router.push('/create')
    expect(router.currentRoute.value.path).toBe('/')
  })

  it('a failed /api/me is signed out: /create redirects', async () => {
    meApi.get.mockRejectedValue(new Error('down'))
    const router = await makeRouter(createPinia())
    await router.push('/create')
    expect(router.currentRoute.value.path).toBe('/')
  })

  it('/edit/:id while signed out redirects, without even fetching the recipe', async () => {
    meApi.get.mockResolvedValue({ data: { contributor: null, signInAvailable: true } })
    const router = await makeRouter(createPinia())
    await router.push('/edit/r1')
    expect(router.currentRoute.value.path).toBe('/')
    expect(recipeApi.getById).not.toHaveBeenCalled()
  })

  it('a signed-in hard reload on /create waits for /api/me and is NOT bounced', async () => {
    let resolve
    meApi.get.mockReturnValue(new Promise((r) => { resolve = r }))
    const router = await makeRouter(createPinia())
    const nav = router.push('/create')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/') // still pending: it waited
    resolve({ data: { contributor: mara, signInAvailable: true } })
    await nav
    expect(router.currentRoute.value.path).toBe('/create')
  })

  it('a signed-in contributor reaches /edit/:id for a recipe they may edit (any contributor edits)', async () => {
    meApi.get.mockResolvedValue({ data: { contributor: { id: 'u-other', name: 'Other' }, signInAvailable: true } })
    recipeApi.getById.mockResolvedValue({ data: recipe() }) // filed by someone else
    const router = await makeRouter(createPinia())
    await router.push('/edit/r1')
    expect(router.currentRoute.value.path).toBe('/edit/r1')
  })

  it('public routes never wait on a pending /api/me', async () => {
    meApi.get.mockReturnValue(new Promise(() => {})) // never resolves
    const router = await makeRouter(createPinia())
    for (const path of ['/recipe/r1', '/contributors', '/contributors/c1', '/connect']) {
      await router.push(path)
      expect(router.currentRoute.value.path).toBe(path)
    }
    expect(meApi.get).not.toHaveBeenCalled()
  })
})
