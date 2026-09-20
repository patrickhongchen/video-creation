import { useEffect, useState, type ChangeEvent } from 'react'
import type { ChartScene, Presentation, Scene, TransitionType } from '../model'
import { createStableId } from '../presentationFactories'
import { ChevronLeftIcon, ChevronRightIcon } from './Icons'

interface InspectorProps {
  scene: Scene
  onChange: (scene: Scene) => void
  presentation: Presentation
  onPresentationChange: (presentation: Presentation) => void
  onPrevious: () => void
  onNext: () => void
  hasPrevious: boolean
  hasNext: boolean
}

function Field({ label, value, onChange, multiline = false }: { label: string; value: string; onChange: (value: string) => void; multiline?: boolean }) {
  return (
    <label className="field-row">
      <span>{label}</span>
      {multiline ? (
        <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={3} />
      ) : (
        <input value={value} onChange={(event) => onChange(event.target.value)} />
      )}
    </label>
  )
}

function NumericInput({ value, label, onChange }: { value: number; label: string; onChange: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value))
  useEffect(() => setDraft(String(value)), [value])

  return <input
    aria-label={label}
    type="number"
    step="any"
    value={draft}
    onChange={(event) => {
      const nextDraft = event.target.value
      setDraft(nextDraft)
      if (nextDraft.trim() === '') return
      const nextValue = Number(nextDraft)
      if (Number.isFinite(nextValue)) onChange(nextValue)
    }}
    onBlur={() => {
      if (draft.trim() === '' || !Number.isFinite(Number(draft))) setDraft(String(value))
    }}
  />
}

