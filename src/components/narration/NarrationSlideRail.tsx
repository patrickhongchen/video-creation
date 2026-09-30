import type { RefObject } from 'react'
import type { NarrationSection, Presentation } from '../../model'
import { NarrationSlideThumbnail } from '../NarrationSlideThumbnail'

interface NarrationSlideRailProps {
  presentation: Presentation
  sections: NarrationSection[]
  orphanSections: NarrationSection[]
  mode: 'setup' | 'recording'
  currentSlideIndex: number
  activeSlideCardRef: RefObject<HTMLDivElement | null>
  onSelectSlide: (index: number) => void
  onAddSectionStart: (index: number) => void
  onRemoveSectionStart: (sectionId: string) => void
  onRemoveOrphanSection: (sectionId: string) => void
}

export function NarrationSlideRail({
  presentation,
  sections,
  orphanSections,
  mode,
  currentSlideIndex,
  activeSlideCardRef,
  onSelectSlide,
  onAddSectionStart,
  onRemoveSectionStart,
  onRemoveOrphanSection,
}: NarrationSlideRailProps) {
  return (
    <aside className="narration-slide-rail" aria-label="Presentation slides and section starts">
      <div className="narration-rail-heading"><h2>Slides</h2><span>{currentSlideIndex + 1} / {presentation.slides.length}</span></div>
      {mode === 'setup' && <p>Mark a slide to start the next section.</p>}
      <div className="narration-rail-scroll">{presentation.slides.map((slide, index) => {
        const owner = sections.find((section) => section.slideIds.includes(slide.id))
        const isStart = owner?.slideIds[0] === slide.id
        const sectionIndex = owner ? sections.findIndex((section) => section.id === owner.id) : -1
        const isCurrent = index === currentSlideIndex
        const slideCard = <><NarrationSlideThumbnail presentation={presentation} slide={slide} index={index} /><span><small>Slide {index + 1}</small><strong>{slide.title || `Slide ${index + 1}`}</strong></span></>
        return <div className="narration-rail-entry" key={slide.id} ref={isCurrent ? activeSlideCardRef : undefined}>
          {isStart && owner && <div className="narration-rail-boundary"><span>{owner.title === `Section ${sectionIndex + 1}` ? owner.title : `Section ${sectionIndex + 1} · ${owner.title}`}</span>{mode === 'setup' && index > 0 && <button aria-label={`Remove section start before Slide ${index + 1}`} title="Merge into previous section" onClick={() => onRemoveSectionStart(owner.id)}>×</button>}</div>}
          {!isStart && index > 0 && mode === 'setup' && <button className="narration-add-boundary" onClick={() => onAddSectionStart(index)} aria-label={`Start a new section at Slide ${index + 1}`}>+ Start section here</button>}
          {mode === 'setup' ? <button className={`narration-rail-slide${isCurrent ? ' is-current' : ''}`} onClick={() => onSelectSlide(index)} aria-current={isCurrent ? 'step' : undefined}>{slideCard}</button> : <div className={`narration-rail-slide${isCurrent ? ' is-current' : ''}`} aria-current={isCurrent ? 'step' : undefined}>{slideCard}</div>}
        </div>
      })}
        {orphanSections.length > 0 && <div className="narration-rail-orphans"><strong>Sections needing repair</strong>{orphanSections.map((section) => <div key={section.id}><span>{section.title}</span>{mode === 'setup' && <button onClick={() => onRemoveOrphanSection(section.id)}>Remove</button>}</div>)}</div>}
      </div>
    </aside>
  )
}
