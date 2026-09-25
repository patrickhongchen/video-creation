import { useRef, type ChangeEvent } from 'react'
import type {
  ElementFrame,
  Presentation,
  PresentationImageMimeType,
  Slide,
  SlideChartElement,
  SlideElement,
  SlideImageElement,
  SlideShape,
} from '../model'
import {
  createSlideArrowElement,
  createSlideChartElement,
  createSlideShapeElement,
  createSlideTextElement,
  createSlideImageElement,
  createStableId,
  duplicateSlideElement,
} from '../presentationFactories'

interface SlideElementInspectorProps {
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
}

const IMAGE_MIME_TYPES = new Set<PresentationImageMimeType>(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])

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

export function SlideElementInspector({
  slide,
  presentation,
  selectedElementId,
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
}: SlideElementInspectorProps) {
  const imageInput = useRef<HTMLInputElement>(null)
  const imageAction = useRef<'add' | 'replace'>('add')
  const selected = slide.elements.find((element) => element.id === selectedElementId) ?? null

  const updateElement = (element: SlideElement) => onSlideChange({
    ...slide,
    elements: slide.elements.map((candidate) => candidate.id === element.id ? element : candidate),
  })
  const addElement = (element: SlideElement) => {
    onSlideChange({ ...slide, elements: [...slide.elements, element] })
    onSelect(element.id)
  }
  const removeSelected = () => {
    if (!selected) return
    onSlideChange({ ...slide, elements: slide.elements.filter((element) => element.id !== selected.id) })
    onSelect(null)
  }
  const duplicateSelected = () => {
    if (!selected) return
    addElement(duplicateSlideElement(selected))
  }
  const moveSelected = (action: 'forward' | 'backward' | 'front' | 'back') => {
    if (!selected) return
    const elements = [...slide.elements]
    const index = elements.findIndex((element) => element.id === selected.id)
    const [element] = elements.splice(index, 1)
    const target = action === 'front' ? elements.length
      : action === 'back' ? 0
        : action === 'forward' ? Math.min(elements.length, index + 1)
          : Math.max(0, index - 1)
    elements.splice(target, 0, element)
    onSlideChange({ ...slide, elements })
  }

  const pickImage = (action: 'add' | 'replace') => {
    if (onImportImage) {
      onImportImage(action)
      return
    }
    imageAction.current = action
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
    if (imageAction.current === 'replace' && selected?.type === 'image') updateElement({ ...selected, assetId: asset.id })
    else {
      const ratio = await readImageRatio(source)
      const element = createSlideImageElement(asset.id)
      const width = Math.round(ratio >= 1 ? 700 : 700 * ratio)
      const height = Math.round(ratio >= 1 ? 700 / ratio : 700)
      addElement({ ...element, frame: { ...element.frame, x: (1080 - width) / 2, y: (1920 - height) / 2, width, height } })
    }
  }

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

  return <>
    <section className="composition-controls">
      <div className="section-heading"><h3>Elements</h3><span>1080 × 1920</span></div>
      <div className="composition-add-grid">
        <button type="button" onClick={() => addElement(createSlideTextElement())}>+ Text</button>
        <button type="button" onClick={() => pickImage('add')}>+ Image</button>
        <button type="button" onClick={() => addElement(createSlideChartElement())}>+ Chart</button>
        <button type="button" onClick={() => addElement({ ...createSlideShapeElement('rectangle'), fill: presentation.theme.accent })}>+ Rectangle</button>
        <button type="button" onClick={() => addElement({ ...createSlideShapeElement('circle'), fill: presentation.theme.accent })}>+ Circle</button>
        <button type="button" onClick={() => addElement({ ...createSlideShapeElement('line'), stroke: presentation.theme.accent })}>+ Line</button>
        <button type="button" onClick={() => addElement({ ...createSlideArrowElement(), stroke: presentation.theme.accent })}>+ Arrow</button>
      </div>
      {!onImportImage && <input ref={imageInput} className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,.svg" onChange={(event) => void acceptImage(event)} />}
      <div className="composition-view-options">
        <label><input type="checkbox" checked={grid} onChange={(event) => onGridChange(event.target.checked)} /> Grid</label>
        <label><input type="checkbox" checked={guides} onChange={(event) => onGuidesChange(event.target.checked)} /> Guides</label>
        <label><input type="checkbox" checked={snap} onChange={(event) => onSnapChange(event.target.checked)} /> Snap</label>
      </div>
      <p className="composition-help">Drag to position. Resize from corners. Hold Option/Alt to disable snapping; Shift-resize an image to unlock its aspect ratio.</p>
    </section>

    <section className="composition-layers">
      <div className="section-heading"><h3>Layers</h3><span>{slide.elements.length}</span></div>
      {slide.elements.length === 0 && <p className="composition-empty">This blank slide has no elements yet.</p>}
      <div className="composition-layer-list">
        {[...slide.elements].reverse().map((element) => <div className={`composition-layer-row${element.id === selectedElementId ? ' is-selected' : ''}`} key={element.id}>
          <input className="composition-layer-select" aria-label={`Layer name for ${element.name}`} value={element.name} onFocus={() => onSelect(element.id)} onChange={(event) => updateElement({ ...element, name: event.target.value })} onBlur={() => { if (!element.name.trim()) updateElement({ ...element, name: fallbackName(element) }) }} />
          <button type="button" title={element.hidden ? 'Show layer' : 'Hide layer'} onClick={() => updateElement({ ...element, hidden: !element.hidden })}>{element.hidden ? '○' : '●'}</button>
          <button type="button" title={element.locked ? 'Unlock layer' : 'Lock layer'} onClick={() => updateElement({ ...element, locked: !element.locked })}>{element.locked ? '🔒' : '◇'}</button>
        </div>)}
      </div>
    </section>

    {selected && <section className="selected-element-controls">
      <div className="section-heading"><h3>Selected Element</h3><span>{selected.type}</span></div>
      <label className="field-row"><span>Name</span><input value={selected.name} onChange={(event) => updateElement({ ...selected, name: event.target.value })} onBlur={() => { if (!selected.name.trim()) updateElement({ ...selected, name: fallbackName(selected) }) }} /></label>
      <label className="field-row"><span>Shared ID</span><input value={selected.sharedElementId ?? ''} placeholder="Optional Morph identity" onChange={(event) => updateElement({ ...selected, sharedElementId: event.target.value.trim() || undefined })} /></label>
      <div className="composition-transform-grid">
        <Numeric label="X" value={selected.frame.x} onChange={(value) => updateFrame('x', value)} />
        <Numeric label="Y" value={selected.frame.y} onChange={(value) => updateFrame('y', value)} />
        <Numeric label="W" value={selected.frame.width} min={minimumSize(selected).width} onChange={(value) => updateFrame('width', value)} />
        <Numeric label="H" value={selected.frame.height} min={minimumSize(selected).height} onChange={(value) => updateFrame('height', value)} />
        <Numeric label="Rotation" value={selected.frame.rotation ?? 0} step={1} onChange={(value) => updateFrame('rotation', value)} />
        <Numeric label="Opacity %" value={Math.round((selected.frame.opacity ?? 1) * 100)} min={0} max={100} onChange={(value) => updateFrame('opacity', value / 100)} />
      </div>
      <div className="composition-inline-actions">
        <button type="button" onClick={() => updateElement({ ...selected, frame: { ...selected.frame, x: (1080 - selected.frame.width) / 2, y: (1920 - selected.frame.height) / 2 } })}>Center</button>
        <button type="button" onClick={() => updateElement({ ...selected, locked: !selected.locked })}>{selected.locked ? 'Unlock' : 'Lock'}</button>
        <button type="button" onClick={duplicateSelected}>Duplicate</button>
        <button type="button" onClick={removeSelected}>Delete</button>
      </div>
      <div className="composition-z-actions">
        <button type="button" onClick={() => moveSelected('forward')}>Bring Forward</button>
        <button type="button" onClick={() => moveSelected('backward')}>Send Backward</button>
        <button type="button" onClick={() => moveSelected('front')}>Bring to Front</button>
        <button type="button" onClick={() => moveSelected('back')}>Send to Back</button>
      </div>
      {(selected.frame.x + selected.frame.width < 0 || selected.frame.x > 1080 || selected.frame.y + selected.frame.height < 0 || selected.frame.y > 1920) && <p className="composition-warning">This element is completely outside the video frame.</p>}

      {selected.type === 'text' && <>
        <label className="field-row"><span>Text</span><textarea rows={4} value={selected.text} onChange={(event) => updateElement({ ...selected, text: event.target.value })} /></label>
        <label className="field-row"><span>Role</span><select value={selected.role ?? 'body'} onChange={(event) => updateElement({ ...selected, role: event.target.value as typeof selected.role })}><option value="headline">Headline</option><option value="body">Body</option><option value="caption">Caption</option><option value="label">Label</option></select></label>
        <Numeric label="Font size" value={selected.fontSize ?? (selected.role === 'headline' ? presentation.theme.defaultHeadlineStyle.fontSize : selected.role === 'caption' ? presentation.theme.defaultCaptionStyle.fontSize : selected.role === 'label' ? (presentation.theme.defaultLabelStyle ?? presentation.theme.defaultBodyStyle).fontSize : presentation.theme.defaultBodyStyle.fontSize)} min={1} max={512} onChange={(fontSize) => updateElement({ ...selected, fontSize })} />
        <Numeric label="Font weight" value={selected.fontWeight ?? 500} min={100} max={900} step={100} onChange={(fontWeight) => updateElement({ ...selected, fontWeight })} />
        <Numeric label="Line height" value={selected.lineHeight ?? 1.1} min={0.5} max={3} step={0.05} onChange={(lineHeight) => updateElement({ ...selected, lineHeight })} />
        <label className="field-row"><span>Align</span><select value={selected.textAlign ?? 'left'} onChange={(event) => updateElement({ ...selected, textAlign: event.target.value as typeof selected.textAlign })}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
      </>}
      {selected.type === 'image' && <>
        <button type="button" className="composition-replace-image" onClick={() => pickImage('replace')}>Replace Image</button>
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
    </section>}
  </>
}
