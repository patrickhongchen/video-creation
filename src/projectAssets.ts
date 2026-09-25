import type { PresentationImageAsset } from './model'

const PROJECT_ASSET_PREFIX = 'assets/'

export function isSafeProjectAssetPath(value: string) {
  if (!value.startsWith(PROJECT_ASSET_PREFIX) || value.includes('\\') || value.includes('\0')) return false
  if (value.startsWith('/') || /^[a-z]:/i.test(value)) return false
  const parts = value.split('/')
  return parts.length >= 2 && parts.every((part) => part !== '' && part !== '.' && part !== '..')
}

export function validateProjectAssetPath(value: string, label = 'asset path') {
  if (!isSafeProjectAssetPath(value)) {
    throw new Error(`${label} must be a safe project-relative path under assets/.`)
  }
  return value
}

export function runtimeAssetSource(asset: PresentationImageAsset) {
  return asset.source ?? ''
}

export function canonicalizeProjectAssets(assets: PresentationImageAsset[] | undefined) {
  return assets?.map(({ source: _runtimeSource, ...asset }) => asset)
}