function ChartEditor({ scene, onChange }: { scene: ChartScene; onChange: (scene: ChartScene) => void }) {
  const updateDatum = (index: number, update: Partial<ChartScene['data'][number]>) => {
    const data = scene.data.map((datum, datumIndex) => datumIndex === index ? { ...datum, ...update } : datum)
    onChange({ ...scene, data })
  }
  const toggleHighlight = (datumId: string, highlighted: boolean) => {
    const highlightIds = highlighted
      ? [...scene.highlightIds, datumId]
      : scene.highlightIds.filter((id) => id !== datumId)
    onChange({ ...scene, highlightIds })
  }
  const addDatum = () => {
    const ordinal = scene.data.length + 1
    onChange({ ...scene, data: [...scene.data, { id: createStableId(`datum-${ordinal}`), label: `Item ${ordinal}`, value: 0 }] })
  }
  const deleteDatum = (index: number) => {
    const datumId = scene.data[index].id
    onChange({
      ...scene,
      data: scene.data.filter((_, datumIndex) => datumIndex !== index),
      highlightIds: scene.highlightIds.filter((id) => id !== datumId),
    })
  }
  const moveDatum = (index: number, offset: -1 | 1) => {
    const target = index + offset
    if (target < 0 || target >= scene.data.length) return
    const data = [...scene.data]
    ;[data[index], data[target]] = [data[target], data[index]]
    onChange({ ...scene, data })
  }

  return <>
    <Field label="Headline" value={scene.headline} onChange={(headline) => onChange({ ...scene, headline })} multiline />
    <label className="field-row"><span>Chart type</span><select value={scene.chartType} onChange={(event) => onChange({ ...scene, chartType: event.target.value as ChartScene['chartType'] })}><option value="bar">Bar</option><option value="line">Line</option></select></label>
    {scene.chartType === 'bar' && <label className="field-row"><span>Orientation</span><select value={scene.orientation ?? 'horizontal'} onChange={(event) => onChange({ ...scene, orientation: event.target.value as ChartScene['orientation'] })}><option value="horizontal">Horizontal</option><option value="vertical">Vertical</option></select></label>}
    <Field label="Supporting" value={scene.supportingText ?? ''} onChange={(supportingText) => onChange({ ...scene, supportingText })} multiline />
    <Field label="Source" value={scene.source ?? ''} onChange={(source) => onChange({ ...scene, source })} />
    <Field label="Chart ID" value={scene.chartId ?? ''} onChange={(chartId) => onChange({ ...scene, chartId: chartId.trim() ? chartId : undefined })} />
    <div className="chart-format-row">
      <Field label="Prefix" value={scene.valuePrefix ?? ''} onChange={(valuePrefix) => onChange({ ...scene, valuePrefix })} />
      <Field label="Suffix" value={scene.valueSuffix ?? ''} onChange={(valueSuffix) => onChange({ ...scene, valueSuffix })} />
    </div>
    <label className="field-row"><span>Decimals</span><input type="number" min="0" max="6" placeholder="Auto" value={scene.decimalPlaces ?? ''} onChange={(event) => {
      if (event.target.value === '') {
        onChange({ ...scene, decimalPlaces: undefined })
        return
      }
      const decimalPlaces = Number(event.target.value)
      if (Number.isInteger(decimalPlaces) && decimalPlaces >= 0 && decimalPlaces <= 6) onChange({ ...scene, decimalPlaces })
    }} /></label>
    <label className="field-row checkbox-field"><span>Values</span><span><input type="checkbox" checked={scene.showValues} onChange={(event) => onChange({ ...scene, showValues: event.target.checked })} /> Show numeric values</span></label>

    <div className="chart-data-editor">
      <div className="section-heading"><h3>Data</h3><button type="button" onClick={addDatum}>+ Add datum</button></div>
      <div className="chart-data-head"><span>Label</span><span>Value</span><span>Highlight</span><span>Order</span></div>
      {scene.data.map((datum, index) => (
        <div className="chart-data-row" key={datum.id}>
          <input aria-label={`Label for datum ${index + 1}`} value={datum.label} onChange={(event) => updateDatum(index, { label: event.target.value })} />
          <NumericInput value={datum.value} label={`Value for ${datum.label}`} onChange={(value) => updateDatum(index, { value })} />
          <input aria-label={`Highlight ${datum.label}`} type="checkbox" checked={scene.highlightIds.includes(datum.id)} onChange={(event) => toggleHighlight(datum.id, event.target.checked)} />
          <span className="chart-data-actions">
            <button type="button" aria-label={`Move ${datum.label} up`} onClick={() => moveDatum(index, -1)} disabled={index === 0}>↑</button>
            <button type="button" aria-label={`Move ${datum.label} down`} onClick={() => moveDatum(index, 1)} disabled={index === scene.data.length - 1}>↓</button>
            <button type="button" aria-label={`Delete ${datum.label}`} onClick={() => deleteDatum(index)} disabled={scene.data.length === 1}>×</button>
          </span>
        </div>
      ))}
      <p className="chart-data-help">Datum IDs stay stable when labels, values, or order change.</p>
    </div>
  </>
}

