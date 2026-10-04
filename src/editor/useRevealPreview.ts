import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Presentation, Slide } from '../model'
import {
  DEFAULT_ENTRANCE_DURATION_MS,
  INITIAL_REVEAL_STATE,
  nextRevealOrder,
  previousSlideFor,
  slideRevealOrders,
} from '../entranceAnimation'

interface UseRevealPreviewOptions {
  presentation: Presentation
  slide: Slide
  mode: 'edit' | 'present' | 'narrate'
  onSequenceEnd: () => void
}

/** Owns the click-driven reveal state shared by editor preview and presenter mode. */
export function useRevealPreview({ presentation, slide, mode, onSequenceEnd }: UseRevealPreviewOptions) {
  const [previewRun, setPreviewRun] = useState<{ slideId: string; presentationId: string; generation: number } | null>(null)
  const [revealRun, setRevealRun] = useState<{ key: string; through: number; active: number | null; startedAt: number } | null>(null)
  const [revealClockMs, setRevealClockMs] = useState(0)
  const revealOrders = useMemo(
    () => slideRevealOrders(slide, previousSlideFor(presentation.slides, slide)),
    [presentation.slides, slide],
  )
  const isPreviewing = previewRun?.slideId === slide.id
    && previewRun.presentationId === presentation.id
    && mode === 'edit'
  const revealKey = `${presentation.id}:${slide.id}:${mode}:${isPreviewing ? previewRun?.generation : ''}`
  const currentReveal = revealRun?.key === revealKey ? revealRun : null
  const revealState = currentReveal ? {
    revealedThroughOrder: currentReveal.through,
    activeRevealOrder: currentReveal.active,
    activeRevealElapsedMs: Math.max(0, revealClockMs - currentReveal.startedAt),
  } : INITIAL_REVEAL_STATE

  useEffect(() => {
    if (!currentReveal || currentReveal.active === null) return
    let frame = 0
    const update = (now: number) => {
      setRevealClockMs(now)
      if (now < currentReveal.startedAt + DEFAULT_ENTRANCE_DURATION_MS) frame = requestAnimationFrame(update)
    }
    frame = requestAnimationFrame(update)
    return () => cancelAnimationFrame(frame)
  }, [currentReveal?.key, currentReveal?.startedAt])

  useEffect(() => {
    if (isPreviewing && revealOrders.length === 0) setPreviewRun(null)
  }, [isPreviewing, revealOrders.length])

  useEffect(() => {
    setPreviewRun(null)
    // Preserve completed reveals prepared for a backward presenter navigation.
    const key = `${presentation.id}:${slide.id}:${mode}:`
    setRevealRun((current) => current?.key === key ? current : null)
  }, [slide.id, presentation.id, mode])

  const startPreview = useCallback(() => {
    if (revealOrders.length === 0) return
    // Stopping clears previewRun, so the next run can reuse the previous key.
    // Clear its reveal progress explicitly before starting a fresh preview.
    setRevealRun(null)
    setRevealClockMs(0)
    setPreviewRun((previous) => ({
      slideId: slide.id,
      presentationId: presentation.id,
      generation: (previous?.generation ?? 0) + 1,
    }))
  }, [presentation.id, revealOrders.length, slide.id])

  const stopPreview = useCallback(() => setPreviewRun(null), [])
  const resetReveal = useCallback(() => setRevealRun(null), [])
  const completeSlideReveals = useCallback((targetSlide: Slide) => {
    const orders = slideRevealOrders(targetSlide, previousSlideFor(presentation.slides, targetSlide))
    setRevealRun({
      key: `${presentation.id}:${targetSlide.id}:${mode}:`,
      through: orders.at(-1) ?? 0,
      active: null,
      startedAt: 0,
    })
  }, [presentation.id, presentation.slides, mode])

  const advanceReveal = useCallback(() => {
    const order = nextRevealOrder(revealOrders, revealState.revealedThroughOrder)
    if (order === null) {
      if (isPreviewing) stopPreview()
      else onSequenceEnd()
      return
    }
    const startedAt = performance.now()
    setRevealClockMs(startedAt)
    setRevealRun({ key: revealKey, through: order, active: order, startedAt })
  }, [isPreviewing, onSequenceEnd, revealKey, revealOrders, revealState.revealedThroughOrder, stopPreview])

  const undoReveal = useCallback(() => {
    const order = revealOrders.filter((candidate) => candidate <= revealState.revealedThroughOrder).at(-1)
    if (order === undefined) return false
    const through = revealOrders.filter((candidate) => candidate < order).at(-1) ?? 0
    setRevealRun({ key: revealKey, through, active: null, startedAt: 0 })
    return true
  }, [revealKey, revealOrders, revealState.revealedThroughOrder])

  return {
    advanceReveal,
    completeSlideReveals,
    isPreviewing,
    resetReveal,
    revealOrders,
    revealState,
    startPreview,
    stopPreview,
    undoReveal,
  }
}
