import { useCallback, useEffect, useReducer, useRef, useState, type DragEvent as ReactDragEvent } from 'react'
import type { Presentation, PresentationImageMimeType, Slide, SlideElement } from './model'
import { createBlankPresentation, createSlideFromPreset, createSlideImageElement, duplicatePresentation, duplicateSlide, duplicateSlideElement, makePresentationIdUnique, type SlidePreset } from './presentationFactories'
import { downloadPresentation, readPresentationFile } from './presentationFiles'
import { loadPresentationLibrary, savePresentationLibrary, type PresentationLibrary } from './storage/presentationStorage'
import { Stage } from './components/Stage'
import { SlideList } from './components/SceneList'
import { Inspector } from './components/Inspector'
import { CheckIcon, CloseIcon, PlayIcon } from './components/Icons'
import { NarrationStudio } from './components/NarrationStudio'
import { deletePresentationTakes, deleteSectionTakes } from './narration/narrationDb'
import { FinalVideoStudio } from './components/FinalVideoStudio'
import { getDesktopBridge } from './desktop/desktopBridge'
import type { DesktopImportedAsset, DesktopProjectSnapshot } from './desktop/desktopTypes'
import { presentationHistoryReducer } from './presentationHistory'

type AppMode = 'edit' | 'present' | 'narrate' | 'final-video'
type PendingChoice = 'save' | 'discard' | 'cancel'

const IMAGE_MIME_TYPES = new Set<PresentationImageMimeType>(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])

function supportedImageMime(file: File): PresentationImageMimeType | null {
  const declared = file.type === 'image/jpg' ? 'image/jpeg' : file.type
  if (IMAGE_MIME_TYPES.has(declared as PresentationImageMimeType)) return declared as PresentationImageMimeType
  const extension = file.name.split('.').pop()?.toLowerCase()
  if (extension === 'png') return 'image/png'
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg'
  if (extension === 'webp') return 'image/webp'
  if (extension === 'svg') return 'image/svg+xml'
  return null
}

function readImageRatio(source: string) {
  return new Promise<number>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image.naturalWidth > 0 && image.naturalHeight > 0 ? image.naturalWidth / image.naturalHeight : 1)
    image.onerror = () => reject(new Error('The imported image could not be decoded.'))
    image.src = source
  })
}

