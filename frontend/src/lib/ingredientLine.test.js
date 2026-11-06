import { describe, it, expect } from 'vitest'
import { parseIngredientLine, splitIngredientList, looksLikeList } from './ingredientLine'

describe('parseIngredientLine', () => {
  it.each([
    ['¾ cup Jasmine rice', { amount: '¾', unit: 'cup', name: 'Jasmine rice' }],
    ['2 Scallions', { amount: '2', unit: '', name: 'Scallions' }],
    ['1 1/2 tbsp soy sauce', { amount: '1 1/2', unit: 'tbsp', name: 'soy sauce' }],
    ['1½ cups of flour', { amount: '1½', unit: 'cups', name: 'flour' }],
    ['1/2 tsp. salt', { amount: '1/2', unit: 'tsp', name: 'salt' }],
    ['2-3 cloves garlic', { amount: '2-3', unit: 'clove'.concat('s'), name: 'garlic' }],
    ['0.5 oz Gochujang', { amount: '0.5', unit: 'oz', name: 'Gochujang' }],
    ['- 10 oz ground beef', { amount: '10', unit: 'oz', name: 'ground beef' }],
    ['• 1 thumb ginger', { amount: '1', unit: 'thumb', name: 'ginger' }],
    ['Salt & pepper', { amount: '', unit: '', name: 'Salt & pepper' }],
    ['2 eggs', { amount: '2', unit: '', name: 'eggs' }],
    ['3 gorgeous tomatoes', { amount: '3', unit: '', name: 'gorgeous tomatoes' }]
  ])('%s', (line, expected) => {
    expect(parseIngredientLine(line)).toEqual(expected)
  })

  it('a unit word with nothing after it is the name, not a unit', () => {
    expect(parseIngredientLine('2 cloves')).toEqual({ amount: '2', unit: '', name: 'cloves' })
  })

  it('blank lines are null', () => {
    expect(parseIngredientLine('   ')).toBeNull()
    expect(parseIngredientLine('')).toBeNull()
  })
})

describe('splitIngredientList', () => {
  it('one ingredient per line, blank lines dropped, CRLF tolerated', () => {
    const rows = splitIngredientList('¾ cup Jasmine rice\r\n\r\n2 Scallions\n6 oz Carrots\n')
    expect(rows).toEqual([
      { amount: '¾', unit: 'cup', name: 'Jasmine rice' },
      { amount: '2', unit: '', name: 'Scallions' },
      { amount: '6', unit: 'oz', name: 'Carrots' }
    ])
  })

  it('looksLikeList is false for a single line', () => {
    expect(looksLikeList('2 eggs')).toBe(false)
    expect(looksLikeList('2 eggs\n1 cup milk')).toBe(true)
  })
})
