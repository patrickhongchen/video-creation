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

/** The model is user-managed application data, never a Project or Git asset. */
export async function resolveWhisperModel() {
  const applicationModel = applicationWhisperModelPath()
  if (app.isPackaged) return applicationModel
  try {
    await access(applicationModel)
    return applicationModel
  } catch {
    return DEVELOPMENT_MEDIUM_EN_MODEL
  }
}

export function applicationWhisperModelPath() {
  return path.join(app.getPath('appData'), app.getName(), 'models', 'ggml-medium.en.bin')
}
