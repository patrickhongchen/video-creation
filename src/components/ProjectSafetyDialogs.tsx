import type { PendingChoice, ConflictChoice } from '../project/useDesktopProject'
interface ProjectSafetyDialogsProps {
  title: string
  unsavedPrompt: boolean
  conflictPrompt: boolean
  finishUnsavedPrompt: (choice: PendingChoice) => void
  finishConflictPrompt: (choice: ConflictChoice) => void
}
export function ProjectSafetyDialogs({ title, unsavedPrompt, conflictPrompt, finishUnsavedPrompt, finishConflictPrompt }: ProjectSafetyDialogsProps) {
  return <>
    {unsavedPrompt && <div className="dialog-backdrop" role="presentation"><section className="project-dialog" role="dialog" aria-modal="true" aria-labelledby="unsaved-title"><div className="project-dialog-heading"><h2 id="unsaved-title">Save changes?</h2></div><p>“{title}” has unsaved changes.</p><div className="project-dialog-actions"><button onClick={() => finishUnsavedPrompt('cancel')}>Cancel</button><button onClick={() => finishUnsavedPrompt('discard')}>Don’t Save</button><button className="primary-button" onClick={() => finishUnsavedPrompt('save')}>Save</button></div></section></div>}
    {conflictPrompt && <div className="dialog-backdrop" role="presentation"><section className="project-dialog" role="dialog" aria-modal="true" aria-labelledby="conflict-title"><div className="project-dialog-heading"><h2 id="conflict-title">presentation.json changed</h2></div><p>The file changed outside AI Presentation Studio while you also have unsaved edits.</p><div className="project-dialog-actions"><button onClick={() => finishConflictPrompt('cancel')}>Cancel</button><button onClick={() => finishConflictPrompt('reload')}>Reload from Disk</button><button className="danger-button" onClick={() => finishConflictPrompt('overwrite')}>Overwrite with My Version</button></div></section></div>}
  </>

}
