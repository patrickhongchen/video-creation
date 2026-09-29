import type { CaptionStyle } from '../model'

interface CaptionOverlayProps {
  text: string | null
  style: CaptionStyle
}

export function CaptionOverlay({ text, style }: CaptionOverlayProps) {
  if (!text) return null
  return <div className={`caption-overlay caption-overlay--${style}`} aria-label="Caption"><span>{text}</span></div>
}
