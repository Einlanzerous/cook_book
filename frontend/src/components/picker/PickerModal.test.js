import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createPinia } from 'pinia'
import { useMe } from '../../stores/me'
import PickerModal from './PickerModal.vue'
import { recipeApi } from '../../services/api'

vi.mock('../../services/api', () => ({ recipeApi: { random: vi.fn() } }))

const bibimbap = {
  id: 'r1',
  title: 'Beef & Zucchini Bibimbap',
  totalMinutes: 30,
  servings: 2,
  vegetarian: false,
  sourceLabel: 'HelloFresh',
  contributor: { id: 'c1', name: 'Mara Okafor' },
  imageUrl: null
}
const salad = { ...bibimbap, id: 'r2', title: 'Quinoa Salad', vegetarian: true, sourceLabel: null, totalMinutes: null }

const reply = (recipe, matches = recipe ? 2 : 0) => ({ data: { recipe, matches } })

const mounted = []

async function setup(props = { show: true }, { signedIn = true } = {}) {
  const pinia = createPinia()
  if (signedIn) {
    useMe(pinia).me = { id: 'c1', name: 'Mara Okafor' }
  }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div/>' } },
      { path: '/recipe/:id', component: { template: '<div/>' } },
      { path: '/create', component: { template: '<div/>' } }
    ]
  })
  router.push('/')
  await router.isReady()
  const wrapper = mount(PickerModal, {
    props,
    attachTo: document.body,
    global: { plugins: [router, pinia], stubs: { teleport: true } }
  })
  mounted.push(wrapper)
  await flushPromises()
  return { wrapper, router }
}

const btn = (w, label) => w.findAll('button').find((b) => b.text() === label)

