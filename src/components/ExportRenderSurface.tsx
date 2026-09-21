import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { DesktopExportJob } from '../desktop/desktopTypes'
import { resolvePlaybackVisual } from '../finalPlayback/resolvePlaybackVisual'
import { Stage } from './Stage'

export function ExportRenderSurface() {
  const bridge = window.videoEssayDesktop
  const [job, setJob] = useState<DesktopExportJob | null>(null)
  const [elapsedMs, setElapsedMs] = useState(0)
  const frameRef = useRef<number | null>(null)
  const previousSlideIndexRef = useRef(0)

  useEffect(() => {
    if (!bridge) return
    const notify = () => bridge.renderCalibrationReady()
    const frame = requestAnimationFrame(notify)
    return () => cancelAnimationFrame(frame)
  }, [bridge])

  useEffect(() => {
    if (!bridge) return
    return bridge.onRenderJob((nextJob) => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
      frameRef.current = null
      previousSlideIndexRef.current = 0
      setElapsedMs(0)
      setJob(nextJob)
    })
  }, [bridge])

  useLayoutEffect(() => {
    if (!bridge || !job) return
    const frame = requestAnimationFrame(() => bridge.renderReady(job.jobId))
    return () => cancelAnimationFrame(frame)
  }, [bridge, job])

  useEffect(() => {
    if (!bridge) return
    return bridge.onRenderStart(({ jobId }) => {
      if (!job || job.jobId !== jobId) return
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
      const startedAt = performance.now()
      setElapsedMs(0)
      bridge.renderStarted(jobId)
      const update = (now: number) => {
        const nextTime = Math.min(job.totalDurationMs, Math.max(0, now - startedAt))
        setElapsedMs(nextTime)
        if (nextTime < job.totalDurationMs) frameRef.current = requestAnimationFrame(update)
      }
      frameRef.current = requestAnimationFrame(update)
    })
  }, [bridge, job])

  useEffect(() => () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
  }, [])

  const visual = useMemo(() => job ? resolvePlaybackVisual(job, elapsedMs) : null, [elapsedMs, job])
  const direction: 1 | -1 = visual && visual.slideIndex < previousSlideIndexRef.current ? -1 : 1
  if (visual) previousSlideIndexRef.current = visual.slideIndex

  if (!job || !visual) {
    return (
      <main className="export-calibration" aria-hidden="true">
        <i className="export-calibration-red" />
        <i className="export-calibration-blue" />
      </main>
    )
  }

  return (
    <main
      className="export-render-surface"
      style={{ '--stage-vw': `${job.editorViewportWidth / 100}px` } as CSSProperties}
    >
      <Stage
        slide={visual.slide}
        theme={job.presentation.theme}
        imageAssets={job.presentation.imageAssets}
        presentationId={job.presentation.id}
        slideNumber={visual.slideIndex + 1}
        slideCount={job.presentation.slides.length}
        direction={direction}
        renderInstanceKey={`desktop-export-${job.jobId}`}
        className="export-stage"
      />
    </main>
  )
}
