/** Selection is editor state. Reconcile it against model IDs after reload/history. */
export function reconcileSelection(elements: readonly { id: string }[], selectedIds: readonly string[]): string[] {
  const validIds = new Set(elements.map(({ id }) => id))
  return selectedIds.filter((id) => validIds.has(id))
}
