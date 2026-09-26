import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { DesktopExportJob, DesktopRenderFrameRequest } from '../desktop/desktopTypes'
import { resolvePlaybackVisual } from '../finalPlayback/resolvePlaybackVisual'
import { Stage } from './Stage'
import { decodePresentationAssets } from '../projectAssetReadiness'
import { MotionGlobalConfig, frameData } from 'motion/react'

export function ExportRenderSurface() {
  // Motion's JS driver uses the requested video timestamp in this isolated renderer.
  MotionGlobalConfig.useManualTiming = true
  const bridge = window.videoEssayDesktop
  const [job, setJob] = useState<DesktopExportJob | null>(null)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [requestedFrame, setRequestedFrame] = useState<DesktopRenderFrameRequest | null>(null)
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
      previousSlideIndexRef.current = 0
      setElapsedMs(0)
      setRequestedFrame(null)
      setJob(nextJob)
    })
  }, [bridge])

  useLayoutEffect(() => {
    if (!bridge || !job) return
    let cancelled = false
    let frame: number | null = null
    void decodePresentationAssets(job.presentation).then(() => {
      if (!cancelled) frame = requestAnimationFrame(() => bridge.renderReady(job.jobId))
    })
    return () => {
      cancelled = true
      if (frame !== null) cancelAnimationFrame(frame)
    }
  }, [bridge, job])

  useEffect(() => {
    if (!bridge) return
    return bridge.onRenderFrame((request) => {
      if (!job || job.jobId !== request.jobId) return
      frameData.delta = Math.max(0, request.elapsedMs - frameData.timestamp)
      frameData.timestamp = request.elapsedMs
      setElapsedMs(request.elapsedMs)
      setRequestedFrame(request)
    })
  }, [bridge, job])

  useLayoutEffect(() => {
    if (!bridge || !job || !requestedFrame || requestedFrame.jobId !== job.jobId) return
    const frame = requestAnimationFrame(() => bridge.renderFrameRendered(requestedFrame))
    return () => cancelAnimationFrame(frame)
  }, [bridge, job, requestedFrame])

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
        slides={job.presentation.slides}
        theme={job.presentation.theme}
        imageAssets={job.presentation.imageAssets}
        presentationId={job.presentation.id}
        slideNumber={visual.slideIndex + 1}
        slideCount={job.presentation.slides.length}
        direction={direction}
        renderInstanceKey={`desktop-export-${job.jobId}`}
        className="export-stage"
        slideElapsedMs={visual.slideElapsedMs}
        deterministicMotion
      />
    </main>
  )
}
