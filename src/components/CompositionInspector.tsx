import type { Presentation, Slide } from '../model'

export interface CompositionEditorProps {
  slide: Slide
  presentation: Presentation
  selectedElementId: string | null
  grid: boolean
  guides: boolean
  snap: boolean
  onGridChange: (value: boolean) => void
  onGuidesChange: (value: boolean) => void
  onSnapChange: (value: boolean) => void
  onSelect: (elementId: string | null) => void
  onSlideChange: (slide: Slide) => void
  onPresentationChange: (presentation: Presentation) => void
  onImportImage?: (action: 'add' | 'replace') => void
  isPreviewing: boolean
  onPreviewSlide: () => void
  onStopPreview: () => void
  previewAvailable: boolean
  revealCount: number
  revealedCount: number
  onNextReveal: () => void
}

export { CanvasToolbar } from './CanvasToolbar'
export { ElementInspector } from './ElementInspector'
export { LayersPanel } from './LayersPanel'