function imageFromClipboardHtml(html: string) {
  if (!html.trim()) return null
  const image = new DOMParser().parseFromString(html, 'text/html').querySelector('img')
  if (!image) return null
  const candidates = ['src', 'data-src', 'data-iurl'].map((attribute) => image.getAttribute(attribute)?.trim())
  const source = candidates.find((candidate) => candidate?.startsWith('https://'))
    ?? candidates.find((candidate) => candidate?.startsWith('data:image/'))
  if (!source) return null
  return { source, name: image.getAttribute('alt')?.trim().slice(0, 80) || 'copied-image' }
}

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
  const [saveTime, setSaveTime] = useState('')
  const [currentProject, setCurrentProject] = useState<DesktopProjectSnapshot | null>(null)
  const [dirty, setDirty] = useState(false)
  const [unsavedPrompt, setUnsavedPrompt] = useState(false)
  const [conflictPrompt, setConflictPrompt] = useState(false)
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
  const internalCopyIsCurrent = useRef(false)
  const unsavedResolver = useRef<((choice: PendingChoice) => void) | null>(null)
  const conflictResolver = useRef<((choice: 'reload' | 'overwrite' | 'cancel') => void) | null>(null)
  const savedPresentation = useRef<Presentation | null>(null)

  const presentation = library.presentations.find((item) => item.id === library.activePresentationId) ?? library.presentations[0]
  const selectedSlide = presentation.slides[selectedIndex] ?? presentation.slides[0]

  const updateCurrent = useCallback((update: (current: Presentation) => Presentation) => {
    dispatchHistory({ type: 'edit', update })
    if (currentProject) {
      setDirty(true)
      void desktop?.setProjectDirty(currentProject.projectId, true)
    }
  }, [currentProject, desktop])

  const travelHistory = useCallback((direction: 'undo' | 'redo') => {
    const source = direction === 'undo' ? history.past : history.future
    const restored = source[source.length - 1]
    if (!restored) return
    dispatchHistory({ type: direction })
    if (currentProject) setDirty(JSON.stringify(restored) !== JSON.stringify(savedPresentation.current))
  }, [currentProject, history.future, history.past])

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
    if (currentProject) return
    try {
      savePresentationLibrary(library)
      setSaveTime(new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date()))
    } catch {
      setError('Changes could not be saved locally. Export your presentation to keep a copy.')
    }
  }, [currentProject, library])

  useEffect(() => {
    if (!currentProject || !desktop) return
    void desktop.setProjectDirty(currentProject.projectId, dirty)
  }, [currentProject, desktop, dirty])

  useEffect(() => {
    document.title = `${dirty ? '• ' : ''}${presentation.title || 'Untitled Presentation'} — Video Presentation Studio`
  }, [dirty, presentation.title])

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
        internalCopyIsCurrent.current = true
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

  useEffect(() => {
    const onBlur = () => { internalCopyIsCurrent.current = false }
    window.addEventListener('blur', onBlur)
    return () => window.removeEventListener('blur', onBlur)
  }, [])

  const applyProjectSnapshot = useCallback((project: DesktopProjectSnapshot, preferredSlideId?: string) => {
    savedPresentation.current = project.presentation
    setCurrentProject(project)
    setLibrary((current) => {
      const withoutSameId = current.presentations.filter((item) => item.id !== project.presentation.id)
      return { presentations: [...withoutSameId, project.presentation], activePresentationId: project.presentation.id }
    })
    const nextIndex = preferredSlideId ? project.presentation.slides.findIndex((slide) => slide.id === preferredSlideId) : 0
    setSelectedIndex(nextIndex >= 0 ? nextIndex : 0)
    setSelectedElementId(null)
    setDirty(false)
    setError(project.missingAssets.length ? project.missingAssets.map((asset) => asset.message).join(' ') : '')
  }, [])

  const askUnsaved = useCallback(() => new Promise<PendingChoice>((resolve) => {
    unsavedResolver.current = resolve
    setUnsavedPrompt(true)
  }), [])

  const finishUnsavedPrompt = (choice: PendingChoice) => {
    setUnsavedPrompt(false)
    unsavedResolver.current?.(choice)
    unsavedResolver.current = null
  }

  const finishConflictPrompt = (choice: 'reload' | 'overwrite' | 'cancel') => {
    setConflictPrompt(false)
    conflictResolver.current?.(choice)
    conflictResolver.current = null
  }

  const saveDesktopProject = useCallback(async (overwriteExternal = false): Promise<boolean> => {
    if (!desktop || !currentProject) return false
    try {
      let result = await desktop.saveProject({ projectId: currentProject.projectId, presentation, overwriteExternal })
      if (result.status === 'conflict') {
        const choice = await new Promise<'reload' | 'overwrite' | 'cancel'>((resolve) => {
          conflictResolver.current = resolve
          setConflictPrompt(true)
        })
        if (choice === 'cancel') return false
        if (choice === 'reload') {
          const reloaded = await desktop.reloadProject(currentProject.projectId)
          applyProjectSnapshot(reloaded, selectedSlide.id)
          return false
        }
        result = await desktop.saveProject({ projectId: currentProject.projectId, presentation, overwriteExternal: true })
      }
      if (result.status !== 'saved') return false
      savedPresentation.current = presentation
      setCurrentProject(result.project)
      setDirty(false)
      setSaveTime(new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date()))
      setError(result.project.missingAssets.length ? result.project.missingAssets.map((asset) => asset.message).join(' ') : '')
      return true
    } catch (problem) {
      setError(problem instanceof Error ? `Save failed: ${problem.message}` : 'Save failed.')
      return false
    }
  }, [applyProjectSnapshot, currentProject, desktop, presentation, selectedSlide.id])

  const protectUnsavedChanges = useCallback(async () => {
    if (!dirty || !currentProject) return true
    const choice = await askUnsaved()
    if (choice === 'cancel') return false
    if (choice === 'save') return saveDesktopProject()
    if (desktop) {
      try {
        await desktop.setProjectDirty(currentProject.projectId, false)
        const reloaded = await desktop.reloadProject(currentProject.projectId)
        applyProjectSnapshot(reloaded, selectedSlide.id)
      } catch (problem) {
        setError(problem instanceof Error ? `Could not discard changes: ${problem.message}` : 'Could not discard changes.')
        return false
      }
    }
    return true
  }, [applyProjectSnapshot, askUnsaved, currentProject, desktop, dirty, saveDesktopProject, selectedSlide.id])

  const createDesktopProject = useCallback(async (source = createBlankPresentation('Untitled Presentation')) => {
    if (!desktop || !await protectUnsavedChanges()) return
    try {
      const result = await desktop.createProject(source)
      if (result.status === 'completed') applyProjectSnapshot(result.project)
    } catch (problem) {
      setError(problem instanceof Error ? `Project creation failed: ${problem.message}` : 'Project creation failed.')
    }
  }, [applyProjectSnapshot, desktop, protectUnsavedChanges])

  const openDesktopProject = useCallback(async () => {
    if (!desktop || !await protectUnsavedChanges()) return
    try {
      const result = await desktop.openProject()
      if (result.status === 'completed') applyProjectSnapshot(result.project)
    } catch (problem) {
      setError(problem instanceof Error ? `Open Project failed: ${problem.message}` : 'Open Project failed.')
    }
  }, [applyProjectSnapshot, desktop, protectUnsavedChanges])

  const reloadDesktopProject = useCallback(async () => {
    if (!desktop || !currentProject || !await protectUnsavedChanges()) return
    try {
      const reloaded = await desktop.reloadProject(currentProject.projectId)
      applyProjectSnapshot(reloaded, selectedSlide.id)
    } catch (problem) {
      setError(problem instanceof Error ? `Reload failed: ${problem.message}` : 'Reload failed. The current presentation was kept open.')
    }
  }, [applyProjectSnapshot, currentProject, desktop, protectUnsavedChanges, selectedSlide.id])

  useEffect(() => {
    if (!desktop) return
    const unsubscribeNew = desktop.onProjectNewRequested(() => { if (mode === 'edit') void createDesktopProject() })
    const unsubscribeOpen = desktop.onProjectOpenRequested(() => { if (mode === 'edit') void openDesktopProject() })
    const unsubscribeSave = desktop.onProjectSaveRequested(() => {
      if (!currentProject) {
        void createDesktopProject(presentation)
        return
      }
      void saveDesktopProject().then((saved) => {
        if (!saved) void desktop.setProjectDirty(currentProject.projectId, true)
      })
    })
    return () => {
      unsubscribeNew()
      unsubscribeOpen()
      unsubscribeSave()
    }
  }, [createDesktopProject, currentProject, desktop, mode, openDesktopProject, presentation, saveDesktopProject])

  useEffect(() => {
    if (!desktop) return
    const handleHistoryRequest = (direction: 'undo' | 'redo') => {
      const target = document.activeElement
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || (target instanceof HTMLElement && target.isContentEditable)) {
        document.execCommand(direction)
      } else if (mode === 'edit') {
        travelHistory(direction)
      }
    }
    const unsubscribeUndo = desktop.onUndoRequested(() => handleHistoryRequest('undo'))
    const unsubscribeRedo = desktop.onRedoRequested(() => handleHistoryRequest('redo'))
    return () => { unsubscribeUndo(); unsubscribeRedo() }
  }, [desktop, mode, travelHistory])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return
      const key = event.key.toLowerCase()
      if (mode === 'edit' && (key === 'z' || key === 'y')) {
        const target = event.target
        if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || (target instanceof HTMLElement && target.isContentEditable)) return
        event.preventDefault()
        travelHistory(key === 'y' || event.shiftKey ? 'redo' : 'undo')
        return
      }
      if (key === 's') {
        event.preventDefault()
        if (currentProject) void saveDesktopProject()
        else if (desktop) void createDesktopProject(presentation)
        else downloadPresentation(presentation)
      }
      if (key === 'n' && desktop && mode === 'edit') {
        event.preventDefault()
        void createDesktopProject()
      }
      if (key === 'o' && desktop && mode === 'edit') {
        event.preventDefault()
        void openDesktopProject()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [createDesktopProject, currentProject, desktop, mode, openDesktopProject, presentation, saveDesktopProject, travelHistory])

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

  const placeImportedAsset = useCallback(async (
    asset: DesktopImportedAsset,
    action: 'add' | 'replace' = 'add',
    center?: { x: number; y: number },
  ) => {
    const ratio = await readImageRatio(asset.source)
    const width = Math.round(ratio >= 1 ? 700 : 700 * ratio)
    const height = Math.round(ratio >= 1 ? 700 / ratio : 700)
    const image = createSlideImageElement(asset.id)
    const frame = {
      ...image.frame,
      x: Math.round((center?.x ?? 540) - width / 2),
      y: Math.round((center?.y ?? 960) - height / 2),
      width,
      height,
    }
    const selected = selectedSlide.elements.find((element) => element.id === selectedElementId)
    const nextElementId = action === 'replace' && selected?.type === 'image' ? selected.id : image.id
    updateCurrent((current) => {
      const slide = current.slides[selectedIndex] ?? current.slides[0]
      let elements: SlideElement[]
      if (action === 'replace' && selected?.type === 'image') {
        elements = slide.elements.map((element) => element.id === selected.id ? { ...selected, assetId: asset.id } : element)
      } else {
        elements = [...slide.elements, { ...image, frame }]
      }
      return {
        ...current,
        imageAssets: [...(current.imageAssets ?? []).filter((candidate) => candidate.id !== asset.id), asset],
        slides: current.slides.map((candidate, index) => index === selectedIndex ? { ...slide, elements } : candidate),
      }
    })
    setSelectedElementId(nextElementId)
  }, [selectedElementId, selectedIndex, selectedSlide.elements, updateCurrent])

  const chooseProjectImage = useCallback(async (action: 'add' | 'replace') => {
    if (!desktop || !currentProject) return
    try {
      const result = await desktop.chooseImage(currentProject.projectId)
      if (result.status === 'imported') await placeImportedAsset(result.asset, action)
    } catch (problem) {
      setError(problem instanceof Error ? `Image import failed: ${problem.message}` : 'Image import failed.')
    }
  }, [currentProject, desktop, placeImportedAsset])

  const importImageBytes = useCallback(async (file: File, suggestedName: string, center?: { x: number; y: number }) => {
    if (!desktop || !currentProject) return
    const mimeType = supportedImageMime(file)
    if (!mimeType) throw new Error('Supported image types are PNG, JPEG, WebP, and SVG.')
    const asset = await desktop.saveImageBytes({
      projectId: currentProject.projectId,
      bytes: await file.arrayBuffer(),
      mimeType,
      suggestedName,
    })
    await placeImportedAsset(asset, 'add', center)
  }, [currentProject, desktop, placeImportedAsset])

  const importClipboardImageSource = useCallback(async (source: string, suggestedName: string) => {
    if (!desktop || !currentProject) return
    if (source.startsWith('data:image/')) {
      const response = await fetch(source)
      const blob = await response.blob()
      const mimeType = blob.type === 'image/jpg' ? 'image/jpeg' : blob.type
      if (!IMAGE_MIME_TYPES.has(mimeType as PresentationImageMimeType)) throw new Error('The copied image format is not supported.')
      await importImageBytes(new File([blob], suggestedName, { type: mimeType }), 'pasted-image')
      return
    }
    const asset = await desktop.importRemoteImage({ projectId: currentProject.projectId, url: source, suggestedName })
    await placeImportedAsset(asset)
  }, [currentProject, desktop, importImageBytes, placeImportedAsset])

  useEffect(() => {
    if (mode !== 'edit') return
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || (target instanceof HTMLElement && target.isContentEditable)) return
      const clipboardFiles = Array.from(event.clipboardData?.files ?? [])
      if (clipboardFiles.length === 0) {
        Array.from(event.clipboardData?.items ?? []).forEach((item) => {
          const file = item.kind === 'file' ? item.getAsFile() : null
          if (file) clipboardFiles.push(file)
        })
      }
      const imageFile = clipboardFiles.find((file) => supportedImageMime(file))
      if (imageFile && currentProject) {
        event.preventDefault()
        internalCopyIsCurrent.current = false
        void importImageBytes(imageFile, 'pasted-image.png').catch((problem) => {
          setError(problem instanceof Error ? `Paste failed: ${problem.message}` : 'Paste failed.')
        })
        return
      }
      const htmlImage = imageFromClipboardHtml(event.clipboardData?.getData('text/html') ?? '')
      const pasteCopiedElement = () => {
        if (!copiedElement.current) return false
        const pasted = duplicateSlideElement(copiedElement.current)
        updateSlide({ ...selectedSlide, elements: [...selectedSlide.elements, pasted] })
        setSelectedElementId(pasted.id)
        return true
      }
      if (htmlImage && currentProject && desktop) {
        event.preventDefault()
        void (async () => {
          const nativeImage = await desktop.importClipboardImage(currentProject.projectId)
          internalCopyIsCurrent.current = false
          if (nativeImage.status === 'imported') await placeImportedAsset(nativeImage.asset)
          else await importClipboardImageSource(htmlImage.source, htmlImage.name)
        })().catch((problem) => {
          setError(problem instanceof Error ? `Paste failed: ${problem.message}` : 'Paste failed.')
        })
        return
      }
      if (internalCopyIsCurrent.current && copiedElement.current) {
        event.preventDefault()
        pasteCopiedElement()
        return
      }
      if (currentProject && desktop) {
        event.preventDefault()
        void (async () => {
          const nativeImage = await desktop.importClipboardImage(currentProject.projectId)
          if (nativeImage.status === 'imported') {
            internalCopyIsCurrent.current = false
            await placeImportedAsset(nativeImage.asset)
            return
          }
          if (htmlImage) {
            internalCopyIsCurrent.current = false
            await importClipboardImageSource(htmlImage.source, htmlImage.name)
            return
          }
          pasteCopiedElement()
        })().catch((problem) => {
          setError(problem instanceof Error ? `Paste failed: ${problem.message}` : 'Paste failed.')
        })
        return
      }
      if (copiedElement.current) {
        event.preventDefault()
        pasteCopiedElement()
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [currentProject, desktop, importClipboardImageSource, importImageBytes, mode, placeImportedAsset, selectedSlide, updateSlide])

  useEffect(() => {
    const preventFileNavigation = (event: DragEvent) => {
      if (event.dataTransfer?.types.includes('Files')) event.preventDefault()
    }
    window.addEventListener('dragover', preventFileNavigation)
    window.addEventListener('drop', preventFileNavigation)
    return () => {
      window.removeEventListener('dragover', preventFileNavigation)
      window.removeEventListener('drop', preventFileNavigation)
    }
  }, [])

  const dropProjectImage = async (event: ReactDragEvent<HTMLElement>) => {
    event.preventDefault()
    const file = [...event.dataTransfer.files].find((candidate) => supportedImageMime(candidate))
    if (!file || !currentProject || !desktop) {
      if (event.dataTransfer.files.length) setError('Only PNG, JPEG, WebP, and SVG images can be dropped on a slide.')
      return
    }
    const stage = event.currentTarget.querySelector<HTMLElement>('.stage')
    const bounds = stage?.getBoundingClientRect()
    const center = bounds ? {
      x: Math.max(0, Math.min(1080, ((event.clientX - bounds.left) / bounds.width) * 1080)),
      y: Math.max(0, Math.min(1920, ((event.clientY - bounds.top) / bounds.height) * 1920)),
    } : undefined
    try {
      const asset = await desktop.importDroppedImage(currentProject.projectId, file)
      await placeImportedAsset(asset, 'add', center)
    } catch (problem) {
      setError(problem instanceof Error ? `Drop failed: ${problem.message}` : 'Drop failed.')
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

  const projectSafetyDialogs = <>
    {unsavedPrompt && <div className="dialog-backdrop" role="presentation"><section className="project-dialog" role="dialog" aria-modal="true" aria-labelledby="unsaved-title"><div className="project-dialog-heading"><h2 id="unsaved-title">Save changes?</h2></div><p>“{presentation.title}” has unsaved changes.</p><div className="project-dialog-actions"><button onClick={() => finishUnsavedPrompt('cancel')}>Cancel</button><button onClick={() => finishUnsavedPrompt('discard')}>Don’t Save</button><button className="primary-button" onClick={() => finishUnsavedPrompt('save')}>Save</button></div></section></div>}
    {conflictPrompt && <div className="dialog-backdrop" role="presentation"><section className="project-dialog" role="dialog" aria-modal="true" aria-labelledby="conflict-title"><div className="project-dialog-heading"><h2 id="conflict-title">presentation.json changed</h2></div><p>The file changed outside Video Presentation Studio while you also have unsaved edits.</p><div className="project-dialog-actions"><button onClick={() => finishConflictPrompt('cancel')}>Cancel</button><button onClick={() => finishConflictPrompt('reload')}>Reload from Disk</button><button className="danger-button" onClick={() => finishConflictPrompt('overwrite')}>Overwrite with My Version</button></div></section></div>}
  </>

  if (mode === 'present') {
    return (
      <><main className="present-mode">
        <Stage slide={selectedSlide} theme={presentation.theme} imageAssets={presentation.imageAssets} presentationId={presentation.id} slideNumber={selectedIndex + 1} slideCount={presentation.slides.length} direction={direction} className="present-stage" />
        <button className="exit-present" onClick={() => setMode('edit')} aria-label="Exit presentation"><CloseIcon /> Exit</button>
        <div className="present-hint" aria-hidden="true">← → navigate&nbsp;&nbsp; · &nbsp;&nbsp;Esc exit</div>
      </main>{projectSafetyDialogs}</>
    )
  }

  if (mode === 'narrate') {
    return (
      <><NarrationStudio
        presentation={presentation}
        initialSlideIndex={selectedIndex}
        onPresentationChange={(nextPresentation) => updateCurrent(() => nextPresentation)}
        onExit={() => setMode('edit')}
        onError={setError}
      />{projectSafetyDialogs}</>
    )
  }

  if (mode === 'final-video') {
    return (
      <><FinalVideoStudio
        presentation={presentation}
        onExit={() => setMode('edit')}
        onOpenNarration={() => setMode('narrate')}
      />{projectSafetyDialogs}</>
    )
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="project-picker">
          <strong>Video Presentation Studio</strong>
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
          <span className={`save-state${dirty ? ' is-dirty' : ''}`}>{!dirty && <CheckIcon />} {dirty ? 'Unsaved changes' : `Saved${saveTime ? ` ${saveTime}` : ''}`}</span>
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

      {projectSafetyDialogs}

      <div className="workspace">
        <SlideList presentation={presentation} selectedIndex={selectedIndex} onSelect={selectSlide} onPrevious={previous} onNext={next} onAdd={addSlide} onDuplicate={copySlide} onDelete={deleteSlide} onMove={moveSlide} />
        <main className="canvas-workspace" onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy' }} onDrop={(event) => void dropProjectImage(event)}>
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
          onImportImage={currentProject ? chooseProjectImage : undefined}
        />
      </div>

      <footer className="statusbar">
        <span>Slide {selectedIndex + 1} of {presentation.slides.length}</span><i /><span>{selectedSlide.title}</span><i /><span>{selectedSlide.duration}s</span>
        <span className="status-help">Nudge <kbd>←</kbd><kbd>→</kbd> · Shift = 10px · Alt disables snap · Undo <kbd>⌘Z</kbd> · Redo <kbd>⌘Y</kbd></span>
      </footer>
    </div>
  )
}
