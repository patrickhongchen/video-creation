import { useCallback, useEffect, useRef, useState } from 'react'
import type { Presentation, Slide, SlideElement } from './model'
import { createBlankPresentation, createSlideFromPreset, duplicatePresentation, duplicateSlide, duplicateSlideElement, makePresentationIdUnique, type SlidePreset } from './presentationFactories'
import { downloadPresentation, readPresentationFile } from './presentationFiles'
import { loadPresentationLibrary, savePresentationLibrary, type PresentationLibrary } from './storage/presentationStorage'
import { Stage } from './components/Stage'
import { SlideList } from './components/SceneList'
import { Inspector } from './components/Inspector'
import { CheckIcon, CloseIcon, PlayIcon } from './components/Icons'
import { NarrationStudio } from './components/NarrationStudio'
import { deletePresentationTakes, deleteSectionTakes } from './narration/narrationDb'
import { FinalVideoStudio } from './components/FinalVideoStudio'

type AppMode = 'edit' | 'present' | 'narrate' | 'final-video'

function sectionIsContiguous(slideIds: string[], orderedSlideIds: string[]) {
  const positions = slideIds.map((id) => orderedSlideIds.indexOf(id)).sort((left, right) => left - right)
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
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null)
  const [compositionGrid, setCompositionGrid] = useState(false)
  const [compositionGuides, setCompositionGuides] = useState(false)
  const [compositionSnap, setCompositionSnap] = useState(true)
  const fileInput = useRef<HTMLInputElement>(null)
  const importReservations = useRef(new Set<string>())
  const copiedElement = useRef<SlideElement | null>(null)

  const presentation = library.presentations.find((item) => item.id === library.activePresentationId) ?? library.presentations[0]
  const selectedSlide = presentation.slides[selectedIndex] ?? presentation.slides[0]

  const updateCurrent = useCallback((update: (current: Presentation) => Presentation) => {
    setLibrary((current) => ({
      ...current,
      presentations: current.presentations.map((item) => item.id === current.activePresentationId ? update(item) : item),
    }))
  }, [])

  const updateSlide = useCallback((slide: Slide) => updateCurrent((current) => ({
    ...current,
    slides: current.slides.map((item, index) => index === selectedIndex ? slide : item),
  })), [selectedIndex, updateCurrent])

  const selectSlide = useCallback((next: number) => {
    const safeIndex = Math.max(0, Math.min(next, presentation.slides.length - 1))
    setDirection(safeIndex >= selectedIndex ? 1 : -1)
    setSelectedIndex(safeIndex)
  }, [presentation.slides.length, selectedIndex])

  const previous = useCallback(() => selectSlide(selectedIndex - 1), [selectSlide, selectedIndex])
  const next = useCallback(() => selectSlide(selectedIndex + 1), [selectSlide, selectedIndex])

  useEffect(() => {
    try {
      savePresentationLibrary(library)
      setSaveTime(new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date()))
    } catch {
      setError('Changes could not be saved locally. Export your presentation to keep a copy.')
    }
  }, [library])

  useEffect(() => {
    if (selectedIndex >= presentation.slides.length) setSelectedIndex(presentation.slides.length - 1)
  }, [presentation.slides.length, selectedIndex])

  useEffect(() => setSelectedElementId(null), [selectedSlide.id])

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

  useEffect(() => {
    if (mode !== 'edit' || !selectedElementId) return
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || (target instanceof HTMLElement && target.isContentEditable)) return
      const element = selectedSlide.elements.find((candidate) => candidate.id === selectedElementId)
      if (!element) return
      if (event.key.startsWith('Arrow') && !element.locked) {
        event.preventDefault()
        const step = event.shiftKey ? 10 : 1
        const frame = { ...element.frame }
        if (event.key === 'ArrowLeft') frame.x -= step
        if (event.key === 'ArrowRight') frame.x += step
        if (event.key === 'ArrowUp') frame.y -= step
        if (event.key === 'ArrowDown') frame.y += step
        updateSlide({ ...selectedSlide, elements: selectedSlide.elements.map((candidate) => candidate.id === element.id ? { ...candidate, frame } : candidate) })
        return
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'd') {
        event.preventDefault()
        const duplicate = duplicateSlideElement(element)
        updateSlide({ ...selectedSlide, elements: [...selectedSlide.elements, duplicate] })
        setSelectedElementId(duplicate.id)
        return
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'c') {
        event.preventDefault()
        copiedElement.current = structuredClone(element)
        return
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'v' && copiedElement.current) {
        event.preventDefault()
        const pasted = duplicateSlideElement(copiedElement.current)
        updateSlide({ ...selectedSlide, elements: [...selectedSlide.elements, pasted] })
        setSelectedElementId(pasted.id)
        return
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault()
        updateSlide({ ...selectedSlide, elements: selectedSlide.elements.filter((candidate) => candidate.id !== element.id) })
        setSelectedElementId(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [mode, selectedElementId, selectedSlide, updateSlide])

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

  const addSlide = (preset: SlidePreset) => {
    const slide = createSlideFromPreset(preset, presentation.theme)
    updateCurrent((current) => ({ ...current, slides: [...current.slides, slide] }))
    setDirection(1)
    setSelectedIndex(presentation.slides.length)
  }

  const copySlide = () => {
    const copy = duplicateSlide(selectedSlide)
    updateCurrent((current) => ({ ...current, slides: [...current.slides.slice(0, selectedIndex + 1), copy, ...current.slides.slice(selectedIndex + 1)] }))
    setDirection(1)
    setSelectedIndex(selectedIndex + 1)
  }

  const deleteSlide = () => {
    if (presentation.slides.length === 1) return
    const deletedSlideId = selectedSlide.id
    const affectedSectionIds = presentation.narration?.sections
      .filter((section) => section.slideIds.includes(deletedSlideId))
      .map((section) => section.id) ?? []
    updateCurrent((current) => {
      const sections = current.narration?.sections.flatMap((section) => {
        const slideIds = section.slideIds.filter((id) => id !== deletedSlideId)
        if (slideIds.length === 0) return []
        return [{ ...section, slideIds }]
      })
      return {
        ...current,
        slides: current.slides.filter((_, index) => index !== selectedIndex),
        ...(current.narration ? { narration: { sections: sections ?? [] } } : {}),
      }
    })
    affectedSectionIds.forEach((sectionId) => {
      void deleteSectionTakes(presentation.id, sectionId).catch(() => setError('The slide was deleted, but an affected section’s local recordings could not be removed.'))
    })
    setDirection(-1)
    setSelectedIndex(Math.max(0, Math.min(selectedIndex, presentation.slides.length - 2)))
  }

  const moveSlide = (offset: -1 | 1) => {
    const target = selectedIndex + offset
    if (target < 0 || target >= presentation.slides.length) return
    const slides = [...presentation.slides]
    ;[slides[selectedIndex], slides[target]] = [slides[target], slides[selectedIndex]]
    const orderedSlideIds = slides.map((slide) => slide.id)
    const brokenSection = presentation.narration?.sections.find((section) => !sectionIsContiguous(section.slideIds, orderedSlideIds))
    if (brokenSection) {
      setError(`“${brokenSection.title || 'Untitled section'}” must stay contiguous. Edit or delete that narration section before moving this slide.`)
      return
    }
    const reorderedSectionIds = new Set<string>()
    const narrationSections = presentation.narration?.sections.map((section) => {
      const slideIds = [...section.slideIds].sort((left, right) => orderedSlideIds.indexOf(left) - orderedSlideIds.indexOf(right))
      if (slideIds.some((slideId, index) => slideId !== section.slideIds[index])) reorderedSectionIds.add(section.id)
      return { ...section, slideIds }
    })
    updateCurrent((current) => ({
      ...current,
      slides,
      ...(current.narration ? { narration: { sections: narrationSections ?? [] } } : {}),
    }))
    reorderedSectionIds.forEach((sectionId) => {
      void deleteSectionTakes(presentation.id, sectionId).catch(() => setError('Slides were reordered, but stale narration recordings could not be removed.'))
    })
    setDirection(offset)
    setSelectedIndex(target)
  }

  if (mode === 'present') {
    return (
      <main className="present-mode">
        <Stage slide={selectedSlide} theme={presentation.theme} imageAssets={presentation.imageAssets} presentationId={presentation.id} slideNumber={selectedIndex + 1} slideCount={presentation.slides.length} direction={direction} className="present-stage" />
        <button className="exit-present" onClick={() => setMode('edit')} aria-label="Exit presentation"><CloseIcon /> Exit</button>
        <div className="present-hint" aria-hidden="true">← → navigate&nbsp;&nbsp; · &nbsp;&nbsp;Esc exit</div>
      </main>
    )
  }

  if (mode === 'narrate') {
    return (
      <NarrationStudio
        presentation={presentation}
        initialSlideIndex={selectedIndex}
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
          <strong>AI Presentation Studio</strong>
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
        <SlideList presentation={presentation} selectedIndex={selectedIndex} onSelect={selectSlide} onPrevious={previous} onNext={next} onAdd={addSlide} onDuplicate={copySlide} onDelete={deleteSlide} onMove={moveSlide} />
        <main className="canvas-workspace">
          <Stage
            slide={selectedSlide}
            theme={presentation.theme}
            imageAssets={presentation.imageAssets}
            presentationId={presentation.id}
            slideNumber={selectedIndex + 1}
            slideCount={presentation.slides.length}
            direction={direction}
            slideEditor={{
              selectedElementId,
              grid: compositionGrid,
              guides: compositionGuides,
              snap: compositionSnap,
              onSelect: setSelectedElementId,
              onElementChange: (element) => updateSlide({ ...selectedSlide, elements: selectedSlide.elements.map((candidate) => candidate.id === element.id ? element : candidate) }),
            }}
          />
        </main>
        <Inspector
          slide={selectedSlide}
          onChange={updateSlide}
          presentation={presentation}
          onPresentationChange={(nextPresentation) => updateCurrent(() => nextPresentation)}
          onPrevious={previous}
          onNext={next}
          hasPrevious={selectedIndex > 0}
          hasNext={selectedIndex < presentation.slides.length - 1}
          selectedElementId={selectedElementId}
          compositionGrid={compositionGrid}
          compositionGuides={compositionGuides}
          compositionSnap={compositionSnap}
          onSelectElement={setSelectedElementId}
          onCompositionGridChange={setCompositionGrid}
          onCompositionGuidesChange={setCompositionGuides}
          onCompositionSnapChange={setCompositionSnap}
        />
      </div>

      <footer className="statusbar">
        <span>Slide {selectedIndex + 1} of {presentation.slides.length}</span><i /><span>{selectedSlide.title}</span><i /><span>{selectedSlide.duration}s</span>
        <span className="status-help">Nudge <kbd>←</kbd><kbd>→</kbd> · Shift = 10px · Alt disables snap</span>
      </footer>
    </div>
  )
}
