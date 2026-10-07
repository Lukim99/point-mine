import { useId, useRef, useState } from 'react'
import {
  ABILITY_STONE_FACET_ATTEMPTS,
  ABILITY_STONE_FACET_MAX_CHANCE,
  ABILITY_STONE_FACET_MIN_CHANCE,
  ABILITY_STONE_FACET_TIER_THRESHOLDS,
  abilityStoneFacetProgress,
  abilityStoneOptionFacets,
  abilityStoneOptionSuccesses,
  abilityStoneTitle,
  findAbilityStoneOption,
  findPickaxe,
  isAbilityStoneFaceted,
  type AbilityStoneInventoryItem,
  type AbilityStoneSign,
  type FacetAbilityStoneResult,
  type PickaxeInventoryItem,
} from '../game'
import type { ForgeSnapshot, ForgeTone } from '../lib/stoneForgeScene'
import { playSound } from '../lib/sound'
import { ArcaneGlyph } from './ArcaneParts'
import { Modal } from './Modal'
import { StoneForgeStage } from './StoneForgeStage'
import '../StoneForge.css'

interface AbilityStoneDetailModalProps {
  stone: AbilityStoneInventoryItem
  attachedPickaxe?: PickaxeInventoryItem | null
  engraveTargetPickaxe?: PickaxeInventoryItem | null
  actionBusy: boolean
  onFacet: (stoneUid: string, optionIndex: number) => Promise<FacetAbilityStoneResult | null>
  onOpenEngraveList?: () => void
  onDismantle: (stoneUid: string) => void
  onClose: () => void
}

// 방금 끝난 세공 한 번의 결과입니다. 장면·줄·확률판이 이 값으로 함께 반응합니다.
interface FacetImpact {
  id: number
  line: number
  slot: number
  success: boolean
  sign: AbilityStoneSign
  successes: number
  chanceBefore: number
  chanceAfter: number
  tierReached: number | null
  tierValue: string | null
  completed: boolean
  tone: ForgeTone
  tier: boolean
}

const ROMAN = ['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ']
const formatValue = (value: number, unit: string) => `${value > 0 ? '+' : ''}${Number.isInteger(value) ? value : value.toLocaleString('ko-KR')}${unit}`
const isThreshold = (position: number) => ABILITY_STONE_FACET_TIER_THRESHOLDS.some((threshold) => threshold === position)
const toneOf = (sign: AbilityStoneSign, success: boolean): ForgeTone => sign === 'negative' ? (success ? 'bane' : 'relief') : (success ? 'boon' : 'ash')

// 이로운 줄의 성공/실패, 불리한 줄의 성공/회피를 색과 함께 서로 다른 말로 알립니다.
const VERDICT_TITLE: Record<ForgeTone, string> = { boon: '성공', ash: '실패', bane: '불리 성공', relief: '회피' }
const verdictNote = (impact: FacetImpact) => {
  if (impact.tone === 'boon') return impact.tierReached ? `${impact.tierReached}회 달성 · ${impact.tierValue}` : `${impact.successes}번째 성공`
  if (impact.tone === 'ash') return '균열이 남았습니다'
  if (impact.tone === 'bane') return impact.tierReached ? `불리 효과 ${impact.tierValue} 발동` : '불리한 효과가 쌓였습니다'
  return '불리한 효과를 피했습니다'
}

const chanceBand = (chance: number) => chance >= 65 ? 'is-high' : chance <= 35 ? 'is-low' : 'is-mid'

// 망치 아이콘
function HammerGlyph() {
  return (
    <svg className="sf-hammer-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path className="is-fill" d="M11.4 4.7 14.2 1.9 20.6 8.3 17.8 11.1Z" />
      <path d="M14.6 7.9 4.4 18.1" />
    </svg>
  )
}

