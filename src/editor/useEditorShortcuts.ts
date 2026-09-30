import { useEffect } from 'react'
import { getDesktopBridge } from '../desktop/desktopBridge'
import { commandForShortcut, isEditingControl, type EditorCommand, type ShortcutContext } from './editorCommands'

/** Keyboard/native menu gestures dispatch the same editor intents. Paste stays native
 * so clipboard image ingestion can inspect image content before internal copies. */
export function useEditorShortcuts(context: Omit<ShortcutContext, 'formFocused'>, execute: (command: EditorCommand) => void) {
  const { mode, preview, modalOpen } = context
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      const command = commandForShortcut(event, { mode, preview, modalOpen, formFocused: isEditingControl(event.target as HTMLElement | null) })
      if (!command || command.type === 'paste') return
      event.preventDefault()
      execute(command)
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  }, [mode, preview, modalOpen, execute])

  useEffect(() => {
    const desktop = getDesktopBridge()
    if (!desktop) return
    const history = (type: 'undo' | 'redo') => {
      if (modalOpen) return
      if (isEditingControl(document.activeElement as HTMLElement | null)) document.execCommand(type)
      else if (mode === 'edit' && !preview) execute({ type })
    }
    const undo = desktop.onUndoRequested(() => history('undo'))
    const redo = desktop.onRedoRequested(() => history('redo'))
    return () => { undo(); redo() }
  }, [mode, preview, modalOpen, execute])
}
