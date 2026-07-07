import { useEffect, useRef, useState } from 'react'
import { findChest, findPickaxe, type BulkOpenChestResult } from '../game'
import { PickaxeSprite } from './PickaxeSprite'

interface BulkChestOpeningEffectProps {
  result: BulkOpenChestResult
  onClose: () => void
}

const CARD_STAGGER = 220
const BASE_DELAY = 700

export function BulkChestOpeningEffect({ result, onClose }: BulkChestOpeningEffectProps) {
  const [revealComplete, setRevealComplete] = useState(false)
  const stageRef = useRef<HTMLDivElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const chest = findChest(result.chest_id ?? '')
  const rewards = result.results ?? []

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    stageRef.current?.focus()
    const total = BASE_DELAY + rewards.length * CARD_STAGGER + 300
    const timer = window.setTimeout(() => {
      setRevealComplete(true)
      window.requestAnimationFrame(() => confirmRef.current?.focus())
    }, total)
    return () => {
      window.clearTimeout(timer)
      previouslyFocused?.focus()
    }
  }, [rewards.length])

  if (!chest) return null

  return (
    <div className="chest-opening-overlay bulk-opening-overlay" role="dialog" aria-modal="true" aria-label="상자 일괄 개봉 결과">
      <div className="opening-rays" aria-hidden="true" />
      <div className="bulk-opening-stage" aria-live="polite" tabIndex={-1} ref={stageRef}>
        <p className="opening-kicker">{chest.name} ×{result.count ?? rewards.length}</p>
        <div className={`bulk-reward-grid ${rewards.length > 5 ? 'bulk-reward-grid--large' : ''}`}>
          {rewards.map((reward, index) => {
            const pickaxe = findPickaxe(reward.pickaxe_id)
            return (
              <div className="bulk-reward-card" key={index} style={{ animationDelay: `${BASE_DELAY + index * CARD_STAGGER}ms` }}>
                <PickaxeSprite pickaxeId={reward.pickaxe_id} size="medium" />
                <strong>{pickaxe?.name ?? reward.pickaxe_name}</strong>
                <small>{reward.is_duplicate ? `내구도 +${reward.durability}` : '신규 획득!'}</small>
              </div>
            )
          })}
        </div>
        <button className="reward-confirm bulk-reward-confirm" type="button" onClick={onClose} disabled={!revealComplete} ref={confirmRef}>확인</button>
      </div>
    </div>
  )
}
