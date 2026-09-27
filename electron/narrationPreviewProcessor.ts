import path from 'node:path'
import { app } from 'electron'
import { NARRATION_PROCESSING_VERSION } from './export/narrationAudioProcessing'
import { processNarrationTake } from './export/narrationTakeProcessor'
import { NarrationPreviewCache } from './narrationPreviewCache'

export const narrationPreviewCache = new NarrationPreviewCache(
  path.join(app.getPath('temp'), 'video-essay-studio', 'narration-preview'),
  NARRATION_PROCESSING_VERSION,
  processNarrationTake,
)
