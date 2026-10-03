import { forwardRef, useMemo, type PointerEventHandler } from 'react'
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'motion/react'
import type { Variants } from 'motion/react'
import type { PresentationImageAsset, PresentationTheme, PresentationVideoAsset, Slide, SlideChartElement, TransitionType } from '../model'
import type { VideoPlaybackState } from '../narration/resolveVideoPlayback'
import { renderSlide } from '../scenes/SceneRenderers'
import type { SlideEditorController } from '../scenes/CompositionSceneRenderer'
import { DEFAULT_ENTRANCE_DURATION_MS, previousSlideFor, type RevealVisualState } from '../entranceAnimation'
import type { NarrationPointerDisplayState } from '../narration/resolveNarrationPointer'

interface StageProps {
  slide: Slide
  theme: PresentationTheme
  presentationId: string
  slideNumber: number
  slideCount: number
  direction: 1 | -1
  className?: string
  renderInstanceKey?: string
  imageAssets?: PresentationImageAsset[]
  videoAssets?: PresentationVideoAsset[]
  videoPlayback?: VideoPlaybackState
  slideEditor?: SlideEditorController
  slides?: readonly Slide[]
  deterministicMotion?: boolean
  /** Null leaves all elements visible for editing. */
  revealState?: RevealVisualState | null
  pointerState?: NarrationPointerDisplayState | null
  onPointerMove?: PointerEventHandler<HTMLDivElement>
  onPointerLeave?: PointerEventHandler<HTMLDivElement>
}

const transitionVariants: Record<TransitionType, Variants> = {
  fade: { enter: () => ({ opacity: 0 }), center: { opacity: 1 }, exit: () => ({ opacity: 0 }) },
  slide: { enter: (d) => ({ opacity: 0, x: d * 72 }), center: { opacity: 1, x: 0 }, exit: (d) => ({ opacity: 0, x: d * -72 }) },
  scale: { enter: () => ({ opacity: 0, scale: 1.07 }), center: { opacity: 1, scale: 1 }, exit: () => ({ opacity: 0, scale: 0.94 }) },
}
const noopMotionUpdate = () => undefined

function continuingChartIdentity(slide: Slide) {
  const charts = slide.elements.filter((element): element is SlideChartElement => element.type === 'chart' && !element.hidden && Boolean(element.chartId))
  if (charts.length === 0) return undefined
  const identities = charts.map((chart) => {
    const representation = chart.chartType === 'bar'
      ? `${chart.chartType}:${chart.orientation ?? 'horizontal'}`
      : chart.chartType
    return `${chart.chartId}:${representation}`
  })
  return JSON.stringify(identities.sort())
}

export function slideFrameKey(slide: Slide, presentationId: string, renderInstanceKey = 'default') {
  const chartIdentity = continuingChartIdentity(slide)
  return chartIdentity
    ? JSON.stringify([presentationId, renderInstanceKey, 'chart', chartIdentity])
    : JSON.stringify([presentationId, renderInstanceKey, 'slide', slide.id])
}

export const Stage = forwardRef<HTMLDivElement, StageProps>(function Stage({ slide, theme, presentationId, slideNumber, slideCount, direction, className = '', renderInstanceKey = 'default', imageAssets, videoAssets, videoPlayback, slideEditor, revealState = null, pointerState = null, onPointerMove, onPointerLeave, slides, deterministicMotion = false }, ref) {
  const reduceMotion = useReducedMotion()
  const variants = transitionVariants[reduceMotion ? 'fade' : slide.transition.type]
  const duration = reduceMotion ? 0.01 : slide.transition.duration
  const namespace = `presentation-${presentationId}-${renderInstanceKey}`
  const previousSlide = useMemo(() => previousSlideFor(slides ?? [slide], slide), [slides, slide])
  const revealElapsedMs = Math.min(revealState?.activeRevealElapsedMs ?? 0, DEFAULT_ENTRANCE_DURATION_MS)
  const stableRevealState = useMemo(() => revealState
    ? { ...revealState, activeRevealElapsedMs: revealElapsedMs }
    : null, [revealState?.revealedThroughOrder, revealState?.activeRevealOrder, revealElapsedMs])
  // Pointer updates and the recording timer must not rebuild the slide or restart its transition.
  const slideContent = useMemo(() => (
    <LayoutGroup id={namespace}>
      <AnimatePresence initial={false} custom={direction} mode="sync">
        <motion.div
          className="scene-frame slide-frame"
          key={slideFrameKey(slide, presentationId, renderInstanceKey)}
          custom={direction}
          initial="enter"
          animate="center"
          exit="exit"
          variants={variants}
          transition={{ duration, ease: [0.22, 1, 0.36, 1] }}
          onUpdate={deterministicMotion ? noopMotionUpdate : undefined}
        >
          <div className="scene-canvas slide-canvas" style={{ background: theme.background, color: theme.foreground, fontFamily: theme.fontFamily }}>
            {renderSlide(slide, theme, namespace, { imageAssets, videoAssets, videoPlayback, editor: slideEditor, revealState: stableRevealState, previousSlide, deterministicMotion })}
          </div>
        </motion.div>
      </AnimatePresence>
    </LayoutGroup>
  ), [namespace, direction, slide, presentationId, renderInstanceKey, variants, duration, deterministicMotion, theme, imageAssets, videoAssets, videoPlayback, slideEditor, stableRevealState, previousSlide])

  return (
    <div ref={ref} className={`stage ${className}`} aria-live="polite" aria-label={`Slide ${slideNumber} of ${slideCount}: ${slide.title}`} onPointerMove={onPointerMove} onPointerLeave={onPointerLeave}>
      {slideContent}
      {pointerState && <div className="narration-pointer-overlay" aria-hidden="true" style={{ left: `${pointerState.x * 100}%`, top: `${pointerState.y * 100}%`, opacity: pointerState.opacity }}><span className="narration-pointer-dot" /></div>}
    </div>
  )
})
