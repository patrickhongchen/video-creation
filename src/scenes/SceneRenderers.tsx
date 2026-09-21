import type { PresentationImageAsset, PresentationTheme, Slide } from '../model'
import { SlideRenderer, type SlideEditorController } from './CompositionSceneRenderer'

interface RenderSlideOptions {
  imageAssets?: PresentationImageAsset[]
  editor?: SlideEditorController
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
    editor={options.editor}
  />
}
