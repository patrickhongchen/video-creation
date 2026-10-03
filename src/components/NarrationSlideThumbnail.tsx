import { memo } from 'react'
import type { Presentation, Slide } from '../model'
import { Stage } from './Stage'

export const NarrationSlideThumbnail = memo(function NarrationSlideThumbnail({ presentation, slide, index }: {
  presentation: Presentation
  slide: Slide
  index: number
}) {
  return <div className="narration-slide-thumbnail" aria-hidden="true">
    <Stage slide={slide} slides={presentation.slides} theme={presentation.theme} imageAssets={presentation.imageAssets} videoAssets={presentation.videoAssets} presentationId={presentation.id} slideNumber={index + 1} slideCount={presentation.slides.length} direction={1} renderInstanceKey={`deck-thumbnail-${slide.id}`} deterministicMotion className="narration-thumbnail-stage" />
  </div>
})
