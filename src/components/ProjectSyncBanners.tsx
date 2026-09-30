import { CloseIcon } from './Icons'
interface ProjectSyncBannersProps {
  projectOpen: boolean
  issue: string
  issueDismissed: boolean
  pending: boolean
  pendingDismissed: boolean
  dirty: boolean
  canAutoApply: boolean
  onDismissIssue: () => void
  onKeepEditing: () => void
  onReload: () => void
}
export function ProjectSyncBanners({ projectOpen, issue, issueDismissed, pending, pendingDismissed, dirty, canAutoApply, onDismissIssue, onKeepEditing, onReload }: ProjectSyncBannersProps) {
  if (!projectOpen) return null
  return <>
    {issue && !issueDismissed && <div className="error-banner" role="status"><span>{issue} The last valid presentation remains open.</span><button onClick={onDismissIssue} aria-label="Dismiss sync warning"><CloseIcon /></button></div>}
    {pending && !pendingDismissed && (dirty || !canAutoApply) && <div className="error-banner" role="status"><span>External changes detected. Your current work has been kept.</span><button onClick={onReload}>Reload from Disk</button><button onClick={onKeepEditing}>Keep Editing</button></div>}
  </>
}
