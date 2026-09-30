import type { RefObject } from 'react'
import type { NarrationSection, Presentation, Slide } from '../../model'
import type { NarrationTake } from '../../narration/narrationTypes'
import type { ResolvedNarrationSection } from '../../narration/narrationValidation'
import { getTakeRevealCoverageIssue, takeIsUsable } from '../../narration/narrationValidation'
import { countCaptionEdits } from '../../narration/captionReview'
import { takePreviewKey } from '../../narration/takePreviewSelection'
import { CheckIcon, PlayIcon } from '../Icons'
import { formatDuration } from '../narrationTime'

interface PreviewState {
  key: string
  status: 'preparing' | 'ready' | 'failed'
  warning?: string
}

interface NarrationSidebarProps {
  presentation: Presentation
  mode: 'setup' | 'recording'
  selectedSection: NarrationSection | null
  selectedSectionIndex: number
  selectedResolved: ResolvedNarrationSection | null
  currentSlide: Slide | undefined
  nextSlide: Slide | undefined
  scriptTextSize: number
  sectionEditorOpen: boolean
  draftTitle: string
  selectedTakes: NarrationTake[]
  latestTakeId: string | null
  latestTakeRef: RefObject<HTMLLIElement | null>
  recorderBusy: boolean
  comparisonMode: 'enhanced' | 'original'
  previewStates: Record<string, PreviewState>
  captionJobTakeId: string | null
  captionErrors: Record<string, string>
  playbackTakeId: string | null
  playbackIsPlaying: boolean
  playbackCurrentTimeMs: number
  onChangeScriptTextSize: (size: number) => void
  onToggleSectionEditor: () => void
  onChangeDraftTitle: (title: string) => void
  onMergeWithPrevious: () => void
  onCancelSectionEdit: () => void
  onSaveSectionName: () => void
  onChooseComparisonMode: (mode: 'enhanced' | 'original') => void
  onPlayTake: (take: NarrationTake) => void
  onChooseTake: (takeId: string) => void
  onRemoveTake: (take: NarrationTake) => void
  onOpenCaptionReview: (take: NarrationTake, takeNumber: number) => void
  onGenerateCaptions: (take: NarrationTake) => void
  onSeek: (seconds: number) => void
}

function NarrationScript({ currentNotes, nextNotes, nextTitle, textSize, onSizeChange }: {
  currentNotes: string | undefined
  nextNotes: string | undefined
  nextTitle: string | undefined
  textSize: number
  onSizeChange: (size: number) => void
}) {
  return <>
    <div className="narration-script-tools"><span>Script</span><div><button aria-label="Decrease script text size" onClick={() => onSizeChange(Math.max(16, textSize - 2))}>A−</button><button aria-label="Increase script text size" onClick={() => onSizeChange(Math.min(30, textSize + 2))}>A+</button></div></div>
    <section className="narration-notes current-notes"><span>Current</span><p style={{ fontSize: textSize }}>{currentNotes?.trim() || 'No speaker notes for this slide.'}</p></section>
    <section className="narration-notes next-notes"><span>Next{nextTitle ? ` · ${nextTitle}` : ''}</span><p>{nextNotes?.trim() || (nextTitle ? 'No speaker notes for the next slide.' : 'End of this section.')}</p></section>
  </>
}

