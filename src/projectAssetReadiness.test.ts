import { describe, expect, it } from 'vitest'
import { createBlankPresentation, createSlideVideoElement } from './presentationFactories'
import { findMissingPresentationAssets } from './projectAssetReadiness'

describe('presentation video readiness', () => {
  it('reports unknown and unavailable video assets used by visible slide elements', () => {
    const presentation = createBlankPresentation('Video readiness')
    presentation.slides[0].elements = [createSlideVideoElement('clip')]
    expect(findMissingPresentationAssets(presentation)).toEqual([
      'Slide 1 references unknown video asset: clip',
    ])

    presentation.videoAssets = [{
      id: 'clip',
      name: 'Demo.mov',
      mimeType: 'video/quicktime',
      path: 'assets/demo.mov',
    }]
    expect(findMissingPresentationAssets(presentation)).toEqual([
      'Slide 1 references missing asset: assets/demo.mov',
    ])

    presentation.videoAssets[0].source = 'ves-asset://project/demo.mov'
    expect(findMissingPresentationAssets(presentation)).toEqual([])
  })

  it('does not require an asset referenced only by a hidden video element', () => {
    const presentation = createBlankPresentation('Hidden video readiness')
    presentation.slides[0].elements = [{ ...createSlideVideoElement('missing'), hidden: true }]
    expect(findMissingPresentationAssets(presentation)).toEqual([])
  })
})
