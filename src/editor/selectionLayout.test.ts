import { describe, expect, it } from 'vitest'
import type { SlideElement } from '../model'
import { alignSelection, deleteSelection, distributeSelection, duplicateSelection, moveSelectionLayer, nudgeSelection } from './selectionLayout'

function element(id: string, x: number, y: number, width = 20, height = 20, locked = false): SlideElement {
  return { id, type: 'shape', shape: 'rectangle', name: id, frame: { x, y, width, height }, locked }
}

const positions = (elements: SlideElement[]) => elements.map(({ id, frame }) => ({ id, x: frame.x, y: frame.y }))

describe('selection layout', () => {
  it('aligns edges using the movable selection bounds', () => {
    const source = [element('a', 10, 20, 20, 30), element('b', 50, 80, 40, 10)]
    expect(positions(alignSelection(source, ['a', 'b'], 'left'))).toEqual([{ id: 'a', x: 10, y: 20 }, { id: 'b', x: 10, y: 80 }])
    expect(positions(alignSelection(source, ['a', 'b'], 'right'))).toEqual([{ id: 'a', x: 70, y: 20 }, { id: 'b', x: 50, y: 80 }])
    expect(positions(alignSelection(source, ['a', 'b'], 'top'))).toEqual([{ id: 'a', x: 10, y: 20 }, { id: 'b', x: 50, y: 20 }])
    expect(positions(alignSelection(source, ['a', 'b'], 'bottom'))).toEqual([{ id: 'a', x: 10, y: 60 }, { id: 'b', x: 50, y: 80 }])
  })

  it('aligns horizontal and vertical centers', () => {
    const source = [element('a', 0, 0, 20, 20), element('b', 80, 80, 40, 40)]
    expect(positions(alignSelection(source, ['a', 'b'], 'center'))).toEqual([{ id: 'a', x: 50, y: 0 }, { id: 'b', x: 40, y: 80 }])
    expect(positions(alignSelection(source, ['a', 'b'], 'middle'))).toEqual([{ id: 'a', x: 0, y: 50 }, { id: 'b', x: 80, y: 40 }])
  })

  it('distributes three or more elements with equal edge gaps and fixed outer elements', () => {
    const horizontal = [element('a', 0, 0, 10), element('b', 20, 10, 20), element('c', 90, 20, 10)]
    expect(positions(distributeSelection(horizontal, ['a', 'b', 'c'], 'horizontal'))).toEqual([
      { id: 'a', x: 0, y: 0 }, { id: 'b', x: 40, y: 10 }, { id: 'c', x: 90, y: 20 },
    ])
    const vertical = [element('a', 0, 0, 10, 10), element('b', 10, 20, 10, 20), element('c', 20, 90, 10, 10)]
    expect(positions(distributeSelection(vertical, ['a', 'b', 'c'], 'vertical'))).toEqual([
      { id: 'a', x: 0, y: 0 }, { id: 'b', x: 10, y: 40 }, { id: 'c', x: 20, y: 90 },
    ])
  })

  it('excludes locked elements from transforms and deletion', () => {
    const source = [element('a', 0, 0), element('locked', 40, 40, 20, 20, true), element('b', 80, 80)]
    const aligned = alignSelection(source, ['a', 'locked', 'b'], 'left')
    expect(positions(aligned)).toEqual([{ id: 'a', x: 0, y: 0 }, { id: 'locked', x: 40, y: 40 }, { id: 'b', x: 0, y: 80 }])
    expect(deleteSelection(source, ['a', 'locked'])).toEqual([source[1], source[2]])
    expect(positions(nudgeSelection(source, ['a', 'locked'], 5, -2))).toEqual([
      { id: 'a', x: 5, y: -2 }, { id: 'locked', x: 40, y: 40 }, { id: 'b', x: 80, y: 80 },
    ])
  })

  it('duplicates all selected elements with fresh identities and selects the copies', () => {
    const source = [element('a', 2, 4), element('b', 30, 40, 20, 20, true)]
    const result = duplicateSelection(source, ['a', 'b'])
    expect(result.elements).toHaveLength(4)
    expect(result.selectedIds).toEqual(result.elements.slice(2).map((item) => item.id))
    expect(new Set(result.elements.map((item) => item.id)).size).toBe(4)
    expect(positions(result.elements.slice(2))).toEqual([
      { id: result.selectedIds[0], x: 26, y: 28 }, { id: result.selectedIds[1], x: 54, y: 64 },
    ])
  })

  it('leaves invalid and too-small selections unchanged', () => {
    const source = [element('a', 0, 0), element('b', 50, 50)]
    expect(alignSelection(source, ['missing'], 'left')).toBe(source)
    expect(distributeSelection(source, ['a', 'b'], 'horizontal')).toBe(source)
    expect(deleteSelection(source, ['missing'])).toBe(source)
    expect(nudgeSelection(source, [], 1, 0)).toBe(source)
  })

  it('moves a multi-selection one layer while preserving its internal order', () => {
    const source = ['a', 'b', 'c', 'd'].map((id, index) => element(id, index, 0))
    expect(moveSelectionLayer(source, ['a', 'c'], 'forward').map((item) => item.id)).toEqual(['b', 'a', 'd', 'c'])
    expect(moveSelectionLayer(source, ['b', 'd'], 'backward').map((item) => item.id)).toEqual(['b', 'a', 'd', 'c'])
  })
})
