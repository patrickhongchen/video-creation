import { motion } from 'motion/react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { BarChart, LineChart } from '../charts'
import { COMPOSITION_HEIGHT, COMPOSITION_WIDTH } from '../model'
import type {
  ElementFrame,
  PresentationImageAsset,
  PresentationTheme,
  Slide,
  SlideElement,
} from '../model'

export interface SlideEditorController {
  selectedElementId: string | null
  grid: boolean
  guides: boolean
  snap: boolean
  onSelect: (elementId: string | null) => void
  onElementChange: (element: SlideElement) => void
}

interface SlideRendererProps {
  slide: Slide
  theme: PresentationTheme
  layoutNamespace: string
  imageAssets?: PresentationImageAsset[]
  editor?: SlideEditorController
}

type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

interface Interaction {
  kind: 'drag' | 'resize'
  pointerId: number
  element: SlideElement
  frame: ElementFrame
  startX: number
  startY: number
  corner?: Corner
}

interface SnapResult {
  frame: ElementFrame
  guideX?: number
  guideY?: number
}

const SAFE_ZONE = { left: 80, right: 1000, top: 120, bottom: 1720 }

function minimumSize(element: SlideElement) {
  switch (element.type) {
    case 'chart': return { width: 280, height: 220 }
    case 'text': return { width: 120, height: 80 }
    case 'image': return { width: 80, height: 80 }
    case 'arrow': return { width: 80, height: 30 }
    case 'shape': return element.shape === 'line' ? { width: 60, height: 20 } : { width: 40, height: 40 }
  }
}

function nearestSnap(value: number, targets: number[], tolerance: number) {
  let match: number | undefined
  let distance = Number.POSITIVE_INFINITY
  for (const target of targets) {
    const nextDistance = Math.abs(target - value)
    if (nextDistance <= tolerance && nextDistance < distance) {
      match = target
      distance = nextDistance
    }
  }
  return match
}

function snapTargets(scene: Slide, excludedId: string) {
  const x = [COMPOSITION_WIDTH / 2, SAFE_ZONE.left, SAFE_ZONE.right]
  const y = [COMPOSITION_HEIGHT / 2, SAFE_ZONE.top, SAFE_ZONE.bottom]
  scene.elements.forEach((element) => {
    if (element.id === excludedId || element.hidden) return
    x.push(element.frame.x, element.frame.x + element.frame.width / 2, element.frame.x + element.frame.width)
    y.push(element.frame.y, element.frame.y + element.frame.height / 2, element.frame.y + element.frame.height)
  })
  return { x, y }
}

function snapDraggedFrame(frame: ElementFrame, scene: Slide, elementId: string, tolerance: number): SnapResult {
  const targets = snapTargets(scene, elementId)
  const horizontalPoints = [frame.x, frame.x + frame.width / 2, frame.x + frame.width]
  const verticalPoints = [frame.y, frame.y + frame.height / 2, frame.y + frame.height]
  let xOffset = 0
  let yOffset = 0
  let guideX: number | undefined
  let guideY: number | undefined
  let bestX = Number.POSITIVE_INFINITY
  let bestY = Number.POSITIVE_INFINITY
  horizontalPoints.forEach((point) => {
    const target = nearestSnap(point, targets.x, tolerance)
    if (target === undefined || Math.abs(target - point) >= bestX) return
    bestX = Math.abs(target - point)
    xOffset = target - point
    guideX = target
  })
  verticalPoints.forEach((point) => {
    const target = nearestSnap(point, targets.y, tolerance)
    if (target === undefined || Math.abs(target - point) >= bestY) return
    bestY = Math.abs(target - point)
    yOffset = target - point
    guideY = target
  })
  return { frame: { ...frame, x: frame.x + xOffset, y: frame.y + yOffset }, guideX, guideY }
}

function snapResizedFrame(frame: ElementFrame, scene: Slide, elementId: string, corner: Corner, tolerance: number): SnapResult {
  const targets = snapTargets(scene, elementId)
  const fromLeft = corner.endsWith('left')
  const fromTop = corner.startsWith('top')
  const edgeX = fromLeft ? frame.x : frame.x + frame.width
  const edgeY = fromTop ? frame.y : frame.y + frame.height
  const guideX = nearestSnap(edgeX, targets.x, tolerance)
  const guideY = nearestSnap(edgeY, targets.y, tolerance)
  const next = { ...frame }
  if (guideX !== undefined) {
    if (fromLeft) {
      next.width += next.x - guideX
      next.x = guideX
    } else next.width = guideX - next.x
  }
  if (guideY !== undefined) {
    if (fromTop) {
      next.height += next.y - guideY
      next.y = guideY
    } else next.height = guideY - next.y
  }
  return { frame: next, guideX, guideY }
}

