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
import { playSound } from '../lib/sound'
import { ArcaneGlyph, FacetTrack, StoneScore, StoneSocket } from './ArcaneParts'
import { Modal } from './Modal'

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

// 방금 끝난 세공 한 번의 결과입니다. 줄·확률판·스톤이 이 값으로 동시에 반응합니다.
interface FacetImpact {
  id: number
  optionIndex: number
  slot: number
  success: boolean
  sign: AbilityStoneSign
  successes: number
  chanceBefore: number
  chanceAfter: number
  tierReached: number | null
  tierValue: string | null
  completed: boolean
}

type ImpactTone = 'boon' | 'ash' | 'bane' | 'relief'

const formatValue = (value: number, unit: string) => `${value > 0 ? '+' : ''}${Number.isInteger(value) ? value : value.toLocaleString('ko-KR')}${unit}`
const sparkIndexes = Array.from({ length: 10 }, (_, index) => index)
const DIAL_RADIUS = 52

// 성공/실패와 효과 방향을 합쳐 판정 도장의 색과 문구를 정합니다. 불리한 줄의 성공은 손해로 표시합니다.
const verdictOf = (impact: FacetImpact): { tone: ImpactTone; title: string; note: string } => {
  if (impact.sign === 'negative') {
    if (impact.success) return { tone: 'bane', title: '성공', note: impact.tierReached ? `불리 효과 ${impact.tierValue} 발동` : '불리한 효과 누적' }
    return { tone: 'relief', title: '실패', note: '불리한 효과 회피' }
  }
  if (impact.success) return { tone: 'boon', title: '성공', note: impact.tierReached ? `${impact.tierReached}회 달성! ${impact.tierValue}` : `${impact.successes}번째 성공` }
  return { tone: 'ash', title: '실패', note: '균열이 남았습니다' }
}

const chanceBand = (chance: number) => chance >= 65 ? 'is-high' : chance <= 35 ? 'is-low' : 'is-mid'

