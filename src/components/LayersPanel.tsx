import { useEffect, useRef, useState } from 'react'
import type { SlideElement } from '../model'
import { reorderLayer } from '../layerOrder'
import type { CompositionEditorProps } from './CompositionInspector'

type LayersPanelProps = Pick<CompositionEditorProps, 'slide' | 'selectedElementId' | 'onSelect' | 'onSlideChange'>

function fallbackName(element: SlideElement) {
  if (element.type === 'text') return 'Text'
  if (element.type === 'image') return 'Image'
  if (element.type === 'chart') return element.chartType === 'bar' ? 'Bar Chart' : 'Line Chart'
  if (element.type === 'arrow') return 'Arrow'
  return element.shape === 'rectangle' ? 'Rectangle' : element.shape === 'circle' ? 'Circle' : 'Line'
}

export function LayersPanel({ slide, selectedElementId, onSelect, onSlideChange }: LayersPanelProps) {
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
    <div className="section-heading">
      <h3>Layers</h3>
      <span>{slide.elements.length}</span>
    </div>
    {slide.elements.length === 0 && <p className="composition-empty">This blank slide has no elements yet.</p>}
    {slide.elements.length > 0 && <p className="composition-help">Layers are listed from front to back.</p>}
    <div className="composition-layer-list" ref={listRef}>
      {[...slide.elements].reverse().map((element) => <div
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
      </div>
      )}
    </div>
  </section>
}
