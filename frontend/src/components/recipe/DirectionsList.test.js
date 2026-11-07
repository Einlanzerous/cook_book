import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import DirectionsList from './DirectionsList.vue'

describe('DirectionsList', () => {
  it('renders each direction with its step number', () => {
    const wrapper = mount(DirectionsList, {
      props: {
        directions: [
          { id: 1, stepNumber: 1, instruction: 'Chop the onion.' },
          { id: 2, stepNumber: 2, instruction: 'Fry it.' }
        ]
      }
    })
    const items = wrapper.findAll('li')
    expect(items).toHaveLength(2)
    expect(items[0].text()).toContain('1')
    expect(items[1].text()).toContain('Fry it.')
  })
})