describe('PickerModal', () => {
  beforeEach(() => {
    recipeApi.random.mockReset()
  })
  afterEach(() => {
    mounted.splice(0).forEach((w) => w.unmount())
    document.body.innerHTML = ''
    document.body.style.overflow = ''
  })

  it('renders nothing while closed and does not call the API', async () => {
    const { wrapper } = await setup({ show: false })
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(recipeApi.random).not.toHaveBeenCalled()
  })

  it('fetches on open and shows the card: meta, title, source and contributor', async () => {
    recipeApi.random.mockResolvedValue(reply(bibimbap))
    const { wrapper } = await setup()
    expect(recipeApi.random).toHaveBeenCalledWith({ vegetarian: false, exclude: [] })
    const text = wrapper.text()
    expect(text).toContain("Tonight you're making")
    expect(text).toContain('30 min · serves 2')
    expect(text).toContain('Beef & Zucchini Bibimbap')
    expect(text).toContain('HelloFresh · Mara Okafor')
    expect(text).not.toContain('Vegetarian\n') // marker only on vegetarian recipes
    expect(wrapper.find('.text-fir').exists()).toBe(false)
  })

  it('marks a vegetarian recipe and omits missing time and source', async () => {
    recipeApi.random.mockResolvedValue(reply(salad))
    const { wrapper } = await setup()
    expect(wrapper.find('span.text-fir').text()).toBe('Vegetarian')
    expect(wrapper.text()).not.toContain(' min')
    expect(wrapper.text()).toContain('Mara Okafor')
    expect(wrapper.text()).not.toContain('·  ')
  })

  it('reroll excludes the recipe on screen', async () => {
    recipeApi.random.mockResolvedValueOnce(reply(bibimbap)).mockResolvedValueOnce(reply(salad))
    const { wrapper } = await setup()
    await btn(wrapper, 'Nope, reroll').trigger('click')
    await flushPromises()
    expect(recipeApi.random).toHaveBeenLastCalledWith({ vegetarian: false, exclude: ['r1'] })
    expect(wrapper.text()).toContain('Quinoa Salad')
  })

  it('switching to Vegetarian rerolls with the filter, still excluding the current recipe', async () => {
    recipeApi.random.mockResolvedValueOnce(reply(bibimbap)).mockResolvedValueOnce(reply(salad))
    const { wrapper } = await setup()
    await btn(wrapper, 'Vegetarian').trigger('click')
    await flushPromises()
    expect(recipeApi.random).toHaveBeenLastCalledWith({ vegetarian: true, exclude: ['r1'] })
    expect(btn(wrapper, 'Vegetarian').attributes('aria-pressed')).toBe('true')
    expect(btn(wrapper, 'Anything').attributes('aria-pressed')).toBe('false')
  })

  it('says when the only match is on screen again', async () => {
    recipeApi.random.mockResolvedValue(reply(bibimbap, 1))
    const { wrapper } = await setup()
    expect(wrapper.text()).toContain('The only match')
  })

  it('empty (no vegetarian recipes): friendly state, offers Anything, no cook button', async () => {
    recipeApi.random.mockResolvedValueOnce(reply(bibimbap)).mockResolvedValueOnce(reply(null))
    const { wrapper } = await setup()
    await btn(wrapper, 'Vegetarian').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="picker-empty"]').text()).toContain('No vegetarian recipes yet.')
    expect(btn(wrapper, "Fine, let's cook")).toBeUndefined()
    recipeApi.random.mockResolvedValueOnce(reply(bibimbap))
    await btn(wrapper, 'Show anything').trigger('click')
    await flushPromises()
    expect(recipeApi.random).toHaveBeenLastCalledWith({ vegetarian: false, exclude: [] })
    expect(wrapper.text()).toContain('Beef & Zucchini Bibimbap')
  })

  it('empty book: points at adding a recipe', async () => {
    recipeApi.random.mockResolvedValue(reply(null))
    const { wrapper } = await setup()
    expect(wrapper.find('[data-testid="picker-empty"]').text()).toContain('The book is empty.')
    expect(wrapper.find('a[href="/create"]').text()).toBe('Add a recipe')
  })

  it('empty book, signed out: no link to /create anywhere (COOK-23)', async () => {
    recipeApi.random.mockResolvedValue(reply(null))
    const { wrapper } = await setup({ show: true }, { signedIn: false })
    expect(wrapper.find('[data-testid="picker-empty"]').text()).toContain('The book is empty.')
    expect(wrapper.find('a[href="/create"]').exists()).toBe(false)
    expect(btn(wrapper, 'Close')).toBeTruthy()
  })

  it('error: offers Try again', async () => {
    recipeApi.random.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(reply(bibimbap))
    const { wrapper } = await setup()
    expect(wrapper.find('[data-testid="picker-error"]').exists()).toBe(true)
    await btn(wrapper, 'Try again').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Beef & Zucchini Bibimbap')
  })

  it('"Fine, let\'s cook" closes and goes to the detail page', async () => {
    recipeApi.random.mockResolvedValue(reply(bibimbap))
    const { wrapper, router } = await setup()
    await btn(wrapper, "Fine, let's cook").trigger('click')
    await flushPromises()
    expect(wrapper.emitted('close')).toHaveLength(1)
    expect(router.currentRoute.value.fullPath).toBe('/recipe/r1')
  })

  it('a stale answer from before a reroll is ignored', async () => {
    let resolveSlow
    recipeApi.random
      .mockResolvedValueOnce(reply(bibimbap))
      .mockReturnValueOnce(new Promise((r) => (resolveSlow = r)))
      .mockResolvedValueOnce(reply(salad))
    const { wrapper } = await setup()
    await btn(wrapper, 'Nope, reroll').trigger('click')
    await btn(wrapper, 'Nope, reroll').trigger('click')
    await flushPromises()
    resolveSlow(reply({ ...bibimbap, id: 'late', title: 'Late Answer' }))
    await flushPromises()
    expect(wrapper.text()).toContain('Quinoa Salad')
    expect(wrapper.text()).not.toContain('Late Answer')
  })

  describe('modal behaviour', () => {
    it('is a labelled aria-modal dialog and takes focus', async () => {
      recipeApi.random.mockResolvedValue(reply(bibimbap))
      const { wrapper } = await setup()
      const dlg = wrapper.find('[role="dialog"]')
      expect(dlg.attributes('aria-modal')).toBe('true')
      const label = document.getElementById(dlg.attributes('aria-labelledby'))
      expect(label.textContent).toContain("Tonight you're making")
      expect(document.activeElement).toBe(dlg.element)
    })

    it('Escape closes', async () => {
      recipeApi.random.mockResolvedValue(reply(bibimbap))
      const { wrapper } = await setup()
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      expect(wrapper.emitted('close')).toHaveLength(1)
    })

    it('a click on the backdrop closes; a click inside does not', async () => {
      recipeApi.random.mockResolvedValue(reply(bibimbap))
      const { wrapper } = await setup()
      await wrapper.find('h2').trigger('click')
      expect(wrapper.emitted('close')).toBeUndefined()
      await wrapper.find('[data-testid="picker-backdrop"]').trigger('click')
      expect(wrapper.emitted('close')).toHaveLength(1)
    })

    it('traps Tab and Shift+Tab inside the dialog', async () => {
      recipeApi.random.mockResolvedValue(reply(bibimbap))
      const { wrapper } = await setup()
      const buttons = wrapper.findAll('button').map((b) => b.element)
      const first = buttons[0]
      const last = buttons[buttons.length - 1]
      last.focus()
      const tab = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true })
      document.dispatchEvent(tab)
      expect(tab.defaultPrevented).toBe(true)
      expect(document.activeElement).toBe(first)
      const back = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, cancelable: true })
      document.dispatchEvent(back)
      expect(back.defaultPrevented).toBe(true)
      expect(document.activeElement).toBe(last)
      // Tab in the middle is left to the browser
      buttons[1].focus()
      const mid = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true })
      document.dispatchEvent(mid)
      expect(mid.defaultPrevented).toBe(false)
    })

    it('returns focus to the opener and unlocks scroll when closed', async () => {
      recipeApi.random.mockResolvedValue(reply(bibimbap))
      const opener = document.createElement('button')
      document.body.appendChild(opener)
      opener.focus()
      const { wrapper } = await setup({ show: false })
      await wrapper.setProps({ show: true })
      await flushPromises()
      expect(document.body.style.overflow).toBe('hidden')
      expect(document.activeElement).not.toBe(opener)
      await wrapper.setProps({ show: false })
      await flushPromises()
      expect(document.activeElement).toBe(opener)
      expect(document.body.style.overflow).toBe('')
    })
  })
})
