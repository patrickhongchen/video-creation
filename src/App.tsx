import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import type { Presentation, Slide } from './model'
import { createBlankPresentation, createSlideFromPreset, duplicatePresentation, duplicateSlide, makePresentationIdUnique, type SlidePreset } from './presentationFactories'
import { downloadPresentation, readPresentationFile } from './presentationFiles'
import { loadPresentationLibrary, type PresentationLibrary } from './storage/presentationStorage'
import { Stage } from './components/Stage'
import { PresentationDialog } from './components/PresentationDialog'
import { ProjectSyncBanners } from './components/ProjectSyncBanners'
import { ProjectSafetyDialogs } from './components/ProjectSafetyDialogs'
import { EditorWorkspace } from './components/EditorWorkspace'
import { CheckIcon, CloseIcon, PlayIcon } from './components/Icons'
import { NarrationStudio } from './components/NarrationStudio'
import { createNarrationStorage } from './narration/narrationStorage'
import { getDesktopBridge } from './desktop/desktopBridge'
import { presentationHistoryReducer } from './presentationHistory'
import { useDesktopProject } from './project/useDesktopProject'
import { useRevealPreview } from './editor/useRevealPreview'
import { useEditorClipboardImages } from './editor/useEditorClipboardImages'
import { reconcileSelection } from './editor/editorSelection'
import { useEditorShortcuts } from './editor/useEditorShortcuts'
import { EDITOR_SHORTCUT_HELP, type EditorCommand } from './editor/editorCommands'
import { duplicateSelection, deleteSelection, nudgeSelection, moveSelectionLayer } from './editor/selectionLayout'
import { useSlideVideoClock } from './video/useSlideVideoClock'

type AppMode = 'edit' | 'present' | 'narrate'

function sectionIsContiguous(slideIds: string[], orderedSlideIds: string[]) {
  const positions = slideIds.map((id) => orderedSlideIds.indexOf(id)).sort((left, right) => left - right)
  return positions.every((position, index) => position >= 0 && (index === 0 || position === positions[index - 1] + 1))
}

