import { useEffect, useMemo, useRef, useState } from 'react'
import type { Presentation } from '../model'
import { slugify } from '../presentationFactories'
import { listNarrationTakes } from '../narration/narrationDb'
import { buildFinalPlaybackPlan } from '../finalPlayback/buildFinalPlaybackPlan'
import type { NarrationTakesBySection } from '../finalPlayback/finalPlaybackTypes'
import { useFinalProgramPlayback } from '../finalPlayback/useFinalProgramPlayback'
import { buildFinalPreviewAudioRequest } from '../finalPlayback/buildFinalPreviewAudioRequest'
import { buildDesktopExportJob, getDesktopBridge } from '../desktop/desktopBridge'
import type { DesktopExportProgress } from '../desktop/desktopTypes'
import { Stage } from './Stage'
import { NarrationSlideThumbnail } from './NarrationSlideThumbnail'
import { previousSlideFor, slideRevealOrders, timedRevealStateAtTime } from '../entranceAnimation'
import { resolveNarrationVisualAtTime } from '../narration/resolveNarrationVisual'
import { ArrowLeftIcon, CheckIcon, CloseIcon, PlayIcon } from './Icons'
import { validatePresentation } from '../presentationValidation'
import { decodePresentationAssets, findMissingPresentationAssets } from '../projectAssetReadiness'
import { resolveFinalPlaybackSeek } from '../finalPlayback/resolveFinalPlaybackSeek'

interface FinalVideoStudioProps {
  presentation: Presentation
  onExit: () => void
  onOpenNarration: (sectionId: string) => void
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
  const [previewAudioStatus, setPreviewAudioStatus] = useState<'waiting' | 'preparing' | 'ready' | 'error'>('waiting')
  const [previewAudio, setPreviewAudio] = useState<Blob | null>(null)
  const [previewWarnings, setPreviewWarnings] = useState<string[]>([])
  const [exportState, setExportState] = useState<ExportState>('ready')
  const [exportProgress, setExportProgress] = useState<DesktopExportProgress | null>(null)
  const [outputPath, setOutputPath] = useState('')
  const [error, setError] = useState('')
  const [scrubTimeMs, setScrubTimeMs] = useState<number | null>(null)
  const scrubTimeRef = useRef<number | null>(null)
  const activeRailEntryRef = useRef<HTMLDivElement | null>(null)
  const exportAttemptRef = useRef(0)

  const plan = useMemo(
    () => buildFinalPlaybackPlan(presentation, takesBySection),
    [presentation, takesBySection],
  )
  const presentationIssue = useMemo(() => {
    try {
      validatePresentation(presentation)
      return ''
    } catch (problem) {
      return problem instanceof Error ? problem.message : 'The presentation contains invalid slide data.'
    }
  }, [presentation])
  const assetIssues = useMemo(() => findMissingPresentationAssets(presentation), [presentation])

  useEffect(() => {
    let cancelled = false
    setTakesStatus('loading')
    setTakesBySection({})
    setPreviewAudioStatus('waiting')
    setPreviewAudio(null)
    setPreviewWarnings([])
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
    if (!desktop || takesStatus !== 'ready' || !plan.isReady) return
    let cancelled = false
    setPreviewAudioStatus('preparing')
    setPreviewAudio(null)
    setPreviewWarnings([])
    void buildFinalPreviewAudioRequest(plan, presentation.voiceEnhance)
      .then((request) => desktop.prepareFinalPreviewAudio(request))
      .then((result) => {
        if (cancelled) return
        if (result.durationMs !== plan.totalDurationMs) throw new Error('The mastered preview duration does not match the playback plan.')
        setPreviewAudio(new Blob([result.bytes], { type: result.mimeType }))
        setPreviewWarnings(result.warnings)
        setPreviewAudioStatus('ready')
      })
      .catch((problem) => {
        if (cancelled) return
        setPreviewAudioStatus('error')
        setError(problem instanceof Error ? `Mastered preview could not be prepared: ${problem.message}` : 'Mastered preview could not be prepared.')
      })
    return () => { cancelled = true }
  }, [desktop, plan, presentation.voiceEnhance, takesStatus])

