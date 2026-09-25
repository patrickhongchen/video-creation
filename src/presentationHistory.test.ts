import { describe, expect, it } from 'vitest'
import { createBlankPresentation } from './presentationFactories'
import { presentationHistoryReducer, type PresentationHistoryState } from './presentationHistory'

function initialState(): PresentationHistoryState {
  const presentation = createBlankPresentation('Original')
  return { library: { presentations: [presentation], activePresentationId: presentation.id }, past: [], future: [] }
}

describe('presentation history', () => {
  it('undoes and redoes edits, then clears redo after a new edit', () => {
    const first = presentationHistoryReducer(initialState(), { type: 'edit', update: (item) => ({ ...item, title: 'First' }) })
    const second = presentationHistoryReducer(first, { type: 'edit', update: (item) => ({ ...item, title: 'Second' }) })
    const undone = presentationHistoryReducer(second, { type: 'undo' })
    expect(undone.library.presentations[0].title).toBe('First')
    expect(presentationHistoryReducer(undone, { type: 'redo' }).library.presentations[0].title).toBe('Second')
    const changed = presentationHistoryReducer(undone, { type: 'edit', update: (item) => ({ ...item, title: 'Different' }) })
    expect(presentationHistoryReducer(changed, { type: 'redo' })).toBe(changed)
  })

  it('clears history when the active presentation changes', () => {
    const edited = presentationHistoryReducer(initialState(), { type: 'edit', update: (item) => ({ ...item, title: 'Edited' }) })
    const other = createBlankPresentation('Other')
    const switched = presentationHistoryReducer(edited, { type: 'replace', update: (library) => ({ presentations: [...library.presentations, other], activePresentationId: other.id }) })
    expect(presentationHistoryReducer(switched, { type: 'undo' })).toBe(switched)
  })
})
