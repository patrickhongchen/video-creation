import type { PresentationImageAsset, PresentationTheme, Slide } from '../model'
import { renderSlide } from '../scenes/SceneRenderers'

interface SlideThumbnailProps {
  slide: Slide
  theme: PresentationTheme
  imageAssets?: PresentationImageAsset[]
  layoutNamespace: string
}

export function SlideThumbnail({ slide, theme, imageAssets, layoutNamespace }: SlideThumbnailProps) {
  return (
    <div className="thumb thumb-slide" aria-hidden="true">
      {renderSlide(slide, theme, layoutNamespace, { imageAssets })}
    </div>
  )
}
