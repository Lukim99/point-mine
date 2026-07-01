import { useEffect, useMemo, useRef, useState } from 'react'
import { enchantDescription, findEnchantment, findPickaxe, toRoman, type EnchantId } from '../game'
import { PickaxeSprite } from './PickaxeSprite'

interface EnchantEffectProps {
  pickaxeId: string
  enchants: Partial<Record<EnchantId, number>>
  onClose: () => void
}

// 부여된 마법을 긍정 먼저 정렬해 정의와 함께 반환합니다.
const orderedEnchants = (enchants: Partial<Record<EnchantId, number>>) =>
  (Object.entries(enchants) as [EnchantId, number][])
    .map(([id, level]) => ({ id, level, def: findEnchantment(id) }))
    .filter((entry): entry is { id: EnchantId; level: number; def: NonNullable<typeof entry.def> } => Boolean(entry.def))
    .sort((a, b) => (a.def.sign === b.def.sign ? 0 : a.def.sign === 'positive' ? -1 : 1))

const CARD_STAGGER = 320
const CAST_DELAY = 1100

export function EnchantEffect({ pickaxeId, enchants, onClose }: EnchantEffectProps) {
  const [revealComplete, setRevealComplete] = useState(false)
  const stageRef = useRef<HTMLDivElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const pickaxe = findPickaxe(pickaxeId)
  const entries = useMemo(() => orderedEnchants(enchants), [enchants])

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    stageRef.current?.focus()
    const total = CAST_DELAY + entries.length * CARD_STAGGER + 400
    const timer = window.setTimeout(() => {
      setRevealComplete(true)
      window.requestAnimationFrame(() => confirmRef.current?.focus())
    }, total)
    return () => {
      window.clearTimeout(timer)
      previouslyFocused?.focus()
    }
  }, [entries.length])

  if (!pickaxe) return null

  return (
    <div className="enchant-overlay" role="dialog" aria-modal="true" aria-label="마법 부여 결과">
      <div className="enchant-rays" aria-hidden="true" />
      <div className="enchant-runes" aria-hidden="true" />
      <div className="enchant-flash" aria-hidden="true" />
      <div className="enchant-stage" aria-live="polite" tabIndex={-1} ref={stageRef}>
        <p className="enchant-kicker">마법 부여</p>
        <div className="enchant-pickaxe">
          <span className="enchant-ring enchant-ring--outer" aria-hidden="true" />
          <span className="enchant-ring enchant-ring--inner" aria-hidden="true" />
          <span className="enchant-sparkles" aria-hidden="true" />
          <PickaxeSprite pickaxeId={pickaxe.id} size="large" />
        </div>
        <h2 className="enchant-title">{pickaxe.name}</h2>
        <ul className="enchant-cards">
          {entries.map((entry, index) => (
            <li
              className={`enchant-card enchant-card--${entry.def.sign}`}
              key={entry.id}
              style={{ animationDelay: `${CAST_DELAY + index * CARD_STAGGER}ms` }}
            >
              <div className="enchant-card-head">
                <span className="enchant-card-dot" aria-hidden="true" />
                <strong>{entry.def.name}{entry.def.maxLevel > 1 ? ` ${toRoman(entry.level)}` : ''}</strong>
                <span className="enchant-card-sign">{entry.def.sign === 'positive' ? '축복' : '저주'}</span>
              </div>
              <small>{enchantDescription(entry.id, entry.level)}</small>
            </li>
          ))}
        </ul>
        <button className="reward-confirm enchant-confirm" type="button" onClick={onClose} disabled={!revealComplete} ref={confirmRef}>확인</button>
      </div>
    </div>
  )
}
