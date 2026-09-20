import type { ChangeEvent } from 'react'
import type { Presentation, Scene, TransitionType } from '../model'
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
