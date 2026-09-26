import { describe, expect, it } from 'vitest'
import { reorderLayer } from './layerOrder'

const elements = ['Background', 'Photo', 'Headline'].map((id) => ({ id }))
const names = (items: typeof elements) => items.map((item) => item.id)

describe('layer order', () => {
  it('displays the renderer order front to back', () => {
    expect(names([...elements].reverse())).toEqual(['Headline', 'Photo', 'Background'])
  })

  it('moves the back layer to the front', () => {
    const reordered = reorderLayer(elements, 'Background', 'Headline', 'above')
    expect(names([...reordered].reverse())).toEqual(['Background', 'Headline', 'Photo'])
    expect(names(reordered)).toEqual(['Photo', 'Headline', 'Background'])
  })

  it('moves the first layer to the last and the last to the first', () => {
    expect(names(reorderLayer(elements, 'Headline', 'Background', 'below'))).toEqual(['Headline', 'Background', 'Photo'])
    expect(names(reorderLayer(elements, 'Background', 'Headline', 'above'))).toEqual(['Photo', 'Headline', 'Background'])
  })

  it('moves between adjacent positions', () => {
    expect(names(reorderLayer(elements, 'Headline', 'Photo', 'below'))).toEqual(['Background', 'Headline', 'Photo'])
    expect(names(reorderLayer(elements, 'Photo', 'Headline', 'above'))).toEqual(['Background', 'Headline', 'Photo'])
  })

  it('returns the original array when the drop does not change order', () => {
    expect(reorderLayer(elements, 'Headline', 'Photo', 'above')).toBe(elements)
    expect(reorderLayer(elements, 'Background', 'Background', 'below')).toBe(elements)
  })
})
