import { useState } from 'react'
import { findOre, findPickaxe, type InventoryItem, type MineralInventoryItem, type OreId, type PickaxeInventoryItem } from '../game'
import { findRepairRecipe } from '../repair'
import '../InventoryControls.css'
import { Durability } from './Durability'
import { OreSprite } from './OreSprite'
import { PickaxeSprite } from './PickaxeSprite'

interface InventoryPanelProps { inventory: InventoryItem[]; actionBusy: boolean; onEquip: (id: string) => void; onSell: (oreIds: OreId[]) => void; onRepair: (id: string, amount: number) => void; compact?: boolean }

export function InventoryPanel({ inventory, actionBusy, onEquip, onSell, onRepair, compact = false }: InventoryPanelProps) {
  const [selectedOreIds, setSelectedOreIds] = useState<OreId[]>([])
  const pickaxes = inventory.filter((item): item is PickaxeInventoryItem => item.type === 'pickaxe')
  const minerals = inventory.filter((item): item is MineralInventoryItem => item.type === 'mineral')
  const selectedMinerals = minerals.filter((item) => selectedOreIds.includes(item.id))
  const selectedValue = selectedMinerals.reduce((total, item) => total + (findOre(item.id)?.points ?? 0) * item.quantity, 0)
  const allSelected = minerals.length > 0 && selectedMinerals.length === minerals.length
  const mineralQuantity = (oreId: OreId) => minerals.find((item) => item.id === oreId)?.quantity ?? 0
  const toggleOre = (oreId: OreId) => setSelectedOreIds((current) => current.includes(oreId) ? current.filter((id) => id !== oreId) : [...current, oreId])
  const toggleAll = () => setSelectedOreIds(allSelected ? [] : minerals.map((item) => item.id))
  const sellSelected = () => { if (selectedValue < 10) return; onSell(selectedOreIds); setSelectedOreIds([]) }

  return <div className={`inventory-content ${compact ? 'inventory-content--compact' : ''}`}>
    <div className="panel-heading"><div><span className="section-kicker">보관함</span><h2>인벤토리</h2></div><span className="slot-count">{inventory.length}칸</span></div>
    <div className="inventory-scroll">
      <p className="inventory-label">곡괭이</p>
      <div className="pickaxe-list">{pickaxes.map((item) => {
        const definition = findPickaxe(item.id)
        const recipe = findRepairRecipe(item.id)
        const missingDurability = Math.max(0, item.maxDurability - item.durability)
        const isPointRepair = recipe?.pointCost !== undefined
        const materialLimit = recipe && !isPointRepair ? Math.min(...recipe.costs.map((cost) => Math.floor(mineralQuantity(cost.oreId) / cost.quantity))) : 0
        const repairAmount = isPointRepair ? Math.min(missingDurability, recipe?.restoreAmount ?? 0) : Math.min(missingDurability, materialLimit)
        const recipeText = isPointRepair ? `내구도 최대 ${recipe?.restoreAmount} 회복 · ${recipe?.pointCost}P` : recipe?.costs.map((cost) => `${findOre(cost.oreId)?.name} ×${cost.quantity}`).join(' + ')
        return <div className={`pickaxe-item ${item.equipped ? 'is-equipped' : ''}`} key={item.id}>
          <PickaxeSprite pickaxeId={item.id} size="small" />
          <span className="pickaxe-meta"><strong>{definition?.name ?? item.id}</strong><span>{item.durability <= 0 ? '파손됨' : item.equipped ? '장착 중' : '대기 중'}</span><Durability item={item} />
            <small className="repair-recipe">{!recipe ? '수리 불가' : missingDurability === 0 ? '최대 내구도' : isPointRepair ? recipeText : `내구도 1당 ${recipeText}`}</small>
            <span className="pickaxe-actions"><button type="button" onClick={() => onEquip(item.id)} disabled={actionBusy || item.equipped || item.durability <= 0}>장착</button><button type="button" onClick={() => onRepair(item.id, repairAmount)} disabled={actionBusy || repairAmount <= 0}>{isPointRepair ? `${recipe?.pointCost}P 수리 +${repairAmount}` : `수리 +${repairAmount}`}</button></span>
          </span>
        </div>
      })}</div>
      <div className="inventory-selection-row"><p className="inventory-label mineral-label">광물 선택</p><button className="inventory-select-button" type="button" onClick={toggleAll} disabled={minerals.length === 0}>{allSelected ? '선택 해제' : '전체 선택'}</button></div>
      {minerals.length > 0 ? <div className="mineral-grid">{minerals.map((item) => { const ore = findOre(item.id); const selected = selectedOreIds.includes(item.id); return <button className={`mineral-item mineral--${item.id} ${selected ? 'is-selected' : ''}`} key={item.id} type="button" aria-pressed={selected} title={`${ore?.points ?? 0}P`} onClick={() => toggleOre(item.id)}><OreSprite oreId={item.id} /><span><strong>{ore?.name ?? item.id}</strong><small>× {item.quantity}</small></span></button> })}</div> : <p className="empty-inventory">아직 채굴한 광물이 없습니다.</p>}
    </div>
    <button className="ore-button sell-button" type="button" onClick={sellSelected} disabled={actionBusy || selectedValue < 10}><span>{selectedValue > 0 && selectedValue < 10 ? '최소 10P 필요' : '선택 광물 판매'}</span><strong>{selectedValue.toLocaleString('ko-KR')} P</strong></button>
  </div>
}
