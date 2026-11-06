import { describe, it, expect } from 'vitest'
import { emptyForm, formFromRecipe, validateForm, buildPayload, payloadFromPreview } from './recipeForm'

const stored = {
  id: 'r1',
  title: 'Beef & Zucchini Bibimbap',
  description: 'Mixed rice.',
  imageUrl: 'https://img/x.jpg',
  source: 'HelloFresh',
  sourceUrl: 'https://www.hellofresh.com/recipes/x',
  contributor: { id: 'c-mara', name: 'Mara Okafor' },
  category: 'Main Course',
  cuisine: 'Korean',
  vegetarian: false,
  servings: 2,
  prepTime: 10,
  cookTime: 20,
  totalMinutes: 30,
  timeSplitEstimated: true,
  notes: 'Swap in chicken.',
  ingredients: [{ amount: '¾', unit: 'cup', name: 'Jasmine rice', quantity: 0.75 }],
  directions: [{ stepNumber: 1, heading: 'Cook the rice', instruction: 'Boil it.' }],
  tags: [{ id: 't', name: 'Beef' }]
}

describe('edit round trip', () => {
  it('sends headings, notes, cook, category, cuisine and vegetarian back unchanged', () => {
    const payload = buildPayload(formFromRecipe(stored), stored)
    expect(payload).toMatchObject({
      contributorId: 'c-mara',
      category: 'Main Course',
      cuisine: 'Korean',
      vegetarian: false,
      notes: 'Swap in chicken.',
      source: 'HelloFresh',
      sourceUrl: 'https://www.hellofresh.com/recipes/x',
      directions: [{ heading: 'Cook the rice', instruction: 'Boil it.' }],
      ingredients: [{ amount: '¾', unit: 'cup', name: 'Jasmine rice' }],
      tags: ['Beef']
    })
  })

  it('leaves the total to the API and keeps the estimate flag while times are untouched', () => {
    const payload = buildPayload(formFromRecipe(stored), stored)
    expect(payload).not.toHaveProperty('totalMinutes')
    expect(payload).not.toHaveProperty('timeSplitEstimated')
  })

  it('editing prep or cook clears the estimated-split flag', () => {
    const form = formFromRecipe(stored)
    form.prepTime = '15'
    expect(buildPayload(form, stored).timeSplitEstimated).toBe(false)
  })

  it('a total that differs from prep + cook is treated as the user\'s own and sent', () => {
    const form = formFromRecipe({ ...stored, totalMinutes: 50 })
    expect(buildPayload(form, stored).totalMinutes).toBe(50)
  })

  it('does not show or send "manual" as a source', () => {
    const manual = { ...stored, source: 'manual' }
    const form = formFromRecipe(manual)
    expect(form.source).toBe('')
    expect(validateForm(form, manual).errors.source).toBeUndefined()
    expect(buildPayload(form, manual)).not.toHaveProperty('source')
  })
})

describe('validateForm', () => {
  const filled = () => {
    const f = emptyForm()
    Object.assign(f, { title: 'Toast', source: 'Me', contributorId: 'c1' })
    f.ingredients = [{ amount: '1', unit: 'slice', name: 'Bread' }]
    f.directions = [{ heading: '', instruction: 'Toast it.' }]
    return f
  }

  it('passes a complete form', () => {
    expect(validateForm(filled()).errors).toEqual({})
  })

  it('requires title, source, cook, an ingredient and a step when adding', () => {
    const { errors } = validateForm(emptyForm())
    expect(Object.keys(errors).sort()).toEqual(['contributorId', 'directions', 'ingredients', 'source', 'title'])
  })

  it('rejects negative or non-numeric minutes and a bad link', () => {
    const f = filled()
    Object.assign(f, { prepTime: '-1', servings: '0', sourceUrl: 'nope' })
    expect(Object.keys(validateForm(f).errors).sort()).toEqual(['prepTime', 'servings', 'sourceUrl'])
  })
})

describe('buildPayload for a new recipe', () => {
  it('trims, nulls blanks and always sends a source', () => {
    const f = emptyForm()
    Object.assign(f, { title: '  Toast ', source: ' Me ', contributorId: 'c1', servings: '2', prepTime: '5' })
    f.ingredients = [{ amount: ' 1 ', unit: '', name: 'Bread ' }, { amount: '', unit: '', name: '' }]
    f.directions = [{ heading: ' ', instruction: ' Toast. ' }]
    const p = buildPayload(f)
    expect(p).toMatchObject({
      title: 'Toast', source: 'Me', servings: 2, prepTime: 5, cookTime: null, description: null,
      ingredients: [{ amount: '1', unit: null, name: 'Bread' }],
      directions: [{ heading: null, instruction: 'Toast.' }]
    })
    expect(p).not.toHaveProperty('totalMinutes')
  })
})

describe('payloadFromPreview', () => {
  it('carries the preview through with the chosen cook and no step numbers', () => {
    const p = payloadFromPreview(
      {
        title: 'T', description: null, imageUrl: null, source: 'HelloFresh', sourceUrl: 'https://www.hellofresh.com/x',
        category: 'Main Course', cuisine: null, vegetarian: false, servings: 2, prepTime: 10, cookTime: 20,
        totalMinutes: 30, timeSplitEstimated: true,
        ingredients: [{ amount: '1', unit: null, name: 'x' }],
        directions: [{ stepNumber: 1, heading: null, instruction: 'Go.' }], tags: ['Beef']
      },
      'c1'
    )
    expect(p).toMatchObject({ contributorId: 'c1', source: 'HelloFresh', timeSplitEstimated: true, directions: [{ heading: null, instruction: 'Go.' }] })
    expect(p.directions[0]).not.toHaveProperty('stepNumber')
  })
})
