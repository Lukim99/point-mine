import { ENCHANT_MANA_COST, enchantDescription, findEnchantment, findOre, findPickaxe, isEnchanted, toRoman, type EnchantId, type OreId, type PickaxeInventoryItem } from '../game'
import { findRepairRecipe } from '../repair'
import { Durability } from './Durability'
import { Modal } from './Modal'
import { PickaxeSprite } from './PickaxeSprite'

interface PickaxeDetailModalProps {
  item: PickaxeInventoryItem
  mana: number
  actionBusy: boolean
  mineralQuantity: (oreId: OreId) => number
  onEquip: (id: string) => void
  onRepair: (id: string, amount: number) => void
  onEnchant: (id: string) => void
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

export function PickaxeDetailModal({ item, mana, actionBusy, mineralQuantity, onEquip, onRepair, onEnchant, onClose }: PickaxeDetailModalProps) {
  const definition = findPickaxe(item.id)
  const recipe = findRepairRecipe(item.id)
  const missingDurability = Math.max(0, item.maxDurability - item.durability)
  const isPointRepair = recipe?.pointCost !== undefined
  const materialLimit = recipe && !isPointRepair ? Math.min(...recipe.costs.map((cost) => Math.floor(mineralQuantity(cost.oreId) / cost.quantity))) : 0
  // 수리는 한 번에 내구도 1씩만 진행합니다.
  const canRepair = missingDurability > 0 && (isPointRepair ? true : materialLimit >= 1)
  const recipeText = isPointRepair ? `내구도 최대 ${recipe?.restoreAmount} 회복 | ${recipe?.pointCost}P` : recipe?.costs.map((cost) => `${findOre(cost.oreId)?.name} x${cost.quantity}`).join(' + ')
  const entries = enchantEntries(item.enchants)
  const statusLabel = item.durability <= 0 ? '파손됨' : item.equipped ? '장착 중' : '대기 중'

  return (
    <Modal title={definition?.name ?? item.id} onClose={onClose} labelledBy="pickaxe-detail-title">
      <div className="pickaxe-detail">
        <div className="pickaxe-detail-head">
          <PickaxeSprite pickaxeId={item.id} size="medium" enchanted={isEnchanted(item)} />
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

        <p className="repair-recipe detail-recipe">{!recipe ? '수리 불가' : missingDurability === 0 ? '최대 내구도' : isPointRepair ? recipeText : `내구도 1당 ${recipeText}`}</p>

        <div className="pickaxe-detail-actions">
          <button type="button" className="ore-button" onClick={() => onEquip(item.id)} disabled={actionBusy || item.equipped || item.durability <= 0}>장착</button>
          <button type="button" className="ore-button" onClick={() => onRepair(item.id, 1)} disabled={actionBusy || !canRepair}>{isPointRepair ? `${recipe?.pointCost}P 수리 +1` : '수리 +1'}</button>
          <button type="button" className="ore-button ore-button--enchant" onClick={() => onEnchant(item.id)} disabled={actionBusy || mana < ENCHANT_MANA_COST}><span>마법 부여</span><small className={mana < ENCHANT_MANA_COST ? 'is-short' : ''}>{mana.toLocaleString('ko-KR')} / {ENCHANT_MANA_COST}</small></button>
        </div>
      </div>
    </Modal>
  )
}
