import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import type { Presentation, Slide } from '../model'
import { createBlankPresentation } from '../presentationFactories'
import { savePresentationLibrary, type PresentationLibrary } from '../storage/presentationStorage'
import { getDesktopBridge } from '../desktop/desktopBridge'
import type { DesktopProjectExternalChange, DesktopProjectSnapshot } from '../desktop/desktopTypes'
import { reconcileSelection } from '../editor/editorSelection'
import type { PresentationHistoryAction } from '../presentationHistory'
import { canAutoApplyProjectChange, pendingChangeKind, selectionAfterProjectReload } from '../projectSync'

export type PendingChoice = 'save' | 'discard' | 'cancel'
export type ConflictChoice = 'reload' | 'overwrite' | 'cancel'
interface DesktopProjectOptions {
  library: PresentationLibrary
  presentation: Presentation
  selectedSlide: Slide
  selectedIndex: number
  selectedElementId: string | null
  selectedElementIds: string[]
  mode: 'edit' | 'present' | 'narrate'
  setLibrary: (update: (library: PresentationLibrary) => PresentationLibrary) => void
  dispatchHistory: Dispatch<PresentationHistoryAction>
  setSelectedIndex: Dispatch<SetStateAction<number>>
  setSelection: (ids: string[]) => void
  setError: Dispatch<SetStateAction<string>>
}

