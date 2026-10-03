import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { NarrationSection, Presentation } from '../model'
import { createNarrationStorage } from '../narration/narrationStorage'
import type { NarrationCaptionTrack, NarrationRecording, NarrationTake } from '../narration/narrationTypes'
import { resolveSection, takeIsUsable } from '../narration/narrationValidation'
import { useNarrationPlayback } from '../narration/useNarrationPlayback'
import { useNarrationRecorder } from '../narration/useNarrationRecorder'
import { CloseIcon } from './Icons'
import { FinalVideoStudio } from './FinalVideoStudio'
import { getDesktopBridge } from '../desktop/desktopBridge'
import { selectTakePlaybackSource, takePreviewKey } from '../narration/takePreviewSelection'
import {
  INITIAL_REVEAL_STATE,
  nextRevealOrder,
  previousSlideFor,
  slideRevealOrders,
  type RevealVisualState,
} from '../entranceAnimation'
import { resolveVideoPlaybackAtTime } from '../narration/resolveVideoPlayback'
import { resolveNarrationVisualAtTime } from '../narration/resolveNarrationVisual'
import { NARRATION_POINTER_FADE_END_MS, narrationPointerOpacityAtTime, resolveNarrationPointerAtTime } from '../narration/resolveNarrationPointer'
import { coverSlidesWithSections, mergeSectionIntoPrevious, sectionsWithChangedSlideRanges, splitSectionAtSlide } from '../narration/sectionBoundaries'
import { countCaptionEdits } from '../narration/captionReview'
import { CaptionReviewDialog } from './CaptionReviewDialog'
import { NarrationHeader } from './narration/NarrationHeader'
import { NarrationSlideRail } from './narration/NarrationSlideRail'
import { NarrationStagePanel } from './narration/NarrationStagePanel'
import { NarrationSidebar } from './narration/NarrationSidebar'

interface NarrationStudioProps {
  presentation: Presentation
  projectId: string | null
  initialSlideIndex: number
  onPresentationChange: (presentation: Presentation) => void
  onExit: () => void
  onError: (message: string) => void
}

const EMPTY_SECTIONS: NarrationSection[] = []

