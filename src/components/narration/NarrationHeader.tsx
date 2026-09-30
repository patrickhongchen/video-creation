import type { NarrationRecorderStatus } from '../../narration/narrationTypes'
import type { VoiceEnhanceMode } from '../../model'
import { CloseIcon } from '../Icons'
import { MicrophoneMeter } from './MicrophoneMeter'

interface NarrationHeaderProps {
  readyCount: number
  sectionCount: number
  slideCount: number
  recorderBusy: boolean
  recorderStatus: NarrationRecorderStatus
  microphoneLevel: number
  microphoneName: string
  audioOpen: boolean
  audioInputs: MediaDeviceInfo[]
  selectedDeviceId: string
  voiceEnhance: VoiceEnhanceMode
  onOpenPreview: () => void
  onToggleAudio: () => void
  onChangeMicrophone: (deviceId: string) => void
  onChangeVoiceEnhance: (mode: VoiceEnhanceMode) => void
  onExit: () => void
}

export function NarrationHeader({
  readyCount,
  sectionCount,
  slideCount,
  recorderBusy,
  recorderStatus,
  microphoneLevel,
  microphoneName,
  audioOpen,
  audioInputs,
  selectedDeviceId,
  voiceEnhance,
  onOpenPreview,
  onToggleAudio,
  onChangeMicrophone,
  onChangeVoiceEnhance,
  onExit,
}: NarrationHeaderProps) {
  return (
    <header className="narration-header">
      <div><h1>Narration Studio</h1></div>
      <div className="narration-header-settings">
        <div className="narration-readiness"><strong>{readyCount} of {sectionCount}</strong> sections ready</div>
        <button className="narration-preview-button" onClick={onOpenPreview} disabled={recorderBusy || slideCount === 0}>Preview &amp; export</button>
        <div className="narration-audio-anchor">
          <button className="narration-audio-button" aria-expanded={audioOpen} onClick={onToggleAudio} disabled={recorderBusy}>Audio ⚙</button>
          {audioOpen && <div className="narration-audio-popover">
            <strong>Microphone</strong>
            <select aria-label="Microphone" value={selectedDeviceId} onChange={(event) => onChangeMicrophone(event.target.value)} disabled={recorderStatus === 'requesting'}>
              <option value="">System default</option>
              {audioInputs.filter((device) => device.deviceId).map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Microphone ${index + 1}`}</option>)}
            </select>
            <small>{microphoneName}{recorderStatus === 'requesting' ? ' · Requesting access…' : ''}</small>
            <label>Microphone level <MicrophoneMeter level={microphoneLevel} /></label>
            <label>Voice Enhance <select value={voiceEnhance} onChange={(event) => onChangeVoiceEnhance(event.target.value as VoiceEnhanceMode)}><option value="off">Off</option><option value="standard">Standard</option></select></label>
            <small>Standard cleans up take previews and export. Final export loudness is balanced automatically.</small>
          </div>}
        </div>
      </div>
      <button className="narration-exit" onClick={onExit} disabled={recorderBusy}><CloseIcon /> Exit</button>
    </header>
  )
}