function layoutId(element: SlideElement, namespace: string) {
  const sharedElementId = element.sharedElementId ?? (element.type === 'chart' ? element.chartId : undefined)
  if (!sharedElementId) return undefined
  const compatibility = element.type === 'chart'
    ? `${element.type}:${element.chartType}:${element.chartType === 'bar' ? element.orientation ?? 'horizontal' : 'line'}`
    : element.type === 'shape'
      ? `${element.type}:${element.shape}`
      : element.type
  return JSON.stringify([namespace, 'slide', compatibility, sharedElementId])
}

function elementRenderKey(element: SlideElement) {
  if (element.type !== 'chart' || !element.chartId) return element.id
  const representation = element.chartType === 'bar'
    ? `${element.chartType}:${element.orientation ?? 'horizontal'}`
    : element.chartType
  return JSON.stringify(['chart', element.chartId, representation])
}

function imagePosition(position: string | undefined) {
  return (position ?? 'center').replace('-', ' ')
}

function ElementContent({ element, theme, foreground, layoutNamespace, imageAssets }: {
  element: SlideElement
  theme: PresentationTheme
  foreground: string
  layoutNamespace: string
  imageAssets?: PresentationImageAsset[]
}) {
  switch (element.type) {
    case 'text': {
      const defaultStyle = element.role === 'headline' ? theme.defaultHeadlineStyle
        : element.role === 'caption' ? theme.defaultCaptionStyle
          : element.role === 'label' ? (theme.defaultLabelStyle ?? theme.defaultBodyStyle)
            : theme.defaultBodyStyle
      return <div className={`composition-text composition-text--${element.role ?? 'body'}`} style={{
        color: element.color ?? defaultStyle.color ?? foreground,
        fontFamily: element.fontFamily ?? defaultStyle.fontFamily ?? theme.fontFamily,
        fontSize: element.fontSize ?? defaultStyle.fontSize,
        fontWeight: element.fontWeight ?? defaultStyle.fontWeight,
        textAlign: element.textAlign ?? 'left',
        lineHeight: element.lineHeight ?? defaultStyle.lineHeight ?? 1.1,
        letterSpacing: element.letterSpacing ?? defaultStyle.letterSpacing ?? 0,
      }}>{element.text}</div>
    }
    case 'image': {
      const asset = imageAssets?.find((candidate) => candidate.id === element.assetId)
      return asset
        ? <img className="composition-image" src={asset.source} alt="" draggable={false} style={{ objectFit: element.fit, objectPosition: imagePosition(element.position), transform: `scale(${element.flipX ? -1 : 1}, ${element.flipY ? -1 : 1})` }} />
        : <div className="composition-missing-asset">Missing image</div>
    }
    case 'chart': {
      return element.chartType === 'bar'
        ? <BarChart scene={element} accent={theme.accent} layoutNamespace={layoutNamespace} />
        : <LineChart scene={element} accent={theme.accent} layoutNamespace={layoutNamespace} />
    }
    case 'shape':
      if (element.shape === 'line') {
        return <svg className="composition-vector" viewBox={`0 0 ${Math.max(1, element.frame.width)} ${Math.max(1, element.frame.height)}`} preserveAspectRatio="none" aria-hidden="true"><line x1="0" y1={element.frame.height / 2} x2={element.frame.width} y2={element.frame.height / 2} stroke={element.stroke ?? theme.accent} strokeWidth={element.strokeWidth ?? 5} vectorEffect="non-scaling-stroke" /></svg>
      }
      return <div className={`composition-shape composition-shape--${element.shape}`} style={{ background: element.fill ?? (element.shape === 'circle' ? theme.accent : `${theme.accent}22`), borderColor: element.stroke ?? theme.accent, borderWidth: element.strokeWidth ?? 3 }} />
    case 'arrow': {
      const width = Math.max(1, element.frame.width)
      const height = Math.max(1, element.frame.height)
      const strokeWidth = element.strokeWidth ?? 6
      const endCap = element.endCap ?? 'arrow'
      return <svg className="composition-vector" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
        <line x1={strokeWidth} y1={height / 2} x2={width - (endCap === 'arrow' ? 28 : strokeWidth)} y2={height / 2} stroke={element.stroke ?? theme.accent} strokeWidth={strokeWidth} vectorEffect="non-scaling-stroke" />
        {element.startCap === 'dot' && <circle cx={strokeWidth} cy={height / 2} r={strokeWidth * 1.2} fill={element.stroke ?? theme.accent} />}
        {endCap === 'arrow' && <polygon points={`${width - 30},${Math.max(0, height / 2 - 22)} ${width},${height / 2} ${width - 30},${Math.min(height, height / 2 + 22)}`} fill={element.stroke ?? theme.accent} />}
      </svg>
    }
  }
}

