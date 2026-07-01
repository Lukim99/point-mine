import { useEffect, useRef, useState } from 'react'
import { findChest, findPickaxe, type OpenChestResult } from '../game'
import { ChestSprite } from './ChestSprite'
import { PickaxeSprite } from './PickaxeSprite'

interface ChestOpeningEffectProps {
  result: OpenChestResult
  onClose: () => void
}

export function ChestOpeningEffect({ result, onClose }: ChestOpeningEffectProps) {
  const [revealComplete, setRevealComplete] = useState(false)
  const stageRef = useRef<HTMLDivElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const chest = findChest(result.chest_id ?? '')
  const pickaxe = findPickaxe(result.pickaxe_id ?? '')

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    stageRef.current?.focus()
    const timer = window.setTimeout(() => {
      setRevealComplete(true)
      window.requestAnimationFrame(() => confirmRef.current?.focus())
    }, 2300)

    return () => {
      window.clearTimeout(timer)
      previouslyFocused?.focus()
    }
  }, [])

  if (!chest || !pickaxe) return null

  return (
    <div className="chest-opening-overlay" role="dialog" aria-modal="true" aria-label="상자 개봉 결과">
      <div className="opening-rays" aria-hidden="true" />
      <div className="opening-flash" aria-hidden="true" />
      <div className="opening-stage" aria-live="polite" tabIndex={-1} ref={stageRef}>
        <p className="opening-kicker">{chest.name}</p>
        <ChestSprite spriteIndex={chest.spriteIndex} size="opening" className="opening-chest opening-chest--closed" />
        <ChestSprite spriteIndex={chest.spriteIndex} open size="opening" className="opening-chest opening-chest--open" />
        <div className="reward-pickaxe">
          <PickaxeSprite pickaxeId={pickaxe.id} size="large" />
        </div>
        <div className="reward-copy">
          <span>{result.is_duplicate ? '내구도 합산!' : '새로운 장비 획득!'}</span>
          <h2>{pickaxe.name}</h2>
          <p>기본 내구도 +{pickaxe.durability}</p>
        </div>
        <button className="reward-confirm" type="button" onClick={onClose} disabled={!revealComplete} ref={confirmRef}>확인</button>
      </div>
    </div>
  )
}
