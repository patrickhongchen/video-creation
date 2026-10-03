import { useEffect, useState } from 'react'

/** Presenter footage starts on each slide visit, independently of reveal clicks. */
export function useSlideVideoClock(slideId: string, playing: boolean) {
  const [clock, setClock] = useState({ slideId, timeMs: 0 })
  useEffect(() => {
    const startedAt = performance.now()
    setClock({ slideId, timeMs: 0 })
    if (!playing) return
    let frame = 0
    const tick = (now: number) => {
      setClock({ slideId, timeMs: Math.max(0, now - startedAt) })
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [slideId, playing])
  return { timeMs: clock.slideId === slideId ? clock.timeMs : 0, playing }
}
