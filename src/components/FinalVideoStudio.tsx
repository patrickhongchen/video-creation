import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Presentation } from '../model'
import { slugify } from '../presentationFactories'
import { listNarrationTakes } from '../narration/narrationDb'
import { browserCanDecodeTake } from '../narration/audioDecoding'
import { buildFinalPlaybackPlan } from '../finalPlayback/buildFinalPlaybackPlan'
import type { NarrationTakesBySection } from '../finalPlayback/finalPlaybackTypes'
import { useFinalPlayback } from '../finalPlayback/useFinalPlayback'
import { useFinalVideoRecorder } from '../recording/useFinalVideoRecorder'
import { Stage } from './Stage'
import { CheckIcon, CloseIcon, PlayIcon } from './Icons'

interface FinalVideoStudioProps {
  presentation: Presentation
  onExit: () => void
  onOpenNarration: () => void
}

function formatTime(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1_000))
  const minutes = Math.floor(seconds / 60)
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

function localDateStamp() {
  const date = new Date()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function FinalVideoStudio({ presentation, onExit, onOpenNarration }: FinalVideoStudioProps) {
  const [takesBySection, setTakesBySection] = useState<NarrationTakesBySection>({})
  const [takesStatus, setTakesStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [decodeStatus, setDecodeStatus] = useState<'waiting' | 'checking' | 'ready'>('waiting')
  const [decodeIssues, setDecodeIssues] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const stageRef = useRef<HTMLDivElement>(null)
  const outputCanvasRef = useRef<HTMLCanvasElement>(null)

  const plan = useMemo(
    () => buildFinalPlaybackPlan(presentation, takesBySection),
    [presentation, takesBySection],
  )

  useEffect(() => {
    let cancelled = false
    setTakesStatus('loading')
    setTakesBySection({})
    setDecodeStatus('waiting')
    setDecodeIssues({})
    Promise.all((presentation.narration?.sections ?? []).map(async (section) => [
      section.id,
      await listNarrationTakes(presentation.id, section.id),
    ] as const))
      .then((entries) => {
        if (cancelled) return
        setTakesBySection(Object.fromEntries(entries))
        setTakesStatus('ready')
      })
      .catch((problem) => {
        if (cancelled) return
        setTakesStatus('error')
        setError(problem instanceof Error ? `Narration recordings could not be loaded: ${problem.message}` : 'Narration recordings could not be loaded.')
      })
    return () => { cancelled = true }
  }, [presentation.id, presentation.narration?.sections])

  useEffect(() => {
    if (takesStatus !== 'ready') return
    let cancelled = false
    const selected = plan.readiness.filter((entry) => entry.ready && entry.selectedTake)
    setDecodeStatus('checking')
    setDecodeIssues({})
    Promise.all(selected.map(async (entry) => {
      const decodable = await browserCanDecodeTake(entry.selectedTake!)
      return decodable
        ? null
        : [entry.sectionId, `“${entry.title}” uses selected audio that this browser could not decode.`] as const
    })).then((results) => {
      if (cancelled) return
      const issues = results.reduce<Record<string, string>>((entries, result) => {
        if (result) entries[result[0]] = result[1]
        return entries
      }, {})
      setDecodeIssues(issues)
      setDecodeStatus('ready')
    })
    return () => { cancelled = true }
  }, [plan.readiness, takesStatus])

  const recorder = useFinalVideoRecorder({ onError: setError })
  const recorderStatusRef = useRef(recorder.status)
  recorderStatusRef.current = recorder.status
  const disposePlaybackAudioRef = useRef<() => Promise<void>>(async () => undefined)

  const handlePlaybackComplete = useCallback(() => {
    if (recorderStatusRef.current === 'recording') recorder.finishRecording()
  }, [recorder.finishRecording])

  const handlePlaybackError = useCallback((message: string) => {
    setError(message)
    if (recorderStatusRef.current === 'recording' || recorderStatusRef.current === 'finalizing') {
      recorder.cancelRender()
      void disposePlaybackAudioRef.current()
    }
  }, [recorder.cancelRender])

  const playback = useFinalPlayback({
    plan,
    onError: handlePlaybackError,
    onComplete: handlePlaybackComplete,
  })
  disposePlaybackAudioRef.current = playback.disposeAudio

  const previousRecorderStatusRef = useRef(recorder.status)
  useEffect(() => {
    const previousStatus = previousRecorderStatusRef.current
    previousRecorderStatusRef.current = recorder.status
    if ((previousStatus === 'recording' || previousStatus === 'finalizing') && recorder.status === 'unprepared') {
      playback.stop()
      void playback.disposeAudio()
    }
    if (recorder.status === 'review') void playback.disposeAudio()
  }, [recorder.status, playback.stop, playback.disposeAudio])

  useEffect(() => () => {
    playback.stop()
    recorder.cancelRender()
    void playback.disposeAudio()
  }, [playback.stop, playback.disposeAudio, recorder.cancelRender])

  const activeSceneIndex = Math.max(0, presentation.scenes.findIndex((scene) => scene.id === playback.activeSceneId))
  const activeScene = presentation.scenes[activeSceneIndex] ?? presentation.scenes[0]
  const previousSceneIndexRef = useRef(activeSceneIndex)
  const direction: 1 | -1 = activeSceneIndex >= previousSceneIndexRef.current ? 1 : -1
  useEffect(() => { previousSceneIndexRef.current = activeSceneIndex }, [activeSceneIndex])

  const decodeIssueCount = Object.keys(decodeIssues).length
  const readinessIssueCount = plan.readinessIssues.length + decodeIssueCount
  const ready = takesStatus === 'ready' && decodeStatus === 'ready' && plan.isReady && decodeIssueCount === 0
  const busy = recorder.status === 'preparing' || recorder.status === 'recording' || recorder.status === 'finalizing'
  const rendering = recorder.status === 'recording' || recorder.status === 'finalizing'
  const progress = playback.totalDurationMs > 0
    ? Math.min(100, (playback.currentTimeMs / playback.totalDurationMs) * 100)
    : 0

  const prepareCapture = async () => {
    setError('')
    playback.stop()
    const stage = stageRef.current
    const canvas = outputCanvasRef.current
    if (!stage || !canvas) {
      setError('The Stage or output preview is not available yet.')
      return
    }
    await recorder.prepare(stage, canvas)
  }

  const renderVideo = async () => {
    if (!ready || recorder.status !== 'ready') return
    setError('')
    playback.stop()
    try {
      const audioStream = await playback.ensureAudioReady()
      await recorder.beginRecording(audioStream)
      await playback.restart()
    } catch (problem) {
      playback.stop()
      recorder.cancelRender()
      void playback.disposeAudio()
      setError(problem instanceof Error ? problem.message : 'Final video rendering could not start.')
    }
  }

  const cancelRender = () => {
    playback.stop()
    recorder.cancelRender()
  }

  const cancelCapture = () => {
    playback.stop()
    recorder.cancelCapture()
    void playback.disposeAudio()
  }

  const leaveStudio = () => {
    playback.stop()
    recorder.cancelRender()
    void playback.disposeAudio()
    onExit()
  }

  const downloadVideo = () => {
    if (!recorder.videoUrl) return
    const link = document.createElement('a')
    link.href = recorder.videoUrl
    link.download = `${slugify(presentation.title || presentation.id)}-${localDateStamp()}.${recorder.extension}`
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  if (recorder.status === 'review' && recorder.videoUrl) {
    return (
      <main className="final-video-studio final-video-review">
        <header className="final-video-header">
          <div><span className="final-video-kicker">Final Video</span><h1>Review your render</h1></div>
          <button className="final-video-exit" onClick={leaveStudio}><CloseIcon /> Back to editor</button>
        </header>
        <section className="final-review-body">
          <video className="final-review-player" src={recorder.videoUrl} controls playsInline />
          <div className="final-review-copy">
            <span className="final-ready-label"><CheckIcon /> Render complete</span>
            <h2>{presentation.title}</h2>
            <p>Your {recorder.extension.toUpperCase()} video is kept in memory only. Download it before closing or refreshing this page.</p>
            <dl><div><dt>Frame</dt><dd>1080 × 1920</dd></div><div><dt>Rate</dt><dd>30 fps</dd></div><div><dt>Duration</dt><dd>{formatTime(playback.totalDurationMs)}</dd></div></dl>
            <div className="final-review-actions">
              <button className="final-primary-button" onClick={downloadVideo}>Download Video</button>
              <button onClick={() => { playback.stop(); recorder.discard(); void playback.disposeAudio() }}>Render Again</button>
              <button className="final-danger-button" onClick={() => { playback.stop(); recorder.discard(); void playback.disposeAudio() }}>Discard</button>
            </div>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className={`final-video-studio${rendering ? ' is-rendering' : ''}`}>
      <header className="final-video-header">
        <div><span className="final-video-kicker">Final Video</span><h1>{presentation.title}</h1></div>
        <div className="final-video-header-summary"><strong>{formatTime(plan.totalDurationMs)}</strong><span>estimated duration</span></div>
        <button className="final-video-exit" onClick={leaveStudio} disabled={busy}><CloseIcon /> Back to editor</button>
      </header>

      {error && <div className="narration-error" role="alert"><span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss error"><CloseIcon /></button></div>}

      <div className="final-video-layout">
        <aside className="final-readiness-panel">
          <div className="final-panel-heading"><span>01</span><div><small>Preflight</small><h2>Narration readiness</h2></div></div>
          {takesStatus === 'loading' ? <p className="final-muted">Loading local takes…</p> : null}
          {decodeStatus === 'checking' ? <p className="final-muted">Checking selected audio…</p> : null}
          <ol className="final-readiness-list">
            {plan.readiness.map((entry) => {
              const decodeIssue = decodeIssues[entry.sectionId]
              const entryReady = entry.ready && !decodeIssue
              return <li key={entry.sectionId} className={entryReady ? 'is-ready' : 'has-issue'}>
                <span>{entryReady ? <CheckIcon /> : '×'}</span>
                <div><strong>{entry.title || 'Untitled section'}</strong><small>{decodeIssue ?? entry.issue ?? `${formatTime(entry.selectedTake?.durationMs ?? 0)} selected take`}</small></div>
              </li>
            })}
          </ol>
          {plan.readiness.length === 0 && takesStatus === 'ready' ? <p className="final-notice">No narration sections. This will be a completely silent visual video.</p> : null}
          {readinessIssueCount > 0 ? <p className="final-blocked-note"><strong>{readinessIssueCount} narration section{readinessIssueCount === 1 ? '' : 's'} need{readinessIssueCount === 1 ? 's' : ''} attention.</strong> Preview and rendering stay blocked until every section is ready.</p> : null}
          <button className="final-secondary-button" onClick={onOpenNarration} disabled={busy}>Open Narration Studio</button>

          <div className="final-summary-card">
            <div><span>Scenes</span><strong>{presentation.scenes.length}</strong></div>
            <div><span>Silent beats</span><strong>{plan.unassignedSceneCount}</strong></div>
            <div><span>Run time</span><strong>{formatTime(plan.totalDurationMs)}</strong></div>
          </div>
          {plan.unassignedSceneCount > 0 ? <p className="final-notice">{plan.unassignedSceneCount} scene{plan.unassignedSceneCount === 1 ? ' has' : 's have'} no narration and will play as silent visual beat{plan.unassignedSceneCount === 1 ? '' : 's'}.</p> : null}
          {plan.warnings.filter((warning) => warning.kind === 'incomplete-cue-coverage').map((warning) => <p key={warning.sectionId} className="final-warning">{warning.message}</p>)}
        </aside>

        <section className="final-stage-panel">
          <div className="final-panel-heading"><span>02</span><div><small>Playback source</small><h2>Presentation Stage</h2></div></div>
          <div className="final-stage-well">
            <Stage
              ref={stageRef}
              scene={activeScene}
              accent={presentation.accent}
              presentationId={presentation.id}
              sceneNumber={activeSceneIndex + 1}
              sceneCount={presentation.scenes.length}
              direction={direction}
              renderInstanceKey={playback.renderInstanceKey}
              className="final-stage"
            />
          </div>
          <div className="final-playback-status">
            <span>{formatTime(playback.currentTimeMs)} / {formatTime(playback.totalDurationMs)}</span>
            <span>Scene {activeSceneIndex + 1} / {presentation.scenes.length}</span>
            <span>{playback.activeSegment?.type === 'narration' ? `Section: ${playback.activeSegment.title}` : playback.activeSegment ? 'Silent visual beat' : 'Ready'}</span>
          </div>
          <div className="final-progress-track" aria-label={`${Math.round(progress)} percent complete`}><i style={{ width: `${progress}%` }} /></div>
          <div className="final-playback-controls">
            <button className="final-primary-button" onClick={() => void playback.play()} disabled={!ready || busy || playback.status === 'playing'}><PlayIcon /> {playback.status === 'paused' ? 'Resume' : 'Preview Final Playback'}</button>
            <button onClick={playback.pause} disabled={playback.status !== 'playing' || rendering}>Pause</button>
            <button onClick={() => void playback.restart()} disabled={!ready || busy}>Restart</button>
            <button onClick={playback.stop} disabled={playback.status === 'idle' || rendering}>Stop</button>
          </div>
        </section>

        <aside className="final-capture-panel">
          <div className="final-panel-heading"><span>03</span><div><small>Browser-native capture</small><h2>Output crop</h2></div></div>
          <div className={`final-output-preview${recorder.status === 'ready' || rendering ? ' is-live' : ''}`}>
            <canvas ref={outputCanvasRef} width={1080} height={1920} aria-label="Live 1080 by 1920 output crop preview" />
            {recorder.status === 'unprepared' && <span>Prepare capture to inspect the exact video crop.</span>}
            {recorder.status === 'preparing' && <span>Choose this browser tab in the share dialog…</span>}
          </div>
          <p className="final-capture-help">Share the current Video Essay Studio browser tab. Display audio is not used; the selected narration takes feed the recording directly.</p>

          {recorder.status === 'unprepared' && <button className="final-capture-button" onClick={() => void prepareCapture()} disabled={!ready}>Prepare Video Capture</button>}
          {recorder.status === 'preparing' && <button className="final-capture-button" disabled>Preparing capture…</button>}
          {recorder.status === 'ready' && <>
            <span className="final-ready-label"><CheckIcon /> Capture ready · inspect the crop</span>
            <button className="final-render-button" onClick={() => void renderVideo()} disabled={!ready}>Render Final Video</button>
            <button className="final-secondary-button" onClick={cancelCapture}>Cancel Capture</button>
          </>}
          {rendering && <div className="final-render-state">
            <span>● Rendering Final Video</span>
            <strong>{formatTime(playback.currentTimeMs)} / {formatTime(playback.totalDurationMs)}</strong>
            <small>Real-time render · keep this tab visible and unchanged</small>
            <button className="final-danger-button" onClick={cancelRender}>Cancel Render</button>
          </div>}
        </aside>
      </div>
    </main>
  )
}
