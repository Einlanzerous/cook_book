import { describe, it, expect } from 'vitest'
import { parseAmount, formatQuantity, scaleIngredient, servingOptions, SNAP_TOLERANCE } from './quantity'
import { formatMinutes, formatDate } from './format'

describe('parseAmount', () => {
  it.each([
    ['2', 2], ['1.5', 1.5], ['.5', 0.5], ['1/3', 1 / 3], ['1 1/2', 1.5],
    ['½', 0.5], ['¾', 0.75], ['1½', 1.5], ['1 ½', 1.5], ['2⅔', 2 + 2 / 3], [' 4 ', 4], [3, 3]
  ])('%j -> %j', (input, out) => {
    expect(parseAmount(input)).toBeCloseTo(out, 10)
  })

  it.each(['1 thumb', '2-3', '2–3', 'a pinch', 'to taste', '', '  ', null, undefined, '1/0', 'x1', NaN])(
    '%j -> null (not a plain quantity)',
    (input) => expect(parseAmount(input)).toBeNull()
  )
})

describe('formatQuantity', () => {
  it.each([
    [0.5, '½'], [0.25, '¼'], [0.75, '¾'], [1 / 3, '⅓'], [2 / 3, '⅔'], [0.125, '⅛'],
    [0.375, '⅜'], [1 / 6, '⅙'], [5 / 6, '⅚'], [0.17, '⅙'], [1.5, '1½'], [2, '2'], [10, '10'], [2.75, '2¾'], [1 + 1 / 3, '1⅓']
  ])('%d -> %s', (n, text) => expect(formatQuantity(n)).toBe(text))

  it('snaps within the stated tolerance and no further', () => {
    expect(SNAP_TOLERANCE).toBe(0.02)
    expect(formatQuantity(0.333)).toBe('⅓')
    expect(formatQuantity(0.66)).toBe('⅔')
    expect(formatQuantity(1.49)).toBe('1½')
    expect(formatQuantity(1.99)).toBe('2')
    expect(formatQuantity(0.3)).toBe('0.3')
    expect(formatQuantity(1.4)).toBe('1.4')
    expect(formatQuantity(0.04)).toBe('0.04')
  })

  it('never produces the 11/2 glitch for a whole number plus a half', () => {
    expect(formatQuantity(1.5)).toBe('1½')
    expect(formatQuantity(1.5)).not.toContain('11')
  })
})

describe('scaleIngredient', () => {
  const ing = (amount, unit, quantity) => ({ amount, unit, quantity })

  it('doubles and halves with real fractions', () => {
    expect(scaleIngredient(ing('¾', 'cup', 0.75), 2)).toMatchObject({ amount: '1½', unit: 'cups', scaled: true })
    expect(scaleIngredient(ing('1½', 'cups', 1.5), 0.5)).toMatchObject({ amount: '¾', unit: 'cup' })
    expect(scaleIngredient(ing('½', 'oz', 0.5), 2)).toMatchObject({ amount: '1', unit: 'oz' })
    expect(scaleIngredient(ing('¼', 'cup', 0.25), 2)).toMatchObject({ amount: '½', unit: 'cup' })
  })

  it('handles every unit shape in the seed', () => {
    const cases = [
      [ing('2', null, 2), 2, '4'], [ing('6', 'oz', 6), 2, '12'], [ing('5', 'tsp', 5), 2, '10'],
      [ing('1', 'tbsp', 1), 2, '2'], [ing('10', 'oz', 10), 2, '20'], [ing('3', 'cloves', 3), 2, '6'],
      [ing('1', 'lb', 1), 0.5, '½']
    ]
    for (const [i, m, expected] of cases) expect(scaleIngredient(i, m).amount).toBe(expected)
  })

  it('uses stored quantity over amount text, and falls back to parsing the text', () => {
    expect(scaleIngredient(ing('garbage', 'cup', 2), 2).amount).toBe('4')
    expect(scaleIngredient(ing('1½', 'cups', null), 2).amount).toBe('3')
    expect(scaleIngredient(ing('1 1/2', 'cups', undefined), 2).amount).toBe('3')
  })

  it('leaves unparsable amounts unscaled and as written', () => {
    expect(scaleIngredient(ing('1 thumb', null, null), 2)).toEqual({ amount: '1 thumb', unit: null, scaled: false })
    expect(scaleIngredient(ing('2-3', 'cloves', null), 2)).toEqual({ amount: '2-3', unit: 'cloves', scaled: false })
    expect(scaleIngredient(ing('to taste', null, null), 0.5).amount).toBe('to taste')
  })

  it('shows a blank amount (Salt & pepper) as blank at any serving size', () => {
    expect(scaleIngredient(ing(null, null, null), 2)).toEqual({ amount: '', unit: null, scaled: false })
    expect(scaleIngredient(ing('', null, null), 0.5)).toEqual({ amount: '', unit: null, scaled: false })
  })

  it('treats a zero stored quantity as a number, not as missing', () => {
    expect(scaleIngredient(ing('0', 'cup', 0), 2).amount).toBe('0')
  })

  it('inflects countable units by the displayed number', () => {
    expect(scaleIngredient(ing('1', 'clove', 1), 1).unit).toBe('clove')
    expect(scaleIngredient(ing('1', 'clove', 1), 2).unit).toBe('cloves')
    expect(scaleIngredient(ing('2', 'cloves', 2), 0.5).unit).toBe('clove')
    expect(scaleIngredient(ing('1', 'tbsp', 1), 2).unit).toBe('tbsp') // not in the countable list
  })

  it('ignores a non-positive multiplier rather than showing nonsense', () => {
    expect(scaleIngredient(ing('2', 'cups', 2), 0)).toMatchObject({ amount: '2', scaled: false })
  })
})

describe('servingOptions', () => {
  it('is 2 and 4, plus the recipe yield when different', () => {
    expect(servingOptions(2)).toEqual([2, 4])
    expect(servingOptions(4)).toEqual([2, 4])
    expect(servingOptions(6)).toEqual([2, 4, 6])
    expect(servingOptions(null)).toEqual([2, 4])
  })
})

describe('format helpers', () => {
  it('formats minutes', () => {
    expect(formatMinutes(30)).toBe('30 min')
    expect(formatMinutes(60)).toBe('1 h')
    expect(formatMinutes(75)).toBe('1 h 15 min')
    expect(formatMinutes(null)).toBeNull()
  })
  it('formats dates in UTC', () => {
    expect(formatDate('2026-03-12T09:30:00Z')).toBe('12 Mar 2026')
    expect(formatDate('2026-03-31T23:59:00Z')).toBe('31 Mar 2026')
    expect(formatDate(null)).toBeNull()
    expect(formatDate('nope')).toBeNull()
  })
})