  useEffect(() => {
    if (!desktop) return
    return desktop.onExportProgress((progress) => {
      setExportState('rendering')
      setExportProgress(progress)
    })
  }, [desktop])

  const playback = useFinalProgramPlayback(plan, previewAudio, setError)
  useEffect(() => () => {
    playback.stop()
    void playback.disposeAudio()
  }, [playback.stop, playback.disposeAudio])

  const scrubPosition = scrubTimeMs === null ? null : resolveFinalPlaybackSeek(plan, scrubTimeMs)
  const visualSegment = scrubPosition ? plan.segments[scrubPosition.segmentIndex] : playback.activeSegment
  const activeSegmentIndex = visualSegment ? plan.segments.indexOf(visualSegment) : -1
  const segmentStartMs = activeSegmentIndex < 0 ? 0 : plan.segments.slice(0, activeSegmentIndex).reduce((sum, segment) => sum + segment.durationMs, 0)
  const segmentElapsedMs = scrubPosition?.segmentElapsedMs ?? Math.max(0, playback.currentTimeMs - segmentStartMs)
  const narrationVisual = visualSegment?.type === 'narration'
    ? resolveNarrationVisualAtTime(
        visualSegment.take.cues,
        segmentElapsedMs,
        presentation.slides,
        visualSegment.sceneIds[0],
      )
    : null
  const activeSlideIndex = narrationVisual?.slideIndex
    ?? Math.max(0, presentation.slides.findIndex((slide) => slide.id === (scrubPosition?.sceneId ?? playback.activeSceneId)))
  const activeSlide = presentation.slides[activeSlideIndex] ?? presentation.slides[0]
  const activeRevealState = (playback.status === 'idle' && !scrubPosition) || !visualSegment
    ? null
    : narrationVisual
      ? narrationVisual.revealState
      : timedRevealStateAtTime(
          slideRevealOrders(activeSlide, previousSlideFor(presentation.slides, activeSlide)),
          segmentElapsedMs,
        )
  const previousSlideIndexRef = useRef(activeSlideIndex)
  const direction: 1 | -1 = activeSlideIndex >= previousSlideIndexRef.current ? 1 : -1
  useEffect(() => { previousSlideIndexRef.current = activeSlideIndex }, [activeSlideIndex])
  useEffect(() => { activeRailEntryRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }, [activeSlideIndex])

  const readinessIssueCount = plan.readinessIssues.length
  const exportReady = takesStatus === 'ready' && plan.isReady && !presentationIssue && assetIssues.length === 0
  const previewReady = exportReady && previewAudioStatus === 'ready' && previewAudio !== null
  const busy = exportState === 'preparing' || exportState === 'rendering'
  const displayedTimeMs = scrubTimeMs ?? playback.currentTimeMs

  const commitScrub = () => {
    const timeMs = scrubTimeRef.current
    if (timeMs === null) return
    scrubTimeRef.current = null
    setScrubTimeMs(null)
    void playback.seek(timeMs)
  }

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
      await decodePresentationAssets(presentation)
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

  const openSection = (sectionId: string) => {
    playback.stop()
    void playback.disposeAudio()
    onOpenNarration(sectionId)
  }

  const elapsedMs = exportProgress?.elapsedMs ?? 0
  const progress = exportProgress?.percent ?? 0
  const progressSlideIndex = exportProgress?.activeSceneId
    ? presentation.slides.findIndex((slide) => slide.id === exportProgress.activeSceneId)
    : -1