function makeId(prefix: string) {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? `${prefix}-${crypto.randomUUID()}`
    : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

interface CaptionReviewSelection {
  take: NarrationTake
  takeNumber: number
}

export function NarrationStudio({ presentation, projectId, initialSlideIndex, onPresentationChange, onExit, onError }: NarrationStudioProps) {
  const narrationStorage = useMemo(() => createNarrationStorage(projectId), [projectId])
  const sections = presentation.narration?.sections ?? EMPTY_SECTIONS
  const safeInitialSlideIndex = Math.max(0, Math.min(initialSlideIndex, Math.max(0, presentation.slides.length - 1)))
  const initialSlideId = presentation.slides[safeInitialSlideIndex]?.id
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(() =>
    sections.find((section) => initialSlideId && section.slideIds.includes(initialSlideId))?.id ?? sections[0]?.id ?? null)
  const [activeRelativeIndex, setActiveRelativeIndex] = useState(0)
  const activeRelativeIndexRef = useRef(0)
  const [fallbackSlideIndex, setFallbackSlideIndex] = useState(safeInitialSlideIndex)
  const [direction, setDirection] = useState<1 | -1>(1)
  const [recordingRevealedThroughOrder, setRecordingRevealedThroughOrder] = useState(0)
  const recordingRevealedThroughOrderRef = useRef(0)
  const [recordingActiveReveal, setRecordingActiveReveal] = useState<{ order: number; startedAtMs: number } | null>(null)
  const [renderInstanceKey, setRenderInstanceKey] = useState(() => `narration-${Date.now()}`)
  const [takeMap, setTakeMap] = useState<Record<string, NarrationTake[]>>({})
  const takeMapRef = useRef(takeMap)
  const takeLoadSequenceRef = useRef(0)
  const [localError, setLocalError] = useState('')
  const [sectionEditorOpen, setSectionEditorOpen] = useState(false)
  const pendingSetupSlideIdRef = useRef<string | null>(null)
  const activeSlideCardRef = useRef<HTMLDivElement | null>(null)
  const [audioOpen, setAudioOpen] = useState(false)
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([])
  const [selectedDeviceId, setSelectedDeviceId] = useState(() => sessionStorage.getItem('narration-microphone') ?? '')
  const [scriptTextSize, setScriptTextSize] = useState(20)
  const [latestTakeId, setLatestTakeId] = useState<string | null>(null)
  const [comparisonMode, setComparisonMode] = useState<'enhanced' | 'original'>('enhanced')
  const previewBlobsRef = useRef(new Map<string, Blob>())
  const [previewStates, setPreviewStates] = useState<Record<string, { key: string; status: 'preparing' | 'ready' | 'failed'; warning?: string }>>({})
  const [captionJobTakeId, setCaptionJobTakeId] = useState<string | null>(null)
  const [captionErrors, setCaptionErrors] = useState<Record<string, string>>({})
  const [captionReview, setCaptionReview] = useState<CaptionReviewSelection | null>(null)
  const latestTakeRef = useRef<HTMLLIElement | null>(null)
  const [workspaceView, setWorkspaceView] = useState<'narration' | 'preview'>('narration')
  const [advanceHint, setAdvanceHint] = useState(false)
  const pendingRecordingSlideIdRef = useRef<string | null>(null)
  const [draftTitle, setDraftTitle] = useState('')
  const recordingSectionIdRef = useRef<string | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const [, setVideoControlVersion] = useState(0)
  const [pointerMode, setPointerMode] = useState(false)
  const pointerModeRef = useRef(false)
  const livePointerRef = useRef<{ sceneId: string; x: number; y: number; timeMs: number; activatedAtMs: number } | null>(null)

  const refreshAudioInputs = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return
    try {
      const devices = (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === 'audioinput')
      setAudioInputs(devices)
      if (selectedDeviceId && devices.every((device) => device.deviceId !== selectedDeviceId)) {
        setSelectedDeviceId('')
        sessionStorage.removeItem('narration-microphone')
      }
    } catch { /* Device labels may remain hidden until permission is granted. */ }
  }, [selectedDeviceId])

  useEffect(() => {
    void refreshAudioInputs()
    navigator.mediaDevices?.addEventListener?.('devicechange', refreshAudioInputs)
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', refreshAudioInputs)
  }, [refreshAudioInputs])

  takeMapRef.current = takeMap
  const selectedSection = sections.find((section) => section.id === selectedSectionId) ?? null
  const selectedResolved = useMemo(
    () => selectedSection ? resolveSection(selectedSection, presentation) : null,
    [presentation, selectedSection],
  )

  const showError = useCallback((message: string) => {
    setLocalError(message)
    onError(message)
  }, [onError])

  const loadTakes = useCallback(async () => {
    const sequence = ++takeLoadSequenceRef.current
    try {
      const entries = await Promise.all(sections.map(async (section) => [section.id, await narrationStorage.list(presentation.id, section.id)] as const))
      if (sequence === takeLoadSequenceRef.current) setTakeMap(Object.fromEntries(entries))
    } catch (problem) {
      showError(problem instanceof Error ? `Narration storage failed: ${problem.message}` : 'Narration takes could not be loaded.')
    }
  }, [narrationStorage, presentation.id, sections, showError])

  useEffect(() => { void loadTakes() }, [loadTakes])

  useEffect(() => {
    if (selectedSectionId && sections.some((section) => section.id === selectedSectionId)) return
    const matching = sections.find((section) => initialSlideId && section.slideIds.includes(initialSlideId))
    setSelectedSectionId(matching?.id ?? sections[0]?.id ?? null)
    setActiveRelativeIndex(0)
  }, [initialSlideId, sections, selectedSectionId])

  useEffect(() => { activeRelativeIndexRef.current = activeRelativeIndex }, [activeRelativeIndex])

  useEffect(() => {
    if (!selectedSection || !selectedResolved) return
    setDraftTitle(selectedSection.title)
    const pendingIndex = selectedResolved.slides.findIndex((slide) => slide.id === pendingSetupSlideIdRef.current)
    pendingSetupSlideIdRef.current = null
    setActiveRelativeIndex(pendingIndex >= 0 ? pendingIndex : 0)
  }, [selectedSection, selectedResolved])

  const showCueSlide = useCallback((sceneId: string) => {
    if (!selectedResolved) return
    const nextIndex = selectedResolved.slides.findIndex((slide) => slide.id === sceneId)
    if (nextIndex < 0) {
      showError('A saved cue points to a slide outside this section. Playback continued without changing the visual.')
      return
    }
    setDirection(nextIndex >= activeRelativeIndexRef.current ? 1 : -1)
    activeRelativeIndexRef.current = nextIndex
    setActiveRelativeIndex(nextIndex)
  }, [selectedResolved, showError])

  const playback = useNarrationPlayback({ onSceneCue: showCueSlide, onError: showError })

  const handleFinishedRecording = useCallback(async (recording: NarrationRecording) => {
    const sectionId = recordingSectionIdRef.current
    recordingSectionIdRef.current = null
    if (!sectionId) throw new Error('The recording section is no longer available.')
    const hasSelectedTake = (takeMapRef.current[sectionId] ?? []).some((take) => take.selected && !take.invalidated)
    const take: NarrationTake = {
      id: makeId('take'),
      presentationId: presentation.id,
      sectionId,
      createdAt: new Date().toISOString(),
      durationMs: recording.durationMs,
      mimeType: recording.mimeType,
      cues: recording.cues,
      pointerTrack: recording.pointerTrack,
      selected: !hasSelectedTake,
      blob: recording.blob,
    }
    await narrationStorage.store(take)
    await loadTakes()
    activeRelativeIndexRef.current = 0
    setActiveRelativeIndex(0)
    setDirection(-1)
    setRecordingRevealedThroughOrder(0)
    recordingRevealedThroughOrderRef.current = 0
    setRecordingActiveReveal(null)
    setLatestTakeId(take.id)
  }, [loadTakes, narrationStorage, presentation.id])

  const recorder = useNarrationRecorder({
    onRecordingStarted: () => {
      pointerModeRef.current = false
      setPointerMode(false)
      livePointerRef.current = null
      setAdvanceHint(true)
      setDirection(-1)
      activeRelativeIndexRef.current = 0
      setActiveRelativeIndex(0)
      setRecordingRevealedThroughOrder(0)
      recordingRevealedThroughOrderRef.current = 0
      setRecordingActiveReveal(null)
      setRenderInstanceKey(`record-${Date.now()}`)
    },
    onFinished: handleFinishedRecording,
    onError: showError,
  })

  const recorderBusy = ['requesting', 'countdown', 'recording', 'stopping'].includes(recorder.status)

  const hideLivePointer = useCallback(() => {
    const pointer = livePointerRef.current
    if (!pointer) return
    recorder.addPointerSample({ sceneId: pointer.sceneId, x: pointer.x, y: pointer.y, visible: false })
    livePointerRef.current = null
  }, [recorder.addPointerSample])

  const resetPointerMode = useCallback(() => {
    hideLivePointer()
    pointerModeRef.current = false
    setPointerMode(false)
  }, [hideLivePointer])

  const togglePointerMode = useCallback(() => {
    if (recorder.status !== 'recording') return
    if (pointerModeRef.current) hideLivePointer()
    pointerModeRef.current = !pointerModeRef.current
    setPointerMode(pointerModeRef.current)
  }, [hideLivePointer, recorder.status])

  const moveLivePointer = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (recorder.status !== 'recording' || !pointerModeRef.current || event.pointerType !== 'mouse') return
    const stage = stageRef.current
    const sceneId = selectedResolved?.slides[activeRelativeIndexRef.current]?.id
    if (!stage || !sceneId) return
    const bounds = stage.getBoundingClientRect()
    if (!bounds.width || !bounds.height) return
    const x = (event.clientX - bounds.left) / bounds.width
    const y = (event.clientY - bounds.top) / bounds.height
    if (x < 0 || x > 1 || y < 0 || y > 1) return
    const timeMs = recorder.getElapsedMs()
    const previous = livePointerRef.current
    const activatedAtMs = previous?.sceneId === sceneId && timeMs - previous.timeMs < NARRATION_POINTER_FADE_END_MS
      ? previous.activatedAtMs
      : timeMs
    const pointer = { sceneId, x, y, timeMs, activatedAtMs }
    livePointerRef.current = pointer
    recorder.addPointerSample({ sceneId, x, y, visible: true })
  }, [recorder.addPointerSample, recorder.getElapsedMs, recorder.status, selectedResolved])

  useEffect(() => {
    if (recorder.status === 'recording') return
    pointerModeRef.current = false
    setPointerMode(false)
    livePointerRef.current = null
  }, [recorder.status])

  useEffect(() => {
    if (recorder.status !== 'ready' || !pendingRecordingSlideIdRef.current) return
    const slideId = pendingRecordingSlideIdRef.current
    pendingRecordingSlideIdRef.current = null
    recorder.startRecording(slideId)
  }, [recorder.status, recorder.startRecording])

  useEffect(() => {
    if (!advanceHint) return
    const timer = window.setTimeout(() => setAdvanceHint(false), 5000)
    return () => window.clearTimeout(timer)
  }, [advanceHint])

  useEffect(() => {
    if (recorder.status === 'ready') void refreshAudioInputs()
  }, [recorder.status, refreshAudioInputs])

  useEffect(() => {
    if (recorder.status !== 'ready' || !recorder.usedDefaultAfterFallback || !selectedDeviceId) return
    setSelectedDeviceId('')
    sessionStorage.removeItem('narration-microphone')
  }, [recorder.status, recorder.usedDefaultAfterFallback, selectedDeviceId])

  useEffect(() => {
    playback.stop()
  }, [playback.stop, selectedSectionId])

  useEffect(() => () => playback.stop(), [playback.stop])

  const updateSections = useCallback((nextSections: NarrationSection[]) => {
    onPresentationChange({ ...presentation, narration: { sections: nextSections } })
  }, [onPresentationChange, presentation])

  const coverageSyncKeyRef = useRef<string | null>(null)
  useEffect(() => {
    const sourceKey = JSON.stringify([presentation.slides.map((slide) => slide.id), sections.map((section) => [section.id, section.title, section.slideIds])])
    if (coverageSyncKeyRef.current === sourceKey) return
    const covered = coverSlidesWithSections(presentation.slides, sections, makeId('section'))
    const changed = covered.length !== sections.length || covered.some((section, index) => section.id !== sections[index]?.id || section.title !== sections[index]?.title || section.slideIds.join('|') !== sections[index]?.slideIds.join('|'))
    if (!changed) return
    coverageSyncKeyRef.current = sourceKey
    void (async () => {
      try {
        await Promise.all(sectionsWithChangedSlideRanges(sections, covered)
          .map((sectionId) => narrationStorage.invalidate(presentation.id, sectionId)))
        await loadTakes()
        if (coverageSyncKeyRef.current !== sourceKey) return
        const targetSlideId = pendingSetupSlideIdRef.current ?? initialSlideId ?? presentation.slides[0]?.id
        pendingSetupSlideIdRef.current = targetSlideId ?? null
        setSelectedSectionId(covered.find((section) => targetSlideId && section.slideIds.includes(targetSlideId))?.id ?? covered[0]?.id ?? null)
        updateSections(covered)
      } catch (problem) {
        showError(problem instanceof Error ? `Sections could not be updated: ${problem.message}` : 'Sections could not be updated.')
      }
    })()
  }, [initialSlideId, loadTakes, narrationStorage, presentation.id, presentation.slides, sections, showError, updateSections])

  const selectSlide = (index: number) => {
    if (recorderBusy) return
    const slide = presentation.slides[index]
    if (!slide) return
    const owner = sections.find((section) => section.slideIds.includes(slide.id))
    if (!owner) return
    playback.stop()
    setSectionEditorOpen(false)
    if (owner.id === selectedSectionId) {
      const relativeIndex = selectedResolved?.slides.findIndex((item) => item.id === slide.id) ?? 0
      activeRelativeIndexRef.current = relativeIndex
      setActiveRelativeIndex(relativeIndex)
      setDirection(relativeIndex >= activeRelativeIndex ? 1 : -1)
    } else {
      pendingSetupSlideIdRef.current = slide.id
      setSelectedSectionId(owner.id)
    }
  }

  const addSectionStart = async (index: number) => {
    if (recorderBusy || index <= 0) return
    const nextSections = splitSectionAtSlide(presentation.slides, sections, index, makeId('section'))
    if (nextSections.length === sections.length) return
    try {
      await Promise.all(sectionsWithChangedSlideRanges(sections, nextSections)
        .map((sectionId) => narrationStorage.invalidate(presentation.id, sectionId)))
      await loadTakes()
      const targetSlideId = currentSlide?.id ?? presentation.slides[index]?.id
      pendingSetupSlideIdRef.current = targetSlideId ?? null
      setSelectedSectionId(nextSections.find((section) => targetSlideId && section.slideIds.includes(targetSlideId))?.id ?? nextSections[0]?.id ?? null)
      setSectionEditorOpen(false)
      updateSections(nextSections)
    } catch (problem) {
      showError(problem instanceof Error ? `Section could not be started: ${problem.message}` : 'Section could not be started.')
    }
  }

  const removeSectionStart = async (sectionId: string) => {
    if (recorderBusy) return
    const section = sections.find((item) => item.id === sectionId)
    if (!section || sections.indexOf(section) <= 0) return
    if (!window.confirm(`Merge “${section.title}” into the previous section? Any stored takes for “${section.title}” will be deleted.`)) return
    playback.stop()
    try {
      const nextSections = mergeSectionIntoPrevious(sections, sectionId)
      await Promise.all(sectionsWithChangedSlideRanges(sections, nextSections)
        .map((changedId) => narrationStorage.invalidate(presentation.id, changedId)))
      await narrationStorage.deleteSection(presentation.id, sectionId)
      await loadTakes()
      const targetSlideId = currentSlide?.id ?? presentation.slides[0]?.id
      pendingSetupSlideIdRef.current = targetSlideId ?? null
      setSelectedSectionId(nextSections.find((item) => targetSlideId && item.slideIds.includes(targetSlideId))?.id ?? nextSections[0]?.id ?? null)
      setTakeMap((current) => {
        const { [sectionId]: _deleted, ...remaining } = current
        return remaining
      })
      setSectionEditorOpen(false)
      updateSections(nextSections)
    } catch (problem) {
      showError(problem instanceof Error ? `Sections could not be merged: ${problem.message}` : 'Sections could not be merged.')
    }
  }

  const removeOrphanSection = async (sectionId: string) => {
    const section = sections.find((item) => item.id === sectionId)
    if (!section || section.slideIds.some((id) => presentation.slides.some((slide) => slide.id === id))) return
    if (!window.confirm(`Remove “${section.title}”? Its slides no longer exist and its stored takes will be deleted.`)) return
    try {
      const remaining = sections.filter((item) => item.id !== sectionId)
      const covered = coverSlidesWithSections(presentation.slides, remaining, makeId('section'))
      await Promise.all(sectionsWithChangedSlideRanges(remaining, covered)
        .map((changedId) => narrationStorage.invalidate(presentation.id, changedId)))
      await narrationStorage.deleteSection(presentation.id, sectionId)
      await loadTakes()
      setSelectedSectionId(covered[0]?.id ?? null)
      updateSections(covered)
    } catch (problem) {
      showError(problem instanceof Error ? `Section could not be removed: ${problem.message}` : 'Section could not be removed.')
    }
  }

  const saveSectionName = () => {
    if (!selectedSection) return
    const title = draftTitle.trim() || selectedSection.title
    updateSections(sections.map((section) => section.id === selectedSection.id ? { ...section, title } : section))
    setSectionEditorOpen(false)
  }

  const moveRecordingVisual = useCallback((offset: -1 | 1) => {
    if (!selectedResolved?.valid) return
    const current = activeRelativeIndexRef.current
    const currentSlide = selectedResolved.slides[current]
    if (!currentSlide) return

    if (offset === 1) {
      const orders = slideRevealOrders(currentSlide, previousSlideFor(presentation.slides, currentSlide))
      const order = nextRevealOrder(orders, recordingRevealedThroughOrderRef.current)
      if (order !== null) {
        const cueTime = recorder.addCue({ type: 'reveal', sceneId: currentSlide.id, order })
        if (cueTime !== undefined) {
          recordingRevealedThroughOrderRef.current = order
          setRecordingRevealedThroughOrder(order)
          setRecordingActiveReveal({ order, startedAtMs: cueTime })
        }
        return
      }
    }

    if (offset === -1 && recordingRevealedThroughOrderRef.current > 0) {
      const orders = slideRevealOrders(currentSlide, previousSlideFor(presentation.slides, currentSlide))
      const order = orders.filter((candidate) => candidate <= recordingRevealedThroughOrderRef.current).at(-1)
      if (order !== undefined) {
        const cueTime = recorder.addCue({ type: 'hide-reveal', sceneId: currentSlide.id, order })
        if (cueTime !== undefined) {
          const previousOrder = orders.filter((candidate) => candidate < order).at(-1) ?? 0
          recordingRevealedThroughOrderRef.current = previousOrder
          setRecordingRevealedThroughOrder(previousOrder)
          setRecordingActiveReveal(null)
        }
        return
      }
    }

    const next = Math.max(0, Math.min(current + offset, selectedResolved.slides.length - 1))
    if (next === current) return
    const nextSlide = selectedResolved.slides[next]
    const revealedThroughOrder = offset === -1
      ? slideRevealOrders(nextSlide, previousSlideFor(presentation.slides, nextSlide)).at(-1) ?? 0
      : 0
    const cueTime = offset === -1
      ? recorder.addCue({ type: 'slide', sceneId: nextSlide.id, revealedThroughOrder })
      : recorder.addCue({ type: 'slide', sceneId: nextSlide.id })
    if (cueTime === undefined) return
    hideLivePointer()
    setDirection(offset)
    activeRelativeIndexRef.current = next
    setActiveRelativeIndex(next)
    recordingRevealedThroughOrderRef.current = revealedThroughOrder
    setRecordingRevealedThroughOrder(revealedThroughOrder)
    setRecordingActiveReveal(null)
  }, [hideLivePointer, presentation.slides, recorder.addCue, selectedResolved])

  const toggleRecordingVideo = useCallback(() => {
    if (recorder.status !== 'recording') return
    const slide = selectedResolved?.slides[activeRelativeIndexRef.current]
    if (!slide?.elements.some((element) => element.type === 'video' && !element.hidden)) return
    const state = resolveVideoPlaybackAtTime(recorder.getCues(), recorder.getElapsedMs(), slide.id)
    recorder.addCue({ type: 'video', sceneId: slide.id, action: state.playing ? 'pause' : 'resume', positionMs: state.timeMs })
    setVideoControlVersion((version) => version + 1)
  }, [recorder.status, recorder.getCues, recorder.getElapsedMs, recorder.addCue, selectedResolved])

  const finishTake = useCallback(() => {
    resetPointerMode()
    recorder.stopRecording()
  }, [recorder.stopRecording, resetPointerMode])

  useEffect(() => {
    if (recorder.status !== 'recording') return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return
      const target = event.target
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])'))) return
      const key = event.key.toLowerCase()
      if (key === 'v' && !event.shiftKey) {
        event.preventDefault()
        toggleRecordingVideo()
      } else if (key === 'f' && !event.shiftKey) {
        event.preventDefault()
        finishTake()
      } else if (!event.shiftKey && (key === 's' || key === 'p')) {
        event.preventDefault()
        togglePointerMode()
      } else if (!event.shiftKey && (key === 'd' || key === ' ' || key === 'arrowright')) {
        event.preventDefault()
        moveRecordingVisual(1)
      } else if (!event.shiftKey && (key === 'a' || key === 'arrowleft')) {
        event.preventDefault()
        moveRecordingVisual(-1)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [finishTake, moveRecordingVisual, recorder.status, togglePointerMode, toggleRecordingVideo])

  const beginTake = () => {
    if (!selectedSection || !selectedResolved?.valid || !selectedResolved.slides[0]) return
    playback.stop()
    resetPointerMode()
    setAudioOpen(false)
    setLatestTakeId(null)
    recordingSectionIdRef.current = selectedSection.id
    pendingRecordingSlideIdRef.current = selectedResolved.slides[0].id
    if (recorder.status === 'ready') {
      const slideId = pendingRecordingSlideIdRef.current
      pendingRecordingSlideIdRef.current = null
      recorder.startRecording(slideId)
    } else {
      void recorder.prepare(selectedDeviceId)
    }
  }

  const cancelTake = () => {
    pendingRecordingSlideIdRef.current = null
    recordingSectionIdRef.current = null
    setAdvanceHint(false)
    resetPointerMode()
    recorder.cancel()
  }

  const changeMicrophone = (deviceId: string) => {
    setSelectedDeviceId(deviceId)
    if (deviceId) sessionStorage.setItem('narration-microphone', deviceId)
    else sessionStorage.removeItem('narration-microphone')
    if (recorder.status === 'ready') recorder.cancel()
    void recorder.prepare(deviceId)
  }

  const playTake = async (take: NarrationTake, forcePlay = false, startAtMs?: number) => {
    if (recorderBusy) return
    if (!forcePlay && playback.takeId === take.id && playback.isPlaying) {
      playback.pause()
      return
    }
    if (playback.takeId !== take.id) setRenderInstanceKey(`play-${take.id}-${Date.now()}`)
    const key = takePreviewKey(take)
    const source = selectTakePlaybackSource(take, presentation.voiceEnhance, comparisonMode, previewBlobsRef.current.get(key))
    await playback.play(take, source.blob, source.key, startAtMs)
  }

  const openCaptionReview = (take: NarrationTake, takeNumber: number) => {
    if (!take.captions || recorderBusy) return
    playback.stop()
    setCaptionReview({ take, takeNumber })
  }

  const closeCaptionReview = () => {
    playback.stop()
    setCaptionReview(null)
  }

  const saveCaptionReview = async (captions: NarrationCaptionTrack) => {
    if (!captionReview) return
    const updatedTake = await narrationStorage.updateCaptions(presentation.id, captionReview.take.id, captions)
    setTakeMap((current) => ({
      ...current,
      [updatedTake.sectionId]: (current[updatedTake.sectionId] ?? []).map((item) =>
        item.id === updatedTake.id ? updatedTake : item),
    }))
    playback.stop()
    setCaptionReview(null)
  }

  const scrubCaptionReview = async (take: NarrationTake, timeMs: number) => {
    if (playback.takeId !== take.id) {
      await playTake(take, true, timeMs)
      playback.pause()
      return
    }
    playback.seek(timeMs / 1000)
  }

  const chooseComparisonMode = (mode: 'enhanced' | 'original') => {
    setComparisonMode(mode)
    const activeTake = Object.values(takeMapRef.current).flat().find((take) => take.id === playback.takeId)
    if (!activeTake || !playback.isPlaying) return
    const key = takePreviewKey(activeTake)
    const source = selectTakePlaybackSource(activeTake, presentation.voiceEnhance, mode, previewBlobsRef.current.get(key))
    void playback.play(activeTake, source.blob, source.key)
  }

  const chooseTake = async (takeId: string) => {
    if (!selectedSection || recorderBusy) return
    try {
      await narrationStorage.select(presentation.id, selectedSection.id, takeId)
      await loadTakes()
    } catch (problem) {
      showError(problem instanceof Error ? `Take could not be selected: ${problem.message}` : 'Take could not be selected.')
    }
  }

  const removeTake = async (take: NarrationTake) => {
    if (recorderBusy || captionJobTakeId) return
    if (!window.confirm('Delete this take and its audio recording? This cannot be undone.')) return
    if (playback.takeId === take.id) playback.stop()
    try {
      await narrationStorage.delete(presentation.id, take.id)
      await loadTakes()
      if (latestTakeId === take.id) setLatestTakeId(null)
    } catch (problem) {
      showError(problem instanceof Error ? `Take could not be deleted: ${problem.message}` : 'Take could not be deleted.')
    }
  }

  const generateCaptions = async (take: NarrationTake) => {
    if (captionJobTakeId || recorderBusy) return
    if (take.captions) {
      const editCount = countCaptionEdits(take.captions)
      const warning = editCount > 0
        ? `Regenerate captions?\n\nThis take has ${editCount} manual caption edit${editCount === 1 ? '' : 's'}. Regenerating will replace ${editCount === 1 ? 'that edit' : 'those edits'} with a new Whisper transcription.`
        : 'Regenerate captions and replace the existing caption track? This cannot be undone.'
      if (!window.confirm(warning)) return
    }
    setCaptionErrors((current) => {
      const next = { ...current }
      delete next[take.id]
      return next
    })
    setCaptionJobTakeId(take.id)
    try {
      const updatedTake = await narrationStorage.transcribe(presentation.id, take.id)
      setTakeMap((current) => ({
        ...current,
        [updatedTake.sectionId]: (current[updatedTake.sectionId] ?? []).map((item) =>
          item.id === updatedTake.id ? updatedTake : item),
      }))
      await loadTakes()
    } catch (problem) {
      const message = problem instanceof Error ? problem.message : 'Captions could not be generated.'
      setCaptionErrors((current) => ({ ...current, [take.id]: message }))
    } finally {
      setCaptionJobTakeId(null)
    }
  }

  const currentSlide = selectedResolved?.slides[activeRelativeIndex]
    ?? presentation.slides[fallbackSlideIndex]
    ?? presentation.slides[0]
  const currentOverallIndex = currentSlide ? presentation.slides.findIndex((slide) => slide.id === currentSlide.id) : -1
  const selectedSectionIndex = sections.findIndex((section) => section.id === selectedSectionId)
  const nextSlide = selectedResolved?.slides[activeRelativeIndex + 1]
  const selectedTakes = selectedSection ? takeMap[selectedSection.id] ?? [] : []
  useEffect(() => {
    if (presentation.voiceEnhance !== 'standard') return
    const bridge = getDesktopBridge()
    for (const take of [...selectedTakes].reverse()) {
      if (take.storageError || take.blob.size === 0) continue
      const key = takePreviewKey(take)
      if (previewBlobsRef.current.has(key) || previewStates[take.id]?.key === key) continue
      if (!bridge) {
        setPreviewStates((current) => ({ ...current, [take.id]: { key, status: 'failed', warning: 'Enhanced previews require the desktop app. Original audio is available.' } }))
        continue
      }
      setPreviewStates((current) => ({ ...current, [take.id]: { key, status: 'preparing' } }))
      void take.blob.arrayBuffer()
        .then((bytes) => bridge.enhanceNarrationPreview({ takeId: take.id, mimeType: take.mimeType, durationMs: take.durationMs, bytes }))
        .then((result) => {
          previewBlobsRef.current.set(key, new Blob([result.bytes], { type: 'audio/wav' }))
          setPreviewStates((current) => ({ ...current, [take.id]: { key, status: 'ready', warning: result.warning } }))
        })
        .catch((problem) => {
          const detail = problem instanceof Error ? problem.message : 'Processing failed.'
          setPreviewStates((current) => ({ ...current, [take.id]: { key, status: 'failed', warning: `Enhanced preview unavailable: ${detail} Original audio is available.` } }))
        })
    }
  }, [presentation.voiceEnhance, selectedTakes, previewStates])
  useEffect(() => {
    if (presentation.voiceEnhance === 'standard') setComparisonMode('enhanced')
  }, [presentation.voiceEnhance])
  const orphanSections = sections.filter((section) => !section.slideIds.some((id) => presentation.slides.some((slide) => slide.id === id)))
  const playbackTake = Object.values(takeMap).flat().find((take) => take.id === playback.takeId)
  const currentRevealOrders = currentSlide
    ? slideRevealOrders(currentSlide, previousSlideFor(presentation.slides, currentSlide))
    : []
  const upcomingRevealOrder = nextRevealOrder(currentRevealOrders, recordingRevealedThroughOrder)
  const playbackVisual = playbackTake
    ? resolveNarrationVisualAtTime(playbackTake.cues, playback.currentTimeMs, presentation.slides, selectedResolved?.slides[0]?.id)
    : null
  const stageVideoPlayback = currentSlide && recorder.status === 'recording'
    ? resolveVideoPlaybackAtTime(recorder.getCues(), recorder.getElapsedMs(), currentSlide.id)
    : currentSlide && playbackTake
      ? { ...resolveVideoPlaybackAtTime(playbackTake.cues, playback.currentTimeMs, currentSlide.id),
          playing: playback.isPlaying && resolveVideoPlaybackAtTime(playbackTake.cues, playback.currentTimeMs, currentSlide.id).playing }
      : { timeMs: 0, playing: false }
  const recordingRevealState: RevealVisualState = {
    revealedThroughOrder: recordingRevealedThroughOrder,
    activeRevealOrder: recordingActiveReveal?.order ?? null,
    activeRevealElapsedMs: recordingActiveReveal
      ? Math.max(0, recorder.elapsedMs - recordingActiveReveal.startedAtMs)
      : 0,
  }
  const stageRevealState = recorder.status === 'recording'
    ? recordingRevealState
    : playbackTake
      ? playbackVisual?.revealState ?? INITIAL_REVEAL_STATE
      : null
  const livePointer = livePointerRef.current
  const stagePointerState = !currentSlide ? null
    : recorder.status === 'recording'
      ? livePointer && pointerMode && livePointer.sceneId === currentSlide.id
        ? { x: livePointer.x, y: livePointer.y, opacity: narrationPointerOpacityAtTime(livePointer.timeMs, livePointer.activatedAtMs, Math.max(recorder.elapsedMs, livePointer.timeMs)) }
        : null
      : playbackTake
        ? resolveNarrationPointerAtTime(playbackTake.pointerTrack, playback.currentTimeMs, currentSlide.id)
        : null
  const revealedCount = currentRevealOrders.filter((order) => order <= (stageRevealState?.revealedThroughOrder ?? 0)).length
  const readyCount = sections.filter((section) => {
    const resolved = resolveSection(section, presentation)
    return (takeMap[section.id] ?? []).some((take) => take.selected && takeIsUsable(take, resolved))
  }).length
  const captionReviewTake = captionReview
    ? Object.values(takeMap).flat().find((take) => take.id === captionReview.take.id) ?? captionReview.take
    : null

  const uiMode = recorderBusy ? 'recording' : 'setup'
  const selectedDevice = audioInputs.find((device) => device.deviceId === selectedDeviceId)
  const microphoneName = selectedDevice?.label || (selectedDeviceId ? 'Selected microphone' : 'System default microphone')
  const recordingProgress = `Slide ${Math.min(activeRelativeIndex + 1, selectedResolved?.slides.length ?? 1)} of ${selectedResolved?.slides.length ?? 1}${currentRevealOrders.length ? ` · Reveal ${revealedCount} of ${currentRevealOrders.length}` : ''}`

  useEffect(() => {
    if (latestTakeId) latestTakeRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [latestTakeId, takeMap])

  useEffect(() => {
    if (uiMode === 'recording') activeSlideCardRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [uiMode, currentOverallIndex])

  if (workspaceView === 'preview') {
    return <FinalVideoStudio
      presentation={presentation}
      projectId={projectId}
      onPresentationChange={onPresentationChange}
      onExit={() => setWorkspaceView('narration')}
      onOpenNarration={(sectionId) => {
        if (sectionId) {
          const section = sections.find((item) => item.id === sectionId)
          pendingSetupSlideIdRef.current = section?.slideIds[0] ?? null
          setSelectedSectionId(sectionId)
        }
        setWorkspaceView('narration')
      }}
    />
  }

  return (
    <main className={`narration-studio mode-${uiMode}${localError ? ' has-error' : ''}`}>
      <NarrationHeader
        readyCount={readyCount} sectionCount={sections.length} slideCount={presentation.slides.length}
        recorderBusy={recorderBusy} recorderStatus={recorder.status}
        microphoneLevel={recorder.level} microphoneName={microphoneName}
        audioOpen={audioOpen} audioInputs={audioInputs} selectedDeviceId={selectedDeviceId}
        voiceEnhance={presentation.voiceEnhance}
        onOpenPreview={() => { playback.stop(); setAudioOpen(false); setWorkspaceView('preview') }}
        onToggleAudio={() => {
          const opening = !audioOpen
          setAudioOpen(opening)
          if (opening && (recorder.status === 'idle' || recorder.status === 'error')) void recorder.prepare(selectedDeviceId)
          void refreshAudioInputs()
        }}
        onChangeMicrophone={changeMicrophone}
        onChangeVoiceEnhance={(voiceEnhance) => { playback.stop(); onPresentationChange({ ...presentation, voiceEnhance }) }}
        onExit={onExit}
      />

      {localError && <div className="narration-error" role="alert"><span>{localError}</span><button onClick={() => setLocalError('')} aria-label="Dismiss error"><CloseIcon /></button></div>}

      <div className="narration-layout">
        <NarrationSlideRail
          presentation={presentation} sections={sections} orphanSections={orphanSections}
          mode={uiMode} currentSlideIndex={currentOverallIndex}
          activeSlideCardRef={activeSlideCardRef}
          onSelectSlide={selectSlide}
          onAddSectionStart={(index) => void addSectionStart(index)}
          onRemoveSectionStart={(sectionId) => void removeSectionStart(sectionId)}
          onRemoveOrphanSection={(sectionId) => void removeOrphanSection(sectionId)}
        />

        <NarrationStagePanel
          presentation={presentation} currentSlide={currentSlide} currentSlideIndex={currentOverallIndex}
          selectedSection={selectedSection} selectedSectionSlideCount={selectedResolved?.slides.length ?? 0}
          selectedSectionValid={selectedResolved?.valid ?? false} activeSectionSlideIndex={activeRelativeIndex}
          direction={direction} renderInstanceKey={renderInstanceKey}
          revealState={stageRevealState} pointerState={stagePointerState} stageRef={stageRef}
          videoPlayback={stageVideoPlayback} onToggleVideo={toggleRecordingVideo}
          mode={uiMode} recorderStatus={recorder.status} recorderBusy={recorderBusy}
          recorderCountdown={recorder.countdown} recorderElapsedMs={recorder.elapsedMs}
          microphoneName={microphoneName} microphoneLevel={recorder.level}
          recordingProgress={recordingProgress} advanceHint={advanceHint} pointerMode={pointerMode}
          hasUpcomingReveal={upcomingRevealOrder !== null}
          hasPreviousReveal={recordingRevealedThroughOrder > 0}
          onAdvanceRecording={moveRecordingVisual} onTogglePointer={togglePointerMode}
          onFinishTake={finishTake} onCancelTake={cancelTake} onBeginTake={beginTake}
          onPointerMove={moveLivePointer} onPointerLeave={hideLivePointer}
        />

        <NarrationSidebar
          presentation={presentation} mode={uiMode}
          selectedSection={selectedSection} selectedSectionIndex={selectedSectionIndex}
          selectedResolved={selectedResolved} currentSlide={currentSlide} nextSlide={nextSlide}
          scriptTextSize={scriptTextSize} sectionEditorOpen={sectionEditorOpen} draftTitle={draftTitle}
          selectedTakes={selectedTakes} latestTakeId={latestTakeId} latestTakeRef={latestTakeRef}
          recorderBusy={recorderBusy} comparisonMode={comparisonMode} previewStates={previewStates}
          captionJobTakeId={captionJobTakeId} captionErrors={captionErrors}
          playbackTakeId={playback.takeId} playbackIsPlaying={playback.isPlaying}
          playbackCurrentTimeMs={playback.currentTimeMs}
          onChangeScriptTextSize={setScriptTextSize}
          onToggleSectionEditor={() => setSectionEditorOpen(!sectionEditorOpen)}
          onChangeDraftTitle={setDraftTitle}
          onMergeWithPrevious={() => selectedSection && void removeSectionStart(selectedSection.id)}
          onCancelSectionEdit={() => { if (selectedSection) setDraftTitle(selectedSection.title); setSectionEditorOpen(false) }}
          onSaveSectionName={saveSectionName}
          onChooseComparisonMode={chooseComparisonMode}
          onPlayTake={(take) => void playTake(take)} onChooseTake={(takeId) => void chooseTake(takeId)}
          onRemoveTake={(take) => void removeTake(take)}
          onOpenCaptionReview={openCaptionReview}
          onGenerateCaptions={(take) => void generateCaptions(take)}
          onSeek={playback.seek}
        />
      </div>
      {captionReview && captionReviewTake && <CaptionReviewDialog
        key={`${captionReviewTake.id}-${captionReview.takeNumber}`}
        take={captionReviewTake}
        takeNumber={captionReview.takeNumber}
        playbackTakeId={playback.takeId}
        playbackIsPlaying={playback.isPlaying}
        playbackCurrentTimeMs={playback.currentTimeMs}
        onPlay={() => playTake(captionReviewTake)}
        onPlayAt={(timeMs) => playTake(captionReviewTake, true, timeMs)}
        onScrub={(timeMs) => scrubCaptionReview(captionReviewTake, timeMs)}
        onSave={saveCaptionReview}
        onClose={closeCaptionReview}
      />}
    </main>
  )
}
