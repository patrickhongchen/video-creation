import { describe, expect, it } from 'vitest'
import type { SlideEntranceAnimation } from './model'
import { createBlankPresentation, createSlideTextElement, duplicateSlide, duplicateSlideElement } from './presentationFactories'
import { validatePresentation } from './presentationValidation'

function presentationWithAnimations(animations: unknown[]) {
  const presentation = createBlankPresentation('Entrance animation test')
  presentation.slides[0].elements = animations.map((animation, index) => ({
    ...createSlideTextElement(),
    id: `element-${index}`,
    animation: animation as SlideEntranceAnimation,
  }))
  return presentation
}

function presentationWithAnimation(animation: unknown) {
  return presentationWithAnimations([animation])
}

describe('element entrance animation validation', () => {
  it.each<SlideEntranceAnimation['entrance']>(['appear', 'fade', 'pop', 'slide-up', 'slide-left', 'slide-right'])('accepts %s entrances', (entrance) => {
    const parsed = validatePresentation(presentationWithAnimation({ entrance, order: 3 }))

    expect(parsed.slides[0].elements[0].animation).toEqual({ entrance, order: 3 })
  })

  it('continues to accept schema-v2 elements without animation metadata', () => {
    const presentation = createBlankPresentation('Existing v2 project')
    presentation.slides[0].elements = [createSlideTextElement()]

    expect(validatePresentation(presentation).slides[0].elements[0].animation).toBeUndefined()
  })

  it.each([
    [{ entrance: 'zoom', order: 1 }, /animation\.entrance/],
    [{ entrance: 'fade', order: 0 }, /animation\.order/],
    [{ entrance: 'fade', order: -1 }, /animation\.order/],
    [{ entrance: 'fade', order: 1.5 }, /animation\.order/],
    [{ entrance: 'fade', order: Number.NaN }, /animation\.order/],
    [{ entrance: 'fade', order: Number.MAX_SAFE_INTEGER + 1 }, /animation\.order/],
  ] as const)('rejects invalid canonical animation metadata', (animation, error) => {
    expect(() => validatePresentation(presentationWithAnimation(animation))).toThrow(error)
  })

  it('migrates legacy delays into sorted reveal groups and drops authored timing', () => {
    const parsed = validatePresentation(presentationWithAnimations([
      { entrance: 'fade', delayMs: 1200, durationMs: 500 },
      { entrance: 'pop', delayMs: 500, durationMs: 100 },
      { entrance: 'slide-up', delayMs: 500, durationMs: 800 },
      { entrance: 'appear', delayMs: 2000, durationMs: 0 },
    ]))

    expect(parsed.slides[0].elements.map((element) => element.animation)).toEqual([
      { entrance: 'fade', order: 2 },
      { entrance: 'pop', order: 1 },
      { entrance: 'slide-up', order: 1 },
      { entrance: 'appear', order: 3 },
    ])
  })

  it('keeps canonical orders and assigns legacy groups to unused orders in mixed slides', () => {
    const parsed = validatePresentation(presentationWithAnimations([
      { entrance: 'fade', order: 1 },
      { entrance: 'pop', delayMs: 500, durationMs: 350 },
      { entrance: 'slide-up', delayMs: 1200, durationMs: 350 },
    ]))

    expect(parsed.slides[0].elements.map((element) => element.animation)).toEqual([
      { entrance: 'fade', order: 1 },
      { entrance: 'pop', order: 2 },
      { entrance: 'slide-up', order: 3 },
    ])
  })

  it('prefers canonical order and strips leftover legacy timing fields', () => {
    const parsed = validatePresentation(presentationWithAnimation({ entrance: 'pop', order: 8, delayMs: 500, durationMs: 900 }))

    expect(parsed.slides[0].elements[0].animation).toEqual({ entrance: 'pop', order: 8 })
  })

  it.each([
    [{ entrance: 'fade', delayMs: -1, durationMs: 350 }, /animation\.delayMs/],
    [{ entrance: 'fade', delayMs: 0, durationMs: -1 }, /animation\.durationMs/],
    [{ entrance: 'fade', delayMs: 60_001, durationMs: 350 }, /animation\.delayMs/],
    [{ entrance: 'fade', delayMs: 0, durationMs: 10_001 }, /animation\.durationMs/],
    [{ entrance: 'fade', delayMs: Number.NaN, durationMs: 350 }, /animation\.delayMs/],
  ] as const)('rejects invalid legacy animation metadata', (animation, error) => {
    expect(() => validatePresentation(presentationWithAnimation(animation))).toThrow(error)
  })
})

describe('element entrance animation duplication', () => {
  const animation: SlideEntranceAnimation = { entrance: 'slide-up', order: 7 }

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
