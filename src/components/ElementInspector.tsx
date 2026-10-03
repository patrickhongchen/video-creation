import { useRef, type ChangeEvent } from 'react'
import { normalizedRotation } from '../elementRotation'
import type { ElementFrame, SlideChartElement, SlideElement, SlideImageElement, SlideShape, SlideVideoElement } from '../model'
import { imageMimeType, readImageFile } from '../imageUtils'
import { createStableId, duplicateSlideElement } from '../presentationFactories'
import { alignSelection, deleteSelection, distributeSelection, duplicateSelection, type DistributionAxis, type SelectionAlignment } from '../editor/selectionLayout'
import type { CompositionEditorProps } from './CompositionInspector'

type ElementInspectorProps = Pick<CompositionEditorProps, 'slide' | 'presentation' | 'selectedElementIds' | 'selectedElementId' | 'onSelect' | 'onSelectionChange' | 'onSlideChange' | 'onPresentationChange' | 'onImportImage'>

function Numeric({ label, displayLabel = label, value, onChange, min, max, step = 1 }: {
  label: string
  displayLabel?: string
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
}) {
  return <label className="composition-number-field"><span>{displayLabel}</span><input type="number" aria-label={label} value={Number.isFinite(value) ? value : 0} min={min} max={max} step={step} onChange={(event) => {
    const next = Number(event.target.value)
    if (Number.isFinite(next)) onChange(next)
  }} /></label>
}

