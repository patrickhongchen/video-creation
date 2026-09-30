import { useLayoutEffect, useRef, useState, type CSSProperties, type MouseEventHandler, type ReactNode } from 'react'

interface SlideViewportProps {
  children: ReactNode
  className?: string
  contentClassName?: string
  onContentClick?: MouseEventHandler<HTMLDivElement>
}

const SLIDE_WIDTH = 1080
const SLIDE_HEIGHT = 1920
const MIN_MANUAL_SCALE = 0.1
const MAX_MANUAL_SCALE = 2
const ZOOM_STEP = 0.1

function clampManualScale(scale: number) {
  return Math.min(MAX_MANUAL_SCALE, Math.max(MIN_MANUAL_SCALE, scale))
}

export function SlideViewport({ children, className = '', contentClassName = '', onContentClick }: SlideViewportProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [fitScale, setFitScale] = useState(1)
  const [manualScale, setManualScale] = useState<number | null>(null)

  useLayoutEffect(() => {
    const viewport = scrollRef.current
    if (!viewport) return

    const measure = () => {
      const style = getComputedStyle(viewport)
      const availableWidth = viewport.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
      const availableHeight = viewport.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)
      if (availableWidth <= 0 || availableHeight <= 0) return
      const nextFitScale = Math.min(availableWidth / SLIDE_WIDTH, availableHeight / SLIDE_HEIGHT)
      setFitScale((current) => Math.abs(current - nextFitScale) < 0.0001 ? current : nextFitScale)
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [])

  const scale = manualScale ?? fitScale
  const stageHeight = SLIDE_HEIGHT * scale
  const viewportStyle = { '--slide-stage-height': `${stageHeight}px` } as CSSProperties
  const changeZoom = (direction: -1 | 1) => {
    setManualScale((current) => clampManualScale((current ?? fitScale) + direction * ZOOM_STEP))
  }

  return (
    <div className={`slide-viewport${className ? ` ${className}` : ''}`}>
      <div ref={scrollRef} className="slide-viewport-scroll">
        <div className="slide-viewport-canvas">
          <div
            className={`slide-viewport-content${contentClassName ? ` ${contentClassName}` : ''}`}
            style={viewportStyle}
            onClick={onContentClick}
          >
            {children}
          </div>
        </div>
      </div>
      <div className="slide-zoom-controls" role="group" aria-label="Slide zoom controls" onKeyDown={(event) => event.stopPropagation()}>
        <button type="button" aria-label="Zoom out" title="Zoom out" onClick={() => changeZoom(-1)} disabled={scale <= MIN_MANUAL_SCALE}>−</button>
        <output aria-live="polite" aria-label={`Slide zoom ${Math.round(scale * 100)} percent`}>{Math.round(scale * 100)}%</output>
        <button type="button" aria-label="Zoom in" title="Zoom in" onClick={() => changeZoom(1)} disabled={scale >= MAX_MANUAL_SCALE}>+</button>
        <button type="button" className="slide-zoom-fit" aria-pressed={manualScale === null} onClick={() => setManualScale(null)}>Fit</button>
      </div>
    </div>
  )
}
