import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import CookPicker from './CookPicker.vue'
import RecipeForm from './RecipeForm.vue'
import ImportFromLink from '../import/ImportFromLink.vue'
import CreateRecipeView from '../../views/CreateRecipeView.vue'
import { contributorApi, importApi, recipeApi, tagApi } from '../../services/api'

vi.mock('../../services/api', () => ({
  contributorApi: { getAll: vi.fn(), create: vi.fn() },
  importApi: { previewHelloFresh: vi.fn() },
  recipeApi: { create: vi.fn(), update: vi.fn(), getAll: vi.fn() },
  tagApi: { getAll: vi.fn() }
}))

const magos = { id: 'c-magos', name: 'magos' }
const mara = { id: 'c-mara', name: 'Mara Okafor' }

async function setup(component, props = {}, path = '/create') {
  const pinia = createPinia()
  setActivePinia(pinia)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div/>' } },
      { path: '/create', component: { template: '<div/>' } },
      { path: '/recipe/:id', component: { template: '<div/>' } }
    ]
  })
  router.push(path)
  await router.isReady()
  const wrapper = mount(component, { props, global: { plugins: [pinia, router] } })
  await flushPromises()
  return { wrapper, router }
}

beforeEach(() => {
  vi.resetAllMocks()
  contributorApi.getAll.mockResolvedValue({ data: [mara, magos] })
  tagApi.getAll.mockResolvedValue({ data: [] })
})

describe('CookPicker', () => {
  it('defaults to magos when nothing is selected', async () => {
    const { wrapper } = await setup(CookPicker, { modelValue: '' })
    expect(wrapper.emitted('update:modelValue')[0]).toEqual(['c-magos'])
  })

  it('keeps an existing selection (the cook of a recipe being edited)', async () => {
    const { wrapper } = await setup(CookPicker, { modelValue: 'c-mara' })
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.find('select').element.value).toBe('c-mara')
  })

  it('adds a new cook and selects them', async () => {
    contributorApi.create.mockResolvedValue({ data: { id: 'c-new', name: 'Ines R' } })
    const { wrapper } = await setup(CookPicker, { modelValue: 'c-magos' })
    await wrapper.find('select').setValue('__new__')
    await wrapper.find('[data-test="new-cook"] input').setValue('Ines R')
    await wrapper.find('[data-test="new-cook"] button').trigger('click')
    await flushPromises()
    expect(contributorApi.create).toHaveBeenCalledWith({ name: 'Ines R' })
    expect(wrapper.emitted('update:modelValue').at(-1)).toEqual(['c-new'])
    expect(wrapper.find('[data-test="new-cook"]').exists()).toBe(false)
  })

  it('on 409 selects the existing cook instead of failing', async () => {
    contributorApi.create.mockRejectedValue({ response: { status: 409, data: { error: 'exists' } } })
    const { wrapper } = await setup(CookPicker, { modelValue: 'c-magos' })
    await wrapper.find('select').setValue('__new__')
    await wrapper.find('[data-test="new-cook"] input').setValue('mara okafor')
    await wrapper.find('[data-test="new-cook"] button').trigger('click')
    await flushPromises()
    expect(wrapper.emitted('update:modelValue').at(-1)).toEqual(['c-mara'])
    expect(wrapper.text()).toContain('already in the book')
  })
})

describe('RecipeForm', () => {
  it('shows validation errors and does not call the API', async () => {
    const { wrapper } = await setup(RecipeForm)
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(recipeApi.create).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Give the recipe a title.')
    expect(wrapper.text()).toContain('Say where it came from')
    expect(wrapper.text()).toContain('Add at least one ingredient.')
  })

  it('creates a recipe with source and the default cook, then opens it', async () => {
    recipeApi.create.mockResolvedValue({ data: { id: 'new1' } })
    const { wrapper, router } = await setup(RecipeForm)
    await wrapper.find('#title').setValue('Toast')
    await wrapper.find('#source').setValue('Me')
    const row = wrapper.find('[data-test="ingredient-row"]')
    await row.find('input[aria-label="Ingredient"]').setValue('Bread')
    await wrapper.find('textarea[aria-label="Step"]').setValue('Toast it.')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(recipeApi.create).toHaveBeenCalledTimes(1)
    expect(recipeApi.create.mock.calls[0][0]).toMatchObject({
      title: 'Toast', source: 'Me', contributorId: 'c-magos',
      ingredients: [{ name: 'Bread' }], directions: [{ instruction: 'Toast it.', heading: null }]
    })
    expect(router.currentRoute.value.path).toBe('/recipe/new1')
  })

  it('pasting a list splits it into amount / unit / name rows', async () => {
    const { wrapper } = await setup(RecipeForm)
    const input = wrapper.find('[data-test="ingredient-row"] input[aria-label="Ingredient"]')
    const text = '¾ cup Jasmine rice\n2 Scallions\n6 oz Carrots'
    const event = new Event('paste', { bubbles: true, cancelable: true })
    event.clipboardData = { getData: () => text }
    input.element.dispatchEvent(event)
    await flushPromises()
    const rows = wrapper.findAll('[data-test="ingredient-row"]')
    expect(rows).toHaveLength(3)
    const vals = rows.map((r) => r.findAll('input').slice(0, 3).map((i) => i.element.value))
    expect(vals).toEqual([['¾', 'cup', 'Jasmine rice'], ['2', '', 'Scallions'], ['6', 'oz', 'Carrots']])
    expect(event.defaultPrevented).toBe(true)
  })

  it('edit: loads headings and sends them back with the other owned fields', async () => {
    recipeApi.update.mockResolvedValue({ data: { id: 'r1' } })
    const recipe = {
      id: 'r1', title: 'Bibimbap', source: 'HelloFresh', contributor: { id: 'c-mara', name: 'Mara Okafor' },
      category: 'Main Course', cuisine: 'Korean', vegetarian: false, notes: 'Swap chicken.',
      prepTime: 10, cookTime: 20, totalMinutes: 30, servings: 2, timeSplitEstimated: true,
      ingredients: [{ amount: '1', unit: 'cup', name: 'Rice' }],
      directions: [{ stepNumber: 1, heading: 'Cook the rice', instruction: 'Boil.' }], tags: []
    }
    const { wrapper } = await setup(RecipeForm, { recipe })
    expect(wrapper.find('input[aria-label="Step heading"]').element.value).toBe('Cook the rice')
    await wrapper.find('#title').setValue('Bibimbap bowl')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    const [id, body] = recipeApi.update.mock.calls[0]
    expect(id).toBe('r1')
    expect(body).toMatchObject({
      title: 'Bibimbap bowl', contributorId: 'c-mara', category: 'Main Course', cuisine: 'Korean',
      notes: 'Swap chicken.', directions: [{ heading: 'Cook the rice', instruction: 'Boil.' }]
    })
    expect(body).not.toHaveProperty('totalMinutes')
  })
})

