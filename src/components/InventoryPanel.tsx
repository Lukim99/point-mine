import { useState } from 'react'
import { abilityStoneFacetProgress, abilityStoneOptionSuccesses, abilityStoneTitle, findMonsterItem, findOre, findPickaxe, hasEngravedAbilityStone, isAbilityStoneFaceted, isEnchanted, type AbilityStoneInventoryItem, type FacetAbilityStoneResult, type InventoryItem, type MineralInventoryItem, type MonsterItemInventoryItem, type MonsterItemId, type OreId, type PickaxeInventoryItem } from '../game'
import '../InventoryControls.css'
import { AbilityStoneDetailModal } from './AbilityStoneDetailModal'
import { AbilityStoneEngraveListModal } from './AbilityStoneEngraveListModal'
import { AbilityStoneSprite } from './AbilityStoneSprite'
import { Durability } from './Durability'
import { OreSprite } from './OreSprite'
import { PickaxeSprite } from './PickaxeSprite'
import { PickaxeDetailModal } from './PickaxeDetailModal'
import { MonsterItemSprite } from './MonsterItemSprite'

interface InventoryPanelProps { inventory: InventoryItem[]; mana: number; actionBusy: boolean; onEquip: (id: string) => void; onSell: (oreIds: OreId[]) => void; onRepair: (id: string, amount: number) => void; onSellMonsterItems: (itemIds: MonsterItemId[]) => void; onEnchant: (id: string) => void; onFacetAbilityStone: (stoneUid: string, optionIndex: number) => Promise<FacetAbilityStoneResult | null>; onEngraveAbilityStone: (stoneUid: string, pickaxeId: string) => void; onDismantleAbilityStone: (stoneUid: string) => void; compact?: boolean }

