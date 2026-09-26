import { describe, expect, it } from 'vitest'
import {
  addRevealAnimation,
  removeRevealAnimation,
  reorderRevealGroup,
  revealGroups,
  updateRevealEntrance,
} from './animationOrder'
import type { Slide, SlideElement, SlideEntranceAnimationType } from './model'
import { createSlideFromPreset, createSlideTextElement } from './presentationFactories'

function element(
  id: string,
  order?: number,
  options: { entrance?: SlideEntranceAnimationType; hidden?: boolean } = {},
): SlideElement {
  return {
    ...createSlideTextElement(),
    id,
    name: id,
    hidden: options.hidden,
    animation: order === undefined ? undefined : { entrance: options.entrance ?? 'fade', order },
  }
}

function slideWith(elements: SlideElement[]): Slide {
  return { ...createSlideFromPreset('blank'), elements }
}

function orders(slide: Slide) {
  return Object.fromEntries(slide.elements.map((item) => [item.id, item.animation?.order]))
}

describe('reveal groups', () => {
  it('derives shared steps as one group', () => {
    const slide = slideWith([element('Headline', 1), element('Subtitle', 1), element('Photo', 2), element('Arrow', 3)])
    expect(revealGroups(slide).map((group) => group.elements.map((item) => item.id))).toEqual([
      ['Headline', 'Subtitle'], ['Photo'], ['Arrow'],
    ])
  })

  it('sorts sparse groups while preserving element source order and hidden animations', () => {
    const slide = slideWith([
      element('eight-a', 8),
      element('two', 2),
      element('plain'),
      element('eight-hidden', 8, { hidden: true }),
      element('five', 5),
      element('eight-b', 8),
    ])

    expect(revealGroups(slide).map((group) => ({
      order: group.order,
      ids: group.elements.map((item) => item.id),
    }))).toEqual([
      { order: 2, ids: ['two'] },
      { order: 5, ids: ['five'] },
      { order: 8, ids: ['eight-a', 'eight-hidden', 'eight-b'] },
    ])
  })
})

describe('reordering reveal groups', () => {
  it('moves a one-element step between two others', () => {
    const slide = slideWith([element('Headline', 1), element('Photo', 2), element('Arrow', 3)])
    expect(orders(reorderRevealGroup(slide, 3, 2, 'above'))).toEqual({ Headline: 1, Photo: 3, Arrow: 2 })
  })

  it('moves a grouped sparse step as one unit and normalizes all stored orders', () => {
    const slide = slideWith([
      element('eight-a', 8),
      element('two', 2),
      element('eight-hidden', 8, { hidden: true }),
      element('five', 5),
    ])

    const reordered = reorderRevealGroup(slide, 8, 5, 'above')

    expect(reordered.elements.map((item) => item.id)).toEqual(slide.elements.map((item) => item.id))
    expect(orders(reordered)).toEqual({ 'eight-a': 2, two: 1, 'eight-hidden': 2, five: 3 })
    expect(revealGroups(reordered).map((group) => group.elements.map((item) => item.id))).toEqual([
      ['two'],
      ['eight-a', 'eight-hidden'],
      ['five'],
    ])
  })

  it('returns the original slide when a drop does not change sequence order', () => {
    const slide = slideWith([element('two', 2), element('five', 5), element('eight', 8)])

    expect(reorderRevealGroup(slide, 5, 5, 'above')).toBe(slide)
    expect(reorderRevealGroup(slide, 5, 2, 'below')).toBe(slide)
    expect(reorderRevealGroup(slide, 99, 2, 'above')).toBe(slide)
  })
})

describe('editing reveal animations', () => {
  it('adds a visible element at the end with fade and normalizes sparse groups', () => {
    const slide = slideWith([
      element('two', 2),
      element('eight-hidden', 8, { hidden: true }),
      element('new'),
    ])

    const updated = addRevealAnimation(slide, 'new')

    expect(orders(updated)).toEqual({ two: 1, 'eight-hidden': 2, new: 3 })
    expect(updated.elements[2].animation).toEqual({ entrance: 'fade', order: 3 })
  })

  it('does not add animations to hidden or already animated elements', () => {
    const hidden = slideWith([element('hidden', undefined, { hidden: true })])
    const animated = slideWith([element('animated', 4)])

    expect(addRevealAnimation(hidden, 'hidden')).toBe(hidden)
    expect(addRevealAnimation(animated, 'animated')).toBe(animated)
    expect(addRevealAnimation(animated, 'missing')).toBe(animated)
  })

  it('removes only the requested animation and compacts groups when one becomes empty', () => {
    const grouped = slideWith([element('a', 2), element('b', 2), element('hidden', 7, { hidden: true }), element('c', 9)])
    const withMemberRemoved = removeRevealAnimation(grouped, 'a')

    expect(orders(withMemberRemoved)).toEqual({ a: undefined, b: 1, hidden: 2, c: 3 })
    expect(withMemberRemoved.elements[0].hidden).toBeFalsy()

    const withGroupRemoved = removeRevealAnimation(withMemberRemoved, 'hidden')
    expect(orders(withGroupRemoved)).toEqual({ a: undefined, b: 1, hidden: undefined, c: 2 })
    expect(withGroupRemoved.elements.find((item) => item.id === 'hidden')?.hidden).toBe(true)
  })

  it('changes only the entrance type and preserves group order', () => {
    const slide = slideWith([element('headline', 5), element('subtitle', 5, { entrance: 'slide-up' })])

    const updated = updateRevealEntrance(slide, 'headline', 'pop')

    expect(updated.elements[0].animation).toEqual({ entrance: 'pop', order: 5 })
    expect(updated.elements[1]).toBe(slide.elements[1])
    expect(updateRevealEntrance(updated, 'headline', 'pop')).toBe(updated)
    expect(updateRevealEntrance(slide, 'missing', 'pop')).toBe(slide)
  })
})
