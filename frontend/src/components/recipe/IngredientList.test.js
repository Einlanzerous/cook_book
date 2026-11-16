import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import IngredientList from './IngredientList.vue'

const ingredients = [
  { id: 'a', amount: '1 1/2', unit: 'tablespoon', quantity: 1.5, name: 'Cumin seeds' },
  { id: 'b', amount: '4', unit: 'clove', quantity: 4, name: 'Garlic' },
  { id: 'c', amount: null, unit: null, quantity: null, name: 'Black pepper' }
]
const mountIt = () => mount(IngredientList, { props: { ingredients, baseServings: 2 } })

describe('IngredientList columns (COOK-57)', () => {
  it('defines one fixed column template on the list, with no per-row auto column', () => {
    const w = mountIt()
    const grid = w.get('[data-test="ingredient-grid"]')
    const tpl = grid.classes().find((c) => c.startsWith('grid-cols-['))
    expect(tpl).toBe('grid-cols-[30px_calc(16ch+1rem)_minmax(0,1fr)]')
    expect(tpl).not.toContain('auto')
  })

  it('makes every row a subgrid of that template instead of its own grid', () => {
    const w = mountIt()
    const rows = w.findAll('li')
    expect(rows).toHaveLength(3)
    for (const li of rows) {
      for (const el of [li, li.get('button')]) {
        expect(el.classes()).toContain('grid-cols-subgrid')
        expect(el.classes()).toContain('col-span-3')
        expect(el.classes().some((c) => c.startsWith('grid-cols-[') || c.includes('auto'))).toBe(false)
      }
    }
  })

  it('tints the quantity column and keeps the fir text', () => {
    const w = mountIt()
    for (const q of w.findAll('[data-test="qty"]')) {
      expect(q.classes()).toContain('bg-fir-tint')
      expect(q.classes()).toContain('text-fir')
      expect(q.classes()).toContain('tabular-nums')
    }
  })

  it('still scales quantities and strikes checked names through', async () => {
    const w = mountIt()
    expect(w.findAll('[data-test="qty"]')[0].text()).toBe('1½ tablespoon')
    const buttons = w.findAll('[role="group"] button')
    await buttons[buttons.length - 1].trigger('click')
    expect(w.findAll('[data-test="qty"]')[0].text()).toMatch(/^3 tablespoon/)
    await w.findAll('li button')[1].trigger('click')
    expect(w.findAll('[data-test="name"]')[1].classes()).toContain('line-through')
    expect(w.findAll('[data-test="name"]')[0].classes()).not.toContain('line-through')
  })
})

describe('IngredientList tint band (COOK-61)', () => {
  it('tints the checkbox cell as well as the quantity cell, so they form one band', () => {
    const w = mountIt()
    const checks = w.findAll('[data-test="check"]')
    expect(checks).toHaveLength(3)
    for (const c of checks) expect(c.classes()).toContain('bg-fir-tint')
    for (const q of w.findAll('[data-test="qty"]')) expect(q.classes()).toContain('bg-fir-tint')
    // The cells are adjacent grid children with no gap utility between them.
    const btn = w.get('li button')
    expect(btn.classes().some((c) => c.startsWith('gap'))).toBe(false)
    expect(btn.element.children[0]).toBe(checks[0].element)
    expect(btn.element.children[1]).toBe(w.get('[data-test="qty"]').element)
  })

  it('pads the box in from the band edge and aligns it to the first text line', () => {
    const w = mountIt()
    for (const c of w.findAll('[data-test="check"]')) {
      expect(c.classes()).toContain('pl-3')
      expect(c.classes().some((k) => k.startsWith('pt-['))).toBe(true)
      expect(c.classes()).not.toContain('self-center')
    }
    for (const b of w.findAll('[data-test="box"]')) expect(b.classes()).not.toContain('self-center')
  })

  it('fills the box when a row is checked and leaves the tint alone', async () => {
    const w = mountIt()
    await w.findAll('li button')[0].trigger('click')
    expect(w.findAll('[data-test="box"]')[0].classes()).toContain('bg-fir')
    expect(w.findAll('[data-test="box"]')[1].classes()).toContain('bg-transparent')
    expect(w.findAll('[data-test="check"]')[0].classes()).toContain('bg-fir-tint')
  })
})
