import type { NarrationTake } from './narrationTypes'

const AUDIO_PROBE_TIMEOUT_MS = 8_000

export async function browserCanDecodeTake(take: NarrationTake) {
  if (!(take.blob instanceof Blob) || take.blob.size === 0) return false
  const audio = document.createElement('audio')
  const declaredType = take.blob.type || take.mimeType
  if (declaredType && audio.canPlayType(declaredType) === '') return false

  const url = URL.createObjectURL(take.blob)
  try {
    return await new Promise<boolean>((resolve) => {
      let settled = false
      const finish = (result: boolean) => {
        if (settled) return
        settled = true
        window.clearTimeout(timeout)
        audio.removeEventListener('loadedmetadata', loaded)
        audio.removeEventListener('canplay', loaded)
        audio.removeEventListener('error', failed)
        resolve(result)
      }
      const loaded = () => finish(audio.readyState >= HTMLMediaElement.HAVE_METADATA)
      const failed = () => finish(false)
      const timeout = window.setTimeout(() => finish(false), AUDIO_PROBE_TIMEOUT_MS)
      audio.preload = 'metadata'
      audio.addEventListener('loadedmetadata', loaded)
      audio.addEventListener('canplay', loaded)
      audio.addEventListener('error', failed)
      audio.src = url
      audio.load()
    })
  } finally {
    audio.pause()
    audio.removeAttribute('src')
    audio.load()
    URL.revokeObjectURL(url)
  }
}