export function NarrationSidebar({
  presentation,
  mode,
  selectedSection,
  selectedSectionIndex,
  selectedResolved,
  currentSlide,
  nextSlide,
  scriptTextSize,
  sectionEditorOpen,
  draftTitle,
  selectedTakes,
  latestTakeId,
  latestTakeRef,
  recorderBusy,
  comparisonMode,
  previewStates,
  captionJobTakeId,
  captionErrors,
  playbackTakeId,
  playbackIsPlaying,
  playbackCurrentTimeMs,
  onChangeScriptTextSize,
  onToggleSectionEditor,
  onChangeDraftTitle,
  onMergeWithPrevious,
  onCancelSectionEdit,
  onSaveSectionName,
  onChooseComparisonMode,
  onPlayTake,
  onChooseTake,
  onRemoveTake,
  onOpenCaptionReview,
  onGenerateCaptions,
  onSeek,
}: NarrationSidebarProps) {
  return (
    <aside className="narration-script-panel">
      <div className="narration-script-content">
        <div className="narration-section-title"><span>Current section</span><h2>{selectedSection?.title ?? 'No section selected'}</h2></div>
        {selectedResolved && !selectedResolved.valid && <div className="narration-section-warning" role="status">{selectedResolved.issue}</div>}
        <NarrationScript currentNotes={currentSlide?.notes} nextNotes={nextSlide?.notes} nextTitle={nextSlide?.title} textSize={scriptTextSize} onSizeChange={onChangeScriptTextSize} />
        {mode === 'setup' && selectedSection && <div className="narration-section-configuration">
          <button className="narration-edit-toggle" onClick={onToggleSectionEditor} aria-expanded={sectionEditorOpen}>{sectionEditorOpen ? 'Close section settings' : 'Edit section name'}</button>
          {sectionEditorOpen && <div className="narration-section-editor"><label><span>Section name</span><input value={draftTitle} onChange={(event) => onChangeDraftTitle(event.target.value)} /></label><div className="narration-editor-actions">{selectedSectionIndex > 0 && <button className="danger-button" onClick={onMergeWithPrevious}>Merge with previous</button>}<button onClick={onCancelSectionEdit}>Cancel</button><button className="primary-button" onClick={onSaveSectionName}>Save name</button></div></div>}
        </div>}
      </div>
      <section className="narration-takes" aria-label="Section takes">
        <div className="narration-panel-heading"><h2>Takes</h2><span>{selectedTakes.length} recorded</span></div>
        {presentation.voiceEnhance === 'standard' && selectedTakes.length > 0 && <div className="narration-preview-choice" role="group" aria-label="Take preview sound"><span>Preview:</span><button type="button" className={comparisonMode === 'enhanced' ? 'is-active' : ''} aria-pressed={comparisonMode === 'enhanced'} onClick={() => onChooseComparisonMode('enhanced')}>Enhanced</button><button type="button" className={comparisonMode === 'original' ? 'is-active' : ''} aria-pressed={comparisonMode === 'original'} onClick={() => onChooseComparisonMode('original')}>Original</button></div>}
        {!selectedSection && <p className="narration-empty">Add a slide to begin.</p>}
        {selectedSection && selectedTakes.length === 0 && <p className="narration-empty">Record this section to create its first take.</p>}
        <ol>{[...selectedTakes].reverse().map((take) => {
          const index = selectedTakes.findIndex((item) => item.id === take.id)
          const usable = selectedResolved ? takeIsUsable(take, selectedResolved) : false
          const coverageIssue = take.selected && usable && selectedResolved ? getTakeRevealCoverageIssue(take, selectedResolved, presentation) : null
          const isPlaying = playbackTakeId === take.id && playbackIsPlaying
          const previewKey = takePreviewKey(take)
          const previewState = previewStates[take.id]?.key === previewKey ? previewStates[take.id] : undefined
          const captionJobActive = captionJobTakeId === take.id
          const captionEditCount = take.captions ? countCaptionEdits(take.captions) : 0
          return <li key={take.id} ref={take.id === latestTakeId ? latestTakeRef : undefined} className={`narration-take${take.selected && usable ? ' is-selected' : ''}${take.id === latestTakeId ? ' is-new' : ''}`}>
            <div className="take-summary"><div><strong>Take {index + 1}</strong><small className={!usable ? 'is-invalid' : ''}>{!usable ? 'Re-record needed' : take.selected ? 'Selected for final video' : take.id === latestTakeId ? 'Just recorded' : 'Ready to use'}</small></div><time>{formatDuration(take.durationMs)}</time></div>
            <div className="take-actions">
              <button onClick={() => onPlayTake(take)} disabled={recorderBusy || Boolean(take.storageError) || take.blob.size === 0} aria-label={`${isPlaying ? 'Pause' : 'Play'} Take ${index + 1}`}>{isPlaying ? 'Pause' : <><PlayIcon /> Play</>}</button>
              {take.selected && usable ? <span className="take-selected"><CheckIcon /> Selected</span> : <button className="use-take" onClick={() => onChooseTake(take.id)} disabled={!usable || recorderBusy}>Use take</button>}
              <button className="delete-take" onClick={() => onRemoveTake(take)} disabled={recorderBusy || Boolean(captionJobTakeId)} aria-label={`Delete Take ${index + 1}`}>Delete</button>
            </div>
            <div className="take-captions">
              <div><strong>Captions</strong><small role={captionJobActive ? 'status' : undefined}>{captionJobActive ? 'Generating captions…' : take.captions ? `Generated · ${take.captions.segments.length} segment${take.captions.segments.length === 1 ? '' : 's'}${captionEditCount ? ` · ${captionEditCount} edited` : ''}` : 'Not generated'}</small></div>
              <div className="take-caption-actions">
                {take.captions && <button type="button" onClick={() => onOpenCaptionReview(take, index + 1)} disabled={recorderBusy || Boolean(captionJobTakeId)}>Review captions</button>}
                <button type="button" onClick={() => onGenerateCaptions(take)} disabled={!usable || recorderBusy || Boolean(captionJobTakeId)}>{take.captions ? 'Regenerate' : 'Generate captions'}</button>
              </div>
            </div>
            {captionErrors[take.id] && <small className="caption-error" role="alert">{captionErrors[take.id]}</small>}
            {playbackTakeId === take.id && <div className="narration-scrubber"><input type="range" min="0" max={Math.max(1, take.durationMs)} step="100" value={Math.min(playbackCurrentTimeMs, take.durationMs)} onChange={(event) => onSeek(Number(event.target.value) / 1000)} aria-label={`Seek Take ${index + 1}`} /><span>{formatDuration(playbackCurrentTimeMs)} / {formatDuration(take.durationMs)}</span></div>}
            {presentation.voiceEnhance === 'standard' && previewState?.status === 'preparing' && <small className="narration-processing-status" role="status">Preparing enhanced preview… {comparisonMode === 'enhanced' ? 'Play uses original audio for now.' : ''}</small>}
            {presentation.voiceEnhance === 'standard' && previewState?.warning && <small className="narration-processing-status" role="status">{previewState.warning}</small>}
            {take.storageError && <small className="narration-coverage-warning" role="alert">{take.storageError}</small>}
            {coverageIssue && <small className="narration-coverage-warning">{coverageIssue}</small>}
          </li>
        })}</ol>
      </section>
    </aside>
  )
}
