import { useState, type KeyboardEvent } from 'react'
import {
  captionTextsChanged,
  countCaptionEdits,
  isCaptionEdited,
  prepareCaptionUpdate,
  resetAllCaptionTexts,
  resetCaptionText,
  updateCaptionText,
} from '../narration/captionReview'
import type { NarrationCaptionTrack, NarrationTake } from '../narration/narrationTypes'
import { CloseIcon, PlayIcon } from './Icons'
import { formatDuration, formatTimer } from './narrationTime'

interface CaptionReviewDialogProps {
  take: NarrationTake
  takeNumber: number
  playbackTakeId: string | null
  playbackIsPlaying: boolean
  playbackCurrentTimeMs: number
  onPlay: () => Promise<void>
  onPlayAt: (timeMs: number) => Promise<void>
  onScrub: (timeMs: number) => Promise<void>
  onSave: (captions: NarrationCaptionTrack) => Promise<void>
  onClose: () => void
}

function copyCaptionTrack(track: NarrationCaptionTrack): NarrationCaptionTrack {
  return { ...track, segments: track.segments.map((segment) => ({ ...segment })) }
}

export function CaptionReviewDialog({
  take,
  takeNumber,
  playbackTakeId,
  playbackIsPlaying,
  playbackCurrentTimeMs,
  onPlay,
  onPlayAt,
  onScrub,
  onSave,
  onClose,
}: CaptionReviewDialogProps) {
  const [original] = useState(() => copyCaptionTrack(take.captions!))
  const [draft, setDraft] = useState(() => copyCaptionTrack(original))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const changed = captionTextsChanged(original, draft)
  const hasEmptyText = draft.segments.some((segment) => !segment.text.trim())
  const editCount = countCaptionEdits(draft)
  const canSave = changed && !hasEmptyText && !saving
  const isActiveTake = playbackTakeId === take.id
  const activeSegmentId = isActiveTake
    ? draft.segments.find((segment) => playbackCurrentTimeMs >= segment.startMs && playbackCurrentTimeMs < segment.endMs)?.id ?? null
    : null
  const audioUnavailable = Boolean(take.storageError) || take.blob.size === 0

  const requestClose = () => {
    if (saving) return
    if (changed && !window.confirm('Discard caption changes?\n\nYour unsaved edits will be lost.')) return
    onClose()
  }

  const save = async () => {
    if (!canSave) return
    let prepared: NarrationCaptionTrack
    try {
      prepared = prepareCaptionUpdate(original, draft)
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Caption changes are invalid.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await onSave(prepared)
    } catch (problem) {
      setSaving(false)
      setError(problem instanceof Error ? problem.message : 'Caption changes could not be saved.')
    }
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Tab') {
      const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button, input, textarea, select, [tabindex]:not([tabindex="-1"])'))
        .filter((element) => !element.hasAttribute('disabled'))
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    } else if (event.key === 'Escape') {
      event.preventDefault()
      requestClose()
    } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
      event.preventDefault()
      if (canSave) void save()
    }
  }

  return <div className="caption-review-backdrop">
    <section
      className="caption-review-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="caption-review-title"
      onKeyDown={handleKeyDown}
    >
      <header className="caption-review-header">
        <div>
          <span>Caption review</span>
          <h2 id="caption-review-title">Review Captions</h2>
          <div className="caption-review-meta">
            <strong>Take {takeNumber}</strong>
            <span>{draft.model} · {draft.segments.length} segment{draft.segments.length === 1 ? '' : 's'}</span>
            {editCount > 0 && <span className="caption-review-edit-count">{editCount} edit{editCount === 1 ? '' : 's'}</span>}
          </div>
        </div>
        <button type="button" className="caption-review-close" onClick={requestClose} disabled={saving} autoFocus><CloseIcon /> Close</button>
      </header>

      <div className="caption-review-playback">
        <button
          type="button"
          onClick={() => void onPlay()}
          disabled={audioUnavailable}
          aria-label={`${isActiveTake && playbackIsPlaying ? 'Pause' : 'Play'} Take ${takeNumber}`}
        >
          {isActiveTake && playbackIsPlaying ? 'Pause' : <><PlayIcon /> Play</>}
        </button>
        <span>{formatDuration(isActiveTake ? playbackCurrentTimeMs : 0)} / {formatDuration(take.durationMs)}</span>
        <input
          type="range"
          min="0"
          max={Math.max(1, take.durationMs)}
          step="100"
          value={isActiveTake ? Math.min(playbackCurrentTimeMs, take.durationMs) : 0}
          onChange={(event) => void onScrub(Number(event.target.value))}
          disabled={audioUnavailable}
          aria-label={`Seek Take ${takeNumber}`}
        />
        <small>Playback follows the current Original / Enhanced preview setting.</small>
      </div>

      <div className="caption-review-toolbar">
        <div><strong>Transcript</strong><span>Listen, then correct the text. Caption timing stays fixed.</span></div>
        {editCount > 0 && <button type="button" onClick={() => { setDraft((current) => resetAllCaptionTexts(current)); setError('') }} disabled={saving}>Reset all edits</button>}
      </div>

      <ol className="caption-segment-list">
        {draft.segments.map((segment, segmentIndex) => {
          const edited = isCaptionEdited(segment)
          const invalid = !segment.text.trim()
          const active = activeSegmentId === segment.id
          return <li key={segment.id} className={`caption-segment${active ? ' is-active' : ''}${edited ? ' is-edited' : ''}${invalid ? ' is-invalid' : ''}`} aria-current={active ? 'true' : undefined}>
            <div className="caption-segment-heading">
              <button type="button" onClick={() => void onPlayAt(segment.startMs)} disabled={audioUnavailable} aria-label={`Play caption ${segmentIndex + 1} from ${formatTimer(segment.startMs)}`}><PlayIcon /><span>{formatTimer(segment.startMs)} – {formatTimer(segment.endMs)}</span></button>
              {edited && <button type="button" className="caption-reset-button" onClick={() => { setDraft((current) => resetCaptionText(current, segment.id)); setError('') }} disabled={saving}>Reset</button>}
            </div>
            <textarea
              rows={3}
              value={segment.text}
              onChange={(event) => {
                const text = event.target.value
                setDraft((current) => updateCaptionText(current, segment.id, text))
                setError('')
              }}
              disabled={saving}
              aria-label={`Caption ${segmentIndex + 1} text`}
              aria-invalid={invalid}
              aria-describedby={invalid ? `caption-error-${segment.id}` : undefined}
            />
            <div className="caption-segment-status">
              {edited && <span>Edited from Whisper</span>}
              {invalid && <span id={`caption-error-${segment.id}`} role="alert">Caption text cannot be empty.</span>}
            </div>
          </li>
        })}
      </ol>

      <footer className="caption-review-footer">
        <div>{error && <span role="alert">{error}</span>}{!error && changed && !hasEmptyText && <span>Unsaved caption changes</span>}</div>
        <button type="button" onClick={requestClose} disabled={saving}>Cancel</button>
        <button type="button" className="caption-review-save" onClick={() => void save()} disabled={!canSave}>{saving ? 'Saving…' : 'Save changes'}</button>
      </footer>
    </section>
  </div>
}
