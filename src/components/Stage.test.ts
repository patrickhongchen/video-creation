import { describe, expect, it } from 'vitest'
import { samplePresentation } from '../samplePresentation'
import { slideFrameKey } from './Stage'

describe('slideFrameKey', () => {
  it('keeps the same frame mounted while a compatible chart story continues', () => {
    const chartSlides = samplePresentation.slides.slice(1, 5)
    const keys = chartSlides.map((slide) => slideFrameKey(slide, samplePresentation.id))

    expect(new Set(keys)).toHaveLength(1)
  })

  it('changes the frame for a new chart representation or ordinary slide', () => {
    const barKey = slideFrameKey(samplePresentation.slides[4], samplePresentation.id)
    const lineKey = slideFrameKey(samplePresentation.slides[5], samplePresentation.id)
    const closingKey = slideFrameKey(samplePresentation.slides[6], samplePresentation.id)

    expect(lineKey).not.toBe(barKey)
    expect(closingKey).not.toBe(lineKey)
  })

  it('keeps multi-chart slides mounted when the same chart set changes order', () => {
    const first = structuredClone(samplePresentation.slides[1])
    const second = structuredClone(samplePresentation.slides[2])
    const firstChart = first.elements.find((element) => element.type === 'chart')!
    const secondChart = second.elements.find((element) => element.type === 'chart')!
    const companionA = { ...structuredClone(firstChart), id: 'companion-a', chartId: 'companion-chart' }
    const companionB = { ...structuredClone(secondChart), id: 'companion-b', chartId: 'companion-chart' }
    first.elements.push(companionA)
    second.elements.unshift(companionB)

    expect(slideFrameKey(first, samplePresentation.id)).toBe(slideFrameKey(second, samplePresentation.id))
  })
})
