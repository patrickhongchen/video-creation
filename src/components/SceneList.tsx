import type { Presentation } from '../model'
import { sceneTypeOptions, type SceneType } from '../presentationFactories'
import { ArrowLeftIcon, ArrowRightIcon } from './Icons'
import { SceneThumbnail } from './SceneThumbnail'

interface SceneListProps {
  presentation: Presentation
  selectedIndex: number
  onSelect: (index: number) => void
  onPrevious: () => void
  onNext: () => void
  onAdd: (type: SceneType) => void
  onDuplicate: () => void
  onDelete: () => void
  onMove: (offset: -1 | 1) => void
}

export function SceneList({ presentation, selectedIndex, onSelect, onPrevious, onNext, onAdd, onDuplicate, onDelete, onMove }: SceneListProps) {
  return (
    <aside className="scene-sidebar" aria-label="Scenes">
      <div className="panel-heading"><h2>Scenes</h2><span>{selectedIndex + 1} / {presentation.scenes.length}</span></div>
      <div className="scene-list">
        {presentation.scenes.map((scene, index) => (
          <div className={`scene-item${index === selectedIndex ? ' selected' : ''}`} key={scene.id}>
            <button className="scene-row" onClick={() => onSelect(index)} aria-current={index === selectedIndex ? 'true' : undefined}>
              <span className="scene-number">{index + 1}</span>
              <SceneThumbnail scene={scene} accent={presentation.accent} />
              <span className="scene-row-copy"><b>{scene.title}</b><small>{scene.duration}s</small></span>
            </button>
            {index === selectedIndex && (
              <div className="scene-actions" aria-label="Selected scene actions">
                <button onClick={() => onMove(-1)} disabled={index === 0} title="Move scene earlier">↑</button>
                <button onClick={() => onMove(1)} disabled={index === presentation.scenes.length - 1} title="Move scene later">↓</button>
                <button onClick={onDuplicate}>Duplicate</button>
                <button onClick={onDelete} disabled={presentation.scenes.length === 1}>Delete</button>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="scene-sidebar-footer">
        <details className="add-scene-menu">
          <summary>+ Add Scene</summary>
          <div>
            {sceneTypeOptions.map(({ type, label }) => <button key={type} onClick={(event) => { onAdd(type); event.currentTarget.closest('details')?.removeAttribute('open') }}>{label}</button>)}
          </div>
        </details>
        <div className="scene-nav">
          <button onClick={onPrevious} disabled={selectedIndex === 0}><ArrowLeftIcon /> Previous</button>
          <button onClick={onNext} disabled={selectedIndex === presentation.scenes.length - 1}>Next <ArrowRightIcon /></button>
        </div>
      </div>
    </aside>
  )
}
