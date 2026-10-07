import { abilityStoneEffectValue, ENCHANT_MANA_COST, findEnchantment, findOre, findPickaxe, hasEngravedAbilityStone, isAbilityStoneFaceted, isEnchanted, type AbilityStoneInventoryItem, type EnchantId, type OreId, type PickaxeInventoryItem } from '../game'
import { findRepairRecipe } from '../repair'
import { ArcaneGlyph, EnchantSeal, StoneInlay, StoneOptionRows, StoneScore, StoneSocket } from './ArcaneParts'
import { Durability } from './Durability'
import { Modal } from './Modal'
import { OreSprite } from './OreSprite'
import { PickaxeSprite } from './PickaxeSprite'

interface PickaxeDetailModalProps {
  item: PickaxeInventoryItem
  abilityStone?: AbilityStoneInventoryItem | null
  mana: number
  actionBusy: boolean
  mineralQuantity: (oreId: OreId) => number
  onEquip: (id: string) => void
  onRepair: (id: string, amount: number) => void
  onEnchant: (id: string) => void
  onOpenAbilityStone: (id: string) => void
  onClose: () => void
}

// 부여된 마법을 긍정 먼저 정렬해 정의와 함께 반환합니다.
const enchantEntries = (enchants?: Partial<Record<EnchantId, number>>) => {
  if (!enchants) return []
  return (Object.entries(enchants) as [EnchantId, number][])
    .map(([id, level]) => ({ id, level, def: findEnchantment(id) }))
    .filter((entry): entry is { id: EnchantId; level: number; def: NonNullable<typeof entry.def> } => Boolean(entry.def))
    .sort((a, b) => (a.def.sign === b.def.sign ? 0 : a.def.sign === 'positive' ? -1 : 1))
}

