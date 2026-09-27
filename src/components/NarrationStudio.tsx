import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { NarrationSection, Presentation } from '../model'
import {
  deleteNarrationTake,
  deleteSectionTakes,
  invalidateSectionTakes,
  listNarrationTakes,
  selectNarrationTake,
  storeNarrationTake,
} from '../narration/narrationDb'
import type { NarrationRecording, NarrationTake } from '../narration/narrationTypes'
import { getTakeRevealCoverageIssue, resolveSection, takeIsUsable } from '../narration/narrationValidation'
import { useNarrationPlayback } from '../narration/useNarrationPlayback'
import { useNarrationRecorder } from '../narration/useNarrationRecorder'
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon, CloseIcon, PlayIcon } from './Icons'
import { Stage } from './Stage'
import { NarrationSlideThumbnail } from './NarrationSlideThumbnail'
import { FinalVideoStudio } from './FinalVideoStudio'
import {
  INITIAL_REVEAL_STATE,
  nextRevealOrder,
  previousSlideFor,
  slideRevealOrders,
  type RevealVisualState,
} from '../entranceAnimation'
import { resolveNarrationVisualAtTime } from '../narration/resolveNarrationVisual'
import { coverSlidesWithSections, mergeSectionIntoPrevious, sectionsWithChangedSlideRanges, splitSectionAtSlide } from '../narration/sectionBoundaries'

