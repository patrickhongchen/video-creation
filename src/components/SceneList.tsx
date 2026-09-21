import type { Presentation } from '../model'
import { slidePresetOptions, type SlidePreset } from '../presentationFactories'
import { ArrowLeftIcon, ArrowRightIcon } from './Icons'
import { SlideThumbnail } from './SceneThumbnail'

interface SlideListProps {
  presentation: Presentation
  selectedIndex: number
  onSelect: (index: number) => void
  onPrevious: () => void
  onNext: () => void
  onAdd: (preset: SlidePreset) => void
  onDuplicate: () => void
  onDelete: () => void
  onMove: (offset: -1 | 1) => void
}

export function SlideList({ presentation, selectedIndex, onSelect, onPrevious, onNext, onAdd, onDuplicate, onDelete, onMove }: SlideListProps) {
  return (
    <aside className="scene-sidebar" aria-label="Slides">
      <div className="panel-heading"><h2>Slides</h2><span>{selectedIndex + 1} / {presentation.slides.length}</span></div>
      <div className="scene-list">
        {presentation.slides.map((slide, index) => (
          <div className={`scene-item${index === selectedIndex ? ' selected' : ''}`} key={slide.id}>
            <button className="scene-row" onClick={() => onSelect(index)} aria-current={index === selectedIndex ? 'true' : undefined}>
              <span className="scene-number">{index + 1}</span>
              <SlideThumbnail
                slide={slide}
                theme={presentation.theme}
                imageAssets={presentation.imageAssets}
                layoutNamespace={`thumbnail-${presentation.id}-${slide.id}`}
              />
              <span className="scene-row-copy"><b>{slide.title}</b><small>{slide.duration}s</small></span>
            </button>
            {index === selectedIndex && (
              <div className="scene-actions" aria-label="Selected slide actions">
                <button onClick={() => onMove(-1)} disabled={index === 0} title="Move slide earlier">↑</button>
                <button onClick={() => onMove(1)} disabled={index === presentation.slides.length - 1} title="Move slide later">↓</button>
                <button onClick={onDuplicate}>Duplicate</button>
                <button onClick={onDelete} disabled={presentation.slides.length === 1}>Delete</button>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="scene-sidebar-footer">
        <details className="add-scene-menu">
          <summary>+ New Slide</summary>
          <div>
            {slidePresetOptions.map(({ preset, label }) => <button key={preset} onClick={(event) => { onAdd(preset); event.currentTarget.closest('details')?.removeAttribute('open') }}>{label}</button>)}
          </div>
        </details>
        <div className="scene-nav">
          <button onClick={onPrevious} disabled={selectedIndex === 0}><ArrowLeftIcon /> Previous</button>
          <button onClick={onNext} disabled={selectedIndex === presentation.slides.length - 1}>Next <ArrowRightIcon /></button>
        </div>
      </div>
    </aside>
  )
}