describe('From a link', () => {
  const preview = {
    title: 'Chicken Ramen', description: 'Brothy.', imageUrl: null, servings: 2, prepTime: 15, cookTime: 30,
    totalMinutes: 45, timeSplitEstimated: false, category: 'Main Course', cuisine: 'Japanese', vegetarian: false,
    source: 'HelloFresh', sourceUrl: 'https://www.hellofresh.com/recipes/ramen',
    ingredients: [{ amount: '2', unit: 'tbsp', name: 'Soy sauce' }, { amount: null, unit: null, name: 'Salt' }],
    directions: [{ stepNumber: 1, heading: null, instruction: 'Simmer.' }], tags: ['Chicken']
  }

  it('previews without saving, then saves the previewed payload on confirm', async () => {
    importApi.previewHelloFresh.mockResolvedValue({ data: preview })
    recipeApi.create.mockResolvedValue({ data: { id: 'r9' } })
    const { wrapper, router } = await setup(ImportFromLink)
    await wrapper.find('#import-url').setValue('https://www.hellofresh.com/recipes/ramen')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(importApi.previewHelloFresh).toHaveBeenCalledWith('https://www.hellofresh.com/recipes/ramen')
    expect(recipeApi.create).not.toHaveBeenCalled()
    const text = wrapper.find('[data-test="preview"]').text()
    expect(text).toContain('Chicken Ramen')
    expect(text).toContain('45 min')
    expect(text).toContain('2 tbsp')
    expect(text).toContain('Soy sauce')
    expect(text).toContain('Simmer.')
    expect(text).toContain('Japanese')
    expect(text).toContain('Chicken')

    await wrapper.findAll('button').find((b) => b.text() === 'Save to the collection').trigger('click')
    await flushPromises()
    expect(recipeApi.create.mock.calls[0][0]).toMatchObject({
      title: 'Chicken Ramen', source: 'HelloFresh', contributorId: 'c-magos', cuisine: 'Japanese'
    })
    expect(router.currentRoute.value.path).toBe('/recipe/r9')
  })

  it('refuses a non-HelloFresh link without calling the API', async () => {
    const { wrapper } = await setup(ImportFromLink)
    await wrapper.find('#import-url').setValue('https://www.nytimes.com/recipe')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(importApi.previewHelloFresh).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Only HelloFresh links work today')
  })

  it('shows the server error when the page cannot be fetched', async () => {
    importApi.previewHelloFresh.mockRejectedValue({ response: { data: { error: 'Failed to fetch recipe: boom' } } })
    const { wrapper } = await setup(ImportFromLink)
    await wrapper.find('#import-url').setValue('https://www.hellofresh.com/recipes/x')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('Failed to fetch recipe: boom')
    expect(wrapper.find('[data-test="preview"]').exists()).toBe(false)
  })
})

describe('Add recipe tabs', () => {
  it('opens on From a link and switches to Write it out', async () => {
    const { wrapper, router } = await setup(CreateRecipeView)
    const tabs = wrapper.findAll('[role="tab"]')
    expect(tabs.map((t) => t.text())).toEqual(['From a link', 'Write it out'])
    expect(tabs[0].attributes('aria-selected')).toBe('true')
    expect(wrapper.find('#import-url').exists()).toBe(true)

    await tabs[1].trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.tab).toBe('write')
    expect(wrapper.find('#title').exists()).toBe(true)
    expect(wrapper.find('#import-url').exists()).toBe(false)
  })

  it('?tab=write opens the form directly', async () => {
    const { wrapper } = await setup(CreateRecipeView, {}, '/create?tab=write')
    expect(wrapper.find('#title').exists()).toBe(true)
  })
})
