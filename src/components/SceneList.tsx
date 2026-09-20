import type { Presentation } from '../model'
import { ArrowLeftIcon, ArrowRightIcon } from './Icons'
import { SceneThumbnail } from './SceneThumbnail'

interface SceneListProps {
  presentation: Presentation
  selectedIndex: number
  onSelect: (index: number) => void
  onPrevious: () => void
  onNext: () => void
}

export function SceneList({ presentation, selectedIndex, onSelect, onPrevious, onNext }: SceneListProps) {
  return (
    <aside className="scene-sidebar" aria-label="Scenes">
      <div className="panel-heading"><h2>Scenes</h2><span>{selectedIndex + 1} / {presentation.scenes.length}</span></div>
      <div className="scene-list">
        {presentation.scenes.map((scene, index) => (
          <button
            key={scene.id}
            className={`scene-row${index === selectedIndex ? ' selected' : ''}`}
            onClick={() => onSelect(index)}
            aria-current={index === selectedIndex ? 'true' : undefined}
          >
            <span className="scene-number">{index + 1}</span>
            <SceneThumbnail scene={scene} accent={presentation.accent} />
            <span className="scene-row-copy"><b>{scene.title}</b><small>{scene.duration}s</small></span>
          </button>
        ))}
      </div>
      <div className="scene-nav">
        <button onClick={onPrevious} disabled={selectedIndex === 0}><ArrowLeftIcon /> Previous</button>
        <button onClick={onNext} disabled={selectedIndex === presentation.scenes.length - 1}>Next <ArrowRightIcon /></button>
      </div>
    </aside>
  )
}