export function AbilityStoneDetailModal({ stone, attachedPickaxe, engraveTargetPickaxe, actionBusy, onFacet, onOpenEngraveList, onDismantle, onClose }: AbilityStoneDetailModalProps) {
  const lineId = useId()
  const [impact, setImpact] = useState<FacetImpact | null>(null)
  const [pendingLine, setPendingLine] = useState<number | null>(null)
  // 응답이 오기 전 연타로 같은 요청이 겹치지 않도록 막습니다.
  const pendingRef = useRef(false)
  // 같은 줄에서 연속으로 같은 판정이 나와도 연출이 다시 시작되도록 결과마다 번호를 매깁니다.
  const impactSeqRef = useRef(0)
  const faceted = isAbilityStoneFaceted(stone)
  const progress = abilityStoneFacetProgress(stone)
  const totalAttempts = stone.options.length * ABILITY_STONE_FACET_ATTEMPTS
  const chance = Math.max(ABILITY_STONE_FACET_MIN_CHANCE, Math.min(ABILITY_STONE_FACET_MAX_CHANCE, Number(stone.facetChance ?? ABILITY_STONE_FACET_MAX_CHANCE)))
  const variant = Math.abs(Math.floor(stone.variant ?? 0)) % 4
  const verdict = impact ? verdictOf(impact) : null
  const chanceShift = impact ? impact.chanceAfter - impact.chanceBefore : 0

  const facet = async (optionIndex: number) => {
    const option = stone.options[optionIndex]
    if (!option || pendingRef.current || actionBusy) return
    const facetsBefore = abilityStoneOptionFacets(option)
    pendingRef.current = true
    setPendingLine(optionIndex)
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
          optionIndex,
          slot: facetsBefore.length,
          success,
          sign: option.sign,
          successes,
          chanceBefore: Number(result.chance_before ?? chance),
          chanceAfter: Number(result.chance ?? chance),
          tierReached: tierIndex >= 0 ? ABILITY_STONE_FACET_TIER_THRESHOLDS[tierIndex] : null,
          tierValue: tierIndex >= 0 && definition ? formatValue(Number(definition.values[tierIndex] ?? 0), definition.unit) : null,
          completed: result.completed === true,
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

  const impactLineName = impact ? findAbilityStoneOption(stone.options[impact.optionIndex]?.id ?? '')?.name ?? '' : ''
  const announcement = impact && verdict ? `${impactLineName} 세공 ${verdict.title}. ${verdict.note}. 성공 확률 ${impact.chanceBefore}%에서 ${impact.chanceAfter}%로 바뀌었습니다.${impact.completed ? ' 모든 세공을 마쳤습니다.' : ''}` : ''

  return (
    <Modal title={abilityStoneTitle(stone)} onClose={onClose} labelledBy="ability-stone-detail-title" className="aw-modal aw-bench-modal">
      <div className={`aw-bench aw-variant-${variant} ${faceted ? 'is-complete' : ''}`}>
        <div className="aw-bench-head">
          <div className={`aw-dial ${chanceBand(chance)} ${pendingLine !== null ? 'is-pending' : ''}`}>
            <svg className="aw-dial-svg" viewBox="0 0 120 120" aria-hidden="true">
              <circle className="aw-dial-track" cx="60" cy="60" r={DIAL_RADIUS} />
              <circle className="aw-dial-range" cx="60" cy="60" r={DIAL_RADIUS} pathLength={100} transform="rotate(-90 60 60)" strokeDasharray={`${ABILITY_STONE_FACET_MAX_CHANCE - ABILITY_STONE_FACET_MIN_CHANCE} 100`} strokeDashoffset={-ABILITY_STONE_FACET_MIN_CHANCE} />
              <circle className="aw-dial-fill" cx="60" cy="60" r={DIAL_RADIUS} pathLength={100} transform="rotate(-90 60 60)" strokeDasharray={`${chance} 100`} />
              {[ABILITY_STONE_FACET_MIN_CHANCE, 50, ABILITY_STONE_FACET_MAX_CHANCE].map((tick) => (
                <line className="aw-dial-tick" key={tick} x1="60" y1="1.5" x2="60" y2="7" transform={`rotate(${tick * 3.6} 60 60)`} />
              ))}
              <g className="aw-dial-needle" style={{ transform: `rotate(${chance * 3.6}deg)` }}>
                <circle cx="60" cy={60 - DIAL_RADIUS} r="4.2" />
              </g>
            </svg>
            <span className={`aw-dial-core ${impact && verdict ? `is-${verdict.tone}` : ''}`} key={impact?.id ?? 'idle'}>
              <StoneSocket stone={stone} size="large" />
            </span>
            {impact && verdict && (
              <span className={`aw-dial-burst is-${verdict.tone} ${impact.completed ? 'is-complete' : ''}`} key={`burst-${impact.id}`} aria-hidden="true">
                {sparkIndexes.map((index) => <i key={index} />)}
              </span>
            )}
          </div>

          <div className="aw-readout">
            <div className="aw-chance">
              <span className="aw-chance-label">성공 확률</span>
              <strong className={`aw-chance-value ${chanceBand(chance)}`}>{chance}<small>%</small></strong>
              {impact && chanceShift !== 0 && (
                <span className={`aw-chance-delta ${chanceShift > 0 ? 'is-up' : 'is-down'}`} key={`delta-${impact.id}`}>
                  {chanceShift > 0 ? '▲' : '▼'} {Math.abs(chanceShift)}%p
                </span>
              )}
            </div>
            <ul className="aw-rules" aria-label="확률 규칙">
              <li><i className="is-boon" aria-hidden="true" />성공하면 <b>−10%p</b></li>
              <li><i className="is-ash" aria-hidden="true" />실패하면 <b>+10%p</b></li>
              <li>범위 <b>{ABILITY_STONE_FACET_MIN_CHANCE}~{ABILITY_STONE_FACET_MAX_CHANCE}%</b></li>
            </ul>
            <div className="aw-bench-status">
              <span className={`aw-state-chip ${faceted ? 'is-done' : ''}`}>
                {faceted ? <><ArcaneGlyph name="spark" />세공 완료</> : <>세공 <b>{progress}</b>/{totalAttempts}</>}
              </span>
              {progress > 0 && <StoneScore stone={stone} size="lg" />}
            </div>
            {!faceted && <span className="aw-bench-progress" aria-hidden="true"><i style={{ width: `${(progress / totalAttempts) * 100}%` }} /></span>}
            {attachedPickaxe && <p className="aw-bench-host"><ArcaneGlyph name="gem" />{findPickaxe(attachedPickaxe.id)?.name ?? attachedPickaxe.id}에 각인 중</p>}
          </div>
          {impact?.completed && (
            <p className="aw-complete-banner" key={`done-${impact.id}`} aria-hidden="true"><ArcaneGlyph name="spark" />세공 완료<ArcaneGlyph name="spark" /></p>
          )}
        </div>

        <p className="aw-sr-only" aria-live="polite">{announcement}</p>

        <div className="aw-lines">
          {stone.options.map((option, optionIndex) => {
            const facets = abilityStoneOptionFacets(option)
            const successes = abilityStoneOptionSuccesses(option)
            const remaining = Math.max(0, ABILITY_STONE_FACET_ATTEMPTS - facets.length)
            const definition = findAbilityStoneOption(option.id)
            const name = definition?.name ?? option.name ?? option.id
            const unit = definition?.unit ?? option.unit ?? ''
            const negative = option.sign === 'negative'
            const lineComplete = facets.length >= ABILITY_STONE_FACET_ATTEMPTS
            const activeTier = Number(option.tier ?? 0)
            const reachedTiers = ABILITY_STONE_FACET_TIER_THRESHOLDS.filter((threshold) => successes >= threshold).length
            const lineImpact = impact?.optionIndex === optionIndex ? impact : null
            const lineVerdict = lineImpact ? verdictOf(lineImpact) : null
            const pending = pendingLine === optionIndex
            const titleId = `${lineId}-line-${optionIndex}`

            return (
              <section
                className={`aw-line aw-line--${option.sign} ${lineComplete ? 'is-complete' : ''} ${pending ? 'is-pending' : ''} ${lineImpact && lineVerdict ? `is-hit-${lineVerdict.tone} is-beat-${lineImpact.id % 2}` : ''}`}
                key={option.id}
                aria-labelledby={titleId}
              >
                <header className="aw-line-head">
                  <span className="aw-line-sign">
                    <ArcaneGlyph name={negative ? 'warn' : 'spark'} />
                    {negative ? '불리한 효과' : '이로운 효과'}
                  </span>
                  <strong id={titleId}>{name}</strong>
                  <span className={`aw-line-value ${activeTier > 0 ? 'is-active' : ''}`}>
                    {activeTier > 0 ? formatValue(Number(option.value ?? option.effectValue ?? 0), unit) : '미활성'}
                  </span>
                </header>

                <div className="aw-line-work">
                  <FacetTrack facets={facets} sign={option.sign} pending={pending} impactSlot={lineImpact?.slot ?? null} impactKey={lineImpact?.id} />
                  <span className="aw-line-count">
                    <span><b>{successes}</b>성공</span>
                    <span>남은 시도 <b>{remaining}</b></span>
                  </span>
                </div>

                <ol className="aw-tiers" aria-label={negative ? '불리한 효과 발동 단계' : '효과 활성 단계'}>
                  {ABILITY_STONE_FACET_TIER_THRESHOLDS.map((threshold, tierIndex) => {
                    const reached = successes >= threshold
                    const current = reachedTiers === tierIndex + 1
                    const unreachable = !reached && successes + remaining < threshold
                    const fresh = lineImpact?.tierReached === threshold
                    const stateText = reached ? (negative ? '발동' : '활성') : unreachable ? (negative ? '회피 확정' : '도달 불가') : '대기'
                    return (
                      <li
                        className={`aw-tier ${reached ? 'is-reached' : ''} ${current ? 'is-current' : ''} ${unreachable ? (negative ? 'is-safe' : 'is-lost') : ''} ${fresh ? 'is-fresh' : ''}`}
                        key={threshold}
                      >
                        <small>{threshold}회</small>
                        <strong>{formatValue(Number(definition?.values[tierIndex] ?? 0), unit)}</strong>
                        {unreachable && <ArcaneGlyph name={negative ? 'check' : 'lock'} className="aw-tier-mark" />}
                        <span className="aw-sr-only">{stateText}</span>
                      </li>
                    )
                  })}
                </ol>

                <button
                  className="aw-chisel"
                  type="button"
                  onClick={() => void facet(optionIndex)}
                  disabled={actionBusy || faceted || lineComplete || pendingLine !== null}
                  aria-describedby={titleId}
                >
                  <ArcaneGlyph name={lineComplete ? 'check' : 'chisel'} />
                  <span>{lineComplete ? '완료' : pending ? '세공 중' : '세공'}</span>
                  {!lineComplete && <small>{negative ? '성공하면 불리' : '성공하면 강화'}</small>}
                </button>

                {lineImpact && lineVerdict && (
                  <span className={`aw-stamp is-${lineVerdict.tone}`} key={`stamp-${lineImpact.id}`} aria-hidden="true">
                    <strong>{lineVerdict.tone === 'bane' && <ArcaneGlyph name="warn" />}{lineVerdict.title}</strong>
                    <small>{lineVerdict.note}</small>
                    <em>{lineImpact.chanceBefore}% → {lineImpact.chanceAfter}%</em>
                  </span>
                )}
              </section>
            )
          })}
        </div>

        <footer className="aw-bench-foot">
          <p className="aw-bench-note">
            {engraveTargetPickaxe
              ? <><ArcaneGlyph name="gem" />{findPickaxe(engraveTargetPickaxe.id)?.name ?? engraveTargetPickaxe.id} 각인 관리</>
              : faceted ? '곡괭이 상세에서 이 스톤을 각인할 수 있습니다.' : '세 줄을 모두 세공하면 곡괭이에 각인할 수 있습니다.'}
          </p>
          <div className="aw-bench-actions">
            {engraveTargetPickaxe && <button type="button" className="aw-btn aw-btn--vein" onClick={onOpenEngraveList} disabled={actionBusy}>각인 변경</button>}
            <button type="button" className="aw-btn aw-btn--danger" onClick={dismantle} disabled={actionBusy}>분해</button>
          </div>
        </footer>
      </div>
    </Modal>
  )
}
