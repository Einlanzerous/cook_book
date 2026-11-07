import { describe, it, expect } from 'vitest'
import fixture from '../../../shared/ownership-outcomes.json'
import { canEdit, canDelete, canWrite } from './ownership'

// The same file the backend handler tests iterate (backend/test/ownership.test.js):
// the SPA shows a control exactly when the server would answer 2xx.
const rows = fixture.outcomes[fixture.active.ownership][fixture.active.unattributed]
const ok = (status) => status >= 200 && status < 300

const actorFor = (actor) => (actor === 'signedOut' ? null : { id: actor === 'author' ? 'u-author' : 'u-other', name: actor })
const recipeFor = (kind) => ({ id: 'r1', contributor: kind === 'unattributed' ? null : { id: 'u-author', name: 'Author' } })

describe('canEdit / canDelete against shared/ownership-outcomes.json', () => {
  it('has rows to check', () => {
    expect(rows.length).toBeGreaterThanOrEqual(5)
  })

  for (const row of rows) {
    it(`${row.actor} x ${row.recipe}: edit ${row.edit}, delete ${row.delete}`, () => {
      const me = actorFor(row.actor)
      const recipe = recipeFor(row.recipe)
      expect(canEdit(me, recipe)).toBe(ok(row.edit))
      expect(canDelete(me, recipe)).toBe(ok(row.delete))
    })
  }

  it('reads the author from a bare contributorId too', () => {
    expect(canDelete({ id: 'u1' }, { contributorId: 'u1' })).toBe(true)
    expect(canDelete({ id: 'u2' }, { contributorId: 'u1' })).toBe(false)
  })

  it('canWrite is "signed in"', () => {
    expect(canWrite({ id: 'u1' })).toBe(true)
    expect(canWrite(null)).toBe(false)
  })
})
