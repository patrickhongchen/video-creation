import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import type {
  ElementFrame,
  Presentation,
  PresentationImageMimeType,
  Slide,
  SlideChartElement,
  SlideElement,
  SlideEntranceAnimationType,
  SlideImageElement,
  SlideShape,
} from '../model'
import { entranceSuppressionReason, previousSlideFor } from '../entranceAnimation'
import { reorderLayer } from '../layerOrder'
import {
  createSlideArrowElement,
  createSlideChartElement,
  createSlideShapeElement,
  createSlideTextElement,
  createSlideImageElement,
  createStableId,
  duplicateSlideElement,
} from '../presentationFactories'

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

const IMAGE_MIME_TYPES = new Set<PresentationImageMimeType>(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])

type LayersPanelProps = Pick<CompositionEditorProps, 'slide' | 'selectedElementId' | 'onSelect' | 'onSlideChange'>
type CanvasToolbarProps = Pick<CompositionEditorProps, 'slide' | 'presentation' | 'grid' | 'guides' | 'snap' | 'onGridChange' | 'onGuidesChange' | 'onSnapChange' | 'onSelect' | 'onSlideChange' | 'onPresentationChange' | 'onImportImage'>
type ElementInspectorProps = Pick<CompositionEditorProps, 'slide' | 'presentation' | 'selectedElementId' | 'onSelect' | 'onSlideChange' | 'onPresentationChange' | 'onImportImage'>
type AnimationInspectorProps = Pick<CompositionEditorProps, 'slide' | 'presentation' | 'selectedElementId' | 'onSlideChange' | 'isPreviewing' | 'onPreviewSlide' | 'onStopPreview' | 'previewAvailable' | 'revealCount' | 'revealedCount' | 'onNextReveal'>

function imageMimeType(file: File): PresentationImageMimeType | null {
  const declared = file.type === 'image/jpg' ? 'image/jpeg' : file.type
  if (IMAGE_MIME_TYPES.has(declared as PresentationImageMimeType)) return declared as PresentationImageMimeType
  const extension = file.name.split('.').pop()?.toLowerCase()
  if (extension === 'png') return 'image/png'
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg'
  if (extension === 'webp') return 'image/webp'
  if (extension === 'svg') return 'image/svg+xml'
  return null
}

function Numeric({ label, value, onChange, min, max, step = 1 }: {
  label: string
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
}) {
  return <label className="composition-number-field"><span>{label}</span><input type="number" aria-label={label} value={Number.isFinite(value) ? value : 0} min={min} max={max} step={step} onChange={(event) => {
    const next = Number(event.target.value)
    if (Number.isFinite(next)) onChange(next)
  }} /></label>
}

function minimumSize(element: SlideElement) {
  if (element.type === 'chart') return { width: 280, height: 220 }
  if (element.type === 'text') return { width: 120, height: 80 }
  if (element.type === 'image') return { width: 80, height: 80 }
  if (element.type === 'arrow') return { width: 80, height: 30 }
  return element.shape === 'line' ? { width: 60, height: 20 } : { width: 40, height: 40 }
}

function normalizedRotation(value: number) {
  return ((value + 180) % 360 + 360) % 360 - 180
}

function fallbackName(element: SlideElement) {
  if (element.type === 'text') return 'Text'
  if (element.type === 'image') return 'Image'
  if (element.type === 'chart') return element.chartType === 'bar' ? 'Bar Chart' : 'Line Chart'
  if (element.type === 'arrow') return 'Arrow'
  return element.shape === 'rectangle' ? 'Rectangle' : element.shape === 'circle' ? 'Circle' : 'Line'
}

function readImage(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('The image could not be read.'))
    reader.onerror = () => reject(reader.error ?? new Error('The image could not be read.'))
    reader.readAsDataURL(file)
  })
}

function readImageRatio(source: string) {
  return new Promise<number>((resolve) => {
    const image = new Image()
    image.onload = () => resolve(image.naturalWidth > 0 && image.naturalHeight > 0 ? image.naturalWidth / image.naturalHeight : 1)
    image.onerror = () => resolve(1)
    image.src = source
  })
}

