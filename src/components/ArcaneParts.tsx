import {
  ABILITY_STONE_FACET_ATTEMPTS,
  ABILITY_STONE_FACET_TIER_THRESHOLDS,
  abilityStoneFacetProgress,
  abilityStoneOptionFacets,
  abilityStoneOptionSuccesses,
  enchantDescription,
  findAbilityStoneOption,
  findEnchantment,
  isAbilityStoneFaceted,
  toRoman,
  type AbilityStoneInventoryItem,
  type AbilityStoneSign,
  type EnchantId,
} from '../game'
import '../ArcaneWorkshop.css'
import { AbilityStoneSprite } from './AbilityStoneSprite'
import { PickaxeSprite } from './PickaxeSprite'

// 「심층 세공소」 화면들이 함께 쓰는 문양·스톤·마법 표시 부품입니다.

export type ArcaneGlyphName = 'sigil' | 'curse' | 'gem' | 'equip' | 'crack' | 'check' | 'lock' | 'warn' | 'chisel' | 'spark'

function glyphPaths(name: ArcaneGlyphName) {
  switch (name) {
    // 마법 부여: 원 안의 네 갈래 별
    case 'sigil': return <><circle cx="8" cy="8" r="6.4" /><path className="is-fill" d="M8 2.9 9.1 6.9 13.1 8 9.1 9.1 8 13.1 6.9 9.1 2.9 8 6.9 6.9Z" /></>
    // 저주: 끊어진 원과 번개 균열
    case 'curse': return <><path d="M12.9 4.4A6.4 6.4 0 1 1 6.2 1.9" /><path d="M9.6 3.6 6.6 8.3h3l-2.8 4.5" /></>
    // 스톤 각인: 깎인 보석
    case 'gem': return <><path d="M4.7 2.6h6.6l2.9 3.6L8 13.7 1.8 6.2Z" /><path d="M1.8 6.2h12.4M6.3 2.6 5.3 6.2 8 13.7l2.7-7.5-1-3.6" /></>
    // 장착: 곡괭이
    case 'equip': return <g transform="rotate(-38 8 8)"><path d="M2.4 6.6C4.9 3.3 11.1 3.3 13.6 6.6" /><path d="M8 4.3v10" /></g>
    case 'crack': return <path d="M9.8 1.8 6.4 6.3l3.1 2.1-3.7 5.9" />
    case 'check': return <path d="M3.2 8.6 6.5 11.7 12.8 4.6" />
    case 'lock': return <><rect x="3.4" y="7.1" width="9.2" height="6.7" rx="1.4" /><path d="M5.4 7.1V5.3a2.6 2.6 0 0 1 5.2 0v1.8" /></>
    case 'warn': return <><path d="M8 2.3 14.2 13.1H1.8Z" /><path d="M8 6.5v3.1M8 11.3v.1" /></>
    // 세공: 끌
    case 'chisel': return <><path d="m2.6 13.4 6.3-6.3" /><path d="m8.4 4.2 3.4 3.4 2.3-2.3-3.4-3.4Z" /></>
    case 'spark': return <path className="is-fill" d="M8 1.6 9.4 6.6 14.4 8 9.4 9.4 8 14.4 6.6 9.4 1.6 8 6.6 6.6Z" />
  }
}

export function ArcaneGlyph({ name, className = '' }: { name: ArcaneGlyphName; className?: string }) {
  return (
    <svg className={`aw-glyph ${className}`} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      {glyphPaths(name)}
    </svg>
  )
}

const stoneVariant = (stone: AbilityStoneInventoryItem) => Math.abs(Math.floor(stone.variant ?? 0)) % 4

// 각인된 스톤은 해당 곡괭이 그림을, 원석은 세공 상태에 맞춘 보석 그림을 보여 줍니다.
export function StoneSocket({ stone, hostPickaxeId, size = 'small', className = '' }: { stone: AbilityStoneInventoryItem; hostPickaxeId?: string; size?: 'small' | 'medium' | 'large'; className?: string }) {
  const state = isAbilityStoneFaceted(stone) ? 'is-cut' : abilityStoneFacetProgress(stone) === 0 ? 'is-raw' : 'is-cutting'
  return (
    <span className={`aw-stone-socket aw-stone-socket--${size} aw-variant-${stoneVariant(stone)} ${state} ${hostPickaxeId ? 'is-engraved' : ''} ${className}`} aria-hidden="true">
      {hostPickaxeId ? <PickaxeSprite pickaxeId={hostPickaxeId} size={size} /> : <AbilityStoneSprite variant={stone.variant} size={size} />}
    </span>
  )
}

// 곡괭이 썸네일 모서리에 박히는 작은 스톤 장식입니다.
export function StoneInlay({ stone }: { stone: AbilityStoneInventoryItem | null }) {
  return (
    <span className={`aw-inlay ${stone ? `aw-variant-${stoneVariant(stone)}` : ''}`} aria-hidden="true">
      {stone ? <AbilityStoneSprite variant={stone.variant} size="small" /> : <ArcaneGlyph name="gem" />}
    </span>
  )
}

