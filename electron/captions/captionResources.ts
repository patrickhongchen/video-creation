import { app } from 'electron'
import { access } from 'node:fs/promises'
import path from 'node:path'

const DEVELOPMENT_WHISPER_BINARY = '/Users/patrickchen/GitHub/whisper.cpp/build/bin/whisper-cli'
const DEVELOPMENT_MEDIUM_EN_MODEL = '/Users/patrickchen/GitHub/whisper.cpp/models/ggml-medium.en.bin'

/** Packaged builds place the native executable in Contents/Resources/whisper/. */
export function resolveWhisperExecutable() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'whisper', 'whisper-cli')
    : DEVELOPMENT_WHISPER_BINARY
}

/** An installed app-data model overrides the bundled model. Neither is Project data. */
export async function resolveWhisperModel() {
  const applicationModel = applicationWhisperModelPath()
  try {
    await access(applicationModel)
    return applicationModel
  } catch {
    return app.isPackaged
      ? path.join(process.resourcesPath, 'whisper', 'ggml-medium.en.bin')
      : DEVELOPMENT_MEDIUM_EN_MODEL
  }
}

export function applicationWhisperModelPath() {
  return path.join(app.getPath('appData'), app.getName(), 'models', 'ggml-medium.en.bin')
}
