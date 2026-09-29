import type { PresentationImageMimeType } from './model'

const IMAGE_MIME_TYPES = new Set<PresentationImageMimeType>(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])

export function isSupportedImageMimeType(value: string): value is PresentationImageMimeType {
  return IMAGE_MIME_TYPES.has(value as PresentationImageMimeType)
}

export function imageMimeType(file: File): PresentationImageMimeType | null {
  const declared = file.type === 'image/jpg' ? 'image/jpeg' : file.type
  if (isSupportedImageMimeType(declared)) return declared
  const extension = file.name.split('.').pop()?.toLowerCase()
  if (extension === 'png') return 'image/png'
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg'
  if (extension === 'webp') return 'image/webp'
  if (extension === 'svg') return 'image/svg+xml'
  return null
}

export function readImageFile(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('The image could not be read.'))
    reader.onerror = () => reject(reader.error ?? new Error('The image could not be read.'))
    reader.readAsDataURL(file)
  })
}

function decodeImageRatio(source: string, onError: (reject: (reason?: unknown) => void, resolve: (value: number) => void) => void) {
  return new Promise<number>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image.naturalWidth > 0 && image.naturalHeight > 0 ? image.naturalWidth / image.naturalHeight : 1)
    image.onerror = () => onError(reject, resolve)
    image.src = source
  })
}

export function readImageRatio(source: string) {
  return decodeImageRatio(source, (reject) => reject(new Error('The imported image could not be decoded.')))
}

export function readImageRatioWithFallback(source: string) {
  return decodeImageRatio(source, (_reject, resolve) => resolve(1))
}
