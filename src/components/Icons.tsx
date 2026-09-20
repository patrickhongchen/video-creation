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
