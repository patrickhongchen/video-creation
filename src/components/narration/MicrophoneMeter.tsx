export function MicrophoneMeter({ level }: { level: number }) {
  return (
    <div className="microphone-meter" aria-label={`Microphone level ${Math.round(level * 100)} percent`}>
      <i style={{ transform: `scaleX(${Math.max(0.02, level)})` }} />
    </div>
  )
}
