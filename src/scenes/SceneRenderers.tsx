import type { PresentationImageAsset, PresentationTheme, PresentationVideoAsset, Slide } from '../model'
import type { VideoPlaybackState } from '../narration/resolveVideoPlayback'
import { SlideRenderer, type SlideEditorController } from './CompositionSceneRenderer'
import type { RevealVisualState } from '../entranceAnimation'

interface RenderSlideOptions {
  imageAssets?: PresentationImageAsset[]
  videoAssets?: PresentationVideoAsset[]
  videoPlayback?: VideoPlaybackState
  editor?: SlideEditorController
  revealState?: RevealVisualState | null
  previousSlide?: Slide
  deterministicMotion?: boolean
}

/**
 * The runtime has one visual path: every Slide renders its structured elements.
 * This historical module name is retained only to avoid needless import churn.
 */
export function renderSlide(
  slide: Slide,
  theme: PresentationTheme,
  layoutNamespace: string,
  options: RenderSlideOptions = {},
) {
  return <SlideRenderer
    slide={slide}
    theme={theme}
    layoutNamespace={layoutNamespace}
    imageAssets={options.imageAssets}
    videoAssets={options.videoAssets}
    videoPlayback={options.videoPlayback}
    editor={options.editor}
    revealState={options.revealState}
    previousSlide={options.previousSlide}
    deterministicMotion={options.deterministicMotion}
  />
}
