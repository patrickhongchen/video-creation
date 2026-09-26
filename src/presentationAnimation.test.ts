import { describe, expect, it } from 'vitest'
import type { SlideEntranceAnimation } from './model'
import { createBlankPresentation, createSlideTextElement, duplicateSlide, duplicateSlideElement } from './presentationFactories'
import { validatePresentation } from './presentationValidation'

function presentationWithAnimation(animation: SlideEntranceAnimation) {
  const presentation = createBlankPresentation('Entrance animation test')
  presentation.slides[0].elements = [{
    ...createSlideTextElement(),
    animation,
  }]
  return presentation
}

describe('element entrance animation validation', () => {
  it.each<SlideEntranceAnimation['entrance']>(['appear', 'fade', 'pop', 'slide-up', 'slide-left', 'slide-right'])('accepts %s entrances', (entrance) => {
    const parsed = validatePresentation(presentationWithAnimation({ entrance, delayMs: 500, durationMs: 350 }))

    expect(parsed.slides[0].elements[0].animation).toEqual({ entrance, delayMs: 500, durationMs: 350 })
  })

  it('continues to accept schema-v2 elements without animation metadata', () => {
    const presentation = createBlankPresentation('Existing v2 project')
    presentation.slides[0].elements = [createSlideTextElement()]

    expect(validatePresentation(presentation).slides[0].elements[0].animation).toBeUndefined()
  })

  it.each([
    [{ entrance: 'zoom', delayMs: 0, durationMs: 350 }, /animation\.entrance/],
    [{ entrance: 'fade', delayMs: -1, durationMs: 350 }, /animation\.delayMs/],
    [{ entrance: 'fade', delayMs: 0, durationMs: -1 }, /animation\.durationMs/],
    [{ entrance: 'fade', delayMs: 60_001, durationMs: 350 }, /animation\.delayMs/],
    [{ entrance: 'fade', delayMs: 0, durationMs: 10_001 }, /animation\.durationMs/],
    [{ entrance: 'fade', delayMs: Number.NaN, durationMs: 350 }, /animation\.delayMs/],
  ] as const)('rejects invalid animation metadata', (animation, error) => {
    expect(() => validatePresentation(presentationWithAnimation(animation as SlideEntranceAnimation))).toThrow(error)
  })
})

describe('element entrance animation duplication', () => {
  const animation: SlideEntranceAnimation = { entrance: 'slide-up', delayMs: 700, durationMs: 400 }

  it('preserves animation metadata when duplicating an element', () => {
    const original = { ...createSlideTextElement(), animation }
    const copy = duplicateSlideElement(original)

    expect(copy.animation).toEqual(animation)
    expect(copy.animation).not.toBe(original.animation)
  })

  it('preserves animation metadata when duplicating a slide', () => {
    const source = createBlankPresentation('Duplicate slide')
    source.slides[0].elements = [{ ...createSlideTextElement(), animation }]
    const copy = duplicateSlide(source.slides[0])

    expect(copy.elements[0].animation).toEqual(animation)
    expect(copy.elements[0].animation).not.toBe(source.slides[0].elements[0].animation)
  })
})
