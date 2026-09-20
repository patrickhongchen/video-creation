import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { NarrationSection, Presentation, Scene } from '../model'
import {
  deleteNarrationTake,
  deleteSectionTakes,
  listNarrationTakes,
  selectNarrationTake,
  storeNarrationTake,
} from '../narration/narrationDb'
import type { NarrationRecording, NarrationTake } from '../narration/narrationTypes'
import { useNarrationPlayback } from '../narration/useNarrationPlayback'
import { useNarrationRecorder } from '../narration/useNarrationRecorder'
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon, CloseIcon, PlayIcon } from './Icons'
import { Stage } from './Stage'

interface NarrationStudioProps {
  presentation: Presentation
  initialSceneIndex: number
  onPresentationChange: (presentation: Presentation) => void
  onExit: () => void
  onError: (message: string) => void
}

interface ResolvedSection {
  scenes: Scene[]
  indices: number[]
  valid: boolean
  issue: string
}

const EMPTY_SECTIONS: NarrationSection[] = []

function resolveSection(section: NarrationSection, presentation: Presentation): ResolvedSection {
  const indices = section.sceneIds.map((id) => presentation.scenes.findIndex((scene) => scene.id === id))
  const missingCount = indices.filter((index) => index < 0).length
  const foundIndices = indices.filter((index) => index >= 0)
  const orderedIndices = [...foundIndices].sort((left, right) => left - right)
  const scenes = orderedIndices.map((index) => presentation.scenes[index])

  if (section.sceneIds.length === 0) return { scenes, indices: orderedIndices, valid: false, issue: 'This section has no scenes. Choose a start and end scene to repair it.' }
  if (missingCount > 0) return { scenes, indices: orderedIndices, valid: false, issue: `${missingCount} referenced scene${missingCount === 1 ? ' is' : 's are'} missing. Save a new range to repair this section.` }
  const contiguous = indices.every((index, position) => position === 0 || index === indices[position - 1] + 1)
  if (!contiguous) return { scenes, indices: orderedIndices, valid: false, issue: 'These scenes are no longer a contiguous range. Save a new range to repair this section.' }
  return { scenes: indices.map((index) => presentation.scenes[index]), indices, valid: true, issue: '' }
}

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

function takeIsUsable(take: NarrationTake, section: ResolvedSection) {
  if (!section.valid || !take.blob || take.blob.size === 0 || take.cues.length === 0) return false
  if (take.cues[0].sceneId !== section.scenes[0]?.id || take.cues[0].timeMs !== 0) return false
  const sceneIds = new Set(section.scenes.map((scene) => scene.id))
  return take.cues.every((cue) => sceneIds.has(cue.sceneId) && cue.timeMs >= 0 && cue.timeMs <= take.durationMs + 100)
}

