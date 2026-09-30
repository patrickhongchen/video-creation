export type EditorCommand =
  | { type: 'undo' | 'redo' | 'save' | 'new-project' | 'open-project' | 'delete' | 'duplicate' | 'clear-selection' | 'copy' | 'paste' | 'exit-preview' | 'advance-reveal' | 'previous-slide' | 'exit-present' }
  | { type: 'nudge'; dx: number; dy: number }
  | { type: 'layer'; direction: 'backward' | 'forward' }

export interface ShortcutGesture {
  key: string
  metaKey?: boolean
  ctrlKey?: boolean
  shiftKey?: boolean
  altKey?: boolean
}
export interface ShortcutContext {
  mode: 'edit' | 'present' | 'narrate'
  preview: boolean
  formFocused: boolean
  modalOpen?: boolean
}

/** Receives plain focus data so shortcut policy can be tested without a browser. */
export function isEditingControl(target: { tagName?: string; isContentEditable?: boolean } | null) {
  return Boolean(target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName?.toUpperCase() ?? '')))
}

export function commandForShortcut(event: ShortcutGesture, context: ShortcutContext): EditorCommand | null {
  if (context.modalOpen) return null
  const key = event.key.toLowerCase()
  const command = event.metaKey || event.ctrlKey
  if (command && !event.altKey && key === 's') return { type: 'save' }
  if (context.mode === 'present') {
    if (key === 'escape') return { type: 'exit-present' }
    if (key === 'arrowright' || key === ' ') return { type: 'advance-reveal' }
    if (key === 'arrowleft') return { type: 'previous-slide' }
    return null
  }
  if (context.mode !== 'edit') return null
  if (context.preview) {
    if (context.formFocused) return null
    if (key === 'escape') return { type: 'exit-preview' }
    if (key === 'arrowright' || key === ' ') return { type: 'advance-reveal' }
    return null
  }
  if (context.formFocused || event.altKey) return null
  if (command) {
    if (key === 'z') return { type: event.shiftKey ? 'redo' : 'undo' }
    if (key === 'y') return { type: 'redo' }
    if (key === 'd') return { type: 'duplicate' }
    if (key === 'c') return { type: 'copy' }
    if (key === 'v') return { type: 'paste' }
    if (key === 'n') return { type: 'new-project' }
    if (key === 'o') return { type: 'open-project' }
    return null
  }
  if (key === 'delete' || key === 'backspace') return { type: 'delete' }
  if (key === 'escape') return { type: 'clear-selection' }
  if (key === '[' || key === ']') return { type: 'layer', direction: key === '[' ? 'backward' : 'forward' }
  const step = event.shiftKey ? 10 : 1
  if (key === 'arrowleft') return { type: 'nudge', dx: -step, dy: 0 }
  if (key === 'arrowright') return { type: 'nudge', dx: step, dy: 0 }
  if (key === 'arrowup') return { type: 'nudge', dx: 0, dy: -step }
  if (key === 'arrowdown') return { type: 'nudge', dx: 0, dy: step }
  return null
}

export const EDITOR_SHORTCUT_HELP = 'Shift-click to select · ⌘D duplicate · Delete · Arrows nudge (Shift = 10) · [ / ] reorder · ⌘Z undo · ⇧⌘Z redo · ⌘S save'