// 줄별 성공 횟수를 이로운 효과는 비취, 불리한 효과는 진사 색 보석 숫자로 보여 줍니다.
export function StoneScore({ stone, size = 'md' }: { stone: AbilityStoneInventoryItem; size?: 'sm' | 'md' | 'lg' }) {
  const scores = stone.options.map((option) => ({ sign: option.sign, value: abilityStoneOptionSuccesses(option) }))
  const label = `세공 성공 ${scores.map((score) => `${score.sign === 'positive' ? '이로운 효과' : '불리한 효과'} ${score.value}회`).join(', ')}`
  return (
    <span className={`aw-score aw-score--${size}`} role="img" aria-label={label}>
      {scores.map((score, index) => (
        <span
          className={`aw-score-gem is-${score.sign} ${score.value >= ABILITY_STONE_FACET_TIER_THRESHOLDS[0] ? 'is-active' : ''} ${score.value === 0 ? 'is-zero' : ''}`}
          key={index}
        >
          {score.value}
        </span>
      ))}
    </span>
  )
}

interface FacetTrackProps {
  facets: boolean[]
  sign: AbilityStoneSign
  size?: 'mini' | 'full'
  pending?: boolean
  impactSlot?: number | null
  impactKey?: number
}

// 한 줄의 10번 시도를 시간 순서대로 마름모 칸에 새깁니다.
export function FacetTrack({ facets, sign, size = 'full', pending = false, impactSlot = null, impactKey = 0 }: FacetTrackProps) {
  const successes = facets.filter(Boolean).length
  return (
    <span
      className={`aw-track aw-track--${size} is-${sign}`}
      role="img"
      aria-label={`${ABILITY_STONE_FACET_ATTEMPTS}번 중 ${facets.length}번 시도, 성공 ${successes}번, 실패 ${facets.length - successes}번`}
    >
      {Array.from({ length: ABILITY_STONE_FACET_ATTEMPTS }, (_, slot) => {
        const result = facets[slot]
        const state = result === true ? 'is-success' : result === false ? 'is-failure' : 'is-empty'
        const next = slot === facets.length
        const impact = impactSlot === slot
        return (
          <span
            className={`aw-facet ${state} ${next ? 'is-next' : ''} ${next && pending ? 'is-pending' : ''} ${impact ? 'is-impact' : ''}`}
            key={impact ? `${slot}-${impactKey}` : slot}
          >
            {size === 'full' && result === undefined && <i>{slot + 1}</i>}
          </span>
        )
      })}
    </span>
  )
}

export function StoneFacetMap({ stone }: { stone: AbilityStoneInventoryItem }) {
  return (
    <span className="aw-facet-map">
      {stone.options.map((option, index) => (
        <FacetTrack key={`${option.id}-${index}`} facets={abilityStoneOptionFacets(option)} sign={option.sign} size="mini" />
      ))}
    </span>
  )
}

const signedValue = (value: number, unit: string) => `${value > 0 ? '+' : ''}${Number.isInteger(value) ? value : value.toLocaleString('ko-KR')}${unit}`

// 효과의 종류는 색으로 구분하고, 화면 읽기에는 종류를 함께 제공합니다.
export function StoneOptionRows({ stone }: { stone: AbilityStoneInventoryItem }) {
  return (
    <span className="aw-option-rows">
      {stone.options.map((option, index) => {
        const definition = findAbilityStoneOption(option.id)
        const active = Number(option.tier ?? 0) > 0
        const unit = definition?.unit ?? option.unit ?? ''
        return (
          <span className={`aw-option-row is-${option.sign} ${active ? 'is-active' : 'is-dormant'}`} key={`${option.id}-${index}`}>
            <span className="aw-option-name"><span className="aw-sr-only">{option.sign === 'positive' ? '이로운 효과 ' : '불리한 효과 '}</span>{definition?.name ?? option.name ?? option.id}</span>
            <strong className="aw-option-value">{active ? signedValue(Number(option.value ?? option.effectValue ?? 0), unit) : '미활성'}</strong>
          </span>
        )
      })}
    </span>
  )
}

// 마법은 인장의 빛깔과 이름으로 표시합니다. 곡괭이 상세와 부여 연출이 함께 사용합니다.
export function EnchantSeal({ id, level }: { id: EnchantId; level: number }) {
  const definition = findEnchantment(id)
  if (!definition) return null
  const positive = definition.sign === 'positive'
  const leveled = definition.maxLevel > 1

  return (
    <span className={`aw-seal aw-seal--${definition.sign}`}>
      <span className="aw-seal-medal" aria-hidden="true">
        <ArcaneGlyph name={positive ? 'sigil' : 'curse'} />
      </span>
      <span className="aw-seal-body">
        <span className="aw-seal-head">
          <span className="aw-sr-only">{positive ? '축복 ' : '저주 '}</span>
          <strong>{definition.name}</strong>
          {leveled && <em className="aw-seal-level">{toRoman(level)}</em>}
        </span>
        {leveled && (
          <span className="aw-seal-pips" role="img" aria-label={`${definition.maxLevel}단계 중 ${level}단계`}>
            {Array.from({ length: definition.maxLevel }, (_, index) => <i className={index < level ? 'is-on' : ''} key={index} />)}
          </span>
        )}
        <small>{enchantDescription(id, level)}</small>
      </span>
    </span>
  )
}
