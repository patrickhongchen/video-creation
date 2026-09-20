import { useEffect, useMemo, useRef, useState } from 'react'
import type { Presentation } from '../model'
import { slugify } from '../presentationFactories'
import { listNarrationTakes } from '../narration/narrationDb'
import { browserCanDecodeTake } from '../narration/audioDecoding'
import { buildFinalPlaybackPlan } from '../finalPlayback/buildFinalPlaybackPlan'
import type { NarrationTakesBySection } from '../finalPlayback/finalPlaybackTypes'
import { useFinalPlayback } from '../finalPlayback/useFinalPlayback'
import { buildDesktopExportJob, getDesktopBridge } from '../desktop/desktopBridge'
import type { DesktopExportProgress } from '../desktop/desktopTypes'
import { Stage } from './Stage'
import { CheckIcon, CloseIcon, PlayIcon } from './Icons'

interface FinalVideoStudioProps {
  presentation: Presentation
  onExit: () => void
  onOpenNarration: () => void
}

type ExportState = 'ready' | 'preparing' | 'rendering' | 'exported'

function formatTime(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1_000))
  const minutes = Math.floor(seconds / 60)
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

function localDateStamp() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function createJobId() {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `export-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function FinalVideoStudio({ presentation, onExit, onOpenNarration }: FinalVideoStudioProps) {
  const desktop = getDesktopBridge()
  const [takesBySection, setTakesBySection] = useState<NarrationTakesBySection>({})
  const [takesStatus, setTakesStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [decodeStatus, setDecodeStatus] = useState<'waiting' | 'checking' | 'ready'>('waiting')
  const [decodeIssues, setDecodeIssues] = useState<Record<string, string>>({})
  const [exportState, setExportState] = useState<ExportState>('ready')
  const [exportProgress, setExportProgress] = useState<DesktopExportProgress | null>(null)
  const [outputPath, setOutputPath] = useState('')
  const [error, setError] = useState('')
  const exportAttemptRef = useRef(0)

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
        : [entry.sectionId, `“${entry.title}” cannot be decoded for Final Playback Preview. Desktop export may still decode it with FFmpeg.`] as const
    }))
      .then((results) => {
        if (cancelled) return
        setDecodeIssues(results.reduce<Record<string, string>>((entries, result) => {
          if (result) entries[result[0]] = result[1]
          return entries
        }, {}))
        setDecodeStatus('ready')
      })
      .catch(() => {
        if (cancelled) return
        setDecodeStatus('ready')
        setDecodeIssues({ preview: 'Selected audio could not be checked for Final Playback Preview.' })
      })
    return () => { cancelled = true }
  }, [plan.readiness, takesStatus])

  useEffect(() => {
    if (!desktop) return
    return desktop.onExportProgress((progress) => {
      setExportState('rendering')
      setExportProgress(progress)
    })
  }, [desktop])

  const playback = useFinalPlayback({ plan, onError: setError })
  useEffect(() => () => {
    playback.stop()
    void playback.disposeAudio()
  }, [playback.stop, playback.disposeAudio])

  const activeSceneIndex = Math.max(0, presentation.scenes.findIndex((scene) => scene.id === playback.activeSceneId))
  const activeScene = presentation.scenes[activeSceneIndex] ?? presentation.scenes[0]
  const previousSceneIndexRef = useRef(activeSceneIndex)
  const direction: 1 | -1 = activeSceneIndex >= previousSceneIndexRef.current ? 1 : -1
  useEffect(() => { previousSceneIndexRef.current = activeSceneIndex }, [activeSceneIndex])

  const decodeIssueCount = Object.keys(decodeIssues).length
  const readinessIssueCount = plan.readinessIssues.length
  const exportReady = takesStatus === 'ready' && plan.isReady
  const previewReady = exportReady && decodeStatus === 'ready' && decodeIssueCount === 0
  const busy = exportState === 'preparing' || exportState === 'rendering'
  const previewProgress = playback.totalDurationMs > 0
    ? Math.min(100, (playback.currentTimeMs / playback.totalDurationMs) * 100)
    : 0

  const startExport = async () => {
    if (!desktop || !exportReady || busy) return
    const attempt = exportAttemptRef.current + 1
    exportAttemptRef.current = attempt
    playback.stop()
    setError('')
    setOutputPath('')
    setExportProgress(null)
    setExportState('preparing')
    try {
      const sourceSegments = plan.segments.map((segment) => segment.type === 'silent-scene'
        ? { ...segment }
        : {
            type: 'narration' as const,
            sectionId: segment.sectionId,
            title: segment.title,
            sceneIds: [...segment.sceneIds],
            durationMs: segment.durationMs,
            cues: segment.take.cues.map((cue) => ({ ...cue })),
            takeId: segment.take.id,
            mimeType: segment.take.mimeType,
            blob: segment.take.blob,
          })
      const job = await buildDesktopExportJob({
        jobId: createJobId(),
        presentation: structuredClone(presentation),
        editorViewportWidth: window.innerWidth,
        totalDurationMs: plan.totalDurationMs,
        finalHoldMs: plan.finalHoldMs,
        suggestedBaseName: `${slugify(presentation.title || presentation.id)}-${localDateStamp()}`,
        segments: sourceSegments,
      })
      if (exportAttemptRef.current !== attempt) return
      const result = await desktop.exportVideo(job)
      if (exportAttemptRef.current !== attempt) return
      if (result.status === 'completed') {
        setOutputPath(result.outputPath)
        setExportState('exported')
        setExportProgress((current) => current ?? {
          jobId: job.jobId,
          elapsedMs: plan.totalDurationMs,
          totalDurationMs: plan.totalDurationMs,
          percent: 100,
        })
      } else {
        setExportState('ready')
        setExportProgress(null)
      }
    } catch (problem) {
      setExportState('ready')
      setExportProgress(null)
      setError(problem instanceof Error ? problem.message : 'Final video export failed.')
    }
  }

  const cancelExport = async () => {
    if (!desktop) return
    exportAttemptRef.current += 1
    try {
      await desktop.cancelExport()
    } finally {
      setExportState('ready')
      setExportProgress(null)
    }
  }

  const leaveStudio = () => {
    playback.stop()
    void playback.disposeAudio()
    onExit()
  }

  const elapsedMs = exportProgress?.elapsedMs ?? 0
  const progress = exportProgress?.percent ?? 0
  const progressSceneIndex = exportProgress?.activeSceneId
    ? presentation.scenes.findIndex((scene) => scene.id === exportProgress.activeSceneId)
    : -1

  return (
    <main className={`final-video-studio${busy ? ' is-rendering' : ''}`}>
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
          {decodeStatus === 'checking' ? <p className="final-muted">Checking selected audio for preview…</p> : null}
          <ol className="final-readiness-list">
            {plan.readiness.map((entry) => {
              const decodeIssue = decodeIssues[entry.sectionId]
              return <li key={entry.sectionId} className={entry.ready ? 'is-ready' : 'has-issue'}>
                <span>{entry.ready ? <CheckIcon /> : '×'}</span>
                <div><strong>{entry.title || 'Untitled section'}</strong><small>{entry.issue ?? decodeIssue ?? `${formatTime(entry.selectedTake?.durationMs ?? 0)} selected take`}</small></div>
              </li>
            })}
          </ol>
          {plan.readiness.length === 0 && takesStatus === 'ready' ? <p className="final-notice">No narration sections. This will be a completely silent visual video.</p> : null}
          {readinessIssueCount > 0 ? <p className="final-blocked-note"><strong>{readinessIssueCount} narration section{readinessIssueCount === 1 ? '' : 's'} need{readinessIssueCount === 1 ? 's' : ''} attention.</strong> Final playback and export stay blocked until every section is ready.</p> : null}
          {decodeIssueCount > 0 ? <p className="final-warning">Final Playback Preview is unavailable for selected audio that Chromium cannot decode. Desktop export will ask FFmpeg to decode the original take.</p> : null}
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
          <div className="final-panel-heading"><span>02</span><div><small>Playback source</small><h2>Final Playback Preview</h2></div></div>
          <div className="final-stage-well">
            <Stage scene={activeScene} accent={presentation.accent} presentationId={presentation.id} sceneNumber={activeSceneIndex + 1} sceneCount={presentation.scenes.length} direction={direction} renderInstanceKey={playback.renderInstanceKey} className="final-stage" />
          </div>
          <div className="final-playback-status">
            <span>{formatTime(playback.currentTimeMs)} / {formatTime(playback.totalDurationMs)}</span>
            <span>Scene {activeSceneIndex + 1} / {presentation.scenes.length}</span>
            <span>{playback.activeSegment?.type === 'narration' ? `Section: ${playback.activeSegment.title}` : playback.activeSegment ? 'Silent visual beat' : 'Ready'}</span>
          </div>
          <div className="final-progress-track" aria-label={`${Math.round(previewProgress)} percent complete`}><i style={{ width: `${previewProgress}%` }} /></div>
          <div className="final-playback-controls">
            <button className="final-primary-button" onClick={() => void playback.play()} disabled={!previewReady || busy || playback.status === 'playing'}><PlayIcon /> {playback.status === 'paused' ? 'Resume' : 'Preview Final Playback'}</button>
            <button onClick={playback.pause} disabled={playback.status !== 'playing'}>Pause</button>
            <button onClick={() => void playback.restart()} disabled={!previewReady || busy}>Restart</button>
            <button onClick={playback.stop} disabled={playback.status === 'idle'}>Stop</button>
          </div>
        </section>

        <aside className="final-export-panel">
          <div className="final-panel-heading"><span>03</span><div><small>Desktop export</small><h2>Direct MP4</h2></div></div>
          <div className="final-export-spec">
            <strong>1080 × 1920</strong>
            <span>30 fps · H.264 · AAC</span>
            <small>Rendered from a dedicated hidden Stage and written directly to disk.</small>
          </div>

          {!desktop ? <div className="final-desktop-required"><strong>Desktop app required for direct MP4 export.</strong><span>Edit, Present, Narration, and Final Playback Preview remain available in this browser.</span></div> : null}

          {desktop && exportState === 'ready' ? <>
            <p className="final-export-help">Choose a destination, then Video Essay Studio will render the presentation in a dedicated 1080 × 1920 desktop surface. No screen-sharing permission is used.</p>
            <button className="final-render-button" onClick={() => void startExport()} disabled={!exportReady}>Export Final Video</button>
          </> : null}

          {desktop && busy ? <div className="final-render-state">
            <span>● Rendering video…</span>
            <strong>{formatTime(elapsedMs)} / {formatTime(plan.totalDurationMs)}</strong>
            <small>{progressSceneIndex >= 0 ? `Scene ${progressSceneIndex + 1} / ${presentation.scenes.length}` : 'Preparing hidden renderer…'}{exportProgress?.activeSectionTitle ? ` · Section: ${exportProgress.activeSectionTitle}` : ''}</small>
            <div className="final-progress-track" aria-label={`${Math.round(progress)} percent exported`}><i style={{ width: `${progress}%` }} /></div>
            <button className="final-danger-button" onClick={() => void cancelExport()}>Cancel Export</button>
          </div> : null}

          {desktop && exportState === 'exported' ? <div className="final-export-success">
            <span className="final-ready-label"><CheckIcon /> Video exported</span>
            <p title={outputPath}>{outputPath}</p>
            <button className="final-render-button" onClick={() => void desktop.openVideo(outputPath)}>Open Video</button>
            <button className="final-secondary-button" onClick={() => void desktop.showInFinder(outputPath)}>Show in Finder</button>
            <button className="final-secondary-button" onClick={() => { setExportState('ready'); setOutputPath(''); setExportProgress(null) }}>Export Again</button>
          </div> : null}
        </aside>
      </div>
    </main>
  )
}
