import { abilityStoneEffectValue, abilityStoneOptionText, ENCHANT_MANA_COST, enchantDescription, findEnchantment, findOre, findPickaxe, hasEngravedAbilityStone, isEnchanted, toRoman, type AbilityStoneInventoryItem, type EnchantId, type OreId, type PickaxeInventoryItem } from '../game'
import { findRepairRecipe } from '../repair'
import { AbilityStoneSprite } from './AbilityStoneSprite'
import { Durability } from './Durability'
import { Modal } from './Modal'
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
  const recipeText = isPointRepair ? `내구도 최대 ${recipe?.restoreAmount} 회복 | ${recipe?.pointCost}P` : recipe?.costs.map((cost) => `${findOre(cost.oreId)?.name} x${cost.quantity}`).join(' + ')
  const entries = enchantEntries(item.enchants)
  const enchantManaCost = Math.max(1, ENCHANT_MANA_COST + abilityStoneEffectValue(abilityStone, 'enchant_mana_cost'))
  const statusLabel = item.durability <= 0 ? '파손됨' : item.equipped ? '장착 중' : '대기 중'

  return (
    <Modal title={definition?.name ?? item.id} onClose={onClose} labelledBy="pickaxe-detail-title">
      <div className="pickaxe-detail">
        <div className="pickaxe-detail-head">
          <PickaxeSprite pickaxeId={item.id} size="medium" enchanted={isEnchanted(item) || hasEngravedAbilityStone(item)} />
          <div className="pickaxe-detail-meta">
            <span className={`pickaxe-detail-status ${item.equipped ? 'is-equipped' : ''}`}>{statusLabel}</span>
            <small>내구도 {item.durability} / {item.maxDurability}</small>
            <Durability item={item} />
          </div>
        </div>

        <div className="pickaxe-detail-stat"><span>공격력</span><strong>{definition?.attack ?? 0}</strong></div>

        <div className="pickaxe-detail-section">
          <p className="inventory-label">부여된 마법</p>
          {entries.length > 0 ? (
            <ul className="enchant-detail-list">
              {entries.map((entry) => (
                <li className={`enchant-detail enchant-detail--${entry.def.sign}`} key={entry.id}>
                  <div className="enchant-detail-title">
                    <span className="enchant-dot" aria-hidden="true" />
                    <strong>{entry.def.name}{entry.def.maxLevel > 1 ? ` ${toRoman(entry.level)}` : ''}</strong>
                  </div>
                  <small>{enchantDescription(entry.id, entry.level)}</small>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-inventory">부여된 마법이 없습니다. 마나로 마법을 부여해 보세요.</p>
          )}
        </div>

        <div className="pickaxe-detail-section">
          <p className="inventory-label">각인된 어빌리티 스톤</p>
          <button type="button" className={`engraved-stone-button ${abilityStone ? 'has-stone' : ''}`} onClick={() => onOpenAbilityStone(item.id)} disabled={actionBusy}>
            {abilityStone ? (
              <>
                <AbilityStoneSprite variant={abilityStone.variant} size="medium" />
                <span className="engraved-stone-summary">
                  {abilityStone.options
                    .slice()
                    .sort((a, b) => (a.sign === b.sign ? 0 : a.sign === 'positive' ? -1 : 1))
                    .map((option) => (
                      <span className={`engraved-stone-option is-${option.sign}`} key={option.id}>
                        <span className="enchant-dot" aria-hidden="true" />
                        <strong>{abilityStoneOptionText(option)}</strong>
                      </span>
                    ))}
                </span>
                <span className="engraved-stone-cta">상세 보기</span>
              </>
            ) : (
              <>
                <span className="engraved-stone-empty-icon" aria-hidden="true">◆</span>
                <span className="engraved-stone-summary">
                  <strong>각인된 어빌리티 스톤이 없습니다.</strong>
                  <small>보유 스톤에서 선택</small>
                </span>
                <span className="engraved-stone-cta">각인</span>
              </>
            )}
          </button>
        </div>

        <p className="repair-recipe detail-recipe">{!recipe ? '수리 불가' : missingDurability === 0 ? '최대 내구도' : isPointRepair ? recipeText : `내구도 1당 ${recipeText}`}</p>

        <div className="pickaxe-detail-actions">
          <button type="button" className="ore-button" onClick={() => onEquip(item.id)} disabled={actionBusy || item.equipped || item.durability <= 0}>장착</button>
          <button type="button" className="ore-button" onClick={() => onRepair(item.id, 1)} disabled={actionBusy || !canRepair}>{isPointRepair ? `${recipe?.pointCost}P 수리 +1` : '수리 +1'}</button>
          <button type="button" className="ore-button ore-button--enchant" onClick={() => onEnchant(item.id)} disabled={actionBusy || mana < enchantManaCost}><span>마법 부여</span><small className={mana < enchantManaCost ? 'is-short' : ''}>{mana.toLocaleString('ko-KR')} / {enchantManaCost}</small></button>
        </div>
      </div>
    </Modal>
  )
}
