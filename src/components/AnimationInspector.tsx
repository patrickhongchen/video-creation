import { useEffect, useRef, useState } from 'react'
import type { SlideEntranceAnimationType } from '../model'
import { entranceSuppressionReason, previousSlideFor } from '../entranceAnimation'
import { addRevealAnimation, removeRevealAnimation, reorderRevealGroup, revealGroups, updateRevealEntrance } from '../animationOrder'
import type { CompositionEditorProps } from './CompositionInspector'

type AnimationInspectorProps = Pick<CompositionEditorProps, 'slide' | 'presentation' | 'selectedElementId' | 'onSelect' | 'onSlideChange' | 'isPreviewing' | 'onPreviewSlide' | 'onStopPreview' | 'previewAvailable' | 'revealCount' | 'revealedCount' | 'onNextReveal'>

export function AnimationInspector({
  slide,
  presentation,
  selectedElementId,
  onSelect,
  onSlideChange,
  isPreviewing,
  onPreviewSlide,
  onStopPreview,
  previewAvailable,
  revealCount,
  revealedCount,
  onNextReveal,
}: AnimationInspectorProps) {
  const groups = revealGroups(slide)
  const available = slide.elements.filter((element) => !element.animation && !element.hidden)
  const previousSlide = previousSlideFor(presentation.slides, slide)
  const [draggedOrder, setDraggedOrder] = useState<number | null>(null)
  const [dropTarget, setDropTarget] = useState<{ order: number; edge: 'above' | 'below' } | null>(null)
  const drag = useRef<{ order: number; startY: number; moved: boolean } | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const addMenuRef = useRef<HTMLDetailsElement>(null)
  const targetAt = (clientX: number, clientY: number) => {
    const row = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>('.composition-reveal-group')
    if (!row || !listRef.current?.contains(row) || !row.dataset.revealOrder) return null
    const bounds = row.getBoundingClientRect()
    return { order: Number(row.dataset.revealOrder), edge: clientY < bounds.top + bounds.height / 2 ? 'above' as const : 'below' as const }
  }
  const finishDrag = () => {
    drag.current = null
    setDraggedOrder(null)
    setDropTarget(null)
  }
  useEffect(() => {
    const release = (event: MouseEvent | globalThis.PointerEvent) => {
      const current = drag.current
      if (!current) return
      const target = current.moved ? targetAt(event.clientX, event.clientY) : null
      finishDrag()
      if (target) {
        const next = reorderRevealGroup(slide, current.order, target.order, target.edge)
        if (next !== slide) onSlideChange(next)
      }
    }
    window.addEventListener('pointerup', release)
    window.addEventListener('mouseup', release)
    return () => {
      window.removeEventListener('pointerup', release)
      window.removeEventListener('mouseup', release)
    }
  }, [slide, onSlideChange])

  return <section className="composition-animation-controls">
    <div className="composition-animation-heading"><h3>Animate</h3><button type="button" className="composition-preview-button" disabled={!previewAvailable || isPreviewing} onClick={onPreviewSlide}>{isPreviewing ? 'Previewing' : 'Preview Slide'}</button></div>
    {isPreviewing && <div className="composition-preview-actions">
      <span role="status">Reveal {revealedCount} / {revealCount}</span>
      <button type="button" className="composition-preview-button" onClick={onNextReveal}>{revealedCount < revealCount ? 'Next Reveal' : 'Finish Preview'}</button>
      <button type="button" className="composition-preview-button is-active" onClick={onStopPreview}>Stop Preview</button>
    </div>}
    <div className="section-heading composition-reveal-title"><h3>Reveal sequence</h3><span>{groups.length} {groups.length === 1 ? 'step' : 'steps'}</span></div>
    {groups.length === 0 && <p className="composition-empty">No animations yet. Add a slide element to begin the reveal sequence.</p>}
    <div className="composition-reveal-list" ref={listRef}>
      {groups.map((group, index) => <div
        key={group.order}
        className={`composition-reveal-group${draggedOrder === group.order ? ' is-dragging' : ''}${dropTarget?.order === group.order ? ` drop-${dropTarget.edge}` : ''}`}
        data-reveal-order={group.order}
      >
        <div className="composition-reveal-step"><span aria-label={`Step ${index + 1}`}>{index + 1}</span><button
          type="button"
          className="composition-reveal-grip"
          aria-label={`Drag step ${index + 1} to reorder`}
          title="Drag reveal step"
          onPointerDown={(event) => {
            if (event.button !== 0) return
            event.currentTarget.setPointerCapture(event.pointerId)
            drag.current = { order: group.order, startY: event.clientY, moved: false }
          }}
          onPointerMove={(event) => {
            if (!drag.current) return
            if (!drag.current.moved && Math.abs(event.clientY - drag.current.startY) < 4) return
            drag.current.moved = true
            event.preventDefault()
            setDraggedOrder(drag.current.order)
            const target = targetAt(event.clientX, event.clientY)
            if (target?.order !== dropTarget?.order || target?.edge !== dropTarget?.edge) setDropTarget(target)
          }}
          onPointerCancel={finishDrag}
        >⠿</button></div>
        <div className="composition-reveal-members">{group.elements.map((element) => {
          const suppression = entranceSuppressionReason(element, previousSlide)
          return <div key={element.id} className={`composition-reveal-member${selectedElementId === element.id ? ' is-selected' : ''}${element.hidden ? ' is-hidden' : ''}`}>
            <button type="button" className="composition-reveal-name" title={element.name} onClick={() => onSelect(element.id)}>{element.name}</button>
            <select aria-label={`Entrance for ${element.name}`} value={element.animation!.entrance} onChange={(event) => onSlideChange(updateRevealEntrance(slide, element.id, event.target.value as SlideEntranceAnimationType))}>
              <option value="appear">Appear</option>
              <option value="fade">Fade</option>
              <option value="pop">Pop</option>
              <option value="slide-up">Slide Up</option>
              <option value="slide-left">Slide Left</option>
              <option value="slide-right">Slide Right</option>
            </select>
            <button type="button" className="composition-reveal-remove" aria-label={`Remove animation from ${element.name}`} title="Remove animation" onClick={() => onSlideChange(removeRevealAnimation(slide, element.id))}>×</button>
            {(element.hidden || suppression) && <small className="composition-reveal-status">{element.hidden ? 'Hidden · entrance won’t play' : suppression === 'shared-element' ? 'Continues from previous slide · entrance won’t replay' : 'Chart continues from previous slide · entrance won’t replay'}</small>}
          </div>
        })}</div>
      </div>)}
    </div>
    <details className="composition-add-animation" ref={addMenuRef}>
      <summary>+ Add animation</summary>
      <div className="composition-add-animation-menu">{available.length === 0 && <p>All visible elements already have animations.</p>}{available.map((element) => <button type="button" key={element.id} onClick={() => {
        onSlideChange(addRevealAnimation(slide, element.id))
        onSelect(element.id)
        if (addMenuRef.current) addMenuRef.current.open = false
      }}>{element.name}</button>)}</div>
    </details>
  </section>
}
