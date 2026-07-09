import { abilityStoneFacetProgress, abilityStoneOptionSuccesses, abilityStoneOptionText, abilityStoneTitle, findPickaxe, isAbilityStoneFaceted, type AbilityStoneInventoryItem, type PickaxeInventoryItem } from '../game'
import { AbilityStoneSprite } from './AbilityStoneSprite'
import { Modal } from './Modal'

interface AbilityStoneEngraveListModalProps {
  pickaxe: PickaxeInventoryItem
  abilityStones: AbilityStoneInventoryItem[]
  actionBusy: boolean
  onSelect: (stoneUid: string, pickaxeId: string) => void
  onClose: () => void
}

export function AbilityStoneEngraveListModal({ pickaxe, abilityStones, actionBusy, onSelect, onClose }: AbilityStoneEngraveListModalProps) {
  const pickaxeName = findPickaxe(pickaxe.id)?.name ?? pickaxe.id
  const sortedStones = abilityStones
    .slice()
    .sort((a, b) => Number(isAbilityStoneFaceted(b)) - Number(isAbilityStoneFaceted(a)) || abilityStoneFacetProgress(b) - abilityStoneFacetProgress(a))

  const selectStone = (stone: AbilityStoneInventoryItem) => {
    if (actionBusy || !isAbilityStoneFaceted(stone) || stone.uid === pickaxe.abilityStoneUid) return
    onSelect(stone.uid, pickaxe.id)
    onClose()
  }

  return (
    <Modal title="어빌리티 스톤 각인" onClose={onClose} labelledBy="ability-stone-engrave-list-title" className="ability-stone-list-modal">
      <div className="ability-stone-engrave-list">
        <div className="ability-stone-engrave-target">
          <span>각인 대상</span>
          <strong>{pickaxeName}</strong>
        </div>

        {sortedStones.length > 0 ? (
          <div className="ability-stone-select-list">
            {sortedStones.map((stone) => {
              const faceted = isAbilityStoneFaceted(stone)
              const current = stone.uid === pickaxe.abilityStoneUid
              const progress = abilityStoneFacetProgress(stone)
              const scores = stone.options.map(abilityStoneOptionSuccesses)
              return (
                <button
                  className={`ability-stone-select-item ${faceted ? 'is-ready' : 'is-locked'} ${current ? 'is-current' : ''}`}
                  type="button"
                  key={stone.uid}
                  onClick={() => selectStone(stone)}
                  disabled={actionBusy || !faceted || current}
                >
                  <AbilityStoneSprite variant={stone.variant} size="medium" />
                  <span className="ability-stone-select-body">
                    <span className="ability-stone-select-head">
                      <strong>{abilityStoneTitle(stone)}</strong>
                      <em>{current ? '각인 중' : faceted ? '각인 가능' : `${progress} / 30`}</em>
                    </span>
                    <span className="ability-stone-select-score">{faceted ? scores.join(' / ') : '세공 완료 필요'}</span>
                    <span className="ability-stone-select-options">
                      {stone.options.map((option) => <small className={`is-${option.sign}`} key={option.id}>{abilityStoneOptionText(option)}</small>)}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        ) : (
          <p className="empty-inventory">보유한 어빌리티 스톤이 없습니다.</p>
        )}
      </div>
    </Modal>
  )
}