export function InventoryPanel({ inventory, mana, actionBusy, onEquip, onSell, onRepair, onSellMonsterItems, onEnchant, onFacetAbilityStone, onEngraveAbilityStone, onDismantleAbilityStone, compact = false }: InventoryPanelProps) {
  const [selectedOreIds, setSelectedOreIds] = useState<OreId[]>([])
  const [selectedItemIds, setSelectedItemIds] = useState<MonsterItemId[]>([])
  const [detailPickaxeId, setDetailPickaxeId] = useState<string | null>(null)
  const [detailStoneUid, setDetailStoneUid] = useState<string | null>(null)
  const [engraveContextPickaxeId, setEngraveContextPickaxeId] = useState<string | null>(null)
  const [stoneListPickaxeId, setStoneListPickaxeId] = useState<string | null>(null)
  const pickaxes = inventory
    .filter((item): item is PickaxeInventoryItem => item.type === 'pickaxe')
    .sort((a, b) => (findPickaxe(a.id)?.rank ?? 0) - (findPickaxe(b.id)?.rank ?? 0))
  const minerals = inventory.filter((item): item is MineralInventoryItem => item.type === 'mineral')
  const monsterItems = inventory.filter((item): item is MonsterItemInventoryItem => item.type === 'monster_item')
  const abilityStones = inventory.filter((item): item is AbilityStoneInventoryItem => item.type === 'ability_stone')
  const selectedMinerals = minerals.filter((item) => selectedOreIds.includes(item.id))
  const selectedValue = selectedMinerals.reduce((total, item) => total + (item.unitPoints ?? findOre(item.id)?.points ?? 0) * item.quantity, 0)
  const allSelected = minerals.length > 0 && selectedMinerals.length === minerals.length
  const selectedManaItems = monsterItems.filter((item) => selectedItemIds.includes(item.id))
  const selectedMana = selectedManaItems.reduce((total, item) => total + (findMonsterItem(item.id)?.mana ?? 0) * item.quantity, 0)
  const allItemsSelected = monsterItems.length > 0 && selectedManaItems.length === monsterItems.length
  const mineralQuantity = (oreId: OreId) => minerals.reduce((total, item) => item.id === oreId ? total + item.quantity : total, 0)
  const detailPickaxe = pickaxes.find((item) => item.id === detailPickaxeId) ?? null
  const detailPickaxeStone = detailPickaxe?.abilityStoneUid ? abilityStones.find((stone) => stone.uid === detailPickaxe.abilityStoneUid) ?? null : null
  const detailStone = abilityStones.find((item) => item.uid === detailStoneUid) ?? null
  const detailStoneAttachedPickaxe = detailStone ? pickaxes.find((pickaxe) => pickaxe.abilityStoneUid === detailStone.uid) ?? null : null
  const engraveContextPickaxe = engraveContextPickaxeId ? pickaxes.find((pickaxe) => pickaxe.id === engraveContextPickaxeId) ?? null : null
  const stoneListPickaxe = stoneListPickaxeId ? pickaxes.find((pickaxe) => pickaxe.id === stoneListPickaxeId) ?? null : null
  const toggleOre = (oreId: OreId) => setSelectedOreIds((current) => current.includes(oreId) ? current.filter((id) => id !== oreId) : [...current, oreId])
  const toggleAll = () => setSelectedOreIds(allSelected ? [] : Array.from(new Set(minerals.map((item) => item.id))))
  const sellSelected = () => { if (selectedValue < 10) return; onSell(selectedOreIds); setSelectedOreIds([]) }
  const toggleItem = (itemId: MonsterItemId) => setSelectedItemIds((current) => current.includes(itemId) ? current.filter((id) => id !== itemId) : [...current, itemId])
  const toggleAllItems = () => setSelectedItemIds(allItemsSelected ? [] : Array.from(new Set(monsterItems.map((item) => item.id))))
  const sellMonsterItems = () => { if (selectedMana <= 0) return; onSellMonsterItems(selectedItemIds); setSelectedItemIds([]) }
  const openStoneFromInventory = (stoneUid: string) => {
    setEngraveContextPickaxeId(null)
    setDetailStoneUid(stoneUid)
  }
  const openAbilityStoneFromPickaxe = (pickaxeId: string) => {
    const pickaxe = pickaxes.find((item) => item.id === pickaxeId)
    if (!pickaxe) return
    setDetailPickaxeId(null)
    if (pickaxe.abilityStoneUid && abilityStones.some((stone) => stone.uid === pickaxe.abilityStoneUid)) {
      setEngraveContextPickaxeId(pickaxe.id)
      setDetailStoneUid(pickaxe.abilityStoneUid)
      return
    }
    setEngraveContextPickaxeId(null)
    setStoneListPickaxeId(pickaxe.id)
  }
  const openEngraveListFromStoneDetail = () => {
    if (!engraveContextPickaxeId) return
    setDetailStoneUid(null)
    setEngraveContextPickaxeId(null)
    setStoneListPickaxeId(engraveContextPickaxeId)
  }
  const closeStoneDetail = () => {
    setDetailStoneUid(null)
    setEngraveContextPickaxeId(null)
  }
  const selectAbilityStoneForPickaxe = (stoneUid: string, pickaxeId: string) => {
    onEngraveAbilityStone(stoneUid, pickaxeId)
    setStoneListPickaxeId(null)
  }
  const stoneTargetLabel = (stoneUid: string) => {
    const target = pickaxes.find((pickaxe) => pickaxe.abilityStoneUid === stoneUid)
    return target ? `${findPickaxe(target.id)?.name ?? target.id} 각인 중` : '미각인'
  }

  return <div className={`inventory-content ${compact ? 'inventory-content--compact' : ''}`}>
    <div className="panel-heading"><div><span className="section-kicker">보관함</span><h2>인벤토리</h2></div><span className="slot-count">{inventory.length}칸</span></div>
    <div className="inventory-scroll">
      <p className="inventory-label">곡괭이 <small className="inventory-hint">(클릭하여 상세 보기)</small></p>
      <div className="pickaxe-list">{pickaxes.map((item) => {
        const definition = findPickaxe(item.id)
        const enchanted = isEnchanted(item) || hasEngravedAbilityStone(item)
        return <button className={`pickaxe-item pickaxe-item--button ${item.equipped ? 'is-equipped' : ''} ${enchanted ? 'is-enchanted' : ''}`} key={item.id} type="button" onClick={() => setDetailPickaxeId(item.id)}>
          <PickaxeSprite pickaxeId={item.id} size="small" enchanted={enchanted} />
          <span className="pickaxe-meta"><strong>{definition?.name ?? item.id}</strong><span>{item.durability <= 0 ? '파손됨' : item.equipped ? '장착 중' : '대기 중'}{isEnchanted(item) ? ' · 마법 부여' : ''}{hasEngravedAbilityStone(item) ? ' · 스톤 각인' : ''}</span><Durability item={item} /></span>
        </button>
      })}</div>
      <div className="inventory-selection-row"><p className="inventory-label mineral-label">어빌리티 스톤</p></div>
      {abilityStones.length > 0 ? <div className="ability-stone-list">{abilityStones.map((stone) => {
        const progress = abilityStoneFacetProgress(stone)
        const scores = stone.options.map(abilityStoneOptionSuccesses)
        return <button className="ability-stone-item" key={stone.uid} type="button" onClick={() => openStoneFromInventory(stone.uid)}>
          <AbilityStoneSprite variant={stone.variant} size="small" />
          <span className="ability-stone-meta">
            <strong>{abilityStoneTitle(stone)}</strong>
            <small>{stoneTargetLabel(stone.uid)}</small>
            <em>{isAbilityStoneFaceted(stone) ? `세공 완료 · ${scores.join(' / ')}` : `세공 진행 ${progress} / 30`}</em>
            <span className="ability-stone-mini-progress"><i style={{ width: `${(progress / 30) * 100}%` }} /></span>
          </span>
        </button>
      })}</div> : <p className="empty-inventory">보유한 어빌리티 스톤이 없습니다.</p>}
      <div className="inventory-selection-row"><p className="inventory-label mineral-label">광물 선택</p><button className="inventory-select-button" type="button" onClick={toggleAll} disabled={minerals.length === 0}>{allSelected ? '선택 해제' : '전체 선택'}</button></div>
      {minerals.length > 0 ? <div className="mineral-grid">{minerals.map((item, index) => { const ore = findOre(item.id); const selected = selectedOreIds.includes(item.id); const unitPoints = item.unitPoints ?? ore?.points ?? 0; return <button className={`mineral-item mineral--${item.id} ${selected ? 'is-selected' : ''}`} key={`${item.id}-${unitPoints}-${index}`} type="button" aria-pressed={selected} title={`${unitPoints}P`} onClick={() => toggleOre(item.id)}><OreSprite oreId={item.id} /><span><strong>{ore?.name ?? item.id}</strong><small>× {item.quantity} · {unitPoints}P</small></span></button> })}</div> : <p className="empty-inventory">아직 채굴한 광물이 없습니다.</p>}
      <div className="inventory-selection-row"><p className="inventory-label mineral-label">몬스터 아이템</p><button className="inventory-select-button" type="button" onClick={toggleAllItems} disabled={monsterItems.length === 0}>{allItemsSelected ? '선택 해제' : '전체 선택'}</button></div>
      {monsterItems.length > 0 ? <div className="mineral-grid">{monsterItems.map((item) => { const def = findMonsterItem(item.id); const selected = selectedItemIds.includes(item.id); return <button className={`mineral-item monster-item--${item.id} ${selected ? 'is-selected' : ''}`} key={item.id} type="button" aria-pressed={selected} title={`마나 ${def?.mana ?? 0}`} onClick={() => toggleItem(item.id)}><MonsterItemSprite itemId={item.id} /><span><strong>{def?.name ?? item.id}</strong><small>× {item.quantity}</small></span></button> })}</div> : <p className="empty-inventory">사냥으로 얻은 아이템이 없습니다.</p>}
    </div>
    <button className="ore-button sell-button" type="button" onClick={sellSelected} disabled={actionBusy || selectedValue < 10}><span>{selectedValue > 0 && selectedValue < 10 ? '최소 10P 필요' : '선택 광물 판매'}</span><strong>{selectedValue.toLocaleString('ko-KR')} P</strong></button>
    <button className="ore-button sell-button mana-sell-button" type="button" onClick={sellMonsterItems} disabled={actionBusy || selectedMana <= 0}><span>선택 아이템 분해</span><strong>{selectedMana.toLocaleString('ko-KR')} ✦</strong></button>
    {detailPickaxe && <PickaxeDetailModal item={detailPickaxe} abilityStone={detailPickaxeStone} mana={mana} actionBusy={actionBusy} mineralQuantity={mineralQuantity} onEquip={onEquip} onRepair={onRepair} onEnchant={onEnchant} onOpenAbilityStone={openAbilityStoneFromPickaxe} onClose={() => setDetailPickaxeId(null)} />}
    {detailStone && <AbilityStoneDetailModal stone={detailStone} attachedPickaxe={detailStoneAttachedPickaxe} engraveTargetPickaxe={engraveContextPickaxe} actionBusy={actionBusy} onFacet={onFacetAbilityStone} onOpenEngraveList={openEngraveListFromStoneDetail} onDismantle={onDismantleAbilityStone} onClose={closeStoneDetail} />}
    {stoneListPickaxe && <AbilityStoneEngraveListModal pickaxe={stoneListPickaxe} abilityStones={abilityStones} actionBusy={actionBusy} onSelect={selectAbilityStoneForPickaxe} onClose={() => setStoneListPickaxeId(null)} />}
  </div>
}
