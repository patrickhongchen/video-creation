import { describe, expect, it } from 'vitest'
import { canAutoApplyProjectChange, pendingChangeKind, selectionAfterProjectReload } from './projectSync'

describe('external Project synchronization state', () => {
  it('applies only in clean Edit mode', () => {
    expect(canAutoApplyProjectChange({ projectOpen: true, mode: 'edit', dirty: false, modalOpen: false })).toBe(true)
    for (const mode of ['present', 'narrate', 'final-video'] as const) {
      expect(canAutoApplyProjectChange({ projectOpen: true, mode, dirty: false, modalOpen: false })).toBe(false)
    }
    expect(canAutoApplyProjectChange({ projectOpen: true, mode: 'edit', dirty: true, modalOpen: false })).toBe(false)
    expect(canAutoApplyProjectChange({ projectOpen: true, mode: 'edit', dirty: false, modalOpen: true })).toBe(false)
    expect(canAutoApplyProjectChange({ projectOpen: false, mode: 'edit', dirty: false, modalOpen: false })).toBe(false)
  })

  it('keeps a pending presentation update authoritative over asset hints', () => {
    expect(pendingChangeKind(null, 'asset')).toBe('asset')
    expect(pendingChangeKind('asset', 'presentation')).toBe('presentation')
    expect(pendingChangeKind('presentation', 'asset')).toBe('presentation')
  })

  it('preserves surviving slide and element IDs and clears removed elements', () => {
    const slides = [
      { id: 'first', elements: [{ id: 'title' }] },
      { id: 'slide-4', elements: [{ id: 'main-chart' }, { id: 'caption' }] },
    ]
    expect(selectionAfterProjectReload(slides, { slideId: 'slide-4', index: 1, elementId: 'main-chart' }))
      .toEqual({ index: 1, elementId: 'main-chart' })
    expect(selectionAfterProjectReload(slides, { slideId: 'slide-4', index: 1, elementId: 'deleted' }))
      .toEqual({ index: 1, elementId: null })
    expect(selectionAfterProjectReload(slides, { slideId: 'deleted-slide', index: 3, elementId: 'main-chart' }))
      .toEqual({ index: 1, elementId: null })
  })
})