export function Inspector({ scene, onChange, presentation, onPresentationChange, onPrevious, onNext, hasPrevious, hasNext }: InspectorProps) {
  const update = <K extends keyof Scene>(key: K, value: Scene[K]) => onChange({ ...scene, [key]: value } as Scene)
  const updateTransition = (event: ChangeEvent<HTMLSelectElement>) => onChange({ ...scene, transition: { ...scene.transition, type: event.target.value as TransitionType } })
  const updateDuration = (value: string) => {
    const duration = Number(value)
    if (Number.isFinite(duration) && duration >= 1 && duration <= 60) update('duration', duration)
  }
  const updateTransitionDuration = (value: string) => {
    const duration = Number(value)
    if (Number.isFinite(duration) && duration >= 0 && duration <= 3) onChange({ ...scene, transition: { ...scene.transition, duration } })
  }

  return (
    <aside className="inspector" aria-label="Scene properties">
      <div className="inspector-title">
        <h2>{scene.title}</h2>
        <div><button aria-label="Previous scene" onClick={onPrevious} disabled={!hasPrevious}><ChevronLeftIcon /></button><button aria-label="Next scene" onClick={onNext} disabled={!hasNext}><ChevronRightIcon /></button></div>
      </div>

      <section>
        <h3>Presentation</h3>
        <Field label="Title" value={presentation.title} onChange={(title) => onPresentationChange({ ...presentation, title })} />
        <Field label="Tagline" value={presentation.tagline} onChange={(tagline) => onPresentationChange({ ...presentation, tagline })} multiline />
        <label className="field-row"><span>Accent</span><span className="color-input"><input type="color" value={presentation.accent} onChange={(event) => onPresentationChange({ ...presentation, accent: event.target.value })} /><code>{presentation.accent}</code></span></label>
        <label className="field-row"><span>Format</span><input value="9:16 vertical" disabled /></label>
      </section>

      <section>
        <h3>Scene</h3>
        <Field label="Title" value={scene.title} onChange={(value) => update('title', value)} />
        <label className="field-row"><span>Duration</span><span className="duration-input"><input type="number" min="1" max="60" value={scene.duration} onChange={(event) => updateDuration(event.target.value)} /><small>seconds</small></span></label>
      </section>

      <section>
        <h3>Content</h3>
        <Field label="Eyebrow" value={scene.eyebrow ?? ''} onChange={(value) => update('eyebrow', value)} />
        {scene.type === 'title' && <>
          <Field label="Headline" value={scene.headline} onChange={(headline) => onChange({ ...scene, headline })} multiline />
          <Field label="Subtitle" value={scene.subtitle ?? ''} onChange={(subtitle) => onChange({ ...scene, subtitle })} multiline />
        </>}
        {scene.type === 'text' && <>
          <Field label="Headline" value={scene.headline} onChange={(headline) => onChange({ ...scene, headline })} multiline />
          <Field label="Body text" value={scene.body} onChange={(body) => onChange({ ...scene, body })} multiline />
          <Field label="Callout" value={scene.callout ?? ''} onChange={(callout) => onChange({ ...scene, callout })} />
        </>}
        {scene.type === 'big-stat' && <>
          <Field label="Main stat" value={scene.value} onChange={(value) => onChange({ ...scene, value })} />
          <Field label="Label" value={scene.label} onChange={(label) => onChange({ ...scene, label })} multiline />
          <Field label="Support" value={scene.supportingText ?? ''} onChange={(supportingText) => onChange({ ...scene, supportingText })} multiline />
        </>}
        {scene.type === 'stat-detail' && <>
          <Field label="Main stat" value={scene.value} onChange={(value) => onChange({ ...scene, value })} />
          <Field label="Stat label" value={scene.label} onChange={(label) => onChange({ ...scene, label })} />
          <Field label="Headline" value={scene.headline} onChange={(headline) => onChange({ ...scene, headline })} multiline />
          <Field label="Body text" value={scene.body} onChange={(body) => onChange({ ...scene, body })} multiline />
        </>}
        {scene.type === 'comparison' && <>
          <Field label="Headline" value={scene.headline} onChange={(headline) => onChange({ ...scene, headline })} multiline />
          <Field label="Left value" value={scene.left.value} onChange={(value) => onChange({ ...scene, left: { ...scene.left, value } })} />
          <Field label="Left label" value={scene.left.label} onChange={(label) => onChange({ ...scene, left: { ...scene.left, label } })} />
          <Field label="Right value" value={scene.right.value} onChange={(value) => onChange({ ...scene, right: { ...scene.right, value } })} />
          <Field label="Right label" value={scene.right.label} onChange={(label) => onChange({ ...scene, right: { ...scene.right, label } })} />
        </>}
        {scene.type === 'chart' && <ChartEditor scene={scene} onChange={onChange} />}
      </section>

      <section>
        <div className="section-heading"><h3>Transition</h3><span>Duration</span></div>
        <div className="transition-row">
          <select value={scene.transition.type} onChange={updateTransition} aria-label="Transition style">
            <option value="fade">Fade</option><option value="slide">Slide</option><option value="scale">Scale</option>
          </select>
          <span className="duration-input"><input aria-label="Transition duration" type="number" min="0" max="3" step="0.05" value={scene.transition.duration} onChange={(event) => updateTransitionDuration(event.target.value)} /><small>seconds</small></span>
        </div>
      </section>

      <section className="notes-section">
        <h3>Speaker notes</h3>
        <textarea aria-label="Speaker notes" value={scene.notes ?? ''} onChange={(event) => update('notes', event.target.value)} rows={6} maxLength={500} />
        <small>{(scene.notes ?? '').length} / 500</small>
      </section>
    </aside>
  )
}
