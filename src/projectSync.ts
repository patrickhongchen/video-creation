export type ProjectInteractionMode = 'edit' | 'present' | 'narrate' | 'final-video'

export function canAutoApplyProjectChange(state: {
  projectOpen: boolean
  mode: ProjectInteractionMode
  dirty: boolean
  modalOpen: boolean
}) {
  return state.projectOpen && state.mode === 'edit' && !state.dirty && !state.modalOpen
}

export function pendingChangeKind(previous: 'presentation' | 'asset' | null, next: 'presentation' | 'asset') {
  return previous === 'presentation' || next === 'presentation' ? 'presentation' : 'asset'
}

export function selectionAfterProjectReload(
  slides: ReadonlyArray<{ id: string; elements: ReadonlyArray<{ id: string }> }>,
  previous: { slideId?: string; index: number; elementId?: string },
) {
  const matchingIndex = previous.slideId ? slides.findIndex(({ id }) => id === previous.slideId) : -1
  const index = matchingIndex >= 0 ? matchingIndex : previous.slideId ? Math.min(previous.index, slides.length - 1) : 0
  const elementId = matchingIndex >= 0 && previous.elementId && slides[index]?.elements.some(({ id }) => id === previous.elementId)
    ? previous.elementId
    : null
  return { index, elementId }
}
