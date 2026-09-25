import { describe, expect, it } from 'vitest'
import { createBlankPresentation } from './presentationFactories'
import { lintPresentation } from './presentationLint'
import type { SlideChartElement, SlideTextElement } from './model'

function text(id: string, x = 100, y = 200, width = 800, height = 180): SlideTextElement {
  return { id, type: 'text', name: id, text: 'A short idea', role: 'headline', fontSize: 72, frame: { x, y, width, height } }
}

function chart(id: string, chartId: string, width = 800, height = 700): SlideChartElement {
  return {
    id, type: 'chart', name: id, frame: { x: 100, y: 500, width, height },
    chartType: 'bar', data: [{ id: 'a', label: 'A', value: 4 }, { id: 'b', label: 'B', value: 8 }],
    highlightIds: [], showValues: true, chartId,
  }
}

describe('presentation quality lint', () => {
  it('accepts a valid minimal slide and intentional partial crop', () => {
    const presentation = createBlankPresentation()
    presentation.slides[0].elements = [text('crop', -80, 240, 500)]
    expect(lintPresentation(presentation)).toEqual([])
  })

  it('warns for tiny text, dense text, a tiny chart, and a fully off-slide element', () => {
    const presentation = createBlankPresentation()
    presentation.slides[0].elements = [
      { ...text('tiny'), fontSize: 18 },
      { ...text('dense', 100, 400, 300, 100), text: 'A long paragraph. '.repeat(30), fontSize: 30 },
      chart('small-chart', 'data', 300, 220),
      text('gone', 1200),
    ]
    const codes = lintPresentation(presentation).map(({ code }) => code)
    expect(codes).toContain('text-small')
    expect(codes).toContain('text-dense')
    expect(codes).toContain('chart-frame-small')
    expect(codes).toContain('element-off-slide')
  })

  it('warns only when several content elements heavily overlap', () => {
    const presentation = createBlankPresentation()
    presentation.slides[0].elements = ['a', 'b', 'c', 'd'].map((id) => text(id))
    expect(lintPresentation(presentation).map(({ code }) => code)).toContain('heavy-overlap')
  })

  it('does not flag a large image used as a backdrop for separate labels', () => {
    const presentation = createBlankPresentation()
    presentation.slides[0].elements = [
      { id: 'backdrop', type: 'image', name: 'Backdrop', assetId: 'asset', fit: 'cover', frame: { x: 0, y: 0, width: 1080, height: 1920 } },
      text('top', 100, 200, 800, 180),
      text('middle', 100, 700, 800, 180),
      text('bottom', 100, 1300, 800, 180),
    ]
    expect(lintPresentation(presentation).map(({ code }) => code)).not.toContain('heavy-overlap')
  })

  it('flags a likely chart identity reset across adjacent slides', () => {
    const presentation = createBlankPresentation()
    presentation.slides[0].elements = [chart('first', 'one')]
    presentation.slides.push({ ...structuredClone(presentation.slides[0]), id: 'next', elements: [chart('second', 'two')] })
    expect(lintPresentation(presentation).map(({ code }) => code)).toContain('chart-identity-reset')
  })
})
