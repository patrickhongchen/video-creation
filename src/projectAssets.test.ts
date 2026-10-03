import { describe, expect, it } from 'vitest'
import { canonicalizeProjectAssets, isSafeProjectAssetPath } from './projectAssets'
import { createBlankPresentation, createSlideImageElement, createSlideVideoElement } from './presentationFactories'
import { validatePresentation } from './presentationValidation'

describe('project asset paths', () => {
  it('accepts normal assets paths', () => {
    expect(isSafeProjectAssetPath('assets/theater.jpg')).toBe(true)
    expect(isSafeProjectAssetPath('assets/illustrations/stick.svg')).toBe(true)
  })

  it.each(['../secret.png', 'assets/../secret.png', '/tmp/photo.jpg', 'assets\\photo.jpg', 'assets//photo.jpg'])('rejects unsafe path %s', (path) => {
    expect(isSafeProjectAssetPath(path)).toBe(false)
  })

  it('removes managed runtime URLs from canonical project assets', () => {
    expect(canonicalizeProjectAssets([{ id: 'photo', name: 'Photo', mimeType: 'image/png', path: 'assets/photo.png', source: 'ves-asset://project/photo.png' }])).toEqual([
      { id: 'photo', name: 'Photo', mimeType: 'image/png', path: 'assets/photo.png' },
    ])
  })

  it('validates project-relative asset records and rejects traversal', () => {
    const presentation = createBlankPresentation('Asset test')
    presentation.imageAssets = [{ id: 'photo', name: 'Photo', mimeType: 'image/png', path: 'assets/photo.png' }]
    presentation.slides[0].elements = [createSlideImageElement('photo')]
    expect(validatePresentation(presentation).imageAssets?.[0].path).toBe('assets/photo.png')

    presentation.imageAssets[0].path = 'assets/../private.png'
    expect(() => validatePresentation(presentation)).toThrow(/safe project-relative path/)
  })

  it('validates video assets separately and rejects IDs shared with images', () => {
    const presentation = createBlankPresentation('Video asset test')
    presentation.videoAssets = [{ id: 'clip', name: 'Clip', mimeType: 'video/mp4', path: 'assets/clip.mp4' }]
    presentation.slides[0].elements = [createSlideVideoElement('clip')]
    expect(validatePresentation(presentation).videoAssets?.[0].path).toBe('assets/clip.mp4')

    presentation.imageAssets = [{ id: 'clip', name: 'Collision', mimeType: 'image/png', path: 'assets/collision.png' }]
    expect(() => validatePresentation(presentation)).toThrow(/already used by an image asset/)
  })
})
