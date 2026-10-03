import type { PresentationImageAsset, PresentationTheme, PresentationVideoAsset, Slide } from '../model'
import { renderSlide } from '../scenes/SceneRenderers'

interface SlideThumbnailProps {
  slide: Slide
  theme: PresentationTheme
  imageAssets?: PresentationImageAsset[]
  videoAssets?: PresentationVideoAsset[]
  layoutNamespace: string
}

export function SlideThumbnail({ slide, theme, imageAssets, videoAssets, layoutNamespace }: SlideThumbnailProps) {
  return (
    <div className="thumb thumb-slide" aria-hidden="true">
      {renderSlide(slide, theme, layoutNamespace, { imageAssets, videoAssets })}
    </div>
  )
}