export function App() {
  const desktop = getDesktopBridge()
  const [history, dispatchHistory] = useReducer(presentationHistoryReducer, undefined, () => ({ library: loadPresentationLibrary(), past: [], future: [] }))
  const library = history.library
  const setLibrary = useCallback((update: (library: PresentationLibrary) => PresentationLibrary) => {
    dispatchHistory({ type: 'replace', update })
  }, [])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [direction, setDirection] = useState<1 | -1>(1)
  const [mode, setMode] = useState<AppMode>('edit')
  const [error, setError] = useState('')
  const [projectDialog, setProjectDialog] = useState<'new' | 'rename' | 'delete' | null>(null)
  const [projectName, setProjectName] = useState('')
  const [selection, setSelection] = useState<string[]>([])
  const [hoveredElementId, setHoveredElementId] = useState<string | null>(null)
  const setSelectedElementId = useCallback((id: string | null, additive = false) => {
    setSelection((current) => id === null ? [] : additive
      ? current.includes(id) ? current.filter((candidate) => candidate !== id) : [...current, id]
      : [id])
  }, [])
  const [compositionGrid, setCompositionGrid] = useState(false)
  const [compositionGuides, setCompositionGuides] = useState(false)
  const [compositionSnap, setCompositionSnap] = useState(true)
  const fileInput = useRef<HTMLInputElement>(null)
  const importReservations = useRef(new Set<string>())

  const presentation = library.presentations.find((item) => item.id === library.activePresentationId) ?? library.presentations[0]
  const selectedSlide = presentation.slides[selectedIndex] ?? presentation.slides[0]

  const selectedElementIds = selection.filter((id) => selectedSlide.elements.some((element) => element.id === id))
  const selectedElementId = selectedElementIds.at(-1) ?? null

  const {
    currentProject, dirty, saveTime, externalPending, externalIssue, externalIssueDismissed,
    externalBannerDismissed, syncStatus, unsavedPrompt, conflictPrompt, canAutoApplyExternal,
    setExternalIssueDismissed, setExternalBannerDismissed, finishUnsavedPrompt, finishConflictPrompt,
    createDesktopProject, openDesktopProject, saveDesktopProject, reloadDesktopProject, reloadPendingFromDisk,
    markDirty, markRestored,
  } = useDesktopProject({ library, presentation, selectedSlide, selectedIndex, selectedElementId, selectedElementIds, mode,
    setLibrary, dispatchHistory, setSelectedIndex, setSelection, setError })

  const updateCurrent = useCallback((update: (current: Presentation) => Presentation) => {
    dispatchHistory({ type: 'edit', update })
    markDirty()
  }, [markDirty])

  const travelHistory = useCallback((direction: 'undo' | 'redo') => {
    const source = direction === 'undo' ? history.past : history.future
    const restored = source[source.length - 1]
    if (!restored) return
    dispatchHistory({ type: direction })
    markRestored(restored)
  }, [markRestored, history.future, history.past])

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
  const onRevealSequenceEnd = useCallback(() => {
    if (selectedIndex < presentation.slides.length - 1) next()
  }, [next, presentation.slides.length, selectedIndex])
  const {
    advanceReveal,
    isPreviewing,
    resetReveal,
    revealOrders,
    revealState,
    startPreview,
    stopPreview,
  } = useRevealPreview({ presentation, slide: selectedSlide, mode, onSequenceEnd: onRevealSequenceEnd })

  useEffect(() => {
    if (selectedIndex >= presentation.slides.length) setSelectedIndex(presentation.slides.length - 1)
  }, [presentation.slides.length, selectedIndex])

  useEffect(() => { setSelection([]); setHoveredElementId(null) }, [presentation.id, selectedSlide.id])
  useEffect(() => {
    setSelection((current) => {
      const reconciled = reconcileSelection(selectedSlide.elements, current)
      return reconciled.length === current.length ? current : reconciled
    })
  }, [selectedSlide.elements])

  const { chooseProjectImage, chooseProjectVideo, dropProjectImage, copySelection, videoImporting } = useEditorClipboardImages({
    currentProject, presentation, selectedSlide, selectedIndex, selectedElementId, selectedElementIds, mode, isPreviewing,
    updateCurrent, setSelectedElementId, setSelection, setError,
  })
  const presenterVideoPlayback = useSlideVideoClock(selectedSlide.id, mode === 'present' && selectedSlide.elements.some((element) => element.type === 'video' && !element.hidden))
  const executeCommand = (command: EditorCommand) => {
    if (command.type === 'undo' || command.type === 'redo') travelHistory(command.type)
    else if (command.type === 'save') {
      if (currentProject) void saveDesktopProject()
      else if (desktop) void createDesktopProject(presentation)
      else downloadPresentation(presentation)
    } else if (command.type === 'new-project' && desktop) void createDesktopProject()
    else if (command.type === 'open-project' && desktop) void openDesktopProject()
    else if (command.type === 'advance-reveal') advanceReveal()
    else if (command.type === 'previous-slide' && selectedIndex > 0) previous()
    else if (command.type === 'exit-present') setMode('edit')
    else if (command.type === 'exit-preview') stopPreview()
    else if (command.type === 'clear-selection') setSelection([])
    else if (command.type === 'copy') copySelection()
    else if (command.type === 'duplicate' && selectedElementIds.length) {
      const result = duplicateSelection(selectedSlide.elements, selectedElementIds)
      updateSlide({ ...selectedSlide, elements: result.elements })
      setSelection(result.selectedIds)
    } else {
      const elements = command.type === 'delete' ? deleteSelection(selectedSlide.elements, selectedElementIds)
        : command.type === 'nudge' ? nudgeSelection(selectedSlide.elements, selectedElementIds, command.dx, command.dy)
        : command.type === 'layer' ? moveSelectionLayer(selectedSlide.elements, selectedElementIds, command.direction)
        : selectedSlide.elements
      if (elements !== selectedSlide.elements) updateSlide({ ...selectedSlide, elements })
    }
  }
  useEditorShortcuts({ mode, preview: isPreviewing, modalOpen: unsavedPrompt || conflictPrompt || Boolean(projectDialog) }, executeCommand)

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
    void createNarrationStorage(currentProject?.projectId ?? null).deletePresentation(deletedPresentationId).catch(() => {
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
        await createNarrationStorage(null).deletePresentation(uniqueId)
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
      void createNarrationStorage(currentProject?.projectId ?? null).deleteSection(presentation.id, sectionId).catch(() => setError('The slide was deleted, but an affected section’s recordings could not be removed.'))
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
      void createNarrationStorage(currentProject?.projectId ?? null).deleteSection(presentation.id, sectionId).catch(() => setError('Slides were reordered, but stale narration recordings could not be removed.'))
    })
    setDirection(offset)
    setSelectedIndex(target)
  }

  const projectSafetyDialogs = <ProjectSafetyDialogs title={presentation.title} unsavedPrompt={unsavedPrompt} conflictPrompt={conflictPrompt} finishUnsavedPrompt={finishUnsavedPrompt} finishConflictPrompt={finishConflictPrompt} />

  if (mode === 'present') {
    return (
      <><main className="present-mode">
        <div className="present-stage-advance" onClick={advanceReveal}>
          <Stage slide={selectedSlide} slides={presentation.slides} theme={presentation.theme} imageAssets={presentation.imageAssets} videoAssets={presentation.videoAssets} videoPlayback={presenterVideoPlayback} presentationId={presentation.id} slideNumber={selectedIndex + 1} slideCount={presentation.slides.length} direction={direction} revealState={revealState} className="present-stage" />
        </div>
        <button className="exit-present" onClick={() => setMode('edit')} aria-label="Exit presentation"><CloseIcon /> Exit</button>
        <div className="present-hint" aria-hidden="true">Click / Space / → reveal or advance&nbsp;&nbsp; · &nbsp;&nbsp;← previous slide&nbsp;&nbsp; · &nbsp;&nbsp;Esc exit</div>
      </main>{projectSafetyDialogs}</>
    )
  }

  if (mode === 'narrate') {
    return (
      <><NarrationStudio
        presentation={presentation}
        projectId={currentProject?.projectId ?? null}
        initialSlideIndex={selectedIndex}
        onPresentationChange={(nextPresentation) => updateCurrent(() => nextPresentation)}
        onExit={() => setMode('edit')}
        onError={setError}
      />{projectSafetyDialogs}</>
    )
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="project-picker">
          <strong>AI Presentation Studio</strong>
          {desktop ? <span className="project-identity"><b>{presentation.title || 'Untitled Presentation'}{dirty ? ' •' : ''}</b><small>{currentProject?.rootPath ?? 'Local presentation — save as a Project to use files'}</small></span> : <select aria-label="Open presentation" value={presentation.id} onChange={(event) => openPresentation(event.target.value)}>
            {library.presentations.map((item) => <option key={item.id} value={item.id}>{item.title || 'Untitled Presentation'}</option>)}
          </select>}
        </div>
        <div className="project-actions">
          {desktop ? <>
            <button onClick={() => void createDesktopProject()}>New Project</button>
            <button onClick={() => void openDesktopProject()}>Open Project</button>
            <i />
            {currentProject ? <>
              <button onClick={() => void saveDesktopProject()}>Save</button>
              <button onClick={() => void reloadDesktopProject()}>Reload Project</button>
              <button onClick={() => void desktop.revealProject(currentProject.projectId)}>Show in Finder</button>
            </> : <button onClick={() => void createDesktopProject(presentation)}>Save as Project…</button>}
          </> : <>
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
          </>}
          <input ref={fileInput} className="visually-hidden" type="file" accept="application/json,.json" onChange={(event) => void importFile(event.target.files?.[0])} />
        </div>
        <div className="topbar-end">
          <span className={`save-state${dirty ? ' is-dirty' : ''}`}>{!dirty && !externalPending && !externalIssue && <CheckIcon />} {externalIssue ? 'Project sync warning' : externalPending ? 'External changes pending' : dirty ? 'Unsaved changes' : currentProject ? syncStatus === 'updated' ? 'Updated from disk' : 'Watching for changes' : `Saved${saveTime ? ` ${saveTime}` : ''}`}</span>
          <button className="narrate-button" onClick={() => setMode('narrate')}>Narrate</button>
          <button className="present-button" onClick={() => { resetReveal(); setMode('present') }}><PlayIcon /> Present</button>
        </div>
      </header>

      {error && <div className="error-banner" role="alert"><span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss error"><CloseIcon /></button></div>}

      <ProjectSyncBanners projectOpen={Boolean(currentProject)} issue={externalIssue} issueDismissed={externalIssueDismissed}
        pending={Boolean(externalPending)} pendingDismissed={externalBannerDismissed} dirty={dirty} canAutoApply={canAutoApplyExternal}
        onDismissIssue={() => setExternalIssueDismissed(true)} onKeepEditing={() => setExternalBannerDismissed(true)} onReload={() => void reloadPendingFromDisk()} />

      <PresentationDialog dialog={projectDialog} title={presentation.title} name={projectName} onNameChange={setProjectName}
        onClose={() => setProjectDialog(null)} onCreate={addBlankPresentation} onRename={renameCurrentPresentation} onDelete={deleteCurrentPresentation} />

      {projectSafetyDialogs}

      <EditorWorkspace
        presentation={presentation} selectedSlide={selectedSlide} selectedIndex={selectedIndex} direction={direction}
        selectedElementId={selectedElementId} selectedElementIds={selectedElementIds} setSelectedElementId={setSelectedElementId}
        hoveredElementId={hoveredElementId} setHoveredElementId={setHoveredElementId} setSelection={setSelection}
        selectSlide={selectSlide} previous={previous} next={next} addSlide={addSlide} copySlide={copySlide} deleteSlide={deleteSlide} moveSlide={moveSlide}
        updateSlide={updateSlide} onPresentationChange={(nextPresentation) => updateCurrent(() => nextPresentation)}
        onImportImage={currentProject ? chooseProjectImage : undefined} onImportVideo={currentProject ? chooseProjectVideo : undefined} videoImporting={videoImporting} onDrop={(event) => void dropProjectImage(event)}
        compositionGrid={compositionGrid} compositionGuides={compositionGuides} compositionSnap={compositionSnap}
        setCompositionGrid={setCompositionGrid} setCompositionGuides={setCompositionGuides} setCompositionSnap={setCompositionSnap}
        isPreviewing={isPreviewing} revealState={revealState} revealOrders={revealOrders}
        advanceReveal={advanceReveal} startPreview={startPreview} stopPreview={stopPreview}
      />

      <footer className="statusbar">
        <span>Slide {selectedIndex + 1} of {presentation.slides.length}</span><i /><span>{selectedSlide.title}</span>
        <span className="status-help" title={EDITOR_SHORTCUT_HELP}>{EDITOR_SHORTCUT_HELP}</span>
      </footer>
    </div>
  )
}