function background(scene: Slide, theme: PresentationTheme) {
  switch (scene.background) {
    case 'light': return '#fffdf9'
    case 'dark': return '#111821'
    case 'accent': return theme.accent
    case 'presentation':
    case undefined: return theme.background
    default: return scene.background
  }
}

function elementStyle(frame: ElementFrame): CSSProperties {
  return {
    left: frame.x,
    top: frame.y,
    width: frame.width,
    height: frame.height,
    opacity: frame.opacity ?? 1,
    rotate: `${frame.rotation ?? 0}deg`,
  }
}

export function SlideRenderer({ slide: scene, theme, layoutNamespace, imageAssets, editor }: SlideRendererProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const interactionRef = useRef<Interaction | null>(null)
  const previewFrameRef = useRef<ElementFrame | null>(null)
  const [scale, setScale] = useState(0.4)
  const [preview, setPreview] = useState<{ elementId: string; frame: ElementFrame } | null>(null)
  const [snapGuides, setSnapGuides] = useState<{ x?: number; y?: number }>({})
  const assetsById = useMemo(() => new Map(imageAssets?.map((asset) => [asset.id, asset]) ?? []), [imageAssets])

  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host) return
    const updateScale = () => setScale(host.clientWidth / COMPOSITION_WIDTH)
    updateScale()
    const observer = new ResizeObserver(updateScale)
    observer.observe(host)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!editor) return
    const onPointerMove = (event: PointerEvent) => {
      const interaction = interactionRef.current
      const host = hostRef.current
      if (!interaction || event.pointerId !== interaction.pointerId || !host) return
      const rect = host.getBoundingClientRect()
      const x = (event.clientX - rect.left) * COMPOSITION_WIDTH / rect.width
      const y = (event.clientY - rect.top) * COMPOSITION_HEIGHT / rect.height
      const deltaX = x - interaction.startX
      const deltaY = y - interaction.startY
      let frame = { ...interaction.frame }
      if (interaction.kind === 'drag') {
        frame.x += deltaX
        frame.y += deltaY
      } else if (interaction.corner) {
        const fromLeft = interaction.corner.endsWith('left')
        const fromTop = interaction.corner.startsWith('top')
        frame.width += fromLeft ? -deltaX : deltaX
        frame.height += fromTop ? -deltaY : deltaY
        if (fromLeft) frame.x += deltaX
        if (fromTop) frame.y += deltaY
        const minimum = minimumSize(interaction.element)
        if (interaction.element.type === 'image' && !event.shiftKey) {
          const ratio = interaction.frame.width / interaction.frame.height
          if (Math.abs(deltaX) >= Math.abs(deltaY)) frame.height = frame.width / ratio
          else frame.width = frame.height * ratio
          if (fromLeft) frame.x = interaction.frame.x + interaction.frame.width - frame.width
          if (fromTop) frame.y = interaction.frame.y + interaction.frame.height - frame.height
        }
        if (frame.width < minimum.width) {
          if (fromLeft) frame.x -= minimum.width - frame.width
          frame.width = minimum.width
        }
        if (frame.height < minimum.height) {
          if (fromTop) frame.y -= minimum.height - frame.height
          frame.height = minimum.height
        }
      }
      let result: SnapResult = { frame }
      if (editor.snap && !event.altKey) {
        const tolerance = 7 * COMPOSITION_WIDTH / rect.width
        result = interaction.kind === 'drag'
          ? snapDraggedFrame(frame, scene, interaction.element.id, tolerance)
          : interaction.element.type === 'image' && !event.shiftKey
            ? { frame }
            : snapResizedFrame(frame, scene, interaction.element.id, interaction.corner!, tolerance)
      }
      const canonicalFrame = {
        ...result.frame,
        x: Math.round(result.frame.x),
        y: Math.round(result.frame.y),
        width: Math.round(result.frame.width),
        height: Math.round(result.frame.height),
      }
      previewFrameRef.current = canonicalFrame
      setPreview({ elementId: interaction.element.id, frame: canonicalFrame })
      setSnapGuides({ x: result.guideX, y: result.guideY })
    }
    const finish = (event: PointerEvent) => {
      const interaction = interactionRef.current
      if (!interaction || event.pointerId !== interaction.pointerId) return
      const frame = previewFrameRef.current
      if (frame) editor.onElementChange({ ...interaction.element, frame })
      interactionRef.current = null
      previewFrameRef.current = null
      setPreview(null)
      setSnapGuides({})
    }
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
    }
  }, [editor, scene])

  const startInteraction = (event: ReactPointerEvent, element: SlideElement, kind: Interaction['kind'], corner?: Corner) => {
    event.preventDefault()
    event.stopPropagation()
    editor?.onSelect(element.id)
    if (!editor || element.locked) return
    const rect = hostRef.current?.getBoundingClientRect()
    if (!rect) return
    const frame = preview && preview.elementId === element.id ? preview.frame : element.frame
    interactionRef.current = {
      kind,
      pointerId: event.pointerId,
      element,
      frame,
      startX: (event.clientX - rect.left) * COMPOSITION_WIDTH / rect.width,
      startY: (event.clientY - rect.top) * COMPOSITION_HEIGHT / rect.height,
      corner,
    }
    previewFrameRef.current = frame
  }

  const logicalStyle = { width: COMPOSITION_WIDTH, height: COMPOSITION_HEIGHT, transform: `scale(${scale})` }
  const rootStyle = {
    background: background(scene, theme),
    color: scene.background === 'dark' || scene.background === 'accent' ? '#fff' : theme.foreground,
  }
  const foreground = rootStyle.color

  return <div ref={hostRef} className={`composition-host${editor ? ' is-editing' : ''}`} style={rootStyle} onPointerDown={editor ? () => editor.onSelect(null) : undefined}>
    <div className="composition-logical-canvas" style={logicalStyle}>
      {editor?.grid && <div className="composition-grid" />}
      {editor?.guides && <>
        <div className="composition-safe-zone" />
        <div className="composition-center-guide composition-center-guide--vertical" />
        <div className="composition-center-guide composition-center-guide--horizontal" />
      </>}
      {scene.elements.map((element) => {
        if (element.hidden) return null
        const frame = preview?.elementId === element.id ? preview.frame : element.frame
        const selected = editor?.selectedElementId === element.id
        const assetMissing = element.type === 'image' && !assetsById.has(element.assetId)
        return <motion.div
          className={`composition-element composition-element--${element.type}${selected ? ' is-selected' : ''}${element.locked ? ' is-locked' : ''}${assetMissing ? ' has-missing-asset' : ''}`}
          key={elementRenderKey(element)}
          layoutId={layoutId(element, layoutNamespace)}
          layout
          transition={{ type: 'spring', stiffness: 150, damping: 22 }}
          style={element.type === 'chart' ? {
            ...elementStyle(frame),
            color: scene.background === 'dark' || scene.background === 'accent' ? foreground : theme.chartStyle.foreground,
            '--chart-grid': theme.chartStyle.grid,
            '--chart-muted': theme.chartStyle.muted,
          } as CSSProperties : elementStyle(frame)}
          onPointerDown={editor ? (event) => startInteraction(event, element, 'drag') : undefined}
          aria-label={element.name}
        >
          <ElementContent element={{ ...element, frame }} theme={theme} foreground={foreground} layoutNamespace={layoutNamespace} imageAssets={imageAssets} />
          {selected && editor && <div className="composition-selection" aria-hidden="true">
            {(['top-left', 'top-right', 'bottom-left', 'bottom-right'] as Corner[]).map((corner) => <button
              type="button"
              tabIndex={-1}
              key={corner}
              className={`composition-resize-handle composition-resize-handle--${corner}`}
              onPointerDown={(event) => startInteraction(event, element, 'resize', corner)}
            />)}
          </div>}
        </motion.div>
      })}
      {snapGuides.x !== undefined && <div className="composition-snap-guide composition-snap-guide--vertical" style={{ left: snapGuides.x }} />}
      {snapGuides.y !== undefined && <div className="composition-snap-guide composition-snap-guide--horizontal" style={{ top: snapGuides.y }} />}
    </div>
  </div>
}

/** @deprecated Internal compatibility alias; every runtime visual is now a Slide. */
export type CompositionEditorController = SlideEditorController
