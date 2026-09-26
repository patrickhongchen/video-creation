import { useEffect, useState, type ChangeEvent } from 'react'
import type { Presentation, Slide, TransitionType } from '../model'
import { ChevronLeftIcon, ChevronRightIcon } from './Icons'
import { AnimationInspector, ElementInspector, LayersPanel } from './CompositionInspector'

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
  onSelectElement: (elementId: string | null) => void
  onImportImage?: (action: 'add' | 'replace') => void
  isPreviewing: boolean
  onPreviewSlide: () => void
  onStopPreview: () => void
  previewAvailable: boolean
  revealCount: number
  revealedCount: number
  onNextReveal: () => void
}

type InspectorTab = 'slide' | 'element' | 'animate' | 'layers'

function SlideInspector({ slide, onChange }: Pick<InspectorProps, 'slide' | 'onChange'>) {
  const update = <K extends keyof Slide>(key: K, value: Slide[K]) => onChange({ ...slide, [key]: value })
  const updateTransition = (event: ChangeEvent<HTMLSelectElement>) => onChange({ ...slide, transition: { ...slide.transition, type: event.target.value as TransitionType } })
  const updateDuration = (value: string) => {
    const duration = Number(value)
    if (Number.isFinite(duration) && duration >= 1 && duration <= 60) update('duration', duration)
  }

  return <div className="inspector-tab-content">
    <section>
      <h3>Slide settings</h3>
      <label className="field-row"><span>Transition</span><select value={slide.transition.type} onChange={updateTransition} aria-label="Transition style"><option value="fade">Fade</option><option value="slide">Slide</option><option value="scale">Scale</option></select></label>
      <label className="field-row"><span>Background</span><select value={slide.background ?? 'presentation'} onChange={(event) => update('background', event.target.value as Slide['background'])}><option value="presentation">Theme</option><option value="light">Light</option><option value="dark">Dark</option><option value="accent">Accent</option></select></label>
    </section>
    <section className="notes-section">
      <h3>Slide notes</h3>
      <textarea aria-label="Slide notes" value={slide.notes ?? ''} onChange={(event) => update('notes', event.target.value)} rows={6} maxLength={500} />
      <small>{(slide.notes ?? '').length} / 500</small>
    </section>
    <details className="inspector-disclosure">
      <summary>Advanced</summary>
      <div className="inspector-disclosure-content">
        <label className="field-row"><span>Slide name</span><input value={slide.title} onChange={(event) => update('title', event.target.value)} /></label>
        <label className="field-row"><span>Silent slide hold</span><span className="duration-input"><input aria-label="Silent slide hold" type="number" min="1" max="60" value={slide.duration} onChange={(event) => updateDuration(event.target.value)} /><small>seconds</small></span></label>
        <label className="field-row"><span>Transition duration</span><span className="duration-input"><input aria-label="Transition duration" type="number" min="0" max="3" step="0.05" value={slide.transition.duration} onChange={(event) => {
          const duration = Number(event.target.value)
          if (Number.isFinite(duration) && duration >= 0 && duration <= 3) onChange({ ...slide, transition: { ...slide.transition, duration } })
        }} /><small>seconds</small></span></label>
      </div>
    </details>
  </div>
}

export function Inspector({ slide, onChange, presentation, onPresentationChange, onPrevious, onNext, hasPrevious, hasNext, selectedElementId, onSelectElement, onImportImage, isPreviewing, onPreviewSlide, onStopPreview, previewAvailable, revealCount, revealedCount, onNextReveal }: InspectorProps) {
  const [activeTab, setActiveTab] = useState<InspectorTab>('slide')
  useEffect(() => {
    if (selectedElementId) setActiveTab((current) => current === 'slide' ? 'element' : current)
  }, [selectedElementId])

  const editorProps = {
    slide, presentation, selectedElementId, onSelect: onSelectElement,
    onSlideChange: onChange, onPresentationChange, onImportImage,
    isPreviewing, onPreviewSlide, onStopPreview, previewAvailable,
    revealCount, revealedCount, onNextReveal,
  }

  return <aside className="inspector" aria-label="Editor inspector">
    <div className="inspector-title">
      <h2>{slide.title}</h2>
      <div><button aria-label="Previous slide" onClick={onPrevious} disabled={!hasPrevious}><ChevronLeftIcon /></button><button aria-label="Next slide" onClick={onNext} disabled={!hasNext}><ChevronRightIcon /></button></div>
    </div>
    <div className="inspector-tabs" role="tablist" aria-label="Editor properties">
      {(['slide', 'element', 'animate', 'layers'] as const).map((tab) => <button key={tab} type="button" id={`inspector-tab-${tab}`} role="tab" aria-selected={activeTab === tab} aria-controls={`inspector-panel-${tab}`} className={activeTab === tab ? 'is-active' : ''} onClick={() => setActiveTab(tab)}>{tab[0].toUpperCase() + tab.slice(1)}</button>)}
    </div>
    <div id={`inspector-panel-${activeTab}`} className="inspector-panel" role="tabpanel" aria-labelledby={`inspector-tab-${activeTab}`}>
      {activeTab === 'slide' && <SlideInspector slide={slide} onChange={onChange} />}
      {activeTab === 'element' && <ElementInspector {...editorProps} />}
      {activeTab === 'animate' && <AnimationInspector {...editorProps} />}
      {activeTab === 'layers' && <LayersPanel {...editorProps} />}
    </div>
  </aside>
}
