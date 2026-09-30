import type { PointerEventHandler, RefObject } from 'react'
import type { NarrationSection, Presentation, Slide } from '../../model'
import type { RevealVisualState } from '../../entranceAnimation'
import type { NarrationPointerDisplayState } from '../../narration/resolveNarrationPointer'
import type { NarrationRecorderStatus } from '../../narration/narrationTypes'
import { ArrowLeftIcon, ArrowRightIcon } from '../Icons'
import { SlideViewport } from '../SlideViewport'
import { Stage } from '../Stage'
import { formatTimer } from '../narrationTime'
import { MicrophoneMeter } from './MicrophoneMeter'

interface NarrationStagePanelProps {
  presentation: Presentation
  currentSlide: Slide | undefined
  currentSlideIndex: number
  selectedSection: NarrationSection | null
  selectedSectionSlideCount: number
  selectedSectionValid: boolean
  activeSectionSlideIndex: number
  direction: 1 | -1
  renderInstanceKey: string
  revealState: RevealVisualState | null
  pointerState: NarrationPointerDisplayState | null
  stageRef: RefObject<HTMLDivElement | null>
  mode: 'setup' | 'recording'
  recorderStatus: NarrationRecorderStatus
  recorderBusy: boolean
  recorderCountdown: number | null
  recorderElapsedMs: number
  microphoneName: string
  microphoneLevel: number
  recordingProgress: string
  advanceHint: boolean
  pointerMode: boolean
  hasUpcomingReveal: boolean
  onAdvanceRecording: (offset: -1 | 1) => void
  onTogglePointer: () => void
  onFinishTake: () => void
  onCancelTake: () => void
  onBeginTake: () => void
  onPointerMove: PointerEventHandler<HTMLDivElement>
  onPointerLeave: () => void
}

export function NarrationStagePanel({
  presentation,
  currentSlide,
  currentSlideIndex,
  selectedSection,
  selectedSectionSlideCount,
  selectedSectionValid,
  activeSectionSlideIndex,
  direction,
  renderInstanceKey,
  revealState,
  pointerState,
  stageRef,
  mode,
  recorderStatus,
  recorderBusy,
  recorderCountdown,
  recorderElapsedMs,
  microphoneName,
  microphoneLevel,
  recordingProgress,
  advanceHint,
  pointerMode,
  hasUpcomingReveal,
  onAdvanceRecording,
  onTogglePointer,
  onFinishTake,
  onCancelTake,
  onBeginTake,
  onPointerMove,
  onPointerLeave,
}: NarrationStagePanelProps) {
  return (
    <section className="narration-stage-panel">
      {currentSlide ? <SlideViewport contentClassName="narration-stage-hit-area" onContentClick={recorderStatus === 'recording' ? () => onAdvanceRecording(1) : undefined}>
        <Stage ref={stageRef} slide={currentSlide} slides={presentation.slides} theme={presentation.theme} imageAssets={presentation.imageAssets} presentationId={presentation.id} slideNumber={currentSlideIndex + 1} slideCount={presentation.slides.length} direction={direction} renderInstanceKey={renderInstanceKey} revealState={revealState} pointerState={pointerState} onPointerMove={onPointerMove} onPointerLeave={onPointerLeave} className={`narration-stage${recorderStatus === 'recording' && pointerMode ? ' pointer-enabled' : ''}`} />
      </SlideViewport> : <div className="narration-empty-stage">Add a slide before recording narration.</div>}
      <div className="narration-progress">{selectedSection && <span>{mode === 'recording' ? recordingProgress : `Slide ${Math.min(activeSectionSlideIndex + 1, selectedSectionSlideCount)} of ${selectedSectionSlideCount} in section`}</span>}{mode !== 'recording' && currentSlideIndex >= 0 && <span>Presentation slide {currentSlideIndex + 1} of {presentation.slides.length}</span>}{advanceHint && recorderStatus === 'recording' && <span className="narration-advance-hint">Click the slide or press Space to advance</span>}</div>
      <div className="narration-stage-toolbar">
        <div className="narration-toolbar-context"><strong>{selectedSection?.title ?? 'Preparing sections…'}</strong><span>{recorderStatus === 'recording' ? `● Recording ${formatTimer(recorderElapsedMs)}` : recorderStatus === 'countdown' ? `Recording in ${recorderCountdown}` : recorderStatus === 'requesting' ? 'Preparing microphone…' : recorderStatus === 'stopping' ? 'Saving take…' : microphoneName}</span></div>
        <div className="narration-toolbar-actions">
          {recorderStatus === 'recording' ? <>
            <button type="button" className="pointer-toggle" aria-pressed={pointerMode} onClick={onTogglePointer} title="Toggle laser pointer (P)">Pointer <kbd>P</kbd></button>
            <button onClick={() => onAdvanceRecording(-1)} disabled={activeSectionSlideIndex <= 0}><ArrowLeftIcon /> Previous</button>
            <button onClick={() => onAdvanceRecording(1)} disabled={!selectedSection || (!hasUpcomingReveal && activeSectionSlideIndex >= selectedSectionSlideCount - 1)}>{hasUpcomingReveal ? 'Next reveal' : 'Next slide'} <ArrowRightIcon /></button>
            <button className="stop-recording" onClick={onFinishTake}>Finish take</button>
            <button className="discard-recording" onClick={onCancelTake}>Discard recording</button>
          </> : recorderBusy ? <>
            <span className="narration-record-status">{recorderStatus === 'countdown' ? recorderCountdown : recorderStatus === 'stopping' ? 'Saving take…' : 'Preparing microphone…'}</span>
            {recorderStatus !== 'stopping' && <button className="discard-recording" onClick={onCancelTake}>Cancel</button>}
          </> : <button className="record-button" onClick={onBeginTake} disabled={!selectedSectionValid}>● Record section</button>}
        </div>
        <div className="narration-toolbar-meter"><span>Microphone</span><MicrophoneMeter level={microphoneLevel} /></div>
      </div>
    </section>
  )
}
