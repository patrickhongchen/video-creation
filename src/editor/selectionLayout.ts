import type { SlideElement } from '../model'
import { duplicateSlideElement } from '../presentationFactories'

export type SelectionAlignment = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'
export type DistributionAxis = 'horizontal' | 'vertical'

function movableSelection(elements: SlideElement[], ids: readonly string[]) {
  // Locked elements remain selected for visibility, but every destructive or
  // positional operation deliberately leaves them untouched.
  const selected = new Set(ids)
  return elements.filter((element) => selected.has(element.id) && !element.locked)
}

export function alignSelection(
  elements: SlideElement[],
  ids: readonly string[],
  alignment: SelectionAlignment,
): SlideElement[] {
  const movable = movableSelection(elements, ids)
  if (movable.length < 2) return elements

  const left = Math.min(...movable.map((element) => element.frame.x))
  const top = Math.min(...movable.map((element) => element.frame.y))
  const right = Math.max(...movable.map((element) => element.frame.x + element.frame.width))
  const bottom = Math.max(...movable.map((element) => element.frame.y + element.frame.height))
  const selected = new Set(movable.map((element) => element.id))

  return elements.map((element) => {
    if (!selected.has(element.id)) return element
    const frame = { ...element.frame }
    if (alignment === 'left') frame.x = left
    if (alignment === 'center') frame.x = left + (right - left - frame.width) / 2
    if (alignment === 'right') frame.x = right - frame.width
    if (alignment === 'top') frame.y = top
    if (alignment === 'middle') frame.y = top + (bottom - top - frame.height) / 2
    if (alignment === 'bottom') frame.y = bottom - frame.height
    return { ...element, frame }
  })
}

export function distributeSelection(
  elements: SlideElement[],
  ids: readonly string[],
  axis: DistributionAxis,
): SlideElement[] {
  const movable = movableSelection(elements, ids)
  if (movable.length < 3) return elements

  const horizontal = axis === 'horizontal'
  const start = (element: SlideElement) => horizontal ? element.frame.x : element.frame.y
  const size = (element: SlideElement) => horizontal ? element.frame.width : element.frame.height
  const ordered = movable.map((element, index) => ({ element, index })).sort((a, b) => start(a.element) - start(b.element) || a.index - b.index)
  const first = ordered[0].element
  const last = ordered[ordered.length - 1].element
  const span = start(last) + size(last) - start(first)
  const occupied = ordered.reduce((total, item) => total + size(item.element), 0)
  const gap = (span - occupied) / (ordered.length - 1)
  const positions = new Map<string, number>()
  let cursor = start(first)
  for (const { element } of ordered) {
    positions.set(element.id, cursor)
    cursor += size(element) + gap
  }

  return elements.map((element) => {
    const position = positions.get(element.id)
    if (position === undefined) return element
    return {
      ...element,
      frame: horizontal
        ? { ...element.frame, x: position }
        : { ...element.frame, y: position },
    }
  })
}

export function duplicateSelection(elements: SlideElement[], ids: readonly string[]): {
  elements: SlideElement[]
  selectedIds: string[]
} {
  const selected = new Set(ids)
  const duplicates = elements.filter((element) => selected.has(element.id)).map(duplicateSlideElement)
  if (duplicates.length === 0) return { elements, selectedIds: [] }
  return { elements: [...elements, ...duplicates], selectedIds: duplicates.map((element) => element.id) }
}

export function deleteSelection(elements: SlideElement[], ids: readonly string[]): SlideElement[] {
  const selected = new Set(ids)
  if (!elements.some((element) => selected.has(element.id) && !element.locked)) return elements
  return elements.filter((element) => !selected.has(element.id) || element.locked)
}

export function nudgeSelection(
  elements: SlideElement[],
  ids: readonly string[],
  dx: number,
  dy: number,
): SlideElement[] {
  if (dx === 0 && dy === 0) return elements
  const selected = new Set(ids)
  if (!elements.some((element) => selected.has(element.id) && !element.locked)) return elements
  return elements.map((element) => selected.has(element.id) && !element.locked
    ? { ...element, frame: { ...element.frame, x: element.frame.x + dx, y: element.frame.y + dy } }
    : element)
}

export function moveSelectionLayer(
  elements: SlideElement[],
  ids: readonly string[],
  direction: 'backward' | 'forward',
): SlideElement[] {
  const movable = new Set(elements.filter((element) => ids.includes(element.id) && !element.locked).map((element) => element.id))
  if (movable.size === 0) return elements
  const next = [...elements]
  let changed = false

  if (direction === 'forward') {
    for (let index = next.length - 2; index >= 0; index -= 1) {
      if (movable.has(next[index].id) && !movable.has(next[index + 1].id)) {
        ;[next[index], next[index + 1]] = [next[index + 1], next[index]]
        changed = true
      }
    }
  } else {
    for (let index = 1; index < next.length; index += 1) {
      if (movable.has(next[index].id) && !movable.has(next[index - 1].id)) {
        ;[next[index - 1], next[index]] = [next[index], next[index - 1]]
        changed = true
      }
    }
  }

  return changed ? next : elements
}
