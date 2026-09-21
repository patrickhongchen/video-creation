import { forwardRef } from 'react'
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'motion/react'
import type { Variants } from 'motion/react'
import type { PresentationImageAsset, Scene, TransitionType } from '../model'
import { renderScene } from '../scenes/SceneRenderers'
import type { CompositionEditorController } from '../scenes/CompositionSceneRenderer'

interface StageProps {
  scene: Scene
  accent: string
  presentationId: string
  sceneNumber: number
  sceneCount: number
  direction: 1 | -1
  className?: string
  renderInstanceKey?: string
  imageAssets?: PresentationImageAsset[]
  compositionEditor?: CompositionEditorController
}

const transitionVariants: Record<TransitionType, Variants> = {
  fade: { enter: () => ({ opacity: 0 }), center: { opacity: 1 }, exit: () => ({ opacity: 0 }) },
  slide: { enter: (d) => ({ opacity: 0, x: d * 72 }), center: { opacity: 1, x: 0 }, exit: (d) => ({ opacity: 0, x: d * -72 }) },
  scale: { enter: () => ({ opacity: 0, scale: 1.07 }), center: { opacity: 1, scale: 1 }, exit: () => ({ opacity: 0, scale: 0.94 }) },
}

function sceneFrameKey(scene: Scene, presentationId: string, renderInstanceKey = 'default') {
  if (scene.type === 'chart' && scene.chartId) {
    const representation = scene.chartType === 'bar'
      ? `${scene.chartType}:${scene.orientation ?? 'horizontal'}`
      : scene.chartType
    return JSON.stringify([presentationId, renderInstanceKey, 'chart', scene.chartId, representation])
  }
  return JSON.stringify([presentationId, renderInstanceKey, 'scene', scene.id])
}

export const Stage = forwardRef<HTMLDivElement, StageProps>(function Stage({ scene, accent, presentationId, sceneNumber, sceneCount, direction, className = '', renderInstanceKey = 'default', imageAssets, compositionEditor }, ref) {
  const reduceMotion = useReducedMotion()
  const variants = transitionVariants[reduceMotion ? 'fade' : scene.transition.type]
  const duration = reduceMotion ? 0.01 : scene.transition.duration
  const namespace = `presentation-${presentationId}-${renderInstanceKey}`

  return (
    <div ref={ref} className={`stage ${className}`} aria-live="polite" aria-label={`Scene ${sceneNumber} of ${sceneCount}: ${scene.title}`}>
      <LayoutGroup id={namespace}>
        <AnimatePresence initial={false} custom={direction} mode="sync">
          <motion.div
            className="scene-frame"
            key={sceneFrameKey(scene, presentationId, renderInstanceKey)}
            custom={direction}
            initial="enter"
            animate="center"
            exit="exit"
            variants={variants}
            transition={{ duration, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="scene-canvas">
              <div className="scene-page-meta">
                <span>{scene.eyebrow ?? 'Video Essay Studio'}</span>
                <i />
                <span>{String(sceneNumber).padStart(2, '0')} / {String(sceneCount).padStart(2, '0')}</span>
              </div>
              {renderScene(scene, accent, namespace, { imageAssets, compositionEditor })}
            </div>
          </motion.div>
        </AnimatePresence>
      </LayoutGroup>
    </div>
  )
})
