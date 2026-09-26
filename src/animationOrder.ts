import type { Slide, SlideElement, SlideEntranceAnimationType } from './model'

export interface RevealGroup {
  order: number
  elements: SlideElement[]
}

export type RevealGroupDropEdge = 'above' | 'below'

/** Animated elements grouped by their stored order, including hidden elements. */
export function revealGroups(slide: Slide): RevealGroup[] {
  const groups = new Map<number, SlideElement[]>()
  slide.elements.forEach((element) => {
    if (!element.animation) return
    const elements = groups.get(element.animation.order)
    if (elements) elements.push(element)
    else groups.set(element.animation.order, [element])
  })
  return [...groups.entries()]
    .sort(([left], [right]) => left - right)
    .map(([order, elements]) => ({ order, elements }))
}

function applyRevealOrders(slide: Slide, orderByStoredOrder: ReadonlyMap<number, number>): Slide {
  let changed = false
  const elements = slide.elements.map((element) => {
    if (!element.animation) return element
    const order = orderByStoredOrder.get(element.animation.order)
    if (order === undefined || order === element.animation.order) return element
    changed = true
    return { ...element, animation: { ...element.animation, order } }
  })
  return changed ? { ...slide, elements } : slide
}

function normalizedOrderMap(groups: readonly RevealGroup[]) {
  return new Map(groups.map((group, index) => [group.order, index + 1]))
}

/** Move one whole reveal group and normalize every group to contiguous orders. */
export function reorderRevealGroup(
  slide: Slide,
  sourceOrder: number,
  targetOrder: number,
  edge: RevealGroupDropEdge,
): Slide {
  if (sourceOrder === targetOrder) return slide

  const groups = revealGroups(slide)
  const sourceIndex = groups.findIndex((group) => group.order === sourceOrder)
  if (sourceIndex < 0 || !groups.some((group) => group.order === targetOrder)) return slide

  const reordered = [...groups]
  const [source] = reordered.splice(sourceIndex, 1)
  const targetIndex = reordered.findIndex((group) => group.order === targetOrder)
  reordered.splice(targetIndex + (edge === 'below' ? 1 : 0), 0, source)

  if (reordered.every((group, index) => group === groups[index])) return slide
  return applyRevealOrders(slide, normalizedOrderMap(reordered))
}

/** Add a visible, unanimated element as a final reveal step. */
export function addRevealAnimation(slide: Slide, elementId: string): Slide {
  const target = slide.elements.find((element) => element.id === elementId)
  if (!target || target.hidden || target.animation) return slide

  const groups = revealGroups(slide)
  const orderByStoredOrder = normalizedOrderMap(groups)
  const elements = slide.elements.map((element) => {
    if (element.id === elementId) return { ...element, animation: { entrance: 'fade' as const, order: groups.length + 1 } }
    if (!element.animation) return element
    const order = orderByStoredOrder.get(element.animation.order)
    return order === undefined || order === element.animation.order
      ? element
      : { ...element, animation: { ...element.animation, order } }
  })
  return { ...slide, elements }
}

/** Remove one element's animation and compact the remaining reveal groups. */
export function removeRevealAnimation(slide: Slide, elementId: string): Slide {
  const target = slide.elements.find((element) => element.id === elementId)
  if (!target?.animation) return slide

  const remainingOrders = [...new Set(slide.elements
    .filter((element) => element.id !== elementId && element.animation)
    .map((element) => element.animation!.order))]
    .sort((left, right) => left - right)
  const orderByStoredOrder = new Map(remainingOrders.map((order, index) => [order, index + 1]))

  const elements = slide.elements.map((element) => {
    if (element.id === elementId) {
      const { animation: _animation, ...withoutAnimation } = element
      return withoutAnimation as SlideElement
    }
    if (!element.animation) return element
    const order = orderByStoredOrder.get(element.animation.order)
    return order === undefined || order === element.animation.order
      ? element
      : { ...element, animation: { ...element.animation, order } }
  })
  return { ...slide, elements }
}

/** Change an element's entrance while preserving its reveal group. */
export function updateRevealEntrance(
  slide: Slide,
  elementId: string,
  entrance: SlideEntranceAnimationType,
): Slide {
  const target = slide.elements.find((element) => element.id === elementId)
  if (!target?.animation || target.animation.entrance === entrance) return slide
  return {
    ...slide,
    elements: slide.elements.map((element) => element.id === elementId
      ? { ...element, animation: { ...element.animation!, entrance } }
      : element),
  }
}