export function AbilityStoneDetailModal({ stone, attachedPickaxe, engraveTargetPickaxe, actionBusy, onFacet, onOpenEngraveList, onDismantle, onClose }: AbilityStoneDetailModalProps) {
  const lineId = useId()
  const [impact, setImpact] = useState<FacetImpact | null>(null)
  const [pendingLine, setPendingLine] = useState<number | null>(null)
  const [aimLine, setAimLine] = useState<number | null>(null)
  const [tapEvent, setTapEvent] = useState<{ id: number; line: number } | null>(null)
  // 응답이 오기 전 연타로 같은 요청이 겹치지 않도록 막습니다.
  const pendingRef = useRef(false)
  // 같은 줄에서 연속으로 같은 판정이 나와도 연출이 다시 시작되도록 결과마다 번호를 매깁니다.
  const impactSeqRef = useRef(0)
  const tapSeqRef = useRef(0)
  const faceted = isAbilityStoneFaceted(stone)
  const progress = abilityStoneFacetProgress(stone)
  const totalAttempts = stone.options.length * ABILITY_STONE_FACET_ATTEMPTS
  const chance = Math.max(ABILITY_STONE_FACET_MIN_CHANCE, Math.min(ABILITY_STONE_FACET_MAX_CHANCE, Number(stone.facetChance ?? ABILITY_STONE_FACET_MAX_CHANCE)))
  const variant = Math.abs(Math.floor(stone.variant ?? 0)) % 4
  const chanceShift = impact ? impact.chanceAfter - impact.chanceBefore : 0

  const lines = stone.options.map((option, index) => {
    const facets = abilityStoneOptionFacets(option)
    const successes = abilityStoneOptionSuccesses(option)
    const definition = findAbilityStoneOption(option.id)
    const attempts = facets.length
    return {
      option,
      index,
      definition,
      successes,
      failures: Math.max(0, attempts - facets.filter(Boolean).length),
      remaining: Math.max(0, ABILITY_STONE_FACET_ATTEMPTS - attempts),
      done: attempts >= ABILITY_STONE_FACET_ATTEMPTS,
      negative: option.sign === 'negative',
      name: definition?.name ?? option.name ?? option.id,
      unit: definition?.unit ?? option.unit ?? '',
    }
  })

  const snapshot: ForgeSnapshot = {
    lines: lines.map((line) => ({ sign: line.option.sign, successes: line.successes, failures: line.failures })),
    chance,
    progress: faceted ? 1 : progress / Math.max(1, totalAttempts),
    faceted,
    aim: aimLine,
    pending: pendingLine,
  }

  const facet = async (optionIndex: number) => {
    const option = stone.options[optionIndex]
    if (!option || pendingRef.current || actionBusy) return
    const facetsBefore = abilityStoneOptionFacets(option)
    pendingRef.current = true
    setPendingLine(optionIndex)
    tapSeqRef.current += 1
    setTapEvent({ id: tapSeqRef.current, line: optionIndex })
    playSound('facetHit')
    try {
      const result = await onFacet(stone.uid, optionIndex)
      if (result?.status === 'success') {
        playSound(result.success ? 'facetSuccess' : 'facetFailure')
        const success = result.success === true
        const successes = Number(result.successes ?? facetsBefore.filter(Boolean).length + (success ? 1 : 0))
        const tierIndex = success ? ABILITY_STONE_FACET_TIER_THRESHOLDS.findIndex((threshold) => threshold === successes) : -1
        const definition = findAbilityStoneOption(option.id)
        impactSeqRef.current += 1
        setImpact({
          id: impactSeqRef.current,
          line: optionIndex,
          slot: facetsBefore.length,
          success,
          sign: option.sign,
          successes,
          chanceBefore: Number(result.chance_before ?? chance),
          chanceAfter: Number(result.chance ?? chance),
          tierReached: tierIndex >= 0 ? ABILITY_STONE_FACET_TIER_THRESHOLDS[tierIndex] : null,
          tierValue: tierIndex >= 0 && definition ? formatValue(Number(definition.values[tierIndex] ?? 0), definition.unit) : null,
          completed: result.completed === true,
          tone: toneOf(option.sign, success),
          tier: tierIndex >= 0,
        })
      }
    } finally {
      pendingRef.current = false
      setPendingLine(null)
    }
  }

  const dismantle = () => {
    onDismantle(stone.uid)
    onClose()
  }

  const impactLine = impact ? lines[impact.line] : null
  const announcement = impact && impactLine
    ? `${impactLine.name} 세공 ${VERDICT_TITLE[impact.tone]}. ${verdictNote(impact)}. 성공 확률 ${impact.chanceBefore}%에서 ${impact.chanceAfter}%로 바뀌었습니다.${impact.completed ? ' 모든 세공을 마쳤습니다.' : ''}`
    : ''

  return (
    <Modal title={abilityStoneTitle(stone)} onClose={onClose} labelledBy="ability-stone-detail-title" className="sf-modal sf-forge-modal">
      <div className={`sf-forge aw-variant-${variant} ${faceted ? 'is-complete' : ''}`}>
        <div className="sf-stage-wrap">
          <StoneForgeStage variant={variant} snapshot={snapshot} tap={tapEvent} strike={impact}>
            <div className="sf-hud">
              <div className={`sf-plaque sf-plaque--chance ${chanceBand(chance)}`}>
                <span className="sf-plaque-label">성공 확률</span>
                <span className="sf-chance-row">
                  <strong className="sf-chance">{chance}<small>%</small></strong>
                  {impact && chanceShift !== 0 && (
                    <span className={`sf-delta ${chanceShift > 0 ? 'is-up' : 'is-down'}`} key={`delta-${impact.id}`}>
                      {chanceShift > 0 ? '▲' : '▼'}{Math.abs(chanceShift)}%p
                    </span>
                  )}
                </span>
                <span className="sf-plaque-rule">성공 −10%p · 실패 +10%p · {ABILITY_STONE_FACET_MIN_CHANCE}~{ABILITY_STONE_FACET_MAX_CHANCE}%</span>
              </div>
              <div className="sf-plaque sf-plaque--progress">
                {faceted
                  ? <span className="sf-done-chip"><ArcaneGlyph name="spark" />세공 완료</span>
                  : <><span className="sf-plaque-label">세공</span><strong className="sf-progress"><b>{progress}</b>/{totalAttempts}</strong></>}
                {attachedPickaxe && <span className="sf-host"><ArcaneGlyph name="gem" />{findPickaxe(attachedPickaxe.id)?.name ?? attachedPickaxe.id}에 각인 중</span>}
              </div>
              {impact && impactLine && (
                <div className={`sf-verdict is-${impact.tone} ${impact.tier ? 'is-tier' : ''}`} key={`verdict-${impact.id}`} aria-hidden="true">
                  <span className="sf-verdict-line">{ROMAN[impact.line] ?? impact.line + 1} {impactLine.name}</span>
                  <strong>{VERDICT_TITLE[impact.tone]}</strong>
                  <span className="sf-verdict-note">{verdictNote(impact)}</span>
                  <span className="sf-verdict-chance">확률 {impact.chanceBefore}% → {impact.chanceAfter}%</span>
                </div>
              )}
              {impact?.completed && (
                <p className="sf-complete" key={`complete-${impact.id}`} aria-hidden="true"><ArcaneGlyph name="spark" />세공 완료<ArcaneGlyph name="spark" /></p>
              )}
            </div>
          </StoneForgeStage>
        </div>

        <p className="aw-sr-only" aria-live="polite">{announcement}</p>

        <div className="sf-console" onPointerLeave={() => setAimLine(null)}>
          {lines.map((line) => {
            const { option, index, definition, successes, failures, remaining, done, negative, name, unit } = line
            const active = Number(option.tier ?? 0) > 0
            const lineImpact = impact?.line === index ? impact : null
            const pending = pendingLine === index
            const titleId = `${lineId}-line-${index}`
            const freshGem = lineImpact?.success ? lineImpact.successes : null
            const freshCrack = lineImpact && !lineImpact.success ? ABILITY_STONE_FACET_ATTEMPTS + 1 - (lineImpact.slot + 1 - lineImpact.successes) : null
            const reachedTiers = ABILITY_STONE_FACET_TIER_THRESHOLDS.filter((threshold) => successes >= threshold).length

            return (
              <section
                className={`sf-line ${negative ? 'is-negative' : 'is-positive'} ${done ? 'is-done' : ''} ${pending ? 'is-pending' : ''} ${aimLine === index ? 'is-aimed' : ''} ${lineImpact ? `is-hit-${lineImpact.tone} is-beat-${lineImpact.id % 2}` : ''}`}
                key={`${option.id}-${index}`}
                aria-labelledby={titleId}
              >
                <header className="sf-line-head">
                  <span className="sf-medal" aria-hidden="true">{ROMAN[index] ?? index + 1}</span>
                  <span className="sf-line-sign">
                    <ArcaneGlyph name={negative ? 'warn' : 'spark'} />
                    {negative ? '불리한 효과' : '이로운 효과'}
                  </span>
                  <strong id={titleId}>{name}</strong>
                  <span className={`sf-line-value ${active ? 'is-active' : ''}`}>
                    {active ? formatValue(Number(option.value ?? option.effectValue ?? 0), unit) : '미활성'}
                  </span>
                </header>

                <span
                  className="sf-rail"
                  role="img"
                  aria-label={`${ABILITY_STONE_FACET_ATTEMPTS}번 중 성공 ${successes}번, 실패 ${failures}번, 남은 시도 ${remaining}번`}
                >
                  {Array.from({ length: ABILITY_STONE_FACET_ATTEMPTS }, (_, slot) => {
                    const position = slot + 1
                    const gem = position <= successes
                    const crack = !gem && position > ABILITY_STONE_FACET_ATTEMPTS - failures
                    const fresh = (gem && position === freshGem) || (crack && position === freshCrack)
                    const nextHit = !done && position === successes + 1
                    const nextMiss = !done && position === ABILITY_STONE_FACET_ATTEMPTS - failures
                    return (
                      <span
                        className={`sf-socket ${gem ? 'is-gem' : crack ? 'is-crack' : 'is-open'} ${isThreshold(position) ? 'is-mark' : ''} ${nextHit ? 'is-next-hit' : ''} ${nextMiss ? 'is-next-miss' : ''} ${fresh ? 'is-fresh' : ''}`}
                        key={fresh && lineImpact ? `${slot}-${lineImpact.id}` : slot}
                      />
                    )
                  })}
                </span>

                <ol className="sf-tiers" aria-label={negative ? '불리한 효과 발동 단계' : '효과 활성 단계'}>
                  {ABILITY_STONE_FACET_TIER_THRESHOLDS.map((threshold, tierIndex) => {
                    const reached = successes >= threshold
                    const unreachable = !reached && successes + remaining < threshold
                    const current = reachedTiers === tierIndex + 1
                    const fresh = lineImpact?.tierReached === threshold
                    const stateText = reached ? (negative ? '발동' : '활성') : unreachable ? (negative ? '회피 확정' : '도달 불가') : '대기'
                    return (
                      <li
                        className={`sf-tier ${reached ? 'is-reached' : ''} ${current ? 'is-current' : ''} ${unreachable ? (negative ? 'is-safe' : 'is-lost') : ''} ${fresh ? 'is-fresh' : ''}`}
                        key={threshold}
                        style={{ gridColumn: String(threshold) }}
                      >
                        <small>{threshold}회</small>
                        <strong>{formatValue(Number(definition?.values[tierIndex] ?? 0), unit)}</strong>
                        <span className="aw-sr-only">{stateText}</span>
                      </li>
                    )
                  })}
                </ol>

                <button
                  className="sf-hammer"
                  type="button"
                  onClick={() => void facet(index)}
                  onPointerEnter={() => setAimLine(index)}
                  onFocus={() => setAimLine(index)}
                  onBlur={() => setAimLine((current) => (current === index ? null : current))}
                  disabled={actionBusy || faceted || done || pendingLine !== null}
                  aria-describedby={titleId}
                >
                  {done ? <ArcaneGlyph name="check" /> : <HammerGlyph />}
                  <span>{done ? '완료' : pending ? '세공 중' : '세공'}</span>
                  {!done && <small>{negative ? '성공 시 불리' : '성공 시 강화'}</small>}
                </button>
              </section>
            )
          })}
        </div>

        <footer className="sf-foot">
          <p className="sf-foot-note">
            {engraveTargetPickaxe
              ? <><ArcaneGlyph name="gem" />{findPickaxe(engraveTargetPickaxe.id)?.name ?? engraveTargetPickaxe.id} 각인 관리</>
              : faceted ? '곡괭이 상세에서 이 스톤을 각인할 수 있습니다.' : '세 줄을 모두 세공하면 곡괭이에 각인할 수 있습니다.'}
          </p>
          <div className="sf-foot-actions">
            {engraveTargetPickaxe && <button type="button" className="sf-btn sf-btn--vein" onClick={onOpenEngraveList} disabled={actionBusy}>각인 변경</button>}
            <button type="button" className="sf-btn sf-btn--danger" onClick={dismantle} disabled={actionBusy}>분해</button>
          </div>
        </footer>
      </div>
    </Modal>
  )
}
