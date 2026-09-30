import { CloseIcon } from './Icons'
interface PresentationDialogProps {
  dialog: 'new' | 'rename' | 'delete' | null
  title: string
  name: string
  onNameChange: (name: string) => void
  onClose: () => void
  onCreate: () => void
  onRename: () => void
  onDelete: () => void
}
export function PresentationDialog({ dialog, title, name, onNameChange, onClose, onCreate, onRename, onDelete }: PresentationDialogProps) {
  return <>
      {dialog && (
        <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
          <section className="project-dialog" role="dialog" aria-modal="true" aria-labelledby="project-dialog-title">
            <div className="project-dialog-heading">
              <h2 id="project-dialog-title">{dialog === 'new' ? 'New presentation' : dialog === 'rename' ? 'Rename presentation' : 'Delete presentation?'}</h2>
              <button onClick={() => onClose()} aria-label="Close dialog"><CloseIcon /></button>
            </div>
            {dialog === 'delete' ? (
              <>
                <p>“{title}” will be removed from local storage. Export it first if you want to keep a copy.</p>
                <div className="project-dialog-actions"><button onClick={() => onClose()}>Cancel</button><button className="danger-button" onClick={onDelete}>Delete presentation</button></div>
              </>
            ) : (
              <form onSubmit={(event) => { event.preventDefault(); dialog === 'new' ? onCreate() : onRename() }}>
                <label><span>Presentation title</span><input autoFocus value={name} onChange={(event) => onNameChange(event.target.value)} /></label>
                <div className="project-dialog-actions"><button type="button" onClick={() => onClose()}>Cancel</button><button type="submit">{dialog === 'new' ? 'Create presentation' : 'Save name'}</button></div>
              </form>
            )}
          </section>
        </div>
      )}

  </>
}
