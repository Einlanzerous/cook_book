import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
vi.mock('vue-router', () => ({ useRouter: () => ({ push: () => {} }) }))
import RecipeCard from './RecipeCard.vue'
import RecipeDetail from './RecipeDetail.vue'

// COOK-6 ruling 12: stored source may be 'hellofresh', 'HelloFresh' or padded;
// the badge check is case-insensitive and trimmed.
const stubs = { 'router-link': { template: '<a><slot /></a>' } }
const base = { id: 'r1', title: 'Bibimbap', ingredients: [], directions: [], tags: [] }

// COOK-8: the card has no badge any more; it prints the API's `sourceLabel`
// (which the backend derives case-insensitively and nulls for 'manual').
const labelOf = (source) => {
  const s = (source ?? '').trim()
  return !s || s.toLowerCase() === 'manual' ? null : s.toLowerCase() === 'hellofresh' ? 'HelloFresh' : s
}
const card = (source) =>
  mount(RecipeCard, { props: { recipe: { ...base, source, sourceLabel: labelOf(source) } }, global: { stubs } })
const detail = (source) =>
  mount(RecipeDetail, { props: { recipe: { ...base, source } }, global: { stubs, plugins: [createPinia()] } })

describe.each([
  ['RecipeCard (RecipeCard.vue:42)', card],
  ['RecipeDetail (RecipeDetail.vue:90)', detail]
])('%s HelloFresh badge', (_name, make) => {
  it.each(['hellofresh', 'HelloFresh', ' HELLOFRESH '])('shows for source %j', (source) => {
    expect(make(source).text()).toContain('HelloFresh')
  })

  it.each(['manual', '', null, undefined, 'NYT Cooking'])('is absent for source %j', (source) => {
    expect(make(source).text()).not.toContain('HelloFresh')
  })
})
