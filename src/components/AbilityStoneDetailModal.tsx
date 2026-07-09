import { useState } from 'react'
import {
  ABILITY_STONE_FACET_ATTEMPTS,
  ABILITY_STONE_FACET_TIER_THRESHOLDS,
  abilityStoneFacetProgress,
  abilityStoneOptionFacets,
  abilityStoneOptionSuccesses,
  abilityStoneOptionText,
  abilityStoneTitle,
  findAbilityStoneOption,
  findPickaxe,
  isAbilityStoneFaceted,
  type AbilityStoneInventoryItem,
  type FacetAbilityStoneResult,
  type PickaxeInventoryItem,
} from '../game'
import { AbilityStoneSprite } from './AbilityStoneSprite'
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

const formatValue = (value: number, unit: string) => `${value > 0 ? '+' : ''}${Number.isInteger(value) ? value : value.toLocaleString('ko-KR')}${unit}`
const sparkIndexes = Array.from({ length: 12 }, (_, index) => index)

export function AbilityStoneDetailModal({ stone, attachedPickaxe, engraveTargetPickaxe, actionBusy, onFacet, onOpenEngraveList, onDismantle, onClose }: AbilityStoneDetailModalProps) {
  const [lastFacet, setLastFacet] = useState<FacetAbilityStoneResult | null>(null)
  const [facetBurst, setFacetBurst] = useState<{ id: number; success: boolean; chanceBefore: number; optionIndex: number } | null>(null)
  const faceted = isAbilityStoneFaceted(stone)
  const progress = abilityStoneFacetProgress(stone)
  const chance = Math.max(25, Math.min(75, Number(stone.facetChance ?? 75)))

  const facet = async (optionIndex: number) => {
    const result = await onFacet(stone.uid, optionIndex)
    if (result) {
      setLastFacet(result)
      if (result.status === 'success') {
        setFacetBurst({
          id: Date.now(),
          success: result.success === true,
          chanceBefore: Number(result.chance_before ?? chance),
          optionIndex,
        })
      }
    }
  }

  const dismantle = () => {
    onDismantle(stone.uid)
    onClose()
  }

  return (
    <Modal title={abilityStoneTitle(stone)} onClose={onClose} labelledBy="ability-stone-detail-title" className="ability-facet-modal">
      <div className="ability-facet-workbench">
        {facetBurst && (
          <div className={`ability-facet-burst ${facetBurst.success ? 'is-success' : 'is-failure'}`} key={facetBurst.id} aria-hidden="true">
            <div className="ability-facet-burst-core">
              <AbilityStoneSprite variant={stone.variant} size="medium" />
              <strong>{facetBurst.success ? '성공' : '균열'}</strong>
              <small>{facetBurst.chanceBefore}%</small>
            </div>
            <div className="ability-facet-burst-sparks">
              {sparkIndexes.map((index) => <i key={`${facetBurst.id}-${index}`} />)}
            </div>
          </div>
        )}
        <div className="ability-facet-head">
          <AbilityStoneSprite variant={stone.variant} size="large" />
          <div className="ability-facet-overview">
            <div className="ability-facet-status-row">
              <span className={`pickaxe-detail-status ${faceted ? 'is-equipped' : ''}`}>{faceted ? '세공 완료' : `세공 ${progress} / 30`}</span>
              {attachedPickaxe && <small>{findPickaxe(attachedPickaxe.id)?.name ?? attachedPickaxe.id} 각인 중</small>}
            </div>
            <div className="ability-facet-chance" aria-label={`세공 성공 확률 ${chance}%`}>
              <div><span>성공 확률</span><strong>{chance}%</strong></div>
              <div className="ability-facet-chance-track"><span style={{ width: `${chance}%` }} /></div>
            </div>
          </div>
        </div>

        <div className="ability-facet-lines">
          {stone.options.map((option, optionIndex) => {
            const facets = abilityStoneOptionFacets(option)
            const successes = abilityStoneOptionSuccesses(option)
            const definition = findAbilityStoneOption(option.id)
            const lineComplete = facets.length >= ABILITY_STONE_FACET_ATTEMPTS
            const lineResult = lastFacet?.option_index === optionIndex ? lastFacet.success : undefined
            const lineImpact = facetBurst?.optionIndex === optionIndex ? (facetBurst.success ? 'is-last-success' : 'is-last-failure') : ''

            return (
              <section className={`ability-facet-line ability-facet-line--${option.sign} ${lineImpact}`} key={option.id} aria-label={`${definition?.name ?? option.name ?? option.id} 세공`}>
                <div className="ability-facet-line-title">
                  <div>
                    <span className="enchant-dot" aria-hidden="true" />
                    <strong>{definition?.name ?? option.name ?? option.id}</strong>
                    <em>{successes} / 10</em>
                  </div>
                  <span className={`ability-facet-result ${lineResult === true ? 'is-success' : lineResult === false ? 'is-failure' : ''}`} aria-live="polite">
                    {lineResult === true ? '성공' : lineResult === false ? '실패' : abilityStoneOptionText(option)}
                  </span>
                </div>

                <div className="ability-facet-node-row" aria-label={`성공 ${successes}회, 시도 ${facets.length}회`}>
                  {Array.from({ length: ABILITY_STONE_FACET_ATTEMPTS }, (_, slotIndex) => {
                    const result = facets[slotIndex]
                    return <span className={`ability-facet-node ${result === true ? 'is-success' : result === false ? 'is-failure' : ''}`} key={`${option.id}-slot-${slotIndex}`} aria-label={result === true ? '성공' : result === false ? '실패' : '미세공'} />
                  })}
                </div>

                <div className="ability-facet-levels" aria-label="효과 활성 단계">
                  {ABILITY_STONE_FACET_TIER_THRESHOLDS.map((threshold, tierIndex) => (
                    <span className={successes >= threshold ? 'is-active' : ''} key={`${option.id}-tier-${threshold}`}>
                      <small>{threshold}</small>
                      <strong>{formatValue(Number(definition?.values[tierIndex] ?? 0), definition?.unit ?? '')}</strong>
                    </span>
                  ))}
                </div>

                <button className="ability-facet-button" type="button" onClick={() => void facet(optionIndex)} disabled={actionBusy || faceted || lineComplete}>
                  {lineComplete ? '완료' : actionBusy ? '세공 중' : '세공'}
                </button>
              </section>
            )
          })}
        </div>

        <div className="ability-facet-footer">
          <span className="ability-facet-lock">
            {engraveTargetPickaxe
              ? `${findPickaxe(engraveTargetPickaxe.id)?.name ?? engraveTargetPickaxe.id} 각인 관리`
              : faceted ? '곡괭이 상세에서 각인할 수 있습니다.' : '세공 완료 후 각인 가능'}
          </span>

          <div className="ability-stone-actions">
            {engraveTargetPickaxe && <button type="button" className="ore-button ore-button--primary" onClick={onOpenEngraveList} disabled={actionBusy}>각인 변경</button>}
            <button type="button" className="ore-button ability-stone-dismantle" onClick={dismantle} disabled={actionBusy}>분해</button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