interface NarrationStudioProps {
  presentation: Presentation
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

function formatDuration(durationMs: number) {
  const seconds = Math.max(0, Math.floor(durationMs / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

function formatTimer(durationMs: number) {
  const totalTenths = Math.max(0, Math.floor(durationMs / 100))
  const minutes = Math.floor(totalTenths / 600)
  const seconds = Math.floor(totalTenths / 10) % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${totalTenths % 10}`
}

function MicrophoneMeter({ level }: { level: number }) {
  return <div className="microphone-meter" aria-label={`Microphone level ${Math.round(level * 100)} percent`}><i style={{ transform: `scaleX(${Math.max(0.02, level)})` }} /></div>
}

function NarrationScript({ currentNotes, nextNotes, nextTitle, textSize, onSizeChange }: {
  currentNotes: string | undefined
  nextNotes: string | undefined
  nextTitle: string | undefined
  textSize: number
  onSizeChange: (size: number) => void
}) {
  return <>
    <div className="narration-script-tools"><span>Script</span><div><button aria-label="Decrease script text size" onClick={() => onSizeChange(Math.max(16, textSize - 2))}>A−</button><button aria-label="Increase script text size" onClick={() => onSizeChange(Math.min(30, textSize + 2))}>A+</button></div></div>
    <section className="narration-notes current-notes"><span>Current</span><p style={{ fontSize: textSize }}>{currentNotes?.trim() || 'No speaker notes for this slide.'}</p></section>
    <section className="narration-notes next-notes"><span>Next{nextTitle ? ` · ${nextTitle}` : ''}</span><p>{nextNotes?.trim() || (nextTitle ? 'No speaker notes for the next slide.' : 'End of this section.')}</p></section>
  </>
}

export function NarrationStudio({ presentation, initialSlideIndex, onPresentationChange, onExit, onError }: NarrationStudioProps) {
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
  const latestTakeRef = useRef<HTMLLIElement | null>(null)
  const [workspaceView, setWorkspaceView] = useState<'narration' | 'preview'>('narration')
  const [advanceHint, setAdvanceHint] = useState(false)
  const pendingRecordingSlideIdRef = useRef<string | null>(null)
  const [draftTitle, setDraftTitle] = useState('')
  const recordingSectionIdRef = useRef<string | null>(null)

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
      const entries = await Promise.all(sections.map(async (section) => [section.id, await listNarrationTakes(presentation.id, section.id)] as const))
      if (sequence === takeLoadSequenceRef.current) setTakeMap(Object.fromEntries(entries))
    } catch (problem) {
      showError(problem instanceof Error ? `Narration storage failed: ${problem.message}` : 'Narration takes could not be loaded.')
    }
  }, [presentation.id, sections, showError])

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
      selected: !hasSelectedTake,
      blob: recording.blob,
    }
    await storeNarrationTake(take)
    await loadTakes()
    activeRelativeIndexRef.current = 0
    setActiveRelativeIndex(0)
    setDirection(-1)
    setRecordingRevealedThroughOrder(0)
    recordingRevealedThroughOrderRef.current = 0
    setRecordingActiveReveal(null)
    setLatestTakeId(take.id)
  }, [loadTakes, presentation.id])

  const recorder = useNarrationRecorder({
    onRecordingStarted: () => {
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
          .map((sectionId) => invalidateSectionTakes(presentation.id, sectionId)))
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
  }, [initialSlideId, loadTakes, presentation.id, presentation.slides, sections, showError, updateSections])

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
        .map((sectionId) => invalidateSectionTakes(presentation.id, sectionId)))
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
        .map((changedId) => invalidateSectionTakes(presentation.id, changedId)))
      await deleteSectionTakes(presentation.id, sectionId)
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
        .map((changedId) => invalidateSectionTakes(presentation.id, changedId)))
      await deleteSectionTakes(presentation.id, sectionId)
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

    const next = Math.max(0, Math.min(current + offset, selectedResolved.slides.length - 1))
    if (next === current) return
    setDirection(offset)
    recorder.addCue({ type: 'slide', sceneId: selectedResolved.slides[next].id })
    activeRelativeIndexRef.current = next
    setActiveRelativeIndex(next)
    recordingRevealedThroughOrderRef.current = 0
    setRecordingRevealedThroughOrder(0)
    setRecordingActiveReveal(null)
  }, [presentation.slides, recorder.addCue, selectedResolved])

  useEffect(() => {
    if (recorder.status !== 'recording') return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === ' ' || event.key === 'ArrowRight') {
        event.preventDefault()
        moveRecordingVisual(1)
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        moveRecordingVisual(-1)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [moveRecordingVisual, recorder.status])

  const beginTake = () => {
    if (!selectedSection || !selectedResolved?.valid || !selectedResolved.slides[0]) return
    playback.stop()
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
    recorder.cancel()
  }

  const changeMicrophone = (deviceId: string) => {
    setSelectedDeviceId(deviceId)
    if (deviceId) sessionStorage.setItem('narration-microphone', deviceId)
    else sessionStorage.removeItem('narration-microphone')
    if (recorder.status === 'ready') recorder.cancel()
    void recorder.prepare(deviceId)
  }

  const playTake = async (take: NarrationTake) => {
    if (recorderBusy) return
    if (playback.takeId === take.id && playback.isPlaying) {
      playback.pause()
      return
    }
    if (playback.takeId !== take.id) setRenderInstanceKey(`play-${take.id}-${Date.now()}`)
    await playback.play(take)
  }

  const chooseTake = async (takeId: string) => {
    if (!selectedSection || recorderBusy) return
    try {
      await selectNarrationTake(presentation.id, selectedSection.id, takeId)
      await loadTakes()
    } catch (problem) {
      showError(problem instanceof Error ? `Take could not be selected: ${problem.message}` : 'Take could not be selected.')
    }
  }

  const removeTake = async (take: NarrationTake) => {
    if (recorderBusy) return
    if (!window.confirm('Delete this take and its audio recording? This cannot be undone.')) return
    if (playback.takeId === take.id) playback.stop()
    try {
      await deleteNarrationTake(take.id)
      await loadTakes()
      if (latestTakeId === take.id) setLatestTakeId(null)
    } catch (problem) {
      showError(problem instanceof Error ? `Take could not be deleted: ${problem.message}` : 'Take could not be deleted.')
    }
  }

  const currentSlide = selectedResolved?.slides[activeRelativeIndex]
    ?? presentation.slides[fallbackSlideIndex]
    ?? presentation.slides[0]
  const currentOverallIndex = currentSlide ? presentation.slides.findIndex((slide) => slide.id === currentSlide.id) : -1
  const selectedSectionIndex = sections.findIndex((section) => section.id === selectedSectionId)
  const nextSlide = selectedResolved?.slides[activeRelativeIndex + 1]
  const selectedTakes = selectedSection ? takeMap[selectedSection.id] ?? [] : []
  const orphanSections = sections.filter((section) => !section.slideIds.some((id) => presentation.slides.some((slide) => slide.id === id)))
  const playbackTake = Object.values(takeMap).flat().find((take) => take.id === playback.takeId)
  const currentRevealOrders = currentSlide
    ? slideRevealOrders(currentSlide, previousSlideFor(presentation.slides, currentSlide))
    : []
  const upcomingRevealOrder = nextRevealOrder(currentRevealOrders, recordingRevealedThroughOrder)
  const playbackVisual = playbackTake
    ? resolveNarrationVisualAtTime(playbackTake.cues, playback.currentTimeMs, presentation.slides, selectedResolved?.slides[0]?.id)
    : null
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
  const revealedCount = currentRevealOrders.filter((order) => order <= (stageRevealState?.revealedThroughOrder ?? 0)).length
  const readyCount = sections.filter((section) => {
    const resolved = resolveSection(section, presentation)
    return (takeMap[section.id] ?? []).some((take) => take.selected && takeIsUsable(take, resolved))
  }).length

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
      <header className="narration-header">
        <div><h1>Narration Studio</h1></div>
        <div className="narration-header-settings">
          <div className="narration-readiness"><strong>{readyCount} of {sections.length}</strong> sections ready</div>
          <button className="narration-preview-button" onClick={() => { playback.stop(); setAudioOpen(false); setWorkspaceView('preview') }} disabled={recorderBusy || presentation.slides.length === 0}>Preview &amp; export</button>
          <div className="narration-audio-anchor">
            <button className="narration-audio-button" aria-expanded={audioOpen} onClick={() => {
              const opening = !audioOpen
              setAudioOpen(opening)
              if (opening && (recorder.status === 'idle' || recorder.status === 'error')) void recorder.prepare(selectedDeviceId)
              void refreshAudioInputs()
            }} disabled={recorderBusy}>Audio ⚙</button>
            {audioOpen && <div className="narration-audio-popover">
              <strong>Microphone</strong>
              <select aria-label="Microphone" value={selectedDeviceId} onChange={(event) => changeMicrophone(event.target.value)} disabled={recorder.status === 'requesting'}>
                <option value="">System default</option>
                {audioInputs.filter((device) => device.deviceId).map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Microphone ${index + 1}`}</option>)}
              </select>
              <small>{microphoneName}{recorder.status === 'requesting' ? ' · Requesting access…' : ''}</small>
              <label>Microphone level <MicrophoneMeter level={recorder.level} /></label>
              <label>Voice Enhance <select value={presentation.voiceEnhance} onChange={(event) => onPresentationChange({ ...presentation, voiceEnhance: event.target.value as 'off' | 'standard' })}><option value="off">Off</option><option value="standard">Standard</option></select></label>
              <small>Applied during export. Takes preview original audio.</small>
            </div>}
          </div>
        </div>
        <button className="narration-exit" onClick={onExit} disabled={recorderBusy}><CloseIcon /> Exit</button>
      </header>

