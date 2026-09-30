import { expect, it } from 'vitest'
import { reconcileSelection } from './editorSelection'
it('keeps surviving selection IDs even when the primary element disappears', () => {
  expect(reconcileSelection([{ id: 'a' }, { id: 'c' }], ['a', 'b'])).toEqual(['a'])
  expect(reconcileSelection([], ['a'])).toEqual([])
  expect(reconcileSelection([{ id: 'a' }], [])).toEqual([])
})
