import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import RecipeCard from './RecipeCard.vue'
import FeaturedRecipe from './FeaturedRecipe.vue'
import TabNavigation from '../layout/TabNavigation.vue'
import {
  ALL, UNDER_30, buildFilters, filterRecipes, cookCount, pickFeatured, byline, metaLine
} from '../../services/library'

const stubs = { 'router-link': { template: '<a><slot /></a>' } }
const mara = { id: 'c1', name: 'Mara Okafor' }
const theo = { id: 'c2', name: 'Theo Brandt' }
const r = (over) => ({
  id: 'r', title: 'Dish', tags: [], totalMinutes: 40, servings: 2,
  sourceLabel: 'HelloFresh', contributor: mara, ...over
})
const recipes = [
  r({ id: '1', totalMinutes: 30, tags: [{ name: 'Beef' }] }),
  r({ id: '2', totalMinutes: 20, tags: [{ name: 'Chicken' }], contributor: theo }),
  r({ id: '3', totalMinutes: 31, tags: [{ name: 'chicken' }] }),
  r({ id: '4', totalMinutes: null, contributor: null })
]
const tags = [
  { id: 't1', name: 'Beef', recipeCount: 1 },
  { id: 't2', name: 'Chicken', recipeCount: 2 },
  { id: 't3', name: 'Ghost', recipeCount: 0 }
]

describe('filters and counts', () => {
  it('builds All, Under 30 min (derived) and tag counts, omitting zero-count tags', () => {
    const f = buildFilters(recipes, tags)
    expect(f.map((x) => [x.label, x.count])).toEqual([
      ['All', 4], ['Under 30 min', 2], ['Chicken', 2], ['Beef', 1]
    ])
  })

  it('Under 30 min is totalMinutes <= 30 (30 in, 31 out, null out)', () => {
    expect(filterRecipes(recipes, UNDER_30).map((x) => x.id)).toEqual(['1', '2'])
  })

  it('tag filter is case-insensitive and its length matches the count', () => {
    expect(filterRecipes(recipes, 'Chicken')).toHaveLength(2)
    expect(filterRecipes(recipes, ALL)).toHaveLength(4)
  })

  it('counts distinct cooks, ignoring null contributors', () => {
    expect(cookCount(recipes)).toBe(2)
  })

  it('features the newest recipe with a photo, else the newest', () => {
    expect(pickFeatured(recipes).id).toBe('1')
    expect(pickFeatured([...recipes.slice(0, 2), r({ id: 'p', imageUrl: 'x.jpg' })]).id).toBe('p')
    expect(pickFeatured([])).toBeNull()
  })

  it('byline and meta omit what is missing', () => {
    expect(byline(r({ sourceLabel: null }))).toBe('Mara Okafor')
    expect(byline(r({ contributor: null }))).toBe('HelloFresh')
    expect(metaLine(r({ totalMinutes: null, servings: null }))).toBe('')
  })
})

describe('TabNavigation', () => {
  const filters = buildFilters(recipes, tags)

  it('renders each label with its count and marks the active one', () => {
    const w = mount(TabNavigation, { props: { filters, modelValue: UNDER_30 } })
    const buttons = w.findAll('button')
    expect(buttons.map((b) => b.find('[data-test=count]').text())).toEqual(['4', '2', '2', '1'])
    expect(buttons.map((b) => b.attributes('aria-pressed'))).toEqual(['false', 'true', 'false', 'false'])
  })

  it('emits update:modelValue with the filter key on click', async () => {
    const w = mount(TabNavigation, { props: { filters, modelValue: ALL } })
    await w.findAll('button')[3].trigger('click')
    expect(w.emitted('update:modelValue')[0]).toEqual(['Beef'])
  })
})

describe('RecipeCard', () => {
  const card = (recipe) => mount(RecipeCard, { props: { recipe }, global: { stubs } })

  it('shows "N min · serves N", title and "source · contributor"', () => {
    const w = card(r({ title: 'Bibimbap', totalMinutes: 30 }))
    expect(w.find('[data-test=meta]').text()).toBe('30 min · serves 2')
    expect(w.find('h3').text()).toBe('Bibimbap')
    expect(w.find('[data-test=byline]').text()).toBe('HelloFresh · Mara Okafor')
  })

  it("never labels 'manual' sources and tolerates a missing contributor", () => {
    const w = card(r({ source: 'manual', sourceLabel: null, contributor: null }))
    expect(w.find('[data-test=byline]').exists()).toBe(false)
  })

  it('uses the striped placeholder until there is a photo', () => {
    expect(card(r({})).find('.photo-placeholder img').exists()).toBe(false)
    expect(card(r({ imageUrl: 'x.jpg' })).find('img').attributes('src')).toBe('x.jpg')
  })
})

describe('FeaturedRecipe', () => {
  it('reads "Source · added by Name"', () => {
    const w = mount(FeaturedRecipe, { props: { recipe: r({ title: 'Bibimbap' }) }, global: { stubs } })
    expect(w.find('[data-test=byline]').text()).toBe('HelloFresh · added by Mara Okafor')
  })
})