      {localError && <div className="narration-error" role="alert"><span>{localError}</span><button onClick={() => setLocalError('')} aria-label="Dismiss error"><CloseIcon /></button></div>}

      <div className="narration-layout">
        <aside className="narration-slide-rail" aria-label="Presentation slides and section starts">
          <div className="narration-rail-heading"><h2>Slides</h2><span>{currentOverallIndex + 1} / {presentation.slides.length}</span></div>
          {uiMode === 'setup' && <p>Mark a slide to start the next section.</p>}
          <div className="narration-rail-scroll">{presentation.slides.map((slide, index) => {
            const owner = sections.find((section) => section.slideIds.includes(slide.id))
            const isStart = owner?.slideIds[0] === slide.id
            const sectionIndex = owner ? sections.findIndex((section) => section.id === owner.id) : -1
            const isCurrent = index === currentOverallIndex
            const slideCard = <><NarrationSlideThumbnail presentation={presentation} slide={slide} index={index} /><span><small>Slide {index + 1}</small><strong>{slide.title || `Slide ${index + 1}`}</strong></span></>
            return <div className="narration-rail-entry" key={slide.id} ref={isCurrent ? activeSlideCardRef : undefined}>
              {isStart && <div className="narration-rail-boundary"><span>{owner.title === `Section ${sectionIndex + 1}` ? owner.title : `Section ${sectionIndex + 1} · ${owner.title}`}</span>{uiMode === 'setup' && index > 0 && <button aria-label={`Remove section start before Slide ${index + 1}`} title="Merge into previous section" onClick={() => void removeSectionStart(owner.id)}>×</button>}</div>}
              {!isStart && index > 0 && uiMode === 'setup' && <button className="narration-add-boundary" onClick={() => void addSectionStart(index)} aria-label={`Start a new section at Slide ${index + 1}`}>+ Start section here</button>}
              {uiMode === 'setup' ? <button className={`narration-rail-slide${isCurrent ? ' is-current' : ''}`} onClick={() => selectSlide(index)} aria-current={isCurrent ? 'step' : undefined}>{slideCard}</button> : <div className={`narration-rail-slide${isCurrent ? ' is-current' : ''}`} aria-current={isCurrent ? 'step' : undefined}>{slideCard}</div>}
            </div>
          })}
            {orphanSections.length > 0 && <div className="narration-rail-orphans"><strong>Sections needing repair</strong>{orphanSections.map((section) => <div key={section.id}><span>{section.title}</span>{uiMode === 'setup' && <button onClick={() => void removeOrphanSection(section.id)}>Remove</button>}</div>)}</div>}
          </div>
        </aside>

