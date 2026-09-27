import path from 'node:path'
import { app } from 'electron'
import { NARRATION_PROCESSING_VERSION } from './export/narrationAudioProcessing'
import { FinalPreviewAudioCache } from './finalPreviewAudioCache'

export const finalPreviewAudioCache = new FinalPreviewAudioCache(
  path.join(app.getPath('temp'), 'video-essay-studio', 'final-preview-audio'),
  NARRATION_PROCESSING_VERSION,
)