function chartEditor(element: SlideChartElement, update: (next: SlideChartElement) => void) {
  const updateDatum = (index: number, value: Partial<SlideChartElement['data'][number]>) => update({
    ...element,
    data: element.data.map((datum, datumIndex) => datumIndex === index ? { ...datum, ...value } : datum),
  })
  const addDatum = () => {
    const ordinal = element.data.length + 1
    update({ ...element, data: [...element.data, { id: createStableId(`datum-${ordinal}`), label: `Item ${ordinal}`, value: 0 }] })
  }
  return <>
    <label className="field-row"><span>Chart type</span><select value={element.chartType} onChange={(event) => update({ ...element, chartType: event.target.value as SlideChartElement['chartType'], name: event.target.value === 'bar' ? 'Bar Chart' : 'Line Chart' })}><option value="bar">Bar</option><option value="line">Line</option></select></label>
    {element.chartType === 'bar' && <label className="field-row"><span>Orientation</span><select value={element.orientation ?? 'horizontal'} onChange={(event) => update({ ...element, orientation: event.target.value as SlideChartElement['orientation'] })}><option value="horizontal">Horizontal</option><option value="vertical">Vertical</option></select></label>}
    <div className="chart-format-row">
      <label className="field-row"><span>Prefix</span><input value={element.valuePrefix ?? ''} onChange={(event) => update({ ...element, valuePrefix: event.target.value })} /></label>
      <label className="field-row"><span>Suffix</span><input value={element.valueSuffix ?? ''} onChange={(event) => update({ ...element, valueSuffix: event.target.value })} /></label>
    </div>
    <label className="field-row checkbox-field"><span>Values</span><span><input type="checkbox" checked={element.showValues} onChange={(event) => update({ ...element, showValues: event.target.checked })} /> Show numeric values</span></label>
    <div className="chart-data-editor composition-chart-data">
      <div className="section-heading"><h3>Data</h3><button type="button" onClick={addDatum}>+ Add datum</button></div>
      {element.data.map((datum, index) => <div className="composition-chart-row" key={datum.id}>
        <input aria-label={`Label for ${datum.label}`} value={datum.label} onChange={(event) => updateDatum(index, { label: event.target.value })} />
        <input aria-label={`Value for ${datum.label}`} type="number" value={datum.value} onChange={(event) => {
          const value = Number(event.target.value)
          if (Number.isFinite(value)) updateDatum(index, { value })
        }} />
        <label title="Highlight"><input type="checkbox" checked={element.highlightIds.includes(datum.id)} onChange={(event) => update({ ...element, highlightIds: event.target.checked ? [...element.highlightIds, datum.id] : element.highlightIds.filter((id) => id !== datum.id) })} /></label>
        <button type="button" aria-label={`Delete ${datum.label}`} disabled={element.data.length === 1} onClick={() => update({ ...element, data: element.data.filter((_, datumIndex) => datumIndex !== index), highlightIds: element.highlightIds.filter((id) => id !== datum.id) })}>×</button>
      </div>)}
    </div>
  </>
}