        <section className="narration-stage-panel">
          {currentSlide ? <div className="narration-stage-hit-area" onClick={recorder.status === 'recording' ? () => moveRecordingVisual(1) : undefined}>
            <Stage slide={currentSlide} slides={presentation.slides} theme={presentation.theme} imageAssets={presentation.imageAssets} presentationId={presentation.id} slideNumber={currentOverallIndex + 1} slideCount={presentation.slides.length} direction={direction} renderInstanceKey={renderInstanceKey} revealState={stageRevealState} className="narration-stage" />
          </div> : <div className="narration-empty-stage">Add a slide before recording narration.</div>}
          <div className="narration-progress">{selectedResolved && <span>{uiMode === 'recording' ? recordingProgress : `Slide ${Math.min(activeRelativeIndex + 1, selectedResolved.slides.length)} of ${selectedResolved.slides.length} in section`}</span>}{uiMode !== 'recording' && currentOverallIndex >= 0 && <span>Presentation slide {currentOverallIndex + 1} of {presentation.slides.length}</span>}{advanceHint && recorder.status === 'recording' && <span className="narration-advance-hint">Click the slide or press Space to advance</span>}</div>
          <div className="narration-stage-toolbar">
            <div className="narration-toolbar-context"><strong>{selectedSection?.title ?? 'Preparing sections…'}</strong><span>{recorder.status === 'recording' ? `● Recording ${formatTimer(recorder.elapsedMs)}` : recorder.status === 'countdown' ? `Recording in ${recorder.countdown}` : recorder.status === 'requesting' ? 'Preparing microphone…' : recorder.status === 'stopping' ? 'Saving take…' : microphoneName}</span></div>
            <div className="narration-toolbar-actions">
              {recorder.status === 'recording' ? <>
                <button onClick={() => moveRecordingVisual(-1)} disabled={activeRelativeIndex <= 0}><ArrowLeftIcon /> Previous</button>
                <button onClick={() => moveRecordingVisual(1)} disabled={!selectedResolved || (upcomingRevealOrder === null && activeRelativeIndex >= selectedResolved.slides.length - 1)}>{upcomingRevealOrder === null ? 'Next slide' : 'Next reveal'} <ArrowRightIcon /></button>
                <button className="stop-recording" onClick={recorder.stopRecording}>Finish take</button>
                <button className="discard-recording" onClick={cancelTake}>Discard recording</button>
              </> : recorderBusy ? <>
                <span className="narration-record-status">{recorder.status === 'countdown' ? recorder.countdown : recorder.status === 'stopping' ? 'Saving take…' : 'Preparing microphone…'}</span>
                {recorder.status !== 'stopping' && <button className="discard-recording" onClick={cancelTake}>Cancel</button>}
              </> : <button className="record-button" onClick={beginTake} disabled={!selectedResolved?.valid}>● Record section</button>}
            </div>
            <div className="narration-toolbar-meter"><span>Microphone</span><MicrophoneMeter level={recorder.level} /></div>
          </div>
        </section>

