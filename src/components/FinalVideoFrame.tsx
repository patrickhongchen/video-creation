import type { ReactNode } from 'react'
import type { CaptionStyle } from '../model'
import { CaptionOverlay } from './CaptionOverlay'

interface FinalVideoFrameProps {
  children: ReactNode
  captionText: string | null
  captionStyle: CaptionStyle
  className?: string
}

/** Keeps subtitles above slide transitions and aligned with the video frame. */
export function FinalVideoFrame({ children, captionText, captionStyle, className = '' }: FinalVideoFrameProps) {
  return <div className={`final-video-frame ${className}`}>
    {children}
    <CaptionOverlay text={captionText} style={captionStyle} />
  </div>
}