export function CanvasToolbar({
  slide,
  presentation,
  grid,
  guides,
  snap,
  onGridChange,
  onGuidesChange,
  onSnapChange,
  onSelect,
  onSlideChange,
  onPresentationChange,
  onImportImage,
}: CanvasToolbarProps) {
  const imageInput = useRef<HTMLInputElement>(null)
  const shapeMenu = useRef<HTMLDetailsElement>(null)
  const addElement = (element: SlideElement) => {
    onSlideChange({ ...slide, elements: [...slide.elements, element] })
    onSelect(element.id)
  }
  const addShape = (element: SlideElement) => {
    addElement(element)
    if (shapeMenu.current) shapeMenu.current.open = false
  }
  const pickImage = () => {
    if (onImportImage) {
      onImportImage('add')
      return
    }
    imageInput.current?.click()
  }
  const acceptImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const mimeType = imageMimeType(file)
    if (!mimeType) return
    const source = (await readImage(file)).replace(/^data:[^;,]*/i, `data:${mimeType}`)
    const asset = { id: createStableId(file.name.replace(/\.[^.]+$/, '') || 'image'), name: file.name, mimeType, source }
    onPresentationChange({ ...presentation, imageAssets: [...(presentation.imageAssets ?? []), asset] })
    const ratio = await readImageRatio(source)
    const element = createSlideImageElement(asset.id)
    const width = Math.round(ratio >= 1 ? 700 : 700 * ratio)
    const height = Math.round(ratio >= 1 ? 700 / ratio : 700)
    addElement({ ...element, frame: { ...element.frame, x: (1080 - width) / 2, y: (1920 - height) / 2, width, height } })
  }

  return <div className="canvas-toolbar" aria-label="Canvas tools">
    <div className="composition-toolbar-actions canvas-toolbar-group">
      <button type="button" onClick={() => addElement(createSlideTextElement())}>+ Text</button>
      <button type="button" onClick={pickImage}>+ Image</button>
      <button type="button" onClick={() => addElement(createSlideChartElement())}>+ Chart</button>
      <details ref={shapeMenu} name="canvas-tools" className="composition-toolbar-menu canvas-toolbar-menu">
        <summary>+ Shape</summary>
        <div className="composition-toolbar-menu-content canvas-toolbar-menu-content">
          <button type="button" aria-label="Add rectangle" onClick={() => addShape({ ...createSlideShapeElement('rectangle'), fill: presentation.theme.accent })}>Rectangle</button>
          <button type="button" aria-label="Add circle" onClick={() => addShape({ ...createSlideShapeElement('circle'), fill: presentation.theme.accent })}>Circle</button>
          <button type="button" aria-label="Add line" onClick={() => addShape({ ...createSlideShapeElement('line'), stroke: presentation.theme.accent })}>Line</button>
          <button type="button" aria-label="Add arrow" onClick={() => addShape({ ...createSlideArrowElement(), stroke: presentation.theme.accent })}>Arrow</button>
        </div>
      </details>
      <details name="canvas-tools" className="composition-toolbar-menu canvas-toolbar-menu">
        <summary>View</summary>
        <div className="composition-toolbar-menu-content canvas-toolbar-menu-content">
          <label><input aria-label="Snap" type="checkbox" checked={snap} onChange={(event) => onSnapChange(event.target.checked)} /> Snap</label>
          <label><input aria-label="Guides" type="checkbox" checked={guides} onChange={(event) => onGuidesChange(event.target.checked)} /> Guides</label>
          <label><input aria-label="Grid" type="checkbox" checked={grid} onChange={(event) => onGridChange(event.target.checked)} /> Grid</label>
        </div>
      </details>
      <details name="canvas-tools" className="composition-toolbar-menu composition-style-menu canvas-toolbar-menu">
        <summary>Style</summary>
        <div className="canvas-toolbar-menu-content"><label><span>Accent</span><input aria-label="Presentation accent" type="color" value={presentation.theme.accent} onChange={(event) => onPresentationChange({ ...presentation, theme: { ...presentation.theme, accent: event.target.value } })} /></label></div>
      </details>
    </div>
    {!onImportImage && <input ref={imageInput} className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,.svg" onChange={(event) => void acceptImage(event)} />}
  </div>
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

export function ElementInspector({
  slide,
  presentation,
  selectedElementId,
  onSelect,
  onSlideChange,
  onPresentationChange,
  onImportImage,
}: ElementInspectorProps) {
  const imageInput = useRef<HTMLInputElement>(null)
  const selected = slide.elements.find((element) => element.id === selectedElementId) ?? null
  const updateElement = (element: SlideElement) => onSlideChange({
    ...slide,
    elements: slide.elements.map((candidate) => candidate.id === element.id ? element : candidate),
  })
  const updateFrame = (key: keyof ElementFrame, value: number) => {
    if (!selected) return
    const minimum = minimumSize(selected)
    let next = value
    if (key === 'width') next = Math.max(minimum.width, value)
    if (key === 'height') next = Math.max(minimum.height, value)
    if (key === 'rotation') next = normalizedRotation(value)
    if (key === 'opacity') next = Math.max(0, Math.min(1, value))
    updateElement({ ...selected, frame: { ...selected.frame, [key]: next } })
  }
  const removeSelected = () => {
    if (!selected) return
    onSlideChange({ ...slide, elements: slide.elements.filter((element) => element.id !== selected.id) })
    onSelect(null)
  }
  const duplicateSelected = () => {
    if (!selected) return
    const duplicate = duplicateSlideElement(selected)
    onSlideChange({ ...slide, elements: [...slide.elements, duplicate] })
    onSelect(duplicate.id)
  }
  const pickReplacement = () => {
    if (onImportImage) {
      onImportImage('replace')
      return
    }
    imageInput.current?.click()
  }
  const acceptReplacement = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || selected?.type !== 'image') return
    const mimeType = imageMimeType(file)
    if (!mimeType) return
    const source = (await readImage(file)).replace(/^data:[^;,]*/i, `data:${mimeType}`)
    const asset = { id: createStableId(file.name.replace(/\.[^.]+$/, '') || 'image'), name: file.name, mimeType, source }
    onPresentationChange({ ...presentation, imageAssets: [...(presentation.imageAssets ?? []), asset] })
    updateElement({ ...selected, assetId: asset.id })
  }

  if (!selected) return <section className="selected-element-controls"><div className="section-heading"><h3>Element</h3></div><p className="composition-empty">Select an element on the canvas or in Layers to edit it.</p></section>

  return <section className="selected-element-controls">
    <div className="section-heading"><h3>Element</h3><span>{selected.type}</span></div>
    <div className="composition-type-controls">
      {selected.type === 'text' && <>
        <label className="field-row"><span>Text</span><textarea rows={4} value={selected.text} onChange={(event) => updateElement({ ...selected, text: event.target.value })} /></label>
        <label className="field-row"><span>Role</span><select value={selected.role ?? 'body'} onChange={(event) => updateElement({ ...selected, role: event.target.value as typeof selected.role })}><option value="headline">Headline</option><option value="body">Body</option><option value="caption">Caption</option><option value="label">Label</option></select></label>
        <Numeric label="Font size" value={selected.fontSize ?? (selected.role === 'headline' ? presentation.theme.defaultHeadlineStyle.fontSize : selected.role === 'caption' ? presentation.theme.defaultCaptionStyle.fontSize : selected.role === 'label' ? (presentation.theme.defaultLabelStyle ?? presentation.theme.defaultBodyStyle).fontSize : presentation.theme.defaultBodyStyle.fontSize)} min={1} max={512} onChange={(fontSize) => updateElement({ ...selected, fontSize })} />
        <Numeric label="Font weight" value={selected.fontWeight ?? 500} min={100} max={900} step={100} onChange={(fontWeight) => updateElement({ ...selected, fontWeight })} />
        <label className="field-row"><span>Align</span><select value={selected.textAlign ?? 'left'} onChange={(event) => updateElement({ ...selected, textAlign: event.target.value as typeof selected.textAlign })}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
      </>}
      {selected.type === 'image' && <>
        <button type="button" className="composition-replace-image" onClick={pickReplacement}>Replace Image</button>
        {!onImportImage && <input ref={imageInput} className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,.svg" onChange={(event) => void acceptReplacement(event)} />}
        <label className="field-row"><span>Fit</span><select value={selected.fit} onChange={(event) => updateElement({ ...selected, fit: event.target.value as SlideImageElement['fit'] })}><option value="contain">Contain</option><option value="cover">Cover</option></select></label>
        <label className="field-row"><span>Position</span><select value={selected.position ?? 'center'} onChange={(event) => updateElement({ ...selected, position: event.target.value as SlideImageElement['position'] })}>{['center', 'top', 'bottom', 'left', 'right', 'top-left', 'top-right', 'bottom-left', 'bottom-right'].map((position) => <option key={position} value={position}>{position}</option>)}</select></label>
        <div className="composition-view-options"><label><input type="checkbox" checked={selected.flipX ?? false} onChange={(event) => updateElement({ ...selected, flipX: event.target.checked })} /> Flip horizontal</label><label><input type="checkbox" checked={selected.flipY ?? false} onChange={(event) => updateElement({ ...selected, flipY: event.target.checked })} /> Flip vertical</label></div>
      </>}
      {selected.type === 'chart' && chartEditor(selected, updateElement)}
      {selected.type === 'shape' && <>
        <label className="field-row"><span>Shape</span><select value={selected.shape} onChange={(event) => updateElement({ ...selected, shape: event.target.value as SlideShape })}><option value="rectangle">Rectangle</option><option value="circle">Circle</option><option value="line">Line</option></select></label>
        {selected.shape !== 'line' && <label className="field-row"><span>Fill</span><input type="color" value={selected.fill ?? presentation.theme.accent} onChange={(event) => updateElement({ ...selected, fill: event.target.value })} /></label>}
        <label className="field-row"><span>Stroke</span><input type="color" value={selected.stroke ?? presentation.theme.accent} onChange={(event) => updateElement({ ...selected, stroke: event.target.value })} /></label>
        <Numeric label="Stroke width" value={selected.strokeWidth ?? 3} min={0} onChange={(strokeWidth) => updateElement({ ...selected, strokeWidth })} />
      </>}
      {selected.type === 'arrow' && <>
        <label className="field-row"><span>Color</span><input type="color" value={selected.stroke ?? presentation.theme.accent} onChange={(event) => updateElement({ ...selected, stroke: event.target.value })} /></label>
        <Numeric label="Stroke width" value={selected.strokeWidth ?? 6} min={1} onChange={(strokeWidth) => updateElement({ ...selected, strokeWidth })} />
        <label className="field-row"><span>Start cap</span><select value={selected.startCap ?? 'none'} onChange={(event) => updateElement({ ...selected, startCap: event.target.value as typeof selected.startCap })}><option value="none">None</option><option value="dot">Dot</option></select></label>
        <label className="field-row"><span>End cap</span><select value={selected.endCap ?? 'arrow'} onChange={(event) => updateElement({ ...selected, endCap: event.target.value as typeof selected.endCap })}><option value="arrow">Arrow</option><option value="none">Line only</option></select></label>
      </>}
    </div>

    {(selected.frame.x + selected.frame.width < 0 || selected.frame.x > 1080 || selected.frame.y + selected.frame.height < 0 || selected.frame.y > 1920) && <p className="composition-warning">This element is completely outside the video frame.</p>}

    <div className="composition-inline-actions">
      <button type="button" onClick={() => updateElement({ ...selected, locked: !selected.locked })}>{selected.locked ? 'Unlock' : 'Lock'}</button>
      <button type="button" onClick={duplicateSelected}>Duplicate</button>
      <button type="button" onClick={removeSelected}>Delete</button>
    </div>

    <details className="composition-inspector-details inspector-disclosure">
      <summary>Position &amp; Size</summary>
      <div className="composition-transform-grid">
        <Numeric label="X" value={selected.frame.x} onChange={(value) => updateFrame('x', value)} />
        <Numeric label="Y" value={selected.frame.y} onChange={(value) => updateFrame('y', value)} />
        <Numeric label="W" value={selected.frame.width} min={minimumSize(selected).width} onChange={(value) => updateFrame('width', value)} />
        <Numeric label="H" value={selected.frame.height} min={minimumSize(selected).height} onChange={(value) => updateFrame('height', value)} />
        <Numeric label="Rotation" value={selected.frame.rotation ?? 0} step={1} onChange={(value) => updateFrame('rotation', value)} />
      </div>
      <button type="button" onClick={() => updateElement({ ...selected, frame: { ...selected.frame, x: (1080 - selected.frame.width) / 2, y: (1920 - selected.frame.height) / 2 } })}>Center on Canvas</button>
    </details>

    <details className="composition-inspector-details inspector-disclosure">
      <summary>Appearance</summary>
      <Numeric label="Opacity %" value={Math.round((selected.frame.opacity ?? 1) * 100)} min={0} max={100} onChange={(value) => updateFrame('opacity', value / 100)} />
      {selected.type === 'text' && <>
        <Numeric label="Line height" value={selected.lineHeight ?? 1.1} min={0.5} max={3} step={0.05} onChange={(lineHeight) => updateElement({ ...selected, lineHeight })} />
      </>}
    </details>

    <details className="composition-inspector-details inspector-disclosure">
      <summary>Morph</summary>
      <label className="field-row"><span>Shared ID</span><input value={selected.sharedElementId ?? ''} placeholder="Optional Morph identity" onChange={(event) => updateElement({ ...selected, sharedElementId: event.target.value.trim() || undefined })} /></label>
    </details>
  </section>
}

