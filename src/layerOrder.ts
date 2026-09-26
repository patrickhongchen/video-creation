/** Elements render back to front, while the Layers panel displays front to back. */
export function reorderLayer<T extends { id: string }>(
  elements: T[],
  draggedId: string,
  targetId: string,
  edge: 'above' | 'below',
): T[] {
  const frontToBack = [...elements].reverse()
  const sourceIndex = frontToBack.findIndex((element) => element.id === draggedId)
  if (sourceIndex < 0 || !frontToBack.some((element) => element.id === targetId)) return elements

  const [dragged] = frontToBack.splice(sourceIndex, 1)
  const targetIndex = frontToBack.findIndex((element) => element.id === targetId)
  const insertionIndex = targetIndex < 0 ? sourceIndex : targetIndex + (edge === 'below' ? 1 : 0)
  frontToBack.splice(insertionIndex, 0, dragged)

  const reordered = frontToBack.reverse()
  return reordered.every((element, index) => element === elements[index]) ? elements : reordered
}
