import type { Presentation } from './model'
import type { PresentationLibrary } from './storage/presentationStorage'

const HISTORY_LIMIT = 100

export interface PresentationHistoryState {
  library: PresentationLibrary
  past: Presentation[]
  future: Presentation[]
}

export type PresentationHistoryAction =
  | { type: 'edit'; update: (presentation: Presentation) => Presentation }
  | { type: 'undo' | 'redo' }
  | { type: 'replace'; update: (library: PresentationLibrary) => PresentationLibrary }
  | { type: 'refresh-assets'; presentation: Presentation }

export function presentationHistoryReducer(state: PresentationHistoryState, action: PresentationHistoryAction): PresentationHistoryState {
  if (action.type === 'replace') return { library: action.update(state.library), past: [], future: [] }

  if (action.type === 'refresh-assets') {
    const sources = new Map((action.presentation.imageAssets ?? []).map((asset) => [asset.id, asset.source]))
    const refresh = (presentation: Presentation): Presentation => ({
      ...presentation,
      imageAssets: presentation.imageAssets?.map((asset) => ({ ...asset, source: sources.get(asset.id) })),
    })
    return {
      library: { ...state.library, presentations: state.library.presentations.map((item) =>
        item.id === state.library.activePresentationId ? refresh(item) : item) },
      past: state.past.map(refresh),
      future: state.future.map(refresh),
    }
  }

  const activeId = state.library.activePresentationId
  const current = state.library.presentations.find((item) => item.id === activeId)
  if (!current) return state

  if (action.type === 'edit') {
    const next = action.update(current)
    if (next === current) return state
    return {
      library: { ...state.library, presentations: state.library.presentations.map((item) => item.id === activeId ? next : item) },
      past: [...state.past.slice(1 - HISTORY_LIMIT), current],
      future: [],
    }
  }

  const source = action.type === 'undo' ? state.past : state.future
  if (!source.length) return state
  const restored = source[source.length - 1]
  return {
    library: { ...state.library, presentations: state.library.presentations.map((item) => item.id === activeId ? restored : item) },
    past: action.type === 'undo' ? source.slice(0, -1) : [...state.past, current],
    future: action.type === 'redo' ? source.slice(0, -1) : [...state.future, current],
  }
}
