import { useEffect, useMemo, useRef, useState } from 'react'
import { findEnchantment, findPickaxe, toRoman, type EnchantId } from '../game'
import '../ArcaneWorkshop.css'
import { playSound } from '../lib/sound'
import { ArcaneGlyph, EnchantSeal } from './ArcaneParts'
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

// 시전 → 축복 공개 → (잠깐의 정적) → 저주 공개 순서의 시간표입니다.
const CAST_DURATION = 1250
const REVEAL_GAP = 560
const CURSE_PAUSE = 260
const CIRCLE_TICKS = Array.from({ length: 36 }, (_, index) => index)
const STAR_POINTS = ['60,18 102,60 60,102 18,60', '89.7,30.3 89.7,89.7 30.3,89.7 30.3,30.3']

const prefersReducedMotion = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

export function EnchantEffect({ pickaxeId, enchants, onClose }: EnchantEffectProps) {
  const pickaxe = findPickaxe(pickaxeId)
  const entries = useMemo(() => orderedEnchants(enchants), [enchants])
  const [reducedMotion] = useState(prefersReducedMotion)
  // 움직임 줄이기 설정이면 처음부터 모든 결과를 펼쳐 둡니다.
  const [revealed, setRevealed] = useState(() => (reducedMotion ? entries.length : 0))
  const complete = revealed >= entries.length
  const scrollRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLOListElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const timersRef = useRef<number[]>([])
  const primaryActionRef = useRef<() => void>(() => undefined)

  const clearTimers = () => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer))
    timersRef.current = []
  }

  // 장비에 마력을 불어넣는 시전음 뒤로 카드가 한 장씩 봉인을 풉니다.
  useEffect(() => {
    playSound('enchantCast')
    if (reducedMotion) {
      if (entries.length > 0) playSound('enchantReveal')
      return
    }
    let at = CAST_DURATION
    entries.forEach((entry, index) => {
      if (index > 0) at += REVEAL_GAP
      if (entry.def.sign === 'negative') at += CURSE_PAUSE
      timersRef.current.push(window.setTimeout(() => {
        setRevealed(index + 1)
        playSound('enchantReveal')
      }, at))
    })
    return clearTimers
  }, [entries, reducedMotion])

  // 확인 버튼에 처음부터 초점을 두고, 닫힐 때 원래 위치로 돌려줍니다.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    confirmRef.current?.focus({ preventScroll: true })
    return () => previouslyFocused?.focus()
  }, [])

  const skip = () => {
    clearTimers()
    if (revealed < entries.length) playSound('enchantReveal')
    setRevealed(entries.length)
  }
  const handlePrimary = () => (complete ? onClose() : skip())

  useEffect(() => {
    primaryActionRef.current = handlePrimary
  })

  // 아래에 깔린 곡괭이 상세 모달이 Esc로 함께 닫히지 않도록 먼저 가로챕니다.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        primaryActionRef.current()
      } else if (event.key === 'Tab') {
        event.preventDefault()
        confirmRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [])

  // 작은 화면에서는 새로 공개된 카드가 보이도록 스크롤을 따라 내립니다.
  useEffect(() => {
    if (revealed === 0) return
    const container = scrollRef.current
    const card = listRef.current?.children[Math.min(revealed, entries.length) - 1]
    if (!container || !(card instanceof HTMLElement)) return
    const bounds = container.getBoundingClientRect()
    const rect = card.getBoundingClientRect()
    if (rect.bottom > bounds.bottom - 12) container.scrollBy({ top: rect.bottom - bounds.bottom + 24, behavior: reducedMotion ? 'auto' : 'smooth' })
  }, [revealed, entries.length, reducedMotion])

  if (!pickaxe) return null

  const phase = complete ? 'is-complete' : revealed === 0 ? 'is-casting' : 'is-revealing'
  const announcement = complete
    ? `${pickaxe.name}에 마법이 깃들었습니다. ${entries.map((entry) => `${entry.def.sign === 'positive' ? '축복' : '저주'} ${entry.def.name}${entry.def.maxLevel > 1 ? ` ${entry.level}단계` : ''}`).join(', ')}`
    : ''

  return (
    <div className={`aw-enchant ${phase} ${reducedMotion ? 'is-still' : ''}`} role="dialog" aria-modal="true" aria-labelledby="aw-enchant-title">
      <div className="aw-enchant-sky" aria-hidden="true" />
      <div className="aw-enchant-scroll" ref={scrollRef}>
        <div className="aw-enchant-stage">
          <p className="aw-enchant-kicker"><ArcaneGlyph name="sigil" />마법 부여</p>

          <div className="aw-altar">
            <svg className="aw-altar-circle" viewBox="0 0 120 120" aria-hidden="true">
              <circle className="aw-circle-halo" cx="60" cy="60" r="58" />
              <circle className="aw-circle-outer" cx="60" cy="60" r="56" pathLength={1} />
              <g className="aw-circle-ticks">
                {CIRCLE_TICKS.map((tick) => (
                  <line key={tick} x1="60" y1={tick % 3 === 0 ? 6.5 : 8.5} x2="60" y2="11" transform={`rotate(${tick * 10} 60 60)`} />
                ))}
              </g>
              <circle className="aw-circle-mid" cx="60" cy="60" r="46" pathLength={1} />
              <g className="aw-circle-star">
                {STAR_POINTS.map((points) => <polygon key={points} points={points} pathLength={1} />)}
              </g>
              <circle className="aw-circle-inner" cx="60" cy="60" r="30" pathLength={1} />
              <g className="aw-circle-nodes">
                {[0, 90, 180, 270].map((angle) => <rect key={angle} x="57.5" y="1.5" width="5" height="5" transform={`rotate(${angle} 60 60) rotate(45 60 4)`} />)}
              </g>
            </svg>
            <span className="aw-altar-beam" aria-hidden="true" />
            <span className="aw-altar-flash" aria-hidden="true" />
            <span className="aw-altar-motes" aria-hidden="true">{CIRCLE_TICKS.slice(0, 12).map((mote) => <i key={mote} />)}</span>
            <span className="aw-altar-pickaxe">
              <PickaxeSprite pickaxeId={pickaxe.id} size="large" enchanted />
            </span>
          </div>

          <h2 className="aw-enchant-title" id="aw-enchant-title">{pickaxe.name}</h2>
          <p className="aw-enchant-status" aria-hidden="true">
            {complete ? '마법이 깃들었습니다' : revealed === 0 ? '마력을 불어넣는 중' : `봉인 해제 ${revealed} / ${entries.length}`}
          </p>

          {entries.length > 0 ? (
            <ol className="aw-enchant-cards" ref={listRef}>
              {entries.map((entry, index) => {
                const open = index < revealed
                return (
                  <li className={`aw-sigil-card is-${entry.def.sign} ${open ? 'is-revealed' : 'is-sealed'}`} key={entry.id} aria-hidden={!open}>
                    <EnchantSeal id={entry.id} level={entry.level} />
                    {!open && (
                      <span className="aw-sigil-veil">
                        <ArcaneGlyph name="sigil" />
                        <small>봉인 {toRoman(index + 1)}</small>
                      </span>
                    )}
                  </li>
                )
              })}
            </ol>
          ) : (
            <p className="aw-empty aw-empty--astral">이번에는 마법이 깃들지 않았습니다.</p>
          )}
        </div>
      </div>
      <p className="aw-sr-only" aria-live="polite">{announcement}</p>
      <div className="aw-enchant-footer">
        <button className={`aw-enchant-confirm ${complete ? 'is-ready' : ''}`} type="button" onClick={handlePrimary} ref={confirmRef}>
          {complete ? '확인' : '모두 보기'}
        </button>
      </div>
    </div>
  )
}
