import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { initials, formatSince, plural } from '../utils/contributor'

// Plain functions (not vi.fn): vitest's call tracking re-reports rejected promises as unhandled.
let getAllImpl, getByIdImpl
const getById = { calls: [] }
vi.mock('../services/api', () => ({
  contributorApi: {
    getAll: () => getAllImpl(),
    getById: (...a) => { getById.calls.push(a); return getByIdImpl(...a) },
  },
}))
const resolves = (data) => () => Promise.resolve({ data })
const rejects = (err) => () => Promise.reject(Object.assign(new Error('x'), err))
const route = { params: { id: 'c1' } }
vi.mock('vue-router', () => ({ useRoute: () => route, useRouter: () => ({ push: () => {} }) }))

import ContributorsView from './ContributorsView.vue'
import ContributorView from './ContributorView.vue'

const stubs = { 'router-link': { props: ['to'], template: '<a :href="to"><slot /></a>' } }
const global = { stubs }

describe('helpers', () => {
  it('initials', () => {
    expect(initials('Mara Okafor')).toBe('MO')
    expect(initials('magos')).toBe('MA')
    expect(initials('')).toBe('?')
  })
  it('formatSince', () => {
    expect(formatSince('2026-02-03T18:00:00Z')).toBe('Feb ’26')
    expect(formatSince('junk')).toBe('')
  })
  it('plural', () => {
    expect(plural(1, 'cook')).toBe('1 cook')
    expect(plural(6, 'cook')).toBe('6 cooks')
  })
})

describe('ContributorsView', () => {
  beforeEach(() => { getAllImpl = null })

  it('lists cooks linking to their profiles with counts', async () => {
    getAllImpl = resolves([
      { id: 'c1', name: 'Mara Okafor', bio: 'Bowls.', portraitUrl: null, joinedAt: '2026-02-03T18:00:00Z', recipeCount: 14, sourceCount: 3 },
      { id: 'c2', name: 'Wren Ellis', bio: null, portraitUrl: null, joinedAt: '2026-04-01T18:00:00Z', recipeCount: 0, sourceCount: 0 },
    ])
    const w = mount(ContributorsView, { global })
    await flushPromises()
    const links = w.findAll('a')
    expect(links.map((a) => a.attributes('href'))).toEqual(['/contributors/c1', '/contributors/c2'])
    expect(w.text()).toContain('Mara Okafor')
    expect(w.text()).toContain('14')
    expect(w.text()).toContain('Feb ’26')
    expect(w.text()).toContain('2 cooks')
  })

  it('shows an error', async () => {
    getAllImpl = rejects({ response: { data: { error: 'boom' } } })
    const w = mount(ContributorsView, { global })
    await flushPromises()
    expect(w.text()).toContain('boom')
  })
})

describe('ContributorView', () => {
  beforeEach(() => { getByIdImpl = null; getById.calls = [] })
  const base = { id: 'c1', name: 'Mara Okafor', bio: 'Bowls.', portraitUrl: null, joinedAt: '2026-02-03T18:00:00Z' }

  it('renders stats, sources and recipe cards', async () => {
    getByIdImpl = resolves({
      ...base, stats: { recipes: 2, sources: 1, since: base.joinedAt },
      sources: [{ name: 'HelloFresh', count: 2 }],
      recipes: [
        { id: 'r1', title: 'Bibimbap', source: 'HelloFresh', tags: [] },
        { id: 'r2', title: 'Pie', source: 'hellofresh', tags: [] },
      ],
    })
    const w = mount(ContributorView, { global })
    await flushPromises()
    expect(getById.calls).toEqual([['c1']])
    expect(w.find('h1').text()).toBe('Mara Okafor')
    expect(w.text()).toContain('Sources they cite')
    expect(w.text()).toContain('HelloFresh')
    expect(w.text()).toContain('Bibimbap')
    expect(w.text()).toContain('Pie')
    expect(w.text()).toContain('Feb ’26')
    expect(w.find('[data-testid="portrait-placeholder"]').exists()).toBe(true)
  })

  it('renders a cook with no recipes sensibly', async () => {
    getByIdImpl = resolves({ ...base, name: 'Wren Ellis', bio: null, stats: { recipes: 0, sources: 0, since: base.joinedAt }, sources: [], recipes: [] })
    const w = mount(ContributorView, { global })
    await flushPromises()
    expect(w.text()).toContain('hasn’t filed any recipes yet')
    expect(w.text()).toContain('None cited yet')
  })

  it('shows not-found on 404', async () => {
    getByIdImpl = rejects({ response: { status: 404 } })
    const w = mount(ContributorView, { global })
    await flushPromises()
    expect(w.text()).toContain('Contributor not found')
  })
})
