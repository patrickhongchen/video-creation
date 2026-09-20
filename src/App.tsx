import { useCallback, useEffect, useRef, useState } from 'react'
import type { Presentation, Scene } from './model'
import { createBlankPresentation, createScene, duplicatePresentation, duplicateScene, makePresentationIdUnique, type SceneType } from './presentationFactories'
import { downloadPresentation, readPresentationFile } from './presentationFiles'
import { loadPresentationLibrary, savePresentationLibrary, type PresentationLibrary } from './storage/presentationStorage'
import { Stage } from './components/Stage'
import { SceneList } from './components/SceneList'
import { Inspector } from './components/Inspector'
import { CheckIcon, CloseIcon, PlayIcon } from './components/Icons'
import { NarrationStudio } from './components/NarrationStudio'
import { deletePresentationTakes, deleteSectionTakes } from './narration/narrationDb'
import { FinalVideoStudio } from './components/FinalVideoStudio'

type AppMode = 'edit' | 'present' | 'narrate' | 'final-video'

function sectionIsContiguous(sceneIds: string[], orderedSceneIds: string[]) {
  const positions = sceneIds.map((id) => orderedSceneIds.indexOf(id)).sort((left, right) => left - right)
  return positions.every((position, index) => position >= 0 && (index === 0 || position === positions[index - 1] + 1))
}

