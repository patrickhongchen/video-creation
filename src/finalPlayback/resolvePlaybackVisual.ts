import type { Slide } from '../model'
import type { DesktopExportJob, DesktopExportSegment } from '../desktop/desktopTypes'
import {
  previousSlideFor,
  slideRevealOrders,
  timedRevealStateAtTime,
  type RevealVisualState,
} from '../entranceAnimation'
import { resolveNarrationVisualAtTime } from '../narration/resolveNarrationVisual'
import { isSlideCue } from '../narration/narrationTypes'

function firstSceneId(segment: DesktopExportSegment | undefined) {
  if (!segment) return undefined
  return segment.type === 'silent-scene'
    ? segment.sceneId
    : [...segment.cues].sort((left, right) => left.timeMs - right.timeMs).find(isSlideCue)?.sceneId ?? segment.sceneIds[0]
}

export interface ResolvedPlaybackVisual {
  slide: Slide
  slideIndex: number
  revealState: RevealVisualState
  segmentIndex: number
  segment: DesktopExportSegment | undefined
}

export function resolvePlaybackVisual(job: Pick<DesktopExportJob, 'presentation' | 'segments'>, elapsedMs: number): ResolvedPlaybackVisual {
  const { presentation, segments } = job
  let segmentStartMs = 0
  let segmentIndex = 0
  let activeSegment: DesktopExportSegment | undefined
  let sceneId: string | undefined

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index]
    const segmentEndMs = segmentStartMs + segment.durationMs
    if (elapsedMs < segmentEndMs || index === segments.length - 1) {
      segmentIndex = index
      activeSegment = segment
      sceneId = firstSceneId(segment)
      break
    }
    segmentStartMs = segmentEndMs
  }

  sceneId ??= firstSceneId(segments[0]) ?? presentation.slides[0]?.id
  const localTimeMs = Math.max(0, elapsedMs - segmentStartMs)
  const narrationVisual = activeSegment?.type === 'narration'
    ? resolveNarrationVisualAtTime(activeSegment.cues, localTimeMs, presentation.slides, sceneId)
    : null
  const slideIndex = narrationVisual?.slideIndex
    ?? Math.max(0, presentation.slides.findIndex((slide) => slide.id === sceneId))
  const slide = presentation.slides[slideIndex] ?? presentation.slides[0]
  const revealState = narrationVisual?.revealState
    ?? timedRevealStateAtTime(
      slideRevealOrders(slide, previousSlideFor(presentation.slides, slide)),
      localTimeMs,
    )
  return {
    slide,
    slideIndex,
    revealState,
    segmentIndex,
    segment: activeSegment,
  }
}
