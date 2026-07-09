import { useEffect, useRef, useState } from 'react'
import { abilityStoneOptionText, abilityStoneTitle, findPickaxe, type AbilityStoneInventoryItem } from '../game'
import { AbilityStoneSprite } from './AbilityStoneSprite'
import { PickaxeSprite } from './PickaxeSprite'

interface AbilityStoneEngraveEffectProps {
  pickaxeId: string
  stone: AbilityStoneInventoryItem
  onClose: () => void
}

const PARTICLES = Array.from({ length: 18 }, (_, index) => index)

export function AbilityStoneEngraveEffect({ pickaxeId, stone, onClose }: AbilityStoneEngraveEffectProps) {
  const [revealComplete, setRevealComplete] = useState(false)
  const stageRef = useRef<HTMLDivElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const pickaxe = findPickaxe(pickaxeId)

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    stageRef.current?.focus()
    const timer = window.setTimeout(() => {
      setRevealComplete(true)
      window.requestAnimationFrame(() => confirmRef.current?.focus())
    }, 2600)
    return () => {
      window.clearTimeout(timer)
      previouslyFocused?.focus()
    }
  }, [])

  if (!pickaxe) return null

  return (
    <div className="stone-engrave-overlay" role="dialog" aria-modal="true" aria-label="어빌리티 스톤 각인 결과">
      <div className="stone-engrave-aurora" aria-hidden="true" />
      <div className="stone-engrave-grid" aria-hidden="true" />
      <div className="stone-engrave-particles" aria-hidden="true">
        {PARTICLES.map((index) => <i key={index} />)}
      </div>
      <div className="stone-engrave-stage" aria-live="polite" tabIndex={-1} ref={stageRef}>
        <p className="stone-engrave-kicker">어빌리티 스톤 각인</p>
        <div className="stone-engrave-composition">
          <div className="stone-engrave-pickaxe">
            <PickaxeSprite pickaxeId={pickaxe.id} size="large" className="stone-engrave-pickaxe-sprite" />
          </div>
          <div className="stone-engrave-link" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div className="stone-engrave-stone">
            <AbilityStoneSprite variant={stone.variant} size="large" />
          </div>
        </div>
        <h2>{pickaxe.name}</h2>
        <strong className="stone-engrave-title">{abilityStoneTitle(stone)}</strong>
        <ul className="stone-engrave-options">
          {stone.options.map((option) => (
            <li className={`is-${option.sign}`} key={option.id}>{abilityStoneOptionText(option)}</li>
          ))}
        </ul>
        <button className="stone-engrave-confirm" type="button" onClick={onClose} disabled={!revealComplete} ref={confirmRef}>확인</button>
      </div>
    </div>
  )
}