/** Desktop persistence and synchronization; presentation/history remain owned by App. */
export function useDesktopProject({ library, presentation, selectedSlide, selectedIndex, selectedElementId, selectedElementIds, mode, setLibrary, dispatchHistory, setSelectedIndex, setSelection, setError }: DesktopProjectOptions) {
  const desktop = getDesktopBridge()
  const [saveTime, setSaveTime] = useState('')
  const [currentProject, setCurrentProject] = useState<DesktopProjectSnapshot | null>(null)
  const [dirty, setDirty] = useState(false)
  const [externalPending, setExternalPending] = useState<{ kind: 'presentation' | 'asset'; revision: number } | null>(null)
  const [externalIssue, setExternalIssue] = useState('')
  const [externalIssueDismissed, setExternalIssueDismissed] = useState(false)
  const [externalBannerDismissed, setExternalBannerDismissed] = useState(false)
  const [syncStatus, setSyncStatus] = useState<'watching' | 'updated'>('watching')
  const [syncPulse, setSyncPulse] = useState(0)
  const [unsavedPrompt, setUnsavedPrompt] = useState(false)
  const [conflictPrompt, setConflictPrompt] = useState(false)
  const unsavedResolver = useRef<((choice: PendingChoice) => void) | null>(null)
  const conflictResolver = useRef<((choice: 'reload' | 'overwrite' | 'cancel') => void) | null>(null)
  const savedPresentation = useRef<Presentation | null>(null)
  const selectedIndexRef = useRef(selectedIndex)
  const selectedIdsRef = useRef(selectedElementIds)
  const externalRevision = useRef(0)
  const externalSyncInFlight = useRef(false)

  selectedIndexRef.current = selectedIndex
  selectedIdsRef.current = selectedElementIds
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
    document.title = `${dirty ? '• ' : ''}${presentation.title || 'Untitled Presentation'} — AI Presentation Studio`
  }, [dirty, presentation.title])

  const applyProjectSnapshot = useCallback((project: DesktopProjectSnapshot, preferredSlideId?: string, preferredElementId?: string) => {
    savedPresentation.current = project.presentation
    setCurrentProject(project)
    setLibrary((current) => {
      const withoutSameId = current.presentations.filter((item) => item.id !== project.presentation.id)
      return { presentations: [...withoutSameId, project.presentation], activePresentationId: project.presentation.id }
    })
    const selection = selectionAfterProjectReload(project.presentation.slides, {
      slideId: preferredSlideId, index: selectedIndexRef.current, elementId: preferredElementId,
    })
    setSelectedIndex(selection.index)
    const slide = project.presentation.slides[selection.index]
    setSelection(slide?.id === preferredSlideId ? reconcileSelection(slide.elements, selectedIdsRef.current) : [])
    setDirty(false)
    setError(project.missingAssets.length ? project.missingAssets.map((asset) => asset.message).join(' ') : '')
    setExternalPending(null)
    setExternalIssue('')
    setExternalIssueDismissed(false)
    setExternalBannerDismissed(false)
    setSyncStatus('watching')
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
          applyProjectSnapshot(reloaded, selectedSlide.id, selectedElementId ?? undefined)
          return false
        }
        result = await desktop.saveProject({ projectId: currentProject.projectId, presentation, overwriteExternal: true })
      }
      if (result.status !== 'saved') return false
      savedPresentation.current = presentation
      setCurrentProject(result.project)
      setDirty(false)
      setSyncStatus('watching')
      setSaveTime(new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date()))
      setError(result.project.missingAssets.length ? result.project.missingAssets.map((asset) => asset.message).join(' ') : '')
      setExternalPending(null)
      setExternalIssue('')
      return true
    } catch (problem) {
      setError(problem instanceof Error ? `Save failed: ${problem.message}` : 'Save failed.')
      return false
    }
  }, [applyProjectSnapshot, currentProject, desktop, presentation, selectedElementId, selectedSlide.id])

  const protectUnsavedChanges = useCallback(async () => {
    if (!dirty || !currentProject) return true
    const choice = await askUnsaved()
    if (choice === 'cancel') return false
    if (choice === 'save') return saveDesktopProject()
    if (desktop) {
      try {
        await desktop.setProjectDirty(currentProject.projectId, false)
        const reloaded = await desktop.reloadProject(currentProject.projectId)
        applyProjectSnapshot(reloaded, selectedSlide.id, selectedElementId ?? undefined)
      } catch (problem) {
        setError(problem instanceof Error ? `Could not discard changes: ${problem.message}` : 'Could not discard changes.')
        return false
      }
    }
    return true
  }, [applyProjectSnapshot, askUnsaved, currentProject, desktop, dirty, saveDesktopProject, selectedElementId, selectedSlide.id])

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
      applyProjectSnapshot(reloaded, selectedSlide.id, selectedElementId ?? undefined)
    } catch (problem) {
      setError(problem instanceof Error ? `Reload failed: ${problem.message}` : 'Reload failed. The current presentation was kept open.')
    }
  }, [applyProjectSnapshot, currentProject, desktop, protectUnsavedChanges, selectedElementId, selectedSlide.id])

  // Filesystem events identify possible changes; the store reads the latest disk state.
  // Protected modes and local edits keep the event pending until Edit is safe again.
  const canAutoApplyExternal = canAutoApplyProjectChange({
    projectOpen: Boolean(currentProject), mode, dirty, modalOpen: unsavedPrompt || conflictPrompt,
  })

  useEffect(() => {
    if (!desktop || !currentProject) return
    const projectId = currentProject.projectId
    return desktop.onProjectExternalChange((change: DesktopProjectExternalChange) => {
      if (change.projectId !== projectId) return
      if (change.kind === 'invalid' || change.kind === 'unavailable') {
        setExternalIssue(change.message)
        setExternalIssueDismissed(false)
        return
      }
      if (change.kind === 'recovered') {
        setExternalIssue('')
        return
      }
      setExternalIssue('')
      setExternalBannerDismissed(false)
      const revision = ++externalRevision.current
      setExternalPending((previous) => ({
        kind: pendingChangeKind(previous?.kind ?? null, change.kind),
        revision,
      }))
    })
  }, [currentProject?.projectId, desktop])

  useEffect(() => {
    if (!desktop || !currentProject || !externalPending || !canAutoApplyExternal || externalSyncInFlight.current) return
    const pendingRevision = externalPending.revision
    let cancelled = false
    externalSyncInFlight.current = true
    void (async () => {
      try {
        if (externalPending.kind === 'presentation') {
          const reloaded = await desktop.reloadProject(currentProject.projectId)
          if (cancelled) return
          applyProjectSnapshot(reloaded, selectedSlide.id, selectedElementId ?? undefined)
        } else {
          const refreshed = await desktop.refreshProjectAssets(currentProject.projectId, presentation)
          if (cancelled) return
          savedPresentation.current = refreshed.presentation
          setCurrentProject(refreshed)
          dispatchHistory({ type: 'refresh-assets', presentation: refreshed.presentation })
          setError(refreshed.missingAssets.map((asset) => asset.message).join(' '))
        }
        setSyncStatus('updated')
        setExternalIssue('')
        if (externalRevision.current !== pendingRevision) {
          setExternalPending({ kind: 'presentation', revision: externalRevision.current })
        } else {
          setExternalPending(null)
        }
      } catch (problem) {
        if (!cancelled) setExternalIssue(problem instanceof Error ? `External update is not valid yet. ${problem.message}` : 'External update is not valid yet. The current presentation was kept.')
      } finally {
        externalSyncInFlight.current = false
        if (cancelled || externalRevision.current !== pendingRevision) setSyncPulse((value) => value + 1)
      }
    })()
    return () => { cancelled = true }
  }, [applyProjectSnapshot, canAutoApplyExternal, currentProject, desktop, externalPending, presentation, selectedElementId, selectedSlide.id, syncPulse])

  const reloadPendingFromDisk = useCallback(async () => {
    if (!desktop || !currentProject) return
    if (dirty && !window.confirm('Discard your unsaved changes and reload the latest Project from disk?')) return
    try {
      const reloaded = await desktop.reloadProject(currentProject.projectId)
      applyProjectSnapshot(reloaded, selectedSlide.id, selectedElementId ?? undefined)
      setSyncStatus('updated')
    } catch (problem) {
      setExternalIssue(problem instanceof Error ? `Could not reload Project: ${problem.message}` : 'Could not reload Project. The current presentation was kept.')
    }
  }, [applyProjectSnapshot, currentProject, desktop, dirty, selectedElementId, selectedSlide.id])

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


  const markDirty = useCallback(() => {
    if (!currentProject) return
    setDirty(true)
    void desktop?.setProjectDirty(currentProject.projectId, true)
  }, [currentProject, desktop])
  const markRestored = useCallback((restored: Presentation) => {
    if (currentProject) setDirty(JSON.stringify(restored) !== JSON.stringify(savedPresentation.current))
  }, [currentProject])
  return {
    currentProject, dirty, saveTime, externalPending, externalIssue, externalIssueDismissed,
    externalBannerDismissed, syncStatus, unsavedPrompt, conflictPrompt, canAutoApplyExternal,
    setExternalIssueDismissed, setExternalBannerDismissed, finishUnsavedPrompt, finishConflictPrompt,
    createDesktopProject, openDesktopProject, saveDesktopProject, reloadDesktopProject, reloadPendingFromDisk,
    markDirty, markRestored,
  }
}
