import { ABILITY_STONE_FACET_ATTEMPTS, abilityStoneFacetProgress, findPickaxe, isAbilityStoneFaceted, type AbilityStoneInventoryItem, type PickaxeInventoryItem } from '../game'
import { AbilityStoneSprite } from './AbilityStoneSprite'
import { ArcaneGlyph, StoneFacetMap, StoneInlay, StoneOptionRows, StoneScore } from './ArcaneParts'
import { Modal } from './Modal'
import { PickaxeSprite } from './PickaxeSprite'
import '../StoneForge.css'

interface AbilityStoneEngraveListModalProps {
  pickaxe: PickaxeInventoryItem
  abilityStones: AbilityStoneInventoryItem[]
  // 다른 곡괭이에 박힌 스톤을 표시하기 위한 보유 곡괭이 목록입니다. 없으면 표시만 생략합니다.
  pickaxes?: PickaxeInventoryItem[]
  actionBusy: boolean
  onSelect: (stoneUid: string, pickaxeId: string) => void
  onClose: () => void
}

const variantOf = (stone: AbilityStoneInventoryItem) => Math.abs(Math.floor(stone.variant ?? 0)) % 4

// 각인대: 위쪽 바이스에 물린 곡괭이에, 아래 진열 선반의 스톤을 골라 박아 넣습니다.
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
    <Modal title="어빌리티 스톤 각인" onClose={onClose} labelledBy="ability-stone-engrave-list-title" className="sf-modal sf-rack-modal">
      <div className="sf-rack">
        <section className="sf-vise" aria-label="각인 대상">
          <span className={`sf-vise-socket ${currentStone ? `is-set aw-variant-${variantOf(currentStone)}` : 'is-empty'}`} aria-hidden="true">
            <PickaxeSprite pickaxeId={pickaxe.id} size="medium" />
            <StoneInlay stone={currentStone} />
          </span>
          <span className="sf-vise-copy">
            <span className="sf-kicker">각인 대상</span>
            <strong>{pickaxeName}</strong>
            <span className="sf-vise-current">
              {currentStone ? <>현재 스톤 <StoneScore stone={currentStone} size="sm" /></> : '비어 있는 스톤 소켓'}
            </span>
          </span>
          <span className="sf-vise-ready"><b>{readyCount}</b>개 각인 가능</span>
        </section>

        <p className="sf-rack-note">
          <ArcaneGlyph name="gem" />
          세공을 마친 스톤만 각인할 수 있습니다. 다른 곡괭이에 박힌 스톤을 고르면 이 곡괭이로 옮겨집니다.
        </p>

        {sortedStones.length > 0 ? (
          <div className="sf-shelf">
            {sortedStones.map((stone) => {
              const faceted = isAbilityStoneFaceted(stone)
              const current = stone.uid === pickaxe.abilityStoneUid
              const progress = abilityStoneFacetProgress(stone)
              const total = stone.options.length * ABILITY_STONE_FACET_ATTEMPTS
              const hostName = hostOf(stone)
              return (
                <button
                  className={`sf-niche aw-variant-${variantOf(stone)} ${faceted ? 'is-ready' : 'is-locked'} ${current ? 'is-current' : ''}`}
                  type="button"
                  key={stone.uid}
                  onClick={() => selectStone(stone)}
                  disabled={actionBusy || !faceted || current}
                >
                  <span className="sf-niche-alcove" aria-hidden="true">
                    <AbilityStoneSprite variant={stone.variant} size="medium" />
                    {current && <span className="sf-niche-ribbon">현재 각인</span>}
                  </span>
                  <span className="sf-niche-body">
                    <span className="sf-niche-head">
                      {progress > 0 ? <StoneScore stone={stone} /> : <strong className="sf-niche-raw">미세공 스톤</strong>}
                      <span className={`sf-niche-state ${current ? 'is-current' : faceted ? 'is-ready' : 'is-locked'}`}>
                        {current ? '현재 각인' : !faceted ? `세공 ${progress}/${total}` : hostName ? `${hostName}에서 이동` : '각인 가능'}
                      </span>
                    </span>
                    {faceted ? <StoneOptionRows stone={stone} /> : <StoneFacetMap stone={stone} />}
                    {faceted && !current && (
                      <span className="sf-niche-cta"><ArcaneGlyph name="gem" />{hostName ? '이 곡괭이로 옮겨 각인' : '이 스톤으로 각인'}</span>
                    )}
                    {!faceted && (
                      <span className="sf-niche-lock"><ArcaneGlyph name="lock" />세 줄을 모두 세공해야 각인할 수 있습니다</span>
                    )}
                  </span>
                </button>
              )
            })}
          </div>
        ) : (
          <p className="sf-rack-empty">보유한 어빌리티 스톤이 없습니다.</p>
        )}
      </div>
    </Modal>
  )
}