  return (
    <main className={`narration-studio final-video-studio${busy ? ' is-rendering' : ''}${error ? ' has-error' : ''}`}>
      <header className="narration-header final-video-header">
        <div><h1>Narration Studio</h1></div>
        <div className="final-video-header-summary"><strong>Preview &amp; export</strong><span>{formatTime(plan.totalDurationMs)} total</span></div>
        <button className="final-video-exit" onClick={leaveStudio} disabled={busy}><ArrowLeftIcon /> Back to narration</button>
      </header>

      {error && <div className="narration-error" role="alert"><span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss error"><CloseIcon /></button></div>}

      <div className="final-video-layout">
        <aside className="narration-slide-rail final-slide-rail" aria-label="Presentation slides during final preview">
          <div className="narration-rail-heading"><h2>Slides</h2><span>{activeSlideIndex + 1} / {presentation.slides.length}</span></div>
          <div className="narration-rail-scroll">{presentation.slides.map((slide, index) => {
            const sections = presentation.narration?.sections ?? []
            const owner = sections.find((section) => section.slideIds.includes(slide.id))
            const sectionIndex = owner ? sections.findIndex((section) => section.id === owner.id) : -1
            const isStart = owner?.slideIds[0] === slide.id
            const isCurrent = index === activeSlideIndex
            return <div className="narration-rail-entry" key={slide.id} ref={isCurrent ? activeRailEntryRef : undefined}>
              {isStart && <div className="narration-rail-boundary"><span>{owner.title === `Section ${sectionIndex + 1}` ? owner.title : `Section ${sectionIndex + 1} · ${owner.title}`}</span></div>}
              <div className={`narration-rail-slide${isCurrent ? ' is-current' : ''}`} aria-current={isCurrent ? 'step' : undefined}><NarrationSlideThumbnail presentation={presentation} slide={slide} index={index} /><span><small>Slide {index + 1}</small><strong>{slide.title || `Slide ${index + 1}`}</strong></span></div>
            </div>
          })}</div>
        </aside>

        <section className="final-stage-panel">
          <div className="final-stage-well">
            {activeSlide && <Stage slide={activeSlide} slides={presentation.slides} theme={presentation.theme} imageAssets={presentation.imageAssets} presentationId={presentation.id} slideNumber={activeSlideIndex + 1} slideCount={presentation.slides.length} direction={direction} renderInstanceKey={playback.renderInstanceKey} revealState={activeRevealState} className="final-stage" />}
          </div>
          <div className="final-scrubber-panel">
            <div className="final-scrubber-row">
              <button className="final-primary-button" onClick={() => playback.status === 'playing' ? playback.pause() : void playback.play()} disabled={!previewReady || busy}>{playback.status === 'playing' ? 'Pause' : <><PlayIcon /> {playback.status === 'paused' ? 'Resume' : 'Play video'}</>}</button>
              <span>{formatTime(displayedTimeMs)}</span>
              <input type="range" min="0" max={Math.max(1, playback.totalDurationMs)} step="100" value={Math.min(displayedTimeMs, playback.totalDurationMs)} disabled={!previewReady || busy} onChange={(event) => { const timeMs = Number(event.target.value); scrubTimeRef.current = timeMs; setScrubTimeMs(timeMs) }} onPointerUp={commitScrub} onPointerCancel={commitScrub} onKeyUp={commitScrub} onBlur={commitScrub} aria-label="Seek final video" />
              <span>{formatTime(playback.totalDurationMs)}</span>
            </div>
            <div className="final-playback-status"><span>Slide {activeSlideIndex + 1} of {presentation.slides.length}</span><span>{visualSegment?.type === 'narration' ? visualSegment.title : visualSegment ? 'Silent visual beat' : 'Ready'}</span></div>
          </div>
        </section>

        <aside className="final-export-panel">
          <div className="final-panel-heading"><div><small>Whole presentation</small><h2>Review &amp; export</h2></div></div>
          <div className="final-readiness-content">
          <p className="final-muted"><strong>{plan.readiness.length - readinessIssueCount} of {plan.readiness.length}</strong> sections ready · {formatTime(plan.totalDurationMs)} total</p>
          {takesStatus === 'loading' ? <p className="final-muted">Loading local takes…</p> : null}
          {previewAudioStatus === 'preparing' ? <p className="final-muted" role="status">Preparing mastered preview audio…</p> : null}
          {previewAudioStatus === 'error' ? <p className="final-warning">Mastered preview audio is unavailable. Export can still process the original takes.</p> : null}
          <ol className="final-readiness-list">
            {plan.readiness.map((entry) => {
              return <li key={entry.sectionId} className={entry.ready ? 'is-ready' : 'has-issue'}>
                <button className="final-readiness-row" onClick={() => openSection(entry.sectionId)} disabled={busy} title={`Return to ${entry.title || 'this section'}`}>
                  <span>{entry.ready ? <CheckIcon /> : '×'}</span>
                  <div><strong>{entry.title || 'Untitled section'}</strong><small>{entry.issue ?? `${formatTime(entry.selectedTake?.durationMs ?? 0)} selected take`}</small></div>
                </button>
              </li>
            })}
          </ol>
          {plan.readiness.length === 0 && takesStatus === 'ready' ? <p className="final-notice">No narration sections. This will be a completely silent visual video.</p> : null}
          {presentation.slides.length > 0 ? <p className={presentationIssue || assetIssues.length ? 'final-blocked-note' : 'final-notice'}><strong>{presentationIssue || assetIssues.length ? 'Slide preflight failed.' : `${presentation.slides.length} slide${presentation.slides.length === 1 ? '' : 's'} ready.`}</strong>{presentationIssue ? ` ${presentationIssue}` : assetIssues.length ? ` ${assetIssues.join(' ')}` : ' Image assets, element frames, charts, and shared identities are valid.'}</p> : null}
          {readinessIssueCount > 0 ? <p className="final-blocked-note"><strong>{readinessIssueCount} narration section{readinessIssueCount === 1 ? '' : 's'} need{readinessIssueCount === 1 ? 's' : ''} attention.</strong> Final playback and export stay blocked until every section is ready.</p> : null}
          {previewWarnings.map((warning, index) => <p key={`${index}-${warning}`} className="final-warning">{warning}</p>)}
          {plan.unassignedSlideCount > 0 ? <p className="final-notice">{plan.unassignedSlideCount} slide{plan.unassignedSlideCount === 1 ? ' has' : 's have'} no narration and will play as silent visual beat{plan.unassignedSlideCount === 1 ? '' : 's'}.</p> : null}
          {plan.warnings.filter((warning) => warning.kind === 'incomplete-cue-coverage' || warning.kind === 'reveal-cue-coverage').map((warning) => <p key={`${warning.kind}-${warning.sectionId}`} className="final-warning">{warning.message}</p>)}
          </div>
          <div className="final-export-dock">
          <div className="final-export-spec">
            <strong>1080 × 1920</strong>
            <span>MP4 · H.264 · AAC · 30 fps</span>
            <small>Final preview and export use the same assembled, mastered narration{presentation.voiceEnhance === 'standard' ? ' with Voice Enhance' : ''}.</small>
          </div>

          {!desktop ? <div className="final-desktop-required"><strong>Desktop app required for mastered preview and MP4 export.</strong><span>Audio processing uses the bundled local FFmpeg.</span></div> : null}

          {desktop && exportState === 'ready' ? <>
            <button className="final-render-button" onClick={() => void startExport()} disabled={!exportReady}>Export video</button>
          </> : null}

          {desktop && busy ? <div className="final-render-state">
            <span>● Rendering video…</span>
            <strong>{formatTime(elapsedMs)} / {formatTime(plan.totalDurationMs)}</strong>
            <small>{progressSlideIndex >= 0 ? `Slide ${progressSlideIndex + 1} / ${presentation.slides.length}` : 'Preparing hidden renderer…'}{exportProgress?.activeSectionTitle ? ` · Section: ${exportProgress.activeSectionTitle}` : ''}</small>
            <div className="final-progress-track" aria-label={`${Math.round(progress)} percent exported`}><i style={{ width: `${progress}%` }} /></div>
            <button className="final-danger-button" onClick={() => void cancelExport()}>Cancel export</button>
          </div> : null}

          {desktop && exportState === 'exported' ? <div className="final-export-success">
            <span className="final-ready-label"><CheckIcon /> Video exported</span>
            <p title={outputPath}>{outputPath}</p>
            <button className="final-render-button" onClick={() => void desktop.openVideo(outputPath)}>Open Video</button>
            <button className="final-secondary-button" onClick={() => void desktop.showInFinder(outputPath)}>Show in Finder</button>
            <button className="final-secondary-button" onClick={() => { setExportState('ready'); setOutputPath(''); setExportProgress(null) }}>Export Again</button>
          </div> : null}
          </div>
        </aside>
      </div>
    </main>
  )
}