export function AnimationInspector({
  slide,
  presentation,
  selectedElementId,
  onSlideChange,
  isPreviewing,
  onPreviewSlide,
  onStopPreview,
  previewAvailable,
  revealCount,
  revealedCount,
  onNextReveal,
}: AnimationInspectorProps) {
  const selected = slide.elements.find((element) => element.id === selectedElementId) ?? null
  const suppressionReason = selected && entranceSuppressionReason(selected, previousSlideFor(presentation.slides, slide))
  const updateElement = (element: SlideElement) => onSlideChange({
    ...slide,
    elements: slide.elements.map((candidate) => candidate.id === element.id ? element : candidate),
  })
  const updateEntrance = (entrance: SlideEntranceAnimationType | '') => {
    if (!selected) return
    if (!entrance) {
      const next = { ...selected }
      delete next.animation
      updateElement(next)
      return
    }
    updateElement({
      ...selected,
      animation: selected.animation
        ? { ...selected.animation, entrance }
        : { entrance, order: Math.max(0, ...slide.elements.map((element) => element.animation?.order ?? 0)) + 1 },
    })
  }
  const updateAnimationOrder = (order: number) => {
    if (!selected?.animation || !Number.isSafeInteger(order) || order < 1) return
    updateElement({ ...selected, animation: { ...selected.animation, order } })
  }

  return <section className="composition-animation-controls">
    <div className="section-heading"><h3>Animation</h3>{selected && <span>{selected.name}</span>}</div>
    {selected ? <>
      <label className="field-row"><span>Entrance</span><select value={selected.animation?.entrance ?? ''} onChange={(event) => updateEntrance(event.target.value as SlideEntranceAnimationType | '')}>
        <option value="">None</option>
        <option value="appear">Appear</option>
        <option value="fade">Fade</option>
        <option value="pop">Pop</option>
        <option value="slide-up">Slide Up</option>
        <option value="slide-left">Slide Left</option>
        <option value="slide-right">Slide Right</option>
      </select></label>
      <label className="field-row"><span>Reveal Step</span><input aria-label="Reveal Step" type="number" min="1" step="1" value={selected.animation?.order ?? 1} disabled={!selected.animation} onChange={(event) => updateAnimationOrder(Number(event.target.value))} /></label>
      {selected.animation && suppressionReason === 'shared-element' && <p className="composition-animation-notice">This entrance is stored but will not play on this slide because its Shared ID continues from the previous slide. It can play where the element first appears.</p>}
      {selected.animation && suppressionReason === 'continuing-chart' && <p className="composition-animation-notice">This entrance is stored but will not play on this slide because this chart continues from the previous slide. It can play where the chart first appears.</p>}
    </> : <p className="composition-empty">Select an element to set its entrance and reveal step.</p>}
    <div className="composition-preview-actions">
      <button type="button" className="composition-preview-button" disabled={!previewAvailable || isPreviewing} onClick={onPreviewSlide}>{isPreviewing ? 'Previewing' : 'Preview Slide'}</button>
      {isPreviewing && <><span role="status">Reveal {revealedCount} / {revealCount}</span><button type="button" className="composition-preview-button" onClick={onNextReveal}>{revealedCount < revealCount ? 'Next Reveal' : 'Finish Preview'}</button><button type="button" className="composition-preview-button is-active" onClick={onStopPreview}>Stop Preview</button></>}
    </div>
  </section>
}