export function PickaxeDetailModal({ item, abilityStone, mana, actionBusy, mineralQuantity, onEquip, onRepair, onEnchant, onOpenAbilityStone, onClose }: PickaxeDetailModalProps) {
  const definition = findPickaxe(item.id)
  const recipe = findRepairRecipe(item.id)
  const missingDurability = Math.max(0, item.maxDurability - item.durability)
  const isPointRepair = recipe?.pointCost !== undefined
  const materialLimit = recipe && !isPointRepair ? Math.min(...recipe.costs.map((cost) => Math.floor(mineralQuantity(cost.oreId) / cost.quantity))) : 0
  // 수리는 한 번에 내구도 1씩만 진행합니다.
  const canRepair = missingDurability > 0 && (isPointRepair ? true : materialLimit >= 1)
  const entries = enchantEntries(item.enchants)
  const blessings = entries.filter((entry) => entry.def.sign === 'positive').length
  const curses = entries.length - blessings
  const enchantManaCost = Math.max(1, ENCHANT_MANA_COST + abilityStoneEffectValue(abilityStone, 'enchant_mana_cost'))
  const manaShort = mana < enchantManaCost
  const enchanted = isEnchanted(item)
  const engraved = hasEngravedAbilityStone(item)
  const broken = item.durability <= 0
  const durabilityRatio = item.maxDurability > 0 ? item.durability / item.maxDurability : 0

  return (
    <Modal title={definition?.name ?? item.id} onClose={onClose} labelledBy="pickaxe-detail-title" className="aw-modal aw-pickaxe-modal">
      <div className="aw-detail">
        <div className={`aw-hero ${item.equipped ? 'is-equipped' : ''} ${enchanted ? 'is-enchanted' : ''} ${engraved ? 'is-engraved' : ''}`}>
          <span className="aw-gear-socket aw-gear-socket--hero" aria-hidden="true">
            {enchanted && <span className="aw-orbit" />}
            <PickaxeSprite pickaxeId={item.id} size="medium" enchanted={enchanted || engraved} />
            {engraved && <StoneInlay stone={abilityStone ?? null} />}
          </span>
          <div className="aw-hero-meta">
            <div className="aw-hero-tags">
              {item.equipped && <span className="aw-tag aw-tag--equip"><ArcaneGlyph name="equip" />장착 중</span>}
              {broken && <span className="aw-tag aw-tag--broken"><ArcaneGlyph name="crack" />파손됨</span>}
              {!item.equipped && !broken && <span className="aw-tag aw-tag--idle">대기 중</span>}
            </div>
            <div className="aw-stats">
              <span className="aw-stat">
                <span>공격력</span>
                <strong>{definition?.attack ?? 0}</strong>
              </span>
              <span className={`aw-stat ${durabilityRatio <= 0.25 ? 'is-warn' : ''}`}>
                <span>내구도</span>
                <strong>{item.durability}<small>/{item.maxDurability}</small></strong>
              </span>
            </div>
            <Durability item={item} />
          </div>
        </div>

        <section className="aw-section aw-section--enchant" aria-labelledby="aw-pickaxe-enchant-title">
          <header className="aw-section-head">
            <ArcaneGlyph name="sigil" />
            <h3 id="aw-pickaxe-enchant-title">마법 부여</h3>
            <span className="aw-rule" aria-hidden="true" />
            {entries.length > 0 && (
              <span className="aw-tally">
                <span className="aw-tally-chip is-boon">축복 <b>{blessings}</b></span>
                <span className="aw-tally-chip is-bane">저주 <b>{curses}</b></span>
              </span>
            )}
          </header>
          {entries.length > 0 ? (
            <ul className="aw-seal-list">
              {entries.map((entry) => <li key={entry.id}><EnchantSeal id={entry.id} level={entry.level} /></li>)}
            </ul>
          ) : (
            <p className="aw-empty aw-empty--astral">아직 깃든 마법이 없습니다. 마나로 마법을 부여해 보세요.</p>
          )}
          {entries.length > 0 && <p className="aw-section-note">다시 부여하면 지금의 마법은 모두 새 마법으로 바뀝니다.</p>}
        </section>

        <section className="aw-section aw-section--stone" aria-labelledby="aw-pickaxe-stone-title">
          <header className="aw-section-head">
            <ArcaneGlyph name="gem" />
            <h3 id="aw-pickaxe-stone-title">스톤 각인</h3>
            <span className="aw-rule" aria-hidden="true" />
          </header>
          <button type="button" className={`aw-socket-plate ${abilityStone ? 'has-stone' : 'is-empty'}`} onClick={() => onOpenAbilityStone(item.id)} disabled={actionBusy}>
            {abilityStone ? (
              <>
                <StoneSocket stone={abilityStone} size="medium" />
                <span className="aw-socket-plate-body">
                  <span className="aw-socket-plate-head">
                    <StoneScore stone={abilityStone} />
                    <span className="aw-kicker">{isAbilityStoneFaceted(abilityStone) ? '세공 완료' : '세공 중'}</span>
                  </span>
                  <StoneOptionRows stone={abilityStone} />
                </span>
                <span className="aw-socket-plate-cta">상세 보기</span>
              </>
            ) : (
              <>
                <span className="aw-empty-socket" aria-hidden="true"><ArcaneGlyph name="gem" /></span>
                <span className="aw-socket-plate-body">
                  <strong>비어 있는 스톤 소켓</strong>
                  <small>세공을 마친 어빌리티 스톤을 박아 넣을 수 있습니다.</small>
                </span>
                <span className="aw-socket-plate-cta">각인하기</span>
              </>
            )}
          </button>
        </section>

        <div className={`aw-repair ${recipe && missingDurability > 0 ? '' : 'is-idle'}`}>
          {!recipe ? (
            <span className="aw-repair-label">수리할 수 없는 곡괭이입니다</span>
          ) : missingDurability === 0 ? (
            <span className="aw-repair-label"><ArcaneGlyph name="check" />내구도가 가득 찼습니다</span>
          ) : isPointRepair ? (
            <>
              <span className="aw-repair-label">내구도 최대 {recipe.restoreAmount} 회복</span>
              <span className="aw-cost"><b>{recipe.pointCost}P</b></span>
            </>
          ) : (
            <>
              <span className="aw-repair-label">내구도 1당</span>
              {recipe.costs.map((cost) => {
                const owned = mineralQuantity(cost.oreId)
                return (
                  <span className={`aw-cost ${owned < cost.quantity ? 'is-short' : ''}`} key={cost.oreId}>
                    <span aria-hidden="true"><OreSprite oreId={cost.oreId} /></span>
                    {findOre(cost.oreId)?.name}
                    <b>×{cost.quantity}</b>
                    <em>보유 {owned.toLocaleString('ko-KR')}</em>
                  </span>
                )
              })}
            </>
          )}
        </div>

        <div className="aw-actions">
          <button type="button" className="aw-btn aw-btn--gold" onClick={() => onEquip(item.id)} disabled={actionBusy || item.equipped || item.durability <= 0}>
            {item.equipped ? '장착 중' : '장착'}
          </button>
          <button type="button" className="aw-btn" onClick={() => onRepair(item.id, 1)} disabled={actionBusy || !canRepair}>
            {isPointRepair ? `${recipe?.pointCost}P 수리 +1` : '수리 +1'}
          </button>
          <button type="button" className="aw-btn aw-btn--astral" onClick={() => onEnchant(item.id)} disabled={actionBusy || manaShort}>
            <span><ArcaneGlyph name="sigil" />마법 부여</span>
            <small className={manaShort ? 'is-short' : ''}>✦ {enchantManaCost} 소모 <i>보유 {mana.toLocaleString('ko-KR')}</i></small>
          </button>
        </div>
      </div>
    </Modal>
  )
}
