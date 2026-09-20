import { useCallback, useEffect, useState } from 'react'
import { demoPresentation } from './demoPresentation'
import type { Presentation, Scene } from './model'
import { Stage } from './components/Stage'
import { SceneList } from './components/SceneList'
import { Inspector } from './components/Inspector'
import { CheckIcon, CloseIcon, PlayIcon, UndoIcon } from './components/Icons'

const STORAGE_KEY = 'video-essay-studio:presentation:v1'

function loadPresentation(): Presentation {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved ? JSON.parse(saved) as Presentation : demoPresentation
  } catch {
    return demoPresentation
  }
}

export function App() {
  const [presentation, setPresentation] = useState<Presentation>(loadPresentation)
  const [selectedIndex, setSelectedIndex] = useState(2)
  const [direction, setDirection] = useState<1 | -1>(1)
  const [isPresenting, setIsPresenting] = useState(false)
  const [saveTime, setSaveTime] = useState('')

  const selectedScene = presentation.scenes[selectedIndex]
  const selectScene = useCallback((next: number) => {
    const safeIndex = Math.max(0, Math.min(next, presentation.scenes.length - 1))
    setDirection(safeIndex >= selectedIndex ? 1 : -1)
    setSelectedIndex(safeIndex)
  }, [presentation.scenes.length, selectedIndex])

  const previous = useCallback(() => selectScene(selectedIndex - 1), [selectScene, selectedIndex])
  const next = useCallback(() => selectScene(selectedIndex + 1), [selectScene, selectedIndex])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presentation))
    setSaveTime(new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date()))
  }, [presentation])

  useEffect(() => {
    if (!isPresenting) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight' || event.key === ' ') { event.preventDefault(); next() }
      if (event.key === 'ArrowLeft') { event.preventDefault(); previous() }
      if (event.key === 'Escape') setIsPresenting(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isPresenting, next, previous])

  const updateScene = (scene: Scene) => {
    setPresentation((current) => ({ ...current, scenes: current.scenes.map((item, index) => index === selectedIndex ? scene : item) }))
  }

  const resetDemo = () => {
    setPresentation(demoPresentation)
    setSelectedIndex(2)
    setDirection(-1)
  }

  if (isPresenting) {
    return (
      <main className="present-mode">
        <Stage scene={selectedScene} accent={presentation.accent} presentationId={presentation.id} sceneNumber={selectedIndex + 1} sceneCount={presentation.scenes.length} direction={direction} className="present-stage" />
        <button className="exit-present" onClick={() => setIsPresenting(false)} aria-label="Exit presentation"><CloseIcon /> Exit</button>
        <div className="present-hint" aria-hidden="true">← → navigate&nbsp;&nbsp; · &nbsp;&nbsp;Esc exit</div>
      </main>
    )
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand"><strong>Video Essay Studio</strong><span>{presentation.tagline}</span></div>
        <div className="save-state"><button onClick={resetDemo} aria-label="Reset demo presentation" title="Reset demo"><UndoIcon /></button><i /><span><CheckIcon /> Autosaved {saveTime}</span></div>
        <button className="present-button" onClick={() => setIsPresenting(true)}><PlayIcon /> Present</button>
      </header>

      <div className="workspace">
        <SceneList presentation={presentation} selectedIndex={selectedIndex} onSelect={selectScene} onPrevious={previous} onNext={next} />
        <main className="canvas-workspace">
          <Stage scene={selectedScene} accent={presentation.accent} presentationId={presentation.id} sceneNumber={selectedIndex + 1} sceneCount={presentation.scenes.length} direction={direction} />
        </main>
        <Inspector scene={selectedScene} onChange={updateScene} onPrevious={previous} onNext={next} hasPrevious={selectedIndex > 0} hasNext={selectedIndex < presentation.scenes.length - 1} />
      </div>

      <footer className="statusbar">
        <span>Scene {selectedIndex + 1} of {presentation.scenes.length}</span><i /><span>{selectedScene.title}</span><i /><span>{selectedScene.duration}s</span>
        <span className="status-help">Arrow keys <kbd>←</kbd><kbd>→</kbd> navigate in Present mode</span>
      </footer>
    </div>
  )
}
