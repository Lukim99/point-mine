import { ABILITY_STONE_FACET_ATTEMPTS, abilityStoneFacetProgress, findPickaxe, isAbilityStoneFaceted, type AbilityStoneInventoryItem, type PickaxeInventoryItem } from '../game'
import { ArcaneGlyph, StoneFacetMap, StoneInlay, StoneOptionRows, StoneScore, StoneSocket } from './ArcaneParts'
import { Modal } from './Modal'
import { PickaxeSprite } from './PickaxeSprite'

interface AbilityStoneEngraveListModalProps {
  pickaxe: PickaxeInventoryItem
  abilityStones: AbilityStoneInventoryItem[]
  // 다른 곡괭이에 박힌 스톤을 표시하기 위한 보유 곡괭이 목록입니다. 없으면 표시만 생략합니다.
  pickaxes?: PickaxeInventoryItem[]
  actionBusy: boolean
  onSelect: (stoneUid: string, pickaxeId: string) => void
  onClose: () => void
}

export function AbilityStoneEngraveListModal({ pickaxe, abilityStones, pickaxes = [], actionBusy, onSelect, onClose }: AbilityStoneEngraveListModalProps) {
  const pickaxeName = findPickaxe(pickaxe.id)?.name ?? pickaxe.id
  const currentStone = abilityStones.find((stone) => stone.uid === pickaxe.abilityStoneUid) ?? null
  const sortedStones = abilityStones
    .slice()
    .sort((a, b) => Number(isAbilityStoneFaceted(b)) - Number(isAbilityStoneFaceted(a)) || abilityStoneFacetProgress(b) - abilityStoneFacetProgress(a))
  const readyCount = sortedStones.filter((stone) => isAbilityStoneFaceted(stone) && stone.uid !== pickaxe.abilityStoneUid).length

  const selectStone = (stone: AbilityStoneInventoryItem) => {
    if (actionBusy || !isAbilityStoneFaceted(stone) || stone.uid === pickaxe.abilityStoneUid) return
    onSelect(stone.uid, pickaxe.id)
    onClose()
  }

  const hostOf = (stone: AbilityStoneInventoryItem) => {
    const host = pickaxes.find((item) => item.abilityStoneUid === stone.uid && item.id !== pickaxe.id)
    return host ? findPickaxe(host.id)?.name ?? host.id : null
  }

  return (
    <Modal title="어빌리티 스톤 각인" onClose={onClose} labelledBy="ability-stone-engrave-list-title" className="aw-modal aw-engrave-modal">
      <div className="aw-engrave">
        <div className="aw-engrave-target">
          <span className={`aw-gear-socket aw-gear-socket--lg ${currentStone ? '' : 'is-empty'}`} aria-hidden="true">
            <PickaxeSprite pickaxeId={pickaxe.id} size="small" />
            <StoneInlay stone={currentStone} />
          </span>
          <span className="aw-engrave-target-copy">
            <span className="aw-kicker">각인 대상</span>
            <strong>{pickaxeName}</strong>
            <span className="aw-engrave-current">
              {currentStone ? <>현재 스톤 <StoneScore stone={currentStone} size="sm" /></> : '비어 있는 스톤 소켓'}
            </span>
          </span>
          <span className="aw-engrave-ready"><b>{readyCount}</b>개 각인 가능</span>
        </div>

        <p className="aw-engrave-note">
          <ArcaneGlyph name="gem" />
          세공을 마친 스톤만 각인할 수 있습니다. 다른 곡괭이에 박힌 스톤을 고르면 이 곡괭이로 옮겨집니다.
        </p>

        {sortedStones.length > 0 ? (
          <div className="aw-pick-list">
            {sortedStones.map((stone) => {
              const faceted = isAbilityStoneFaceted(stone)
              const current = stone.uid === pickaxe.abilityStoneUid
              const progress = abilityStoneFacetProgress(stone)
              const total = stone.options.length * ABILITY_STONE_FACET_ATTEMPTS
              const hostName = hostOf(stone)
              return (
                <button
                  className={`aw-pick-stone ${faceted ? 'is-ready' : 'is-locked'} ${current ? 'is-current' : ''}`}
                  type="button"
                  key={stone.uid}
                  onClick={() => selectStone(stone)}
                  disabled={actionBusy || !faceted || current}
                >
                  <StoneSocket stone={stone} size="medium" />
                  <span className="aw-pick-body">
                    <span className="aw-pick-head">
                      {progress > 0 ? <StoneScore stone={stone} /> : <strong className="aw-stone-name">미세공 스톤</strong>}
                      <span className={`aw-pick-state ${current ? 'is-current' : faceted ? 'is-ready' : 'is-locked'}`}>
                        {current ? '현재 각인' : !faceted ? `세공 ${progress}/${total}` : hostName ? `${hostName}에서 이동` : '각인 가능'}
                      </span>
                    </span>
                    {faceted ? <StoneOptionRows stone={stone} /> : <StoneFacetMap stone={stone} />}
                    {faceted && !current && (
                      <span className="aw-pick-cta"><ArcaneGlyph name="gem" />{hostName ? '이 곡괭이로 옮겨 각인' : '이 스톤으로 각인'}</span>
                    )}
                    {!faceted && (
                      <span className="aw-pick-lock"><ArcaneGlyph name="lock" />세 줄을 모두 세공해야 각인할 수 있습니다</span>
                    )}
                  </span>
                </button>
              )
            })}
          </div>
        ) : (
          <p className="aw-empty">보유한 어빌리티 스톤이 없습니다.</p>
        )}
      </div>
    </Modal>
  )
}
