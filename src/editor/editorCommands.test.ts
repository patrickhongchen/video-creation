import { describe, expect, it } from 'vitest'
import { commandForShortcut, isEditingControl } from './editorCommands'
const edit = { mode: 'edit', preview: false, formFocused: false } as const

describe('editor shortcut commands', () => {
  it('maps macOS history/file/clipboard and selection intent', () => {
    for (const [key, type] of [['z', 'undo'], ['s', 'save'], ['d', 'duplicate'], ['c', 'copy'], ['v', 'paste']] as const) {
      expect(commandForShortcut({ key, metaKey: true }, edit)).toEqual({ type })
    }
    expect(commandForShortcut({ key: 'Z', metaKey: true, shiftKey: true }, edit)).toEqual({ type: 'redo' })
    expect(commandForShortcut({ key: 'z', ctrlKey: true }, edit)).toEqual({ type: 'undo' })
    expect(commandForShortcut({ key: 'd' }, edit)).toBeNull()
    expect(commandForShortcut({ key: 'd', metaKey: true, altKey: true }, edit)).toBeNull()
    for (const key of ['Delete', 'Backspace']) expect(commandForShortcut({ key }, edit)).toEqual({ type: 'delete' })
    expect(commandForShortcut({ key: 'Escape' }, edit)).toEqual({ type: 'clear-selection' })
  })
  it('maps all arrow directions and nudge amounts', () => {
    for (const [key, dx, dy] of [['ArrowLeft', -1, 0], ['ArrowRight', 1, 0], ['ArrowUp', 0, -1], ['ArrowDown', 0, 1]] as const) {
      expect(commandForShortcut({ key }, edit)).toEqual({ type: 'nudge', dx, dy })
      expect(commandForShortcut({ key, shiftKey: true }, edit)).toEqual({ type: 'nudge', dx: dx * 10, dy: dy * 10 })
    }
  })
  it('maps relative layer ordering', () => {
    expect(commandForShortcut({ key: '[' }, edit)).toEqual({ type: 'layer', direction: 'backward' })
    expect(commandForShortcut({ key: ']' }, edit)).toEqual({ type: 'layer', direction: 'forward' })
  })
  it('suppresses editing commands for controls, modals and other modes', () => {
    for (const key of ['Delete', 'd', '[', 'z', 'c']) {
      expect(commandForShortcut({ key, metaKey: key.length === 1 }, { ...edit, formFocused: true })).toBeNull()
      expect(commandForShortcut({ key }, { ...edit, modalOpen: true })).toBeNull()
      for (const mode of ['present', 'narrate'] as const) expect(commandForShortcut({ key, metaKey: true }, { ...edit, mode })).toBeNull()
    }
    expect(commandForShortcut({ key: 'Delete' }, { ...edit, preview: true })).toBeNull()
    expect(commandForShortcut({ key: 'Escape' }, { ...edit, preview: true })).toEqual({ type: 'exit-preview' })
    expect(commandForShortcut({ key: 's', metaKey: true }, { ...edit, formFocused: true })).toEqual({ type: 'save' })
  })
  it('preserves presentation and preview navigation without editing commands', () => {
    expect(commandForShortcut({ key: 'ArrowRight' }, { ...edit, mode: 'present' })).toEqual({ type: 'advance-reveal' })
    expect(commandForShortcut({ key: ' ' }, { ...edit, preview: true })).toEqual({ type: 'advance-reveal' })
    expect(commandForShortcut({ key: 'ArrowLeft' }, { ...edit, mode: 'present' })).toEqual({ type: 'previous-slide' })
    expect(commandForShortcut({ key: 'Escape' }, { ...edit, mode: 'present' })).toEqual({ type: 'exit-present' })
    expect(commandForShortcut({ key: 'ArrowRight' }, { ...edit, mode: 'narrate' })).toBeNull()
  })
  it('identifies numeric/text fields, selects and editable content', () => {
    for (const tagName of ['input', 'TEXTAREA', 'SELECT']) expect(isEditingControl({ tagName })).toBe(true)
    expect(isEditingControl({ tagName: 'DIV', isContentEditable: true })).toBe(true)
    expect(isEditingControl({ tagName: 'BUTTON' })).toBe(false)
    expect(isEditingControl(null)).toBe(false)
  })
})