export function App() {
  const [library, setLibrary] = useState<PresentationLibrary>(loadPresentationLibrary)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [direction, setDirection] = useState<1 | -1>(1)
  const [mode, setMode] = useState<AppMode>('edit')
  const [saveTime, setSaveTime] = useState('')
  const [error, setError] = useState('')
  const [projectDialog, setProjectDialog] = useState<'new' | 'rename' | 'delete' | null>(null)
  const [projectName, setProjectName] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)
  const importReservations = useRef(new Set<string>())

  const presentation = library.presentations.find((item) => item.id === library.activePresentationId) ?? library.presentations[0]
  const selectedScene = presentation.scenes[selectedIndex] ?? presentation.scenes[0]

  const updateCurrent = useCallback((update: (current: Presentation) => Presentation) => {
    setLibrary((current) => ({
      ...current,
      presentations: current.presentations.map((item) => item.id === current.activePresentationId ? update(item) : item),
    }))
  }, [])

  const selectScene = useCallback((next: number) => {
    const safeIndex = Math.max(0, Math.min(next, presentation.scenes.length - 1))
    setDirection(safeIndex >= selectedIndex ? 1 : -1)
    setSelectedIndex(safeIndex)
  }, [presentation.scenes.length, selectedIndex])

  const previous = useCallback(() => selectScene(selectedIndex - 1), [selectScene, selectedIndex])
  const next = useCallback(() => selectScene(selectedIndex + 1), [selectScene, selectedIndex])

  useEffect(() => {
    try {
      savePresentationLibrary(library)
      setSaveTime(new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date()))
    } catch {
      setError('Changes could not be saved locally. Export your presentation to keep a copy.')
    }
  }, [library])

  useEffect(() => {
    if (selectedIndex >= presentation.scenes.length) setSelectedIndex(presentation.scenes.length - 1)
  }, [presentation.scenes.length, selectedIndex])

  useEffect(() => {
    if (mode !== 'present') return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight' || event.key === ' ') { event.preventDefault(); next() }
      if (event.key === 'ArrowLeft') { event.preventDefault(); previous() }
      if (event.key === 'Escape') setMode('edit')
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [mode, next, previous])

  const openPresentation = (id: string) => {
    setLibrary((current) => ({ ...current, activePresentationId: id }))
    setSelectedIndex(0)
    setDirection(-1)
    setError('')
  }

  const addBlankPresentation = () => {
    const title = projectName.trim() || 'Untitled Presentation'
    const created = createBlankPresentation(title)
    created.id = makePresentationIdUnique(created.id, library.presentations.map((item) => item.id))
    setLibrary((current) => ({ presentations: [...current.presentations, created], activePresentationId: created.id }))
    setSelectedIndex(0)
    setProjectDialog(null)
    setProjectName('')
  }

  const duplicateCurrentPresentation = () => {
    const created = duplicatePresentation(presentation)
    created.id = makePresentationIdUnique(created.id, library.presentations.map((item) => item.id))
    setLibrary((current) => ({ presentations: [...current.presentations, created], activePresentationId: created.id }))
    setSelectedIndex(0)
  }

  const renameCurrentPresentation = () => {
    const title = projectName.trim()
    if (title) updateCurrent((current) => ({ ...current, title }))
    setProjectDialog(null)
    setProjectName('')
  }

  const deleteCurrentPresentation = () => {
    if (library.presentations.length === 1) {
      setError('Create another presentation before deleting this one.')
      return
    }
    const deletedPresentationId = presentation.id
    setLibrary((current) => {
      const presentations = current.presentations.filter((item) => item.id !== current.activePresentationId)
      return { presentations, activePresentationId: presentations[0].id }
    })
    setSelectedIndex(0)
    setProjectDialog(null)
    void deletePresentationTakes(deletedPresentationId).catch(() => {
      setError('The presentation was deleted, but its local narration recordings could not be removed.')
    })
  }

  const importFile = async (file: File | undefined) => {
    if (!file) return
    try {
      const imported = await readPresentationFile(file)
      const uniqueId = makePresentationIdUnique(imported.id, [
        ...library.presentations.map((item) => item.id),
        ...importReservations.current,
      ])
      importReservations.current.add(uniqueId)
      let cleanupWarning = false
      try {
        await deletePresentationTakes(uniqueId)
      } catch {
        cleanupWarning = true
      }
      const added = { ...imported, id: uniqueId }
      setLibrary((current) => ({ presentations: [...current.presentations, added], activePresentationId: uniqueId }))
      setSelectedIndex(0)
      setError(cleanupWarning ? 'Imported presentation structure, but local narration storage could not be checked for stale recordings.' : '')
    } catch (problem) {
      setError(problem instanceof Error ? `Import failed: ${problem.message}` : 'Import failed: the file is not a valid presentation.')
    } finally {
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  const updateScene = (scene: Scene) => updateCurrent((current) => ({
    ...current,
    scenes: current.scenes.map((item, index) => index === selectedIndex ? scene : item),
  }))

  const addScene = (type: SceneType) => {
    const scene = createScene(type)
    updateCurrent((current) => ({ ...current, scenes: [...current.scenes, scene] }))
    setDirection(1)
    setSelectedIndex(presentation.scenes.length)
  }

  const copyScene = () => {
    const copy = duplicateScene(selectedScene)
    updateCurrent((current) => ({ ...current, scenes: [...current.scenes.slice(0, selectedIndex + 1), copy, ...current.scenes.slice(selectedIndex + 1)] }))
    setDirection(1)
    setSelectedIndex(selectedIndex + 1)
  }

  const deleteScene = () => {
    if (presentation.scenes.length === 1) return
    const deletedSceneId = selectedScene.id
    const affectedSectionIds = presentation.narration?.sections
      .filter((section) => section.sceneIds.includes(deletedSceneId))
      .map((section) => section.id) ?? []
    updateCurrent((current) => {
      const sections = current.narration?.sections.flatMap((section) => {
        const sceneIds = section.sceneIds.filter((id) => id !== deletedSceneId)
        if (sceneIds.length === 0) return []
        return [{ ...section, sceneIds }]
      })
      return {
        ...current,
        scenes: current.scenes.filter((_, index) => index !== selectedIndex),
        ...(current.narration ? { narration: { sections: sections ?? [] } } : {}),
      }
    })
    affectedSectionIds.forEach((sectionId) => {
      void deleteSectionTakes(presentation.id, sectionId).catch(() => setError('The scene was deleted, but an affected section’s local recordings could not be removed.'))
    })
    setDirection(-1)
    setSelectedIndex(Math.max(0, Math.min(selectedIndex, presentation.scenes.length - 2)))
  }

  const moveScene = (offset: -1 | 1) => {
    const target = selectedIndex + offset
    if (target < 0 || target >= presentation.scenes.length) return
    const scenes = [...presentation.scenes]
    ;[scenes[selectedIndex], scenes[target]] = [scenes[target], scenes[selectedIndex]]
    const orderedSceneIds = scenes.map((scene) => scene.id)
    const brokenSection = presentation.narration?.sections.find((section) => !sectionIsContiguous(section.sceneIds, orderedSceneIds))
    if (brokenSection) {
      setError(`“${brokenSection.title || 'Untitled section'}” must stay contiguous. Edit or delete that narration section before moving this scene.`)
      return
    }
    const reorderedSectionIds = new Set<string>()
    const narrationSections = presentation.narration?.sections.map((section) => {
      const sceneIds = [...section.sceneIds].sort((left, right) => orderedSceneIds.indexOf(left) - orderedSceneIds.indexOf(right))
      if (sceneIds.some((sceneId, index) => sceneId !== section.sceneIds[index])) reorderedSectionIds.add(section.id)
      return { ...section, sceneIds }
    })
    updateCurrent((current) => ({
      ...current,
      scenes,
      ...(current.narration ? { narration: { sections: narrationSections ?? [] } } : {}),
    }))
    reorderedSectionIds.forEach((sectionId) => {
      void deleteSectionTakes(presentation.id, sectionId).catch(() => setError('Scenes were reordered, but stale narration recordings could not be removed.'))
    })
    setDirection(offset)
    setSelectedIndex(target)
  }

  if (mode === 'present') {
    return (
      <main className="present-mode">
        <Stage scene={selectedScene} accent={presentation.accent} presentationId={presentation.id} sceneNumber={selectedIndex + 1} sceneCount={presentation.scenes.length} direction={direction} className="present-stage" />
        <button className="exit-present" onClick={() => setMode('edit')} aria-label="Exit presentation"><CloseIcon /> Exit</button>
        <div className="present-hint" aria-hidden="true">← → navigate&nbsp;&nbsp; · &nbsp;&nbsp;Esc exit</div>
      </main>
    )
  }

  if (mode === 'narrate') {
    return (
      <NarrationStudio
        presentation={presentation}
        initialSceneIndex={selectedIndex}
        onPresentationChange={(nextPresentation) => updateCurrent(() => nextPresentation)}
        onExit={() => setMode('edit')}
        onError={setError}
      />
    )
  }

  if (mode === 'final-video') {
    return (
      <FinalVideoStudio
        presentation={presentation}
        onExit={() => setMode('edit')}
        onOpenNarration={() => setMode('narrate')}
      />
    )
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="project-picker">
          <strong>Video Essay Studio</strong>
          <select aria-label="Open presentation" value={presentation.id} onChange={(event) => openPresentation(event.target.value)}>
            {library.presentations.map((item) => <option key={item.id} value={item.id}>{item.title || 'Untitled Presentation'}</option>)}
          </select>
        </div>
        <div className="project-actions">
          <button onClick={() => { setProjectName('Untitled Presentation'); setProjectDialog('new') }}>New blank</button>
          <button onClick={duplicateCurrentPresentation}>Duplicate</button>
          <button onClick={() => { setProjectName(presentation.title); setProjectDialog('rename') }}>Rename</button>
          <button onClick={() => {
            if (library.presentations.length === 1) setError('Create another presentation before deleting this one.')
            else setProjectDialog('delete')
          }}>Delete</button>
          <i />
          <button onClick={() => fileInput.current?.click()}>Import</button>
          <button onClick={() => downloadPresentation(presentation)}>Export</button>
          <input ref={fileInput} className="visually-hidden" type="file" accept="application/json,.json" onChange={(event) => void importFile(event.target.files?.[0])} />
        </div>
        <div className="topbar-end">
          <span className="save-state"><CheckIcon /> Saved {saveTime}</span>
          <button className="narrate-button" onClick={() => setMode('narrate')}>Narrate</button>
          <button className="final-video-button" onClick={() => setMode('final-video')}>Final Video</button>
          <button className="present-button" onClick={() => setMode('present')}><PlayIcon /> Present</button>
        </div>
      </header>

      {error && <div className="error-banner" role="alert"><span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss error"><CloseIcon /></button></div>}

      {projectDialog && (
        <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setProjectDialog(null) }}>
          <section className="project-dialog" role="dialog" aria-modal="true" aria-labelledby="project-dialog-title">
            <div className="project-dialog-heading">
              <h2 id="project-dialog-title">{projectDialog === 'new' ? 'New presentation' : projectDialog === 'rename' ? 'Rename presentation' : 'Delete presentation?'}</h2>
              <button onClick={() => setProjectDialog(null)} aria-label="Close dialog"><CloseIcon /></button>
            </div>
            {projectDialog === 'delete' ? (
              <>
                <p>“{presentation.title}” will be removed from local storage. Export it first if you want to keep a copy.</p>
                <div className="project-dialog-actions"><button onClick={() => setProjectDialog(null)}>Cancel</button><button className="danger-button" onClick={deleteCurrentPresentation}>Delete presentation</button></div>
              </>
            ) : (
              <form onSubmit={(event) => { event.preventDefault(); projectDialog === 'new' ? addBlankPresentation() : renameCurrentPresentation() }}>
                <label><span>Presentation title</span><input autoFocus value={projectName} onChange={(event) => setProjectName(event.target.value)} /></label>
                <div className="project-dialog-actions"><button type="button" onClick={() => setProjectDialog(null)}>Cancel</button><button type="submit">{projectDialog === 'new' ? 'Create presentation' : 'Save name'}</button></div>
              </form>
            )}
          </section>
        </div>
      )}

      <div className="workspace">
        <SceneList presentation={presentation} selectedIndex={selectedIndex} onSelect={selectScene} onPrevious={previous} onNext={next} onAdd={addScene} onDuplicate={copyScene} onDelete={deleteScene} onMove={moveScene} />
        <main className="canvas-workspace">
          <Stage scene={selectedScene} accent={presentation.accent} presentationId={presentation.id} sceneNumber={selectedIndex + 1} sceneCount={presentation.scenes.length} direction={direction} />
        </main>
        <Inspector scene={selectedScene} onChange={updateScene} presentation={presentation} onPresentationChange={(nextPresentation) => updateCurrent(() => nextPresentation)} onPrevious={previous} onNext={next} hasPrevious={selectedIndex > 0} hasNext={selectedIndex < presentation.scenes.length - 1} />
      </div>

      <footer className="statusbar">
        <span>Scene {selectedIndex + 1} of {presentation.scenes.length}</span><i /><span>{selectedScene.title}</span><i /><span>{selectedScene.duration}s</span>
        <span className="status-help">Arrow keys <kbd>←</kbd><kbd>→</kbd> navigate in Present mode</span>
      </footer>
    </div>
  )
}