        <aside className="narration-script-panel">
          <div className="narration-script-content">
            <div className="narration-section-title"><span>Current section</span><h2>{selectedSection?.title ?? 'No section selected'}</h2></div>
            {selectedResolved && !selectedResolved.valid && <div className="narration-section-warning" role="status">{selectedResolved.issue}</div>}
            <NarrationScript currentNotes={currentSlide?.notes} nextNotes={nextSlide?.notes} nextTitle={nextSlide?.title} textSize={scriptTextSize} onSizeChange={setScriptTextSize} />
            {uiMode === 'setup' && selectedSection && <div className="narration-section-configuration">
              <button className="narration-edit-toggle" onClick={() => setSectionEditorOpen(!sectionEditorOpen)} aria-expanded={sectionEditorOpen}>{sectionEditorOpen ? 'Close section settings' : 'Edit section name'}</button>
              {sectionEditorOpen && <div className="narration-section-editor"><label><span>Section name</span><input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} /></label><div className="narration-editor-actions">{selectedSectionIndex > 0 && <button className="danger-button" onClick={() => void removeSectionStart(selectedSection.id)}>Merge with previous</button>}<button onClick={() => { setDraftTitle(selectedSection.title); setSectionEditorOpen(false) }}>Cancel</button><button className="primary-button" onClick={saveSectionName}>Save name</button></div></div>}
            </div>}
          </div>
          <section className="narration-takes" aria-label="Section takes">
            <div className="narration-panel-heading"><h2>Takes</h2><span>{selectedTakes.length} recorded</span></div>
            {!selectedSection && <p className="narration-empty">Add a slide to begin.</p>}
            {selectedSection && selectedTakes.length === 0 && <p className="narration-empty">Record this section to create its first take.</p>}
            <ol>{[...selectedTakes].reverse().map((take) => {
              const index = selectedTakes.findIndex((item) => item.id === take.id)
              const usable = selectedResolved ? takeIsUsable(take, selectedResolved) : false
              const coverageIssue = take.selected && usable && selectedResolved ? getTakeRevealCoverageIssue(take, selectedResolved, presentation) : null
              const isPlaying = playback.takeId === take.id && playback.isPlaying
              return <li key={take.id} ref={take.id === latestTakeId ? latestTakeRef : undefined} className={`narration-take${take.selected && usable ? ' is-selected' : ''}${take.id === latestTakeId ? ' is-new' : ''}`}>
                <div className="take-summary"><div><strong>Take {index + 1}</strong><small className={!usable ? 'is-invalid' : ''}>{!usable ? 'Re-record needed' : take.selected ? 'Selected for final video' : take.id === latestTakeId ? 'Just recorded' : 'Ready to use'}</small></div><time>{formatDuration(take.durationMs)}</time></div>
                <div className="take-actions">
                  <button onClick={() => void playTake(take)} disabled={recorderBusy} aria-label={`${isPlaying ? 'Pause' : 'Play'} Take ${index + 1}`}>{isPlaying ? 'Pause' : <><PlayIcon /> Play</>}</button>
                  {take.selected && usable ? <span className="take-selected"><CheckIcon /> Selected</span> : <button className="use-take" onClick={() => void chooseTake(take.id)} disabled={!usable || recorderBusy}>Use take</button>}
                  <button className="delete-take" onClick={() => void removeTake(take)} disabled={recorderBusy} aria-label={`Delete Take ${index + 1}`}>Delete</button>
                </div>
                {playback.takeId === take.id && <div className="narration-scrubber"><input type="range" min="0" max={Math.max(1, take.durationMs)} step="100" value={Math.min(playback.currentTimeMs, take.durationMs)} onChange={(event) => playback.seek(Number(event.target.value) / 1000)} aria-label={`Seek Take ${index + 1}`} /><span>{formatDuration(playback.currentTimeMs)} / {formatDuration(take.durationMs)}</span></div>}
                {coverageIssue && <small className="narration-coverage-warning">{coverageIssue}</small>}
              </li>
            })}</ol>
          </section>
        </aside>
      </div>
    </main>
  )
}
