import { useEffect, useState } from 'react'
import { getSoundEnabled, playSound, setSoundEnabled } from '../lib/sound'

export function SoundToggle() {
  const [enabled, setEnabled] = useState(getSoundEnabled)

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest('button') : null
      if (target && !target.disabled && !target.hasAttribute('data-sound-toggle')) playSound('click')
    }
    document.addEventListener('click', handleClick, true)
    return () => document.removeEventListener('click', handleClick, true)
  }, [])

  const toggle = () => {
    setSoundEnabled(!enabled)
    setEnabled(!enabled)
    if (!enabled) playSound('click')
  }

  return <button type="button" className="sound-toggle" data-sound-toggle aria-pressed={enabled} aria-label={`효과음 ${enabled ? '끄기' : '켜기'}`} title={`효과음 ${enabled ? '켜짐' : '꺼짐'}`} onClick={toggle}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 5 6 9H3v6h3l5 4V5Z" />
      {enabled ? <><path d="M15 8a6 6 0 0 1 0 8" /><path d="M18 5a10 10 0 0 1 0 14" /></> : <><path d="m16 9 5 6" /><path d="m21 9-5 6" /></>}
    </svg>
  </button>
}
