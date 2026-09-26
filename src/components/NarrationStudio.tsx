import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { NarrationSection, Presentation } from '../model'
import {
  deleteNarrationTake,
  deleteSectionTakes,
  listNarrationTakes,
  selectNarrationTake,
  storeNarrationTake,
} from '../narration/narrationDb'
import type { NarrationRecording, NarrationTake } from '../narration/narrationTypes'
import { resolveSection, takeIsUsable } from '../narration/narrationValidation'
import { useNarrationPlayback } from '../narration/useNarrationPlayback'
import { useNarrationRecorder } from '../narration/useNarrationRecorder'
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon, CloseIcon, PlayIcon } from './Icons'
import { Stage } from './Stage'
import {
  INITIAL_REVEAL_STATE,
  nextRevealOrder,
  previousSlideFor,
  slideRevealOrders,
  type RevealVisualState,
} from '../entranceAnimation'
import { resolveNarrationVisualAtTime } from '../narration/resolveNarrationVisual'

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
  return `${(durationMs / 1000).toFixed(1)}s`
}

function formatTimer(durationMs: number) {
  const totalTenths = Math.max(0, Math.floor(durationMs / 100))
  const minutes = Math.floor(totalTenths / 600)
  const seconds = Math.floor(totalTenths / 10) % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${totalTenths % 10}`
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
  const [localError, setLocalError] = useState('')
  const [editingNew, setEditingNew] = useState(false)
  const [draftStart, setDraftStart] = useState(safeInitialSlideIndex)
  const [draftEnd, setDraftEnd] = useState(safeInitialSlideIndex)
  const [draftTitle, setDraftTitle] = useState('')
  const recordingSectionIdRef = useRef<string | null>(null)

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
    try {
      const entries = await Promise.all(sections.map(async (section) => [section.id, await listNarrationTakes(presentation.id, section.id)] as const))
      setTakeMap(Object.fromEntries(entries))
    } catch (problem) {
      showError(problem instanceof Error ? `Narration storage failed: ${problem.message}` : 'Narration takes could not be loaded.')
    }
  }, [presentation.id, sections, showError])

  useEffect(() => { void loadTakes() }, [loadTakes])

  useEffect(() => {
    if (editingNew) return
    if (selectedSectionId && sections.some((section) => section.id === selectedSectionId)) return
    const matching = sections.find((section) => initialSlideId && section.slideIds.includes(initialSlideId))
    setSelectedSectionId(matching?.id ?? sections[0]?.id ?? null)
    setActiveRelativeIndex(0)
  }, [editingNew, initialSlideId, sections, selectedSectionId])

  useEffect(() => { activeRelativeIndexRef.current = activeRelativeIndex }, [activeRelativeIndex])

  useEffect(() => {
    if (!selectedSection || !selectedResolved) return
    const start = selectedResolved.indices[0] ?? 0
    const end = selectedResolved.indices.at(-1) ?? start
    setDraftStart(start)
    setDraftEnd(end)
    setDraftTitle(selectedSection.title)
    setActiveRelativeIndex(0)
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
    const hasSelectedTake = (takeMapRef.current[sectionId] ?? []).some((take) => take.selected)
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
  }, [loadTakes, presentation.id])

  const recorder = useNarrationRecorder({
    onRecordingStarted: () => {
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

  const recorderBusy = recorder.status !== 'idle' && recorder.status !== 'error'

  useEffect(() => {
    playback.stop()
  }, [playback.stop, selectedSectionId])

  useEffect(() => () => playback.stop(), [playback.stop])

  const updateSections = useCallback((nextSections: NarrationSection[]) => {
    onPresentationChange({ ...presentation, narration: { sections: nextSections } })
  }, [onPresentationChange, presentation])

  const selectSection = (id: string) => {
    if (recorderBusy) return
    playback.stop()
    setEditingNew(false)
    setSelectedSectionId(id)
    setActiveRelativeIndex(0)
    setDirection(-1)
  }

  const occupiedIds = useMemo(() => new Set(sections
    .filter((section) => editingNew || section.id !== selectedSectionId)
    .flatMap((section) => section.slideIds)), [editingNew, sections, selectedSectionId])
  const rangeIds = draftStart <= draftEnd
    ? presentation.slides.slice(draftStart, draftEnd + 1).map((slide) => slide.id)
    : []
  const rangeOverlap = rangeIds.some((id) => occupiedIds.has(id))
  const rangeValid = rangeIds.length > 0 && !rangeOverlap

  const startNewSection = () => {
    if (recorderBusy) return
    const currentSlide = selectedResolved?.indices[activeRelativeIndex] ?? fallbackSlideIndex
    const occupied = new Set(sections.flatMap((section) => section.slideIds))
    const availableIndices = presentation.slides
      .map((slide, index) => occupied.has(slide.id) ? -1 : index)
      .filter((index) => index >= 0)
    const targetSlide = availableIndices.includes(currentSlide)
      ? currentSlide
      : availableIndices.find((index) => index > currentSlide) ?? availableIndices[0]
    if (targetSlide === undefined) {
      showError('Every slide already belongs to a narration section. Adjust or delete a section before creating another.')
      return
    }
    setEditingNew(true)
    setSelectedSectionId(null)
    setFallbackSlideIndex(targetSlide)
    setDraftStart(targetSlide)
    setDraftEnd(targetSlide)
    setDraftTitle(`Section ${sections.length + 1}`)
  }

  const saveSection = async () => {
    if (!rangeValid) return
    const title = draftTitle.trim() || `Section ${editingNew ? sections.length + 1 : sections.findIndex((section) => section.id === selectedSectionId) + 1}`
    if (editingNew) {
      const created = { id: makeId('section'), title, slideIds: rangeIds }
      updateSections([...sections, created])
      setSelectedSectionId(created.id)
      setEditingNew(false)
    } else if (selectedSection) {
      const rangeChanged = selectedSection.slideIds.length !== rangeIds.length
        || selectedSection.slideIds.some((slideId, index) => slideId !== rangeIds[index])
      if (rangeChanged) {
        playback.stop()
        try {
          await deleteSectionTakes(presentation.id, selectedSection.id)
          setTakeMap((current) => ({ ...current, [selectedSection.id]: [] }))
        } catch (problem) {
          showError(problem instanceof Error ? `Section range could not be changed: ${problem.message}` : 'Section range could not be changed.')
          return
        }
      }
      updateSections(sections.map((section) => section.id === selectedSection.id
        ? { ...section, title, slideIds: rangeIds }
        : section))
    }
    setActiveRelativeIndex(0)
    setDirection(-1)
  }

  const deleteSection = async () => {
    if (!selectedSection || recorderBusy) return
    if (!window.confirm(`Delete “${selectedSection.title}” and all of its locally stored takes?`)) return
    playback.stop()
    try {
      await deleteSectionTakes(presentation.id, selectedSection.id)
      const nextSections = sections.filter((section) => section.id !== selectedSection.id)
      updateSections(nextSections)
      setSelectedSectionId(nextSections[0]?.id ?? null)
      setTakeMap((current) => {
        const { [selectedSection.id]: _deleted, ...remaining } = current
        return remaining
      })
    } catch (problem) {
      showError(problem instanceof Error ? `Section could not be deleted: ${problem.message}` : 'Section could not be deleted.')
    }
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
    recordingSectionIdRef.current = selectedSection.id
    recorder.startRecording(selectedResolved.slides[0].id)
  }

  const playTake = async (take: NarrationTake) => {
    if (playback.takeId === take.id && playback.isPlaying) {
      playback.pause()
      return
    }
    if (playback.takeId !== take.id) setRenderInstanceKey(`play-${take.id}-${Date.now()}`)
    await playback.play(take)
  }

  const restartTake = async () => {
    setRenderInstanceKey(`replay-${Date.now()}`)
    await playback.restart()
  }

  const chooseTake = async (takeId: string) => {
    if (!selectedSection) return
    try {
      await selectNarrationTake(presentation.id, selectedSection.id, takeId)
      await loadTakes()
    } catch (problem) {
      showError(problem instanceof Error ? `Take could not be selected: ${problem.message}` : 'Take could not be selected.')
    }
  }

  const removeTake = async (take: NarrationTake) => {
    if (playback.takeId === take.id) playback.stop()
    try {
      await deleteNarrationTake(take.id)
      await loadTakes()
    } catch (problem) {
      showError(problem instanceof Error ? `Take could not be deleted: ${problem.message}` : 'Take could not be deleted.')
    }
  }

  const selectedSectionIndex = sections.findIndex((section) => section.id === selectedSectionId)
  const currentSlide = selectedResolved?.slides[activeRelativeIndex]
    ?? presentation.slides[fallbackSlideIndex]
    ?? presentation.slides[0]
  const currentOverallIndex = currentSlide ? presentation.slides.findIndex((slide) => slide.id === currentSlide.id) : -1
  const nextSlide = selectedResolved?.slides[activeRelativeIndex + 1]
  const selectedTakes = selectedSection ? takeMap[selectedSection.id] ?? [] : []
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

  return (
    <main className="narration-studio">
      <header className="narration-header">
        <div><span className="narration-kicker">Voiceover workspace</span><h1>Narration Studio</h1></div>
        <div className="narration-readiness"><strong>{readyCount} of {sections.length}</strong> sections ready</div>
        <button className="narration-exit" onClick={onExit} disabled={recorderBusy}><CloseIcon /> Exit</button>
      </header>

      {localError && <div className="narration-error" role="alert"><span>{localError}</span><button onClick={() => setLocalError('')} aria-label="Dismiss error"><CloseIcon /></button></div>}

      <div className="narration-layout">
        <aside className="narration-sections" aria-label="Narration sections">
          <div className="narration-panel-heading"><h2>Sections</h2><button onClick={startNewSection} disabled={recorderBusy || presentation.slides.length === 0}>New section</button></div>
          {sections.length === 0 && <p className="narration-empty">Create a section from the current slide to begin.</p>}
          <ol className="narration-section-list">
            {sections.map((section, index) => {
              const resolved = resolveSection(section, presentation)
              const isReady = (takeMap[section.id] ?? []).some((take) => take.selected && takeIsUsable(take, resolved))
              return <li key={section.id}><button className={section.id === selectedSectionId ? 'is-active' : ''} onClick={() => selectSection(section.id)} disabled={recorderBusy}>
                <span className={`narration-ready-dot ${isReady ? 'is-ready' : ''}`}>{isReady ? <CheckIcon /> : '○'}</span>
                <span><strong>{section.title || `Section ${index + 1}`}</strong><small>{resolved.valid ? `Slides ${resolved.indices[0] + 1}–${resolved.indices.at(-1)! + 1}` : 'Needs repair'}</small></span>
              </button></li>
            })}
          </ol>
        </aside>

        <section className="narration-stage-panel">
          {currentSlide ? <div
            style={{ display: 'contents' }}
            onClick={recorder.status === 'recording' ? () => moveRecordingVisual(1) : undefined}
          ><Stage
            slide={currentSlide}
            slides={presentation.slides}
            theme={presentation.theme}
            imageAssets={presentation.imageAssets}
            presentationId={presentation.id}
            slideNumber={currentOverallIndex + 1}
            slideCount={presentation.slides.length}
            direction={direction}
            renderInstanceKey={renderInstanceKey}
            revealState={stageRevealState}
            className="narration-stage"
          /></div> : <div className="narration-empty-stage">Add a slide before recording narration.</div>}
          <div className="narration-progress">
            {selectedResolved && <span>Slide {Math.min(activeRelativeIndex + 1, selectedResolved.slides.length)} / {selectedResolved.slides.length} in section</span>}
            {(recorder.status === 'recording' || playbackTake) && <span>Reveal {revealedCount} / {currentRevealOrders.length}</span>}
            {currentOverallIndex >= 0 && <span>Presentation slide {currentOverallIndex + 1} / {presentation.slides.length}</span>}
          </div>
        </section>

        <aside className="narration-script-panel">
          <div className="narration-section-title">
            <span>Current section</span>
            <h2>{selectedSection?.title ?? (editingNew ? 'New section' : 'No section selected')}</h2>
          </div>
          {selectedResolved && !selectedResolved.valid && <div className="narration-section-warning" role="status">{selectedResolved.issue}</div>}
          <section className="narration-notes current-notes"><span>Current speaker notes</span><p>{currentSlide?.notes?.trim() || 'No speaker notes for this slide.'}</p></section>
          <section className="narration-notes next-notes"><span>Next slide{nextSlide ? ` · ${nextSlide.title}` : ''}</span><p>{nextSlide?.notes?.trim() || (nextSlide ? 'No speaker notes for the next slide.' : 'End of this section.')}</p></section>

          {(selectedSection || editingNew) && <div className="narration-section-editor">
            <label><span>Section name</span><input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} disabled={recorderBusy} /></label>
            <div className="narration-range-fields">
              <label><span>Start</span><select value={draftStart} onChange={(event) => setDraftStart(Number(event.target.value))} disabled={recorderBusy}>
                {presentation.slides.map((slide, index) => <option key={slide.id} value={index}>Slide {index + 1}: {slide.title}</option>)}
              </select></label>
              <label><span>End</span><select value={draftEnd} onChange={(event) => setDraftEnd(Number(event.target.value))} disabled={recorderBusy}>
                {presentation.slides.map((slide, index) => <option key={slide.id} value={index}>Slide {index + 1}: {slide.title}</option>)}
              </select></label>
            </div>
            {draftStart > draftEnd && <p className="field-error">The end slide must be at or after the start slide.</p>}
            {rangeOverlap && <p className="field-error">This range overlaps another narration section.</p>}
            <div className="narration-editor-actions">
              {editingNew && <button onClick={() => { setEditingNew(false); setSelectedSectionId(sections[0]?.id ?? null) }}>Cancel</button>}
              {!editingNew && <button className="danger-button" onClick={() => void deleteSection()} disabled={recorderBusy}>Delete section</button>}
              <button className="primary-button" onClick={() => void saveSection()} disabled={!rangeValid || recorderBusy}>{editingNew ? 'Create section' : 'Save section'}</button>
            </div>
          </div>}
        </aside>
      </div>

      <section className="narration-controls">
        <div className="narration-section-navigation">
          <button onClick={() => selectSection(sections[selectedSectionIndex - 1].id)} disabled={recorderBusy || selectedSectionIndex <= 0}><ArrowLeftIcon /> Previous section</button>
          <button onClick={() => selectSection(sections[selectedSectionIndex + 1].id)} disabled={recorderBusy || selectedSectionIndex < 0 || selectedSectionIndex >= sections.length - 1}>Next section <ArrowRightIcon /></button>
        </div>

        <div className="narration-recorder">
          {(recorder.status === 'ready' || recorder.status === 'countdown' || recorder.status === 'recording') && <div className="microphone-meter" aria-label={`Microphone level ${Math.round(recorder.level * 100)} percent`}><i style={{ transform: `scaleX(${Math.max(0.02, recorder.level)})` }} /></div>}
          {recorder.status === 'idle' || recorder.status === 'error' ? <button className="record-button" onClick={() => void recorder.prepare()} disabled={!selectedResolved?.valid}>● Record New Take</button> : null}
          {recorder.status === 'requesting' && <button disabled>Requesting microphone…</button>}
          {recorder.status === 'ready' && <><span className="recorder-state">Microphone ready</span><button className="record-button" onClick={beginTake}>Start Recording</button><button onClick={recorder.cancel}>Cancel</button></>}
          {recorder.status === 'countdown' && <><strong className="record-countdown">{recorder.countdown}</strong><span>Get ready…</span><button onClick={recorder.cancel}>Cancel Take</button></>}
          {recorder.status === 'recording' && <>
            <strong className="recording-timer">● REC {formatTimer(recorder.elapsedMs)}</strong>
            <button onClick={() => moveRecordingVisual(-1)} disabled={activeRelativeIndex <= 0}><ArrowLeftIcon /> Previous slide</button>
            <button onClick={() => moveRecordingVisual(1)} disabled={!selectedResolved || (upcomingRevealOrder === null && activeRelativeIndex >= selectedResolved.slides.length - 1)}>{upcomingRevealOrder === null ? 'Next Slide' : 'Next Reveal'} <ArrowRightIcon /></button>
            <span className="recording-shortcuts">Space / → next · ← previous</span>
            <button className="stop-recording" onClick={recorder.stopRecording}>Stop Recording</button>
            <button onClick={recorder.cancel}>Cancel Take</button>
          </>}
          {recorder.status === 'stopping' && <button disabled>Finalizing take…</button>}
        </div>

        <div className="narration-takes">
          <div className="narration-panel-heading"><h2>Takes</h2><span>{selectedTakes.length} recorded</span></div>
          {!selectedSection && <p className="narration-empty">Select or create a section to record takes.</p>}
          {selectedSection && selectedTakes.length === 0 && <p className="narration-empty">No takes yet. The first completed take will be selected automatically.</p>}
          <ol>
            {selectedTakes.map((take, index) => <li key={take.id} className={take.selected ? 'is-selected' : ''}>
              <span className="take-name"><strong>Take {index + 1}</strong><small>{new Date(take.createdAt).toLocaleString()}</small></span>
              <span>{formatDuration(take.durationMs)}</span>
              <button onClick={() => void playTake(take)} disabled={recorderBusy}>{playback.takeId === take.id && playback.isPlaying ? 'Pause' : <><PlayIcon /> Play</>}</button>
              {playback.takeId === take.id && <button onClick={() => void restartTake()} disabled={recorderBusy}>Restart</button>}
              {playback.takeId === take.id && <button onClick={playback.stop} disabled={recorderBusy}>Stop</button>}
              {take.selected ? <span className={`selected-take ${selectedResolved && takeIsUsable(take, selectedResolved) ? '' : 'is-invalid'}`}><CheckIcon /> {selectedResolved && takeIsUsable(take, selectedResolved) ? 'Selected Take' : 'Selected · Re-record needed'}</span> : <button onClick={() => void chooseTake(take.id)} disabled={recorderBusy}>Use Take</button>}
              <button className="delete-take" onClick={() => void removeTake(take)} disabled={recorderBusy}>Delete</button>
            </li>)}
          </ol>
        </div>
      </section>
    </main>
  )
}
