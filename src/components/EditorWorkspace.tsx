import type { DragEventHandler } from 'react'
import type { Presentation, Slide } from '../model'
import type { SlidePreset } from '../presentationFactories'
import type { RevealVisualState } from '../entranceAnimation'
import { SlideList } from './SceneList'
import { CanvasToolbar } from './CompositionInspector'
import { SlideViewport } from './SlideViewport'
import { Stage } from './Stage'
import { Inspector } from './Inspector'

interface EditorWorkspaceProps {
  presentation: Presentation
  selectedSlide: Slide
  selectedIndex: number
  direction: 1 | -1
  selectedElementId: string | null
  selectedElementIds: string[]
  hoveredElementId: string | null
  setHoveredElementId: (id: string | null) => void
  setSelectedElementId: (id: string | null, additive?: boolean) => void
  setSelection: (ids: string[]) => void
  selectSlide: (index: number) => void
  previous: () => void
  next: () => void
  addSlide: (preset: SlidePreset) => void
  copySlide: () => void
  deleteSlide: () => void
  moveSlide: (offset: -1 | 1) => void
  updateSlide: (slide: Slide) => void
  onPresentationChange: (presentation: Presentation) => void
  onImportImage?: (action: 'add' | 'replace') => void
  onDrop: DragEventHandler<HTMLElement>
  compositionGrid: boolean
  compositionGuides: boolean
  compositionSnap: boolean
  setCompositionGrid: (value: boolean) => void
  setCompositionGuides: (value: boolean) => void
  setCompositionSnap: (value: boolean) => void
  isPreviewing: boolean
  revealState: RevealVisualState
  revealOrders: number[]
  advanceReveal: () => void
  startPreview: () => void
  stopPreview: () => void
}

/** Stateless composition of the slide rail, canvas and Inspector. */
export function EditorWorkspace({ presentation, selectedSlide, selectedIndex, direction, selectedElementId,
  selectedElementIds, hoveredElementId, setHoveredElementId, setSelectedElementId, setSelection,
  selectSlide, previous, next, addSlide, copySlide, deleteSlide, moveSlide, updateSlide,
  onPresentationChange, onImportImage, onDrop, compositionGrid, compositionGuides, compositionSnap,
  setCompositionGrid, setCompositionGuides, setCompositionSnap, isPreviewing, revealState, revealOrders,
  advanceReveal, startPreview, stopPreview }: EditorWorkspaceProps) {
  return (
      <div className="workspace">
        <SlideList presentation={presentation} selectedIndex={selectedIndex} onSelect={selectSlide} onPrevious={previous} onNext={next} onAdd={addSlide} onDuplicate={copySlide} onDelete={deleteSlide} onMove={moveSlide} />
        <main className="canvas-workspace" onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy' }} onDrop={onDrop}>
          <CanvasToolbar
            slide={selectedSlide}
            presentation={presentation}
            onSelect={setSelectedElementId}
            onSlideChange={updateSlide}
            onPresentationChange={onPresentationChange}
            onImportImage={onImportImage}
            grid={compositionGrid}
            guides={compositionGuides}
            snap={compositionSnap}
            onGridChange={setCompositionGrid}
            onGuidesChange={setCompositionGuides}
            onSnapChange={setCompositionSnap}
          />
          <SlideViewport contentClassName={isPreviewing ? 'preview-stage-advance' : 'edit-stage-host'} onContentClick={isPreviewing ? advanceReveal : undefined}>
            <Stage
              slide={selectedSlide}
              slides={isPreviewing ? presentation.slides : undefined}
              theme={presentation.theme}
              imageAssets={presentation.imageAssets}
              presentationId={presentation.id}
              slideNumber={selectedIndex + 1}
              slideCount={presentation.slides.length}
              direction={direction}
              revealState={isPreviewing ? revealState : null}
              slideEditor={isPreviewing ? undefined : {
                selectedElementId,
              selectedElementIds,
              hoveredElementId,
              onHover: setHoveredElementId,
              onElementsChange: (elements) => updateSlide({ ...selectedSlide, elements }),
                grid: compositionGrid,
                guides: compositionGuides,
                snap: compositionSnap,
                onSelect: setSelectedElementId,
                onElementChange: (element) => updateSlide({ ...selectedSlide, elements: selectedSlide.elements.map((candidate) => candidate.id === element.id ? element : candidate) }),
              }}
            />
          </SlideViewport>
        </main>
        <Inspector
          slide={selectedSlide}
          onChange={updateSlide}
          presentation={presentation}
          onPresentationChange={onPresentationChange}
          onPrevious={previous}
          onNext={next}
          hasPrevious={selectedIndex > 0}
          hasNext={selectedIndex < presentation.slides.length - 1}
          selectedElementId={selectedElementId}
          selectedElementIds={selectedElementIds}
          onSelectionChange={setSelection}
          hoveredElementId={hoveredElementId}
          onHover={setHoveredElementId}
          isPreviewing={isPreviewing}
          previewAvailable={revealOrders.length > 0}
          revealCount={revealOrders.length}
          revealedCount={revealOrders.filter((order) => order <= revealState.revealedThroughOrder).length}
          onNextReveal={advanceReveal}
          onPreviewSlide={startPreview}
          onStopPreview={stopPreview}
          onSelectElement={setSelectedElementId}
          onImportImage={onImportImage}
        />
      </div>

  )
}
