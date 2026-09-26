import { type ChangeEvent } from 'react'
import type { Presentation, Slide, TransitionType } from '../model'
import { ChevronLeftIcon, ChevronRightIcon } from './Icons'
import { SlideElementInspector } from './CompositionInspector'

interface InspectorProps {
  slide: Slide
  onChange: (slide: Slide) => void
  presentation: Presentation
  onPresentationChange: (presentation: Presentation) => void
  onPrevious: () => void
  onNext: () => void
  hasPrevious: boolean
  hasNext: boolean
  selectedElementId: string | null
  compositionGrid: boolean
  compositionGuides: boolean
  compositionSnap: boolean
  onSelectElement: (elementId: string | null) => void
  onCompositionGridChange: (value: boolean) => void
  onCompositionGuidesChange: (value: boolean) => void
  onCompositionSnapChange: (value: boolean) => void
  onImportImage?: (action: 'add' | 'replace') => void
  isPreviewing: boolean
  onPreviewSlide: () => void
  onStopPreview: () => void
  previewAvailable: boolean
}

function Field({ label, value, onChange, multiline = false }: { label: string; value: string; onChange: (value: string) => void; multiline?: boolean }) {
  return <label className="field-row"><span>{label}</span>{multiline
    ? <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={3} />
    : <input value={value} onChange={(event) => onChange(event.target.value)} />}</label>
}

export function Inspector({ slide, onChange, presentation, onPresentationChange, onPrevious, onNext, hasPrevious, hasNext, selectedElementId, compositionGrid, compositionGuides, compositionSnap, onSelectElement, onCompositionGridChange, onCompositionGuidesChange, onCompositionSnapChange, onImportImage, isPreviewing, onPreviewSlide, onStopPreview, previewAvailable }: InspectorProps) {
  const update = <K extends keyof Slide>(key: K, value: Slide[K]) => onChange({ ...slide, [key]: value })
  const updateTransition = (event: ChangeEvent<HTMLSelectElement>) => onChange({ ...slide, transition: { ...slide.transition, type: event.target.value as TransitionType } })
  const updateDuration = (value: string) => {
    const duration = Number(value)
    if (Number.isFinite(duration) && duration >= 1 && duration <= 60) update('duration', duration)
  }

  return <aside className="inspector" aria-label="Slide properties">
    <div className="inspector-title">
      <h2>{slide.title}</h2>
      <div><button aria-label="Previous slide" onClick={onPrevious} disabled={!hasPrevious}><ChevronLeftIcon /></button><button aria-label="Next slide" onClick={onNext} disabled={!hasNext}><ChevronRightIcon /></button></div>
    </div>

    <section>
      <h3>Presentation</h3>
      <Field label="Title" value={presentation.title} onChange={(title) => onPresentationChange({ ...presentation, title })} />
      <Field label="Tagline" value={presentation.tagline} onChange={(tagline) => onPresentationChange({ ...presentation, tagline })} multiline />
      <label className="field-row"><span>Theme</span><input value={presentation.theme.id === 'editorial' ? 'Editorial' : presentation.theme.id} disabled /></label>
      <label className="field-row"><span>Accent</span><span className="color-input"><input type="color" value={presentation.theme.accent} onChange={(event) => onPresentationChange({ ...presentation, theme: { ...presentation.theme, accent: event.target.value } })} /><code>{presentation.theme.accent}</code></span></label>
      <label className="field-row"><span>Format</span><input value="9:16 · 1080 × 1920" disabled /></label>
    </section>

    <section>
      <h3>Slide</h3>
      <Field label="Name" value={slide.title} onChange={(value) => update('title', value)} />
      <label className="field-row"><span>Duration</span><span className="duration-input"><input type="number" min="1" max="60" value={slide.duration} onChange={(event) => updateDuration(event.target.value)} /><small>seconds</small></span></label>
      <label className="field-row"><span>Background</span><select value={slide.background ?? 'presentation'} onChange={(event) => update('background', event.target.value as Slide['background'])}><option value="presentation">Theme</option><option value="light">Light</option><option value="dark">Dark</option><option value="accent">Accent</option></select></label>
    </section>

    <SlideElementInspector
      slide={slide}
      presentation={presentation}
      selectedElementId={selectedElementId}
      grid={compositionGrid}
      guides={compositionGuides}
      snap={compositionSnap}
      onGridChange={onCompositionGridChange}
      onGuidesChange={onCompositionGuidesChange}
      onSnapChange={onCompositionSnapChange}
      onSelect={onSelectElement}
      onSlideChange={onChange}
      onPresentationChange={onPresentationChange}
      onImportImage={onImportImage}
      isPreviewing={isPreviewing}
      onPreviewSlide={onPreviewSlide}
      onStopPreview={onStopPreview}
      previewAvailable={previewAvailable}
    />

    <section>
      <div className="section-heading"><h3>Transition</h3><span>Duration</span></div>
      <div className="transition-row">
        <select value={slide.transition.type} onChange={updateTransition} aria-label="Transition style"><option value="fade">Fade</option><option value="slide">Slide</option><option value="scale">Scale</option></select>
        <span className="duration-input"><input aria-label="Transition duration" type="number" min="0" max="3" step="0.05" value={slide.transition.duration} onChange={(event) => {
          const duration = Number(event.target.value)
          if (Number.isFinite(duration) && duration >= 0 && duration <= 3) onChange({ ...slide, transition: { ...slide.transition, duration } })
        }} /><small>seconds</small></span>
      </div>
    </section>

    <section className="notes-section">
      <h3>Slide notes</h3>
      <textarea aria-label="Slide notes" value={slide.notes ?? ''} onChange={(event) => update('notes', event.target.value)} rows={6} maxLength={500} />
      <small>{(slide.notes ?? '').length} / 500</small>
    </section>
  </aside>
}
