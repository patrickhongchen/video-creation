import { useEffect, useRef, useState } from 'react'
import type { SlideElement, SlideEntranceAnimationType } from '../model'
import { reorderLayer } from '../layerOrder'
import { addRevealAnimation, removeRevealAnimation, revealGroups, updateRevealEntrance } from '../animationOrder'
import { entranceSuppressionReason, previousSlideFor } from '../entranceAnimation'
import type { CompositionEditorProps } from './CompositionInspector'

type LayersPanelProps = Pick<CompositionEditorProps, 'slide' | 'presentation' | 'selectedElementId' | 'onSelect' | 'onSlideChange' | 'isPreviewing' | 'onPreviewSlide' | 'onStopPreview' | 'previewAvailable' | 'revealCount' | 'revealedCount' | 'onNextReveal'>

function fallbackName(element: SlideElement) {
  if (element.type === 'text') return 'Text'
  if (element.type === 'image') return 'Image'
  if (element.type === 'chart') return element.chartType === 'bar' ? 'Bar Chart' : 'Line Chart'
  if (element.type === 'arrow') return 'Arrow'
  return element.shape === 'rectangle' ? 'Rectangle' : element.shape === 'circle' ? 'Circle' : 'Line'
}

export function LayersPanel({ slide, presentation, selectedElementId, onSelect, onSlideChange, isPreviewing, onPreviewSlide, onStopPreview, previewAvailable, revealCount, revealedCount, onNextReveal }: LayersPanelProps) {
  const previousSlide = previousSlideFor(presentation.slides, slide)
  const groups = revealGroups(slide)
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{ id: string, edge: 'above' | 'below' } | null>(null)
  const drag = useRef<{ id: string, startY: number, moved: boolean } | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const updateElement = (element: SlideElement) => onSlideChange({
    ...slide,
    elements: slide.elements.map((candidate) => candidate.id === element.id ? element : candidate),
  })
  const targetAt = (clientX: number, clientY: number) => {
    const row = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>('.composition-layer-row')
    if (!row || !listRef.current?.contains(row) || !row.dataset.layerId) return null
    const bounds = row.getBoundingClientRect()
    return { id: row.dataset.layerId, edge: clientY < bounds.top + bounds.height / 2 ? 'above' as const : 'below' as const }
  }
  const finishDrag = () => {
    drag.current = null
    setDraggedId(null)
    setDropTarget(null)
  }
  useEffect(() => {
    const release = (event: MouseEvent | globalThis.PointerEvent) => {
      const current = drag.current
      if (!current) return
      const target = current.moved ? targetAt(event.clientX, event.clientY) : null
      finishDrag()
      if (target) {
        const nextElements = reorderLayer(slide.elements, current.id, target.id, target.edge)
        if (nextElements !== slide.elements) onSlideChange({ ...slide, elements: nextElements })
      }
    }
    window.addEventListener('pointerup', release)
    window.addEventListener('mouseup', release)
    return () => {
      window.removeEventListener('pointerup', release)
      window.removeEventListener('mouseup', release)
    }
  }, [slide, onSlideChange])

  return <section className="composition-layers">
    <div className="composition-animation-heading">
      <h3>Layers</h3>
      <button type="button" className="composition-preview-button" disabled={!previewAvailable || isPreviewing} onClick={onPreviewSlide}>{isPreviewing ? 'Previewing' : 'Preview Slide'}</button>
    </div>
    {isPreviewing && <div className="composition-preview-actions">
      <span role="status">Reveal {revealedCount} / {revealCount}</span>
      <button type="button" className="composition-preview-button" onClick={onNextReveal}>{revealedCount < revealCount ? 'Next Reveal' : 'Finish Preview'}</button>
      <button type="button" className="composition-preview-button is-active" onClick={onStopPreview}>Stop Preview</button>
    </div>}
    {slide.elements.length === 0 && <p className="composition-empty">This blank slide has no elements yet.</p>}
    {slide.elements.length > 0 && <>
      <p className="composition-help">Drag layers to arrange front to back. Set an entrance to animate a layer. Steps play in number order; matching steps reveal together.</p>
      <div className="composition-layer-summary"><span>{slide.elements.length} {slide.elements.length === 1 ? 'layer' : 'layers'}</span><span>{groups.length} reveal {groups.length === 1 ? 'step' : 'steps'}</span></div>
    </>}
    <div className="composition-layer-list" ref={listRef}>
      {[...slide.elements].reverse().map((element) => {
        const suppression = entranceSuppressionReason(element, previousSlide)
        return <div
        className={`composition-layer-row${element.id === selectedElementId ? ' is-selected' : ''}${element.id === draggedId ? ' is-dragging' : ''}${dropTarget?.id === element.id ? ` drop-${dropTarget.edge}` : ''}${element.hidden ? ' is-hidden' : ''}${element.locked ? ' is-locked' : ''}`}
        key={element.id}
        data-layer-id={element.id}
        onClick={() => onSelect(element.id)}
      >
        <button
          type="button"
          className="composition-layer-grip"
          aria-label={`Drag ${element.name} to reorder`}
          title="Drag to reorder layer"
          onClick={(event) => { event.stopPropagation(); onSelect(element.id) }}
          onPointerDown={(event) => {
            if (event.button !== 0) return
            event.stopPropagation()
            event.currentTarget.setPointerCapture(event.pointerId)
            drag.current = { id: element.id, startY: event.clientY, moved: false }
            onSelect(element.id)
          }}
          onPointerMove={(event) => {
            if (!drag.current) return
            if (!drag.current.moved && Math.abs(event.clientY - drag.current.startY) < 4) return
            drag.current.moved = true
            event.preventDefault()
            setDraggedId(drag.current.id)
            const target = targetAt(event.clientX, event.clientY)
            if (target?.id !== dropTarget?.id || target?.edge !== dropTarget?.edge) setDropTarget(target)
          }}
          onPointerCancel={finishDrag}
        >⠿</button>
        <input className="composition-layer-select" aria-label={`Layer name for ${element.name}`} value={element.name} onFocus={() => onSelect(element.id)} onChange={(event) => updateElement({ ...element, name: event.target.value })} onBlur={() => { if (!element.name.trim()) updateElement({ ...element, name: fallbackName(element) }) }} />
        <button type="button" aria-label={`${element.hidden ? 'Show' : 'Hide'} ${element.name}`} title={element.hidden ? 'Show layer' : 'Hide layer'} onClick={(event) => { event.stopPropagation(); updateElement({ ...element, hidden: !element.hidden }) }}>{element.hidden ? '○' : '●'}</button>
        <button type="button" aria-label={`${element.locked ? 'Unlock' : 'Lock'} ${element.name}`} title={element.locked ? 'Unlock layer' : 'Lock layer'} onClick={(event) => { event.stopPropagation(); updateElement({ ...element, locked: !element.locked }) }}>{element.locked ? '🔒' : '◇'}</button>
        <div className="composition-layer-animation" onClick={(event) => event.stopPropagation()}>
          <label><span>Entrance</span><select
            aria-label={`Entrance for ${element.name}`}
            value={element.animation?.entrance ?? 'none'}
            disabled={Boolean(element.hidden && !element.animation)}
            title={element.hidden && !element.animation ? 'Show this layer to add an entrance' : undefined}
            onFocus={() => onSelect(element.id)}
            onChange={(event) => {
              if (event.target.value === 'none') onSlideChange(removeRevealAnimation(slide, element.id))
              else onSlideChange(updateRevealEntrance(element.animation ? slide : addRevealAnimation(slide, element.id), element.id, event.target.value as SlideEntranceAnimationType))
            }}
          >
            <option value="none">None · visible immediately</option>
            <option value="appear">Appear</option>
            <option value="fade">Fade</option>
            <option value="pop">Pop</option>
            <option value="slide-up">Slide Up</option>
            <option value="slide-left">Slide Left</option>
            <option value="slide-right">Slide Right</option>
          </select></label>
          {element.animation && <label className="composition-layer-step"><span>Step</span><input
            aria-label={`Reveal step for ${element.name}`}
            type="number"
            min="1"
            step="1"
            value={element.animation.order}
            onFocus={() => onSelect(element.id)}
            onChange={(event) => {
              const order = Number(event.target.value)
              if (Number.isSafeInteger(order) && order > 0) updateElement({ ...element, animation: { ...element.animation!, order } })
            }}
          /></label>}
          {element.animation && (element.hidden || suppression) && <small className="composition-layer-animation-status">{element.hidden ? 'Hidden · entrance won’t play' : suppression === 'shared-element' ? 'Continues from previous slide · entrance won’t replay' : 'Chart continues from previous slide · entrance won’t replay'}</small>}
        </div>
      </div>
      })}
    </div>
  </section>
}
