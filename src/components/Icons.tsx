import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

const base = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }

export const PlayIcon = (props: IconProps) => <svg {...base} {...props}><path d="m8 5 11 7-11 7Z" fill="currentColor" stroke="none" /></svg>
export const ArrowLeftIcon = (props: IconProps) => <svg {...base} {...props}><path d="m15 18-6-6 6-6" /><path d="M9 12h10" /></svg>
export const ArrowRightIcon = (props: IconProps) => <svg {...base} {...props}><path d="m9 18 6-6-6-6" /><path d="M5 12h10" /></svg>
export const ChevronLeftIcon = (props: IconProps) => <svg {...base} {...props}><path d="m14.5 18-6-6 6-6" /></svg>
export const ChevronRightIcon = (props: IconProps) => <svg {...base} {...props}><path d="m9.5 18 6-6-6-6" /></svg>
export const UndoIcon = (props: IconProps) => <svg {...base} {...props}><path d="m9 7-5 5 5 5" /><path d="M4 12h9a7 7 0 0 1 7 7" /></svg>
export const CheckIcon = (props: IconProps) => <svg {...base} {...props}><circle cx="12" cy="12" r="9" /><path d="m8.5 12 2.25 2.25 4.75-5" /></svg>
export const CloseIcon = (props: IconProps) => <svg {...base} {...props}><path d="m7 7 10 10M17 7 7 17" /></svg>
export const DragHandleIcon = (props: IconProps) => <svg {...base} {...props}><circle cx="9" cy="7" r="1" fill="currentColor" stroke="none" /><circle cx="15" cy="7" r="1" fill="currentColor" stroke="none" /><circle cx="9" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="15" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="9" cy="17" r="1" fill="currentColor" stroke="none" /><circle cx="15" cy="17" r="1" fill="currentColor" stroke="none" /></svg>
export const VisibleIcon = (props: IconProps) => <svg {...base} {...props}><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" /></svg>
export const HiddenIcon = (props: IconProps) => <svg {...base} {...props}><path d="m3 3 18 18" /><path d="M10.6 6.1A10.5 10.5 0 0 1 12 6c6 0 9.5 6 9.5 6a16 16 0 0 1-2.2 2.8M6.2 6.2C3.8 7.8 2.5 12 2.5 12s3.5 6 9.5 6c1.6 0 3-.4 4.2-1" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></svg>
export const LockedIcon = (props: IconProps) => <svg {...base} {...props}><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
export const UnlockedIcon = (props: IconProps) => <svg {...base} {...props}><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M16 10V7a4 4 0 0 0-7.6-1.7" /></svg>
export const DuplicateIcon = (props: IconProps) => <svg {...base} {...props}><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></svg>
export const DeleteIcon = (props: IconProps) => <svg {...base} {...props}><path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5" /></svg>
