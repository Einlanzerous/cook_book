import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import TagInput from './TagInput.vue'

describe('TagInput', () => {
  const setup = () => mount(TagInput, { global: { plugins: [createPinia()] } })

  it('commits a tag on Enter and on a comma', async () => {
    const w = setup()
    const input = w.find('input')
    await input.setValue('soup')
    await input.trigger('keydown', { key: 'Enter' })
    await input.setValue('stew')
    await input.trigger('keydown', { key: ',' })
    expect(w.emitted('update:modelValue')).toEqual([[['soup']], [['stew']]])
  })

  it('does not commit mid-IME-composition', async () => {
    const w = setup()
    const input = w.find('input')
    await input.setValue('かれー')
    await input.trigger('keydown', { key: 'Enter', isComposing: true })
    await input.trigger('keydown', { key: 'Enter', keyCode: 229 })
    expect(w.emitted('update:modelValue')).toBeUndefined()
  })
})