export function NarrationStudio({ presentation, initialSceneIndex, onPresentationChange, onExit, onError }: NarrationStudioProps) {
  const sections = presentation.narration?.sections ?? EMPTY_SECTIONS
  const safeInitialSceneIndex = Math.max(0, Math.min(initialSceneIndex, Math.max(0, presentation.scenes.length - 1)))
  const initialSceneId = presentation.scenes[safeInitialSceneIndex]?.id
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(() =>
    sections.find((section) => initialSceneId && section.sceneIds.includes(initialSceneId))?.id ?? sections[0]?.id ?? null)
  const [activeRelativeIndex, setActiveRelativeIndex] = useState(0)
  const activeRelativeIndexRef = useRef(0)
  const [fallbackSceneIndex, setFallbackSceneIndex] = useState(safeInitialSceneIndex)
  const [direction, setDirection] = useState<1 | -1>(1)
  const [renderInstanceKey, setRenderInstanceKey] = useState(() => `narration-${Date.now()}`)
  const [takeMap, setTakeMap] = useState<Record<string, NarrationTake[]>>({})
  const takeMapRef = useRef(takeMap)
  const [localError, setLocalError] = useState('')
  const [editingNew, setEditingNew] = useState(false)
  const [draftStart, setDraftStart] = useState(safeInitialSceneIndex)
  const [draftEnd, setDraftEnd] = useState(safeInitialSceneIndex)
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
    const matching = sections.find((section) => initialSceneId && section.sceneIds.includes(initialSceneId))
    setSelectedSectionId(matching?.id ?? sections[0]?.id ?? null)
    setActiveRelativeIndex(0)
  }, [editingNew, initialSceneId, sections, selectedSectionId])

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

  const showCueScene = useCallback((sceneId: string) => {
    if (!selectedResolved) return
    const nextIndex = selectedResolved.scenes.findIndex((scene) => scene.id === sceneId)
    if (nextIndex < 0) {
      showError('A saved cue points to a scene outside this section. Playback continued without changing the visual.')
      return
    }
    setDirection(nextIndex >= activeRelativeIndexRef.current ? 1 : -1)
    activeRelativeIndexRef.current = nextIndex
    setActiveRelativeIndex(nextIndex)
  }, [selectedResolved, showError])

  const playback = useNarrationPlayback({ onSceneCue: showCueScene, onError: showError })

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
    .flatMap((section) => section.sceneIds)), [editingNew, sections, selectedSectionId])
  const rangeIds = draftStart <= draftEnd
    ? presentation.scenes.slice(draftStart, draftEnd + 1).map((scene) => scene.id)
    : []
  const rangeOverlap = rangeIds.some((id) => occupiedIds.has(id))
  const rangeValid = rangeIds.length > 0 && !rangeOverlap

  const startNewSection = () => {
    if (recorderBusy) return
    const currentScene = selectedResolved?.indices[activeRelativeIndex] ?? fallbackSceneIndex
    const occupied = new Set(sections.flatMap((section) => section.sceneIds))
    const availableIndices = presentation.scenes
      .map((scene, index) => occupied.has(scene.id) ? -1 : index)
      .filter((index) => index >= 0)
    const targetScene = availableIndices.includes(currentScene)
      ? currentScene
      : availableIndices.find((index) => index > currentScene) ?? availableIndices[0]
    if (targetScene === undefined) {
      showError('Every scene already belongs to a narration section. Adjust or delete a section before creating another.')
      return
    }
    setEditingNew(true)
    setSelectedSectionId(null)
    setFallbackSceneIndex(targetScene)
    setDraftStart(targetScene)
    setDraftEnd(targetScene)
    setDraftTitle(`Section ${sections.length + 1}`)
  }

  const saveSection = async () => {
    if (!rangeValid) return
    const title = draftTitle.trim() || `Section ${editingNew ? sections.length + 1 : sections.findIndex((section) => section.id === selectedSectionId) + 1}`
    if (editingNew) {
      const created = { id: makeId('section'), title, sceneIds: rangeIds }
      updateSections([...sections, created])
      setSelectedSectionId(created.id)
      setEditingNew(false)
    } else if (selectedSection) {
      const rangeChanged = selectedSection.sceneIds.length !== rangeIds.length
        || selectedSection.sceneIds.some((sceneId, index) => sceneId !== rangeIds[index])
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
        ? { ...section, title, sceneIds: rangeIds }
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

  const moveVisual = useCallback((offset: -1 | 1, recordCue = false) => {
    if (!selectedResolved?.valid) return
    const current = activeRelativeIndexRef.current
    const next = Math.max(0, Math.min(current + offset, selectedResolved.scenes.length - 1))
    if (next === current) return
    setDirection(offset)
    if (recordCue) recorder.addCue(selectedResolved.scenes[next].id)
    activeRelativeIndexRef.current = next
    setActiveRelativeIndex(next)
  }, [recorder.addCue, selectedResolved])

  useEffect(() => {
    if (recorder.status !== 'recording') return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === ' ' || event.key === 'ArrowRight') {
        event.preventDefault()
        moveVisual(1, true)
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        moveVisual(-1, true)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [moveVisual, recorder.status])

  const beginTake = () => {
    if (!selectedSection || !selectedResolved?.valid || !selectedResolved.scenes[0]) return
    playback.stop()
    recordingSectionIdRef.current = selectedSection.id
    recorder.startRecording(selectedResolved.scenes[0].id)
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
  const currentScene = selectedResolved?.scenes[activeRelativeIndex]
    ?? presentation.scenes[fallbackSceneIndex]
    ?? presentation.scenes[0]
  const currentOverallIndex = currentScene ? presentation.scenes.findIndex((scene) => scene.id === currentScene.id) : -1
  const nextScene = selectedResolved?.scenes[activeRelativeIndex + 1]
  const selectedTakes = selectedSection ? takeMap[selectedSection.id] ?? [] : []
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
          <div className="narration-panel-heading"><h2>Sections</h2><button onClick={startNewSection} disabled={recorderBusy || presentation.scenes.length === 0}>New section</button></div>
          {sections.length === 0 && <p className="narration-empty">Create a section from the current scene to begin.</p>}
          <ol className="narration-section-list">
            {sections.map((section, index) => {
              const resolved = resolveSection(section, presentation)
              const isReady = (takeMap[section.id] ?? []).some((take) => take.selected && takeIsUsable(take, resolved))
              return <li key={section.id}><button className={section.id === selectedSectionId ? 'is-active' : ''} onClick={() => selectSection(section.id)} disabled={recorderBusy}>
                <span className={`narration-ready-dot ${isReady ? 'is-ready' : ''}`}>{isReady ? <CheckIcon /> : '○'}</span>
                <span><strong>{section.title || `Section ${index + 1}`}</strong><small>{resolved.valid ? `Scenes ${resolved.indices[0] + 1}–${resolved.indices.at(-1)! + 1}` : 'Needs repair'}</small></span>
              </button></li>
            })}
          </ol>
        </aside>

        <section className="narration-stage-panel">
          {currentScene ? <Stage
            scene={currentScene}
            accent={presentation.accent}
            presentationId={presentation.id}
            sceneNumber={currentOverallIndex + 1}
            sceneCount={presentation.scenes.length}
            direction={direction}
            renderInstanceKey={renderInstanceKey}
            className="narration-stage"
          /> : <div className="narration-empty-stage">Add a scene before recording narration.</div>}
          <div className="narration-progress">
            {selectedResolved && <span>Scene {Math.min(activeRelativeIndex + 1, selectedResolved.scenes.length)} / {selectedResolved.scenes.length} in section</span>}
            {currentOverallIndex >= 0 && <span>Presentation scene {currentOverallIndex + 1} / {presentation.scenes.length}</span>}
          </div>
        </section>

        <aside className="narration-script-panel">
          <div className="narration-section-title">
            <span>Current section</span>
            <h2>{selectedSection?.title ?? (editingNew ? 'New section' : 'No section selected')}</h2>
          </div>
          {selectedResolved && !selectedResolved.valid && <div className="narration-section-warning" role="status">{selectedResolved.issue}</div>}
          <section className="narration-notes current-notes"><span>Current speaker notes</span><p>{currentScene?.notes?.trim() || 'No speaker notes for this scene.'}</p></section>
          <section className="narration-notes next-notes"><span>Next scene{nextScene ? ` · ${nextScene.title}` : ''}</span><p>{nextScene?.notes?.trim() || (nextScene ? 'No speaker notes for the next scene.' : 'End of this section.')}</p></section>

          {(selectedSection || editingNew) && <div className="narration-section-editor">
            <label><span>Section name</span><input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} disabled={recorderBusy} /></label>
            <div className="narration-range-fields">
              <label><span>Start</span><select value={draftStart} onChange={(event) => setDraftStart(Number(event.target.value))} disabled={recorderBusy}>
                {presentation.scenes.map((scene, index) => <option key={scene.id} value={index}>Scene {index + 1}: {scene.title}</option>)}
              </select></label>
              <label><span>End</span><select value={draftEnd} onChange={(event) => setDraftEnd(Number(event.target.value))} disabled={recorderBusy}>
                {presentation.scenes.map((scene, index) => <option key={scene.id} value={index}>Scene {index + 1}: {scene.title}</option>)}
              </select></label>
            </div>
            {draftStart > draftEnd && <p className="field-error">The end scene must be at or after the start scene.</p>}
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
            <button onClick={() => moveVisual(-1, true)} disabled={activeRelativeIndex <= 0}><ArrowLeftIcon /> Previous visual</button>
            <button onClick={() => moveVisual(1, true)} disabled={!selectedResolved || activeRelativeIndex >= selectedResolved.scenes.length - 1}>Next visual <ArrowRightIcon /></button>
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
