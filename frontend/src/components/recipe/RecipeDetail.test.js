import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
vi.mock('vue-router', () => ({ useRouter: () => ({ push: () => {} }) }))
import RecipeDetail from './RecipeDetail.vue'

const stubs = { 'router-link': { props: ['to'], template: '<a :href="to"><slot /></a>' } }
const ings = [
  ['¾', 'cup', 0.75, 'Jasmine rice'], ['2', null, 2, 'Scallions'], ['1 thumb', null, null, 'Ginger'],
  ['1', 'clove', 1, 'Garlic'], [null, null, null, 'Salt & pepper']
].map(([amount, unit, quantity, name], i) => ({ id: `i${i}`, amount, unit, quantity, name }))

const recipe = (over = {}) => ({
  id: 'r1', title: 'Bibimbap', description: 'Mix it.', category: 'Main course', cuisine: 'Korean',
  servings: 2, prepTime: 10, cookTime: 20, totalMinutes: 30, timeSplitEstimated: false,
  source: 'HelloFresh', sourceLabel: 'HelloFresh', sourceUrl: 'https://example.com/r',
  contributor: { id: 'c1', name: 'Mara Okafor' }, createdAt: '2026-03-12T09:30:00Z',
  vegetarian: false, notes: 'Swap in chicken.', tags: [],
  ingredients: ings,
  directions: [
    { id: 'd1', stepNumber: 1, heading: 'Cook the rice', instruction: 'Boil it.' },
    { id: 'd2', stepNumber: 2, heading: null, instruction: 'Serve it.' }
  ],
  ...over
})
const mountIt = (r = recipe()) => mount(RecipeDetail, { props: { recipe: r }, global: { stubs, plugins: [createPinia()] } })
const qtys = (w) => w.findAll('[data-test="qty"]').map((e) => e.text())

describe('RecipeDetail header', () => {
  it('shows eyebrow, provenance with source link, contributor and date', () => {
    const w = mountIt()
    expect(w.find('.eyebrow').text()).toBe('Main course · Korean')
    const p = w.get('[data-test="provenance"]')
    expect(p.text()).toContain('From HelloFresh')
    expect(p.get('a[href="https://example.com/r"]').text()).toBe('HelloFresh')
    expect(p.text()).toContain('Added by Mara Okafor')
    expect(p.text()).toContain('12 Mar 2026')
  })

  it('omits the source and link for manual recipes', () => {
    const w = mountIt(recipe({ source: 'manual', sourceLabel: null, sourceUrl: null }))
    const p = w.get('[data-test="provenance"]').text()
    expect(p).not.toContain('From')
    expect(p).toContain('Added by Mara Okafor')
  })

  it('marks vegetarian recipes', () => {
    expect(mountIt(recipe({ vegetarian: true })).find('[data-test="vegetarian"]').exists()).toBe(true)
    expect(mountIt().find('[data-test="vegetarian"]').exists()).toBe(false)
  })
})

describe('RecipeDetail stat strip', () => {
  const stat = (w) => Object.fromEntries(w.findAll('[data-test="stats"] > div').map((d) => [d.get('dt').text(), d.get('dd').text()]))

  it('shows Total, Prep, Cook and Serves', () => {
    expect(stat(mountIt())).toEqual({ Total: '30 min', Prep: '10 min', Cook: '20 min', Serves: '2' })
  })

  it('still shows stored prep/cook when the split is estimated, marked est.', () => {
    const s = stat(mountIt(recipe({ timeSplitEstimated: true })))
    expect(s.Prep).toBe('10 min est.')
    expect(s.Cook).toBe('20 min est.')
  })

  it('shows a dash, not a hidden cell, when a time is missing', () => {
    const s = stat(mountIt(recipe({ prepTime: null, cookTime: null, totalMinutes: 45 })))
    expect(s).toEqual({ Total: '45 min', Prep: '—', Cook: '—', Serves: '2' })
  })
})

describe('RecipeDetail scaling', () => {
  it('rescales ingredients and the Serves stat together; non-numeric lines stay put', async () => {
    const w = mountIt()
    expect(qtys(w)).toEqual(['¾ cup', '2', '1 thumb', '1 clove', ''])
    await w.findAll('[aria-label="Servings"] button').find((b) => b.text() === 'Serves 4').trigger('click')
    expect(qtys(w)).toEqual(['1½ cups', '4', '1 thumb', '2 cloves', ''])
    expect(w.get('[data-test="stats"]').text()).toContain('Serves4')
    await w.findAll('[aria-label="Servings"] button')[0].trigger('click')
    expect(qtys(w)).toEqual(['¾ cup', '2', '1 thumb', '1 clove', ''])
  })

  it('starts at the recipe yield and offers it as an option when not 2 or 4', async () => {
    const w = mountIt(recipe({ servings: 6 }))
    const buttons = w.findAll('[aria-label="Servings"] button')
    expect(buttons.map((b) => b.text())).toEqual(['Serves 2', 'Serves 4', 'Serves 6'])
    expect(buttons[2].attributes('aria-pressed')).toBe('true')
    expect(qtys(w)[0]).toBe('¾ cup')
    await buttons[0].trigger('click')
    expect(qtys(w)[0]).toBe('¼ cup')
  })

  it('tap-to-check toggles strikethrough on the name', async () => {
    const w = mountIt()
    const row = w.findAll('ul button')[0]
    await row.trigger('click')
    expect(row.attributes('aria-pressed')).toBe('true')
    expect(row.html()).toContain('line-through')
  })
})

describe('RecipeDetail method', () => {
  it('renders heading when present and body only when heading is null; tip from notes', () => {
    const w = mountIt()
    const steps = w.findAll('ol li')
    expect(steps[0].get('[data-test="heading"]').text()).toBe('Cook the rice')
    expect(steps[0].get('[data-test="numeral"]').text()).toBe('1')
    expect(steps[1].find('[data-test="heading"]').exists()).toBe(false)
    expect(steps[1].get('[data-test="body"]').text()).toBe('Serve it.')
    expect(w.get('[data-test="tip"]').text()).toBe('Swap in chicken.')
  })

  it('has no tip line without notes', () => {
    expect(mountIt(recipe({ notes: null })).find('[data-test="tip"]').exists()).toBe(false)
  })
})