function minimumSize(element: SlideElement) {
  if (element.type === 'chart') return { width: 280, height: 220 }
  if (element.type === 'text') return { width: 120, height: 80 }
  if (element.type === 'image') return { width: 80, height: 80 }
  if (element.type === 'video') return { width: 120, height: 80 }
  if (element.type === 'arrow') return { width: 80, height: 30 }
  return element.shape === 'line' ? { width: 60, height: 20 } : { width: 40, height: 40 }
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
    <label className="field-row"><span>Chart type</span><select value={element.chartType} onChange={(event) => update({ ...element, chartType: event.target.value as SlideChartElement['chartType'], name: element.name === 'Bar Chart' || element.name === 'Line Chart' ? (event.target.value === 'bar' ? 'Bar Chart' : 'Line Chart') : element.name })}><option value="bar">Bar</option><option value="line">Line</option></select></label>
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

export function ElementInspector({
  slide,
  presentation,
  selectedElementIds,
  selectedElementId,
  onSelect,
  onSelectionChange,
  onSlideChange,
  onPresentationChange,
  onImportImage,
}: ElementInspectorProps) {
  const imageInput = useRef<HTMLInputElement>(null)
  const selectedElements = slide.elements.filter((element) => selectedElementIds.includes(element.id))
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
    if (!selected || selected.locked) return
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
    const source = (await readImageFile(file)).replace(/^data:[^;,]*/i, `data:${mimeType}`)
    const asset = { id: createStableId(file.name.replace(/\.[^.]+$/, '') || 'image'), name: file.name, mimeType, source }
    onPresentationChange({ ...presentation, imageAssets: [...(presentation.imageAssets ?? []), asset] })
    updateElement({ ...selected, assetId: asset.id })
  }

  if (selectedElements.length > 1) {
    const movableCount = selectedElements.filter((element) => !element.locked).length
    const applyLayout = (alignment: SelectionAlignment) => onSlideChange({ ...slide, elements: alignSelection(slide.elements, selectedElementIds, alignment) })
    const distribute = (axis: DistributionAxis) => onSlideChange({ ...slide, elements: distributeSelection(slide.elements, selectedElementIds, axis) })
    const duplicate = () => {
      const result = duplicateSelection(slide.elements, selectedElementIds)
      onSlideChange({ ...slide, elements: result.elements })
      onSelectionChange(result.selectedIds)
    }
    const remove = () => {
      const elements = deleteSelection(slide.elements, selectedElementIds)
      onSlideChange({ ...slide, elements })
      const remainingIds = selectedElements.filter((element) => element.locked).map((element) => element.id)
      onSelectionChange(remainingIds)
    }
    return <section className="selected-element-controls multi-selection-controls">
      <div className="section-heading"><h3>{selectedElements.length} elements selected</h3><span>{movableCount} editable</span></div>
      {movableCount < selectedElements.length && <p className="composition-help">Locked elements stay selected but are excluded from layout changes and deletion.</p>}
      <section className="element-property-section">
        <h4>Align</h4>
        <div className="multi-selection-action-grid">
          <button type="button" disabled={movableCount < 2} onClick={() => applyLayout('left')}>Left</button>
          <button type="button" disabled={movableCount < 2} onClick={() => applyLayout('center')}>Center</button>
          <button type="button" disabled={movableCount < 2} onClick={() => applyLayout('right')}>Right</button>
          <button type="button" disabled={movableCount < 2} onClick={() => applyLayout('top')}>Top</button>
          <button type="button" disabled={movableCount < 2} onClick={() => applyLayout('middle')}>Middle</button>
          <button type="button" disabled={movableCount < 2} onClick={() => applyLayout('bottom')}>Bottom</button>
        </div>
      </section>
      <section className="element-property-section">
        <h4>Distribute</h4>
        <div className="multi-selection-distribute-grid">
          <button type="button" disabled={movableCount < 3} onClick={() => distribute('horizontal')}>Horizontal</button>
          <button type="button" disabled={movableCount < 3} onClick={() => distribute('vertical')}>Vertical</button>
        </div>
      </section>
      <div className="composition-inline-actions multi-selection-footer">
        <button type="button" onClick={duplicate}>Duplicate</button>
        <button type="button" disabled={movableCount === 0} onClick={remove}>Delete</button>
      </div>
    </section>
  }

  if (!selected) return <section className="selected-element-controls"><div className="section-heading"><h3>Element</h3></div><p className="composition-empty">Select an element on the canvas or in Layers to edit it.</p></section>

  return <section className="selected-element-controls">
    <div className="section-heading"><h3>Element</h3><span>{selected.type}</span></div>
    <label className="field-row element-name-field"><span>Name</span><input aria-label="Element name" value={selected.name} onChange={(event) => updateElement({ ...selected, name: event.target.value })} onBlur={() => {
      if (!selected.name.trim()) updateElement({ ...selected, name: selected.type === 'chart' ? (selected.chartType === 'bar' ? 'Bar Chart' : 'Line Chart') : selected.type === 'shape' ? selected.shape[0].toUpperCase() + selected.shape.slice(1) : selected.type[0].toUpperCase() + selected.type.slice(1) })
    }} /></label>
    <div className="composition-inline-actions">
      <button type="button" onClick={() => updateElement({ ...selected, locked: !selected.locked })}>{selected.locked ? 'Unlock' : 'Lock'}</button>
      <button type="button" onClick={duplicateSelected}>Duplicate</button>
      <button type="button" disabled={selected.locked} title={selected.locked ? 'Unlock this element before deleting it' : undefined} onClick={removeSelected}>Delete</button>
    </div>
    <section className="element-property-section">
      <h4>{selected.type === 'text' ? 'Text' : selected.type === 'chart' ? 'Chart' : selected.type === 'image' ? 'Image' : selected.type === 'video' ? 'Video' : selected.type === 'shape' ? 'Shape' : 'Arrow'}</h4>
      <div className="composition-type-controls element-property-grid">
        {selected.type === 'text' && <>
          <label className="field-row element-wide-field"><span>Content</span><textarea rows={3} value={selected.text} onChange={(event) => updateElement({ ...selected, text: event.target.value })} /></label>
          <Numeric label="Font size" value={selected.fontSize ?? (selected.role === 'headline' ? presentation.theme.defaultHeadlineStyle.fontSize : selected.role === 'caption' ? presentation.theme.defaultCaptionStyle.fontSize : selected.role === 'label' ? (presentation.theme.defaultLabelStyle ?? presentation.theme.defaultBodyStyle).fontSize : presentation.theme.defaultBodyStyle.fontSize)} min={1} max={512} onChange={(fontSize) => updateElement({ ...selected, fontSize })} />
          <Numeric label="Font weight" displayLabel="Weight" value={selected.fontWeight ?? 500} min={100} max={900} step={100} onChange={(fontWeight) => updateElement({ ...selected, fontWeight })} />
          <label className="field-row"><span>Align</span><select value={selected.textAlign ?? 'left'} onChange={(event) => updateElement({ ...selected, textAlign: event.target.value as typeof selected.textAlign })}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
        </>}
        {selected.type === 'image' && <>
          <button type="button" className="composition-replace-image" onClick={pickReplacement}>Replace Image</button>
          {!onImportImage && <input ref={imageInput} className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,.svg" onChange={(event) => void acceptReplacement(event)} />}
          <label className="field-row"><span>Fit</span><select value={selected.fit} onChange={(event) => updateElement({ ...selected, fit: event.target.value as SlideImageElement['fit'] })}><option value="contain">Contain</option><option value="cover">Cover</option></select></label>
          <label className="field-row"><span>Position</span><select value={selected.position ?? 'center'} onChange={(event) => updateElement({ ...selected, position: event.target.value as SlideImageElement['position'] })}>{['center', 'top', 'bottom', 'left', 'right', 'top-left', 'top-right', 'bottom-left', 'bottom-right'].map((position) => <option key={position} value={position}>{position}</option>)}</select></label>
          <div className="composition-view-options"><label><input type="checkbox" checked={selected.flipX ?? false} onChange={(event) => updateElement({ ...selected, flipX: event.target.checked })} /> Flip horizontal</label><label><input type="checkbox" checked={selected.flipY ?? false} onChange={(event) => updateElement({ ...selected, flipY: event.target.checked })} /> Flip vertical</label></div>
        </>}
        {selected.type === 'video' && <>
          <label className="field-row"><span>Fit</span><select value={selected.fit} onChange={(event) => updateElement({ ...selected, fit: event.target.value as SlideVideoElement['fit'] })}><option value="contain">Contain</option><option value="cover">Cover</option></select></label>
          <p className="composition-help element-wide-field">Video audio is ignored. Use Narrate to record your voice and pointer.</p>
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
    </section>

    {(selected.frame.x + selected.frame.width < 0 || selected.frame.x > 1080 || selected.frame.y + selected.frame.height < 0 || selected.frame.y > 1920) && <p className="composition-warning">This element is completely outside the video frame.</p>}

    <section className="element-property-section">
      <h4>Position &amp; Size</h4>
      <div className="composition-transform-grid">
        <Numeric label="X" value={selected.frame.x} onChange={(value) => updateFrame('x', value)} />
        <Numeric label="Y" value={selected.frame.y} onChange={(value) => updateFrame('y', value)} />
        <Numeric label="W" value={selected.frame.width} min={minimumSize(selected).width} onChange={(value) => updateFrame('width', value)} />
        <Numeric label="H" value={selected.frame.height} min={minimumSize(selected).height} onChange={(value) => updateFrame('height', value)} />
        <Numeric label="Rotation" value={selected.frame.rotation ?? 0} step={1} onChange={(value) => updateFrame('rotation', value)} />
      </div>
    </section>

    <section className="element-property-section">
      <h4>Appearance</h4>
      <div className="element-property-grid">
        <Numeric label="Opacity %" value={Math.round((selected.frame.opacity ?? 1) * 100)} min={0} max={100} onChange={(value) => updateFrame('opacity', value / 100)} />
        {selected.type === 'text' && <>
          <Numeric label="Line height" value={selected.lineHeight ?? 1.1} min={0.5} max={3} step={0.05} onChange={(lineHeight) => updateElement({ ...selected, lineHeight })} />
        </>}
      </div>
    </section>

    <section className="element-property-section">
      <h4>Morph</h4>
      <label className="field-row"><span>Shared ID</span><input value={selected.sharedElementId ?? ''} placeholder="Optional Morph identity" onChange={(event) => updateElement({ ...selected, sharedElementId: event.target.value.trim() || undefined })} /></label>
    </section>
  </section>
}
