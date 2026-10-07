import { useId, useState } from 'react'
import { ABILITY_STONE_FACET_ATTEMPTS, abilityStoneFacetProgress, abilityStoneTitle, findAbilityStoneOption, findMonsterItem, findOre, findPickaxe, hasEngravedAbilityStone, isAbilityStoneFaceted, isEnchanted, type AbilityStoneInventoryItem, type FacetAbilityStoneResult, type InventoryItem, type MineralInventoryItem, type MonsterItemInventoryItem, type MonsterItemId, type OreId, type PickaxeInventoryItem } from '../game'
import '../InventoryControls.css'
import '../ArcaneWorkshop.css'
import { AbilityStoneDetailModal } from './AbilityStoneDetailModal'
import { AbilityStoneEngraveListModal } from './AbilityStoneEngraveListModal'
import { ArcaneGlyph, StoneInlay, StoneScore, StoneSocket } from './ArcaneParts'
import { Durability } from './Durability'
import { OreSprite } from './OreSprite'
import { PickaxeSprite } from './PickaxeSprite'
import { PickaxeDetailModal } from './PickaxeDetailModal'
import { MonsterItemSprite } from './MonsterItemSprite'

interface InventoryPanelProps { inventory: InventoryItem[]; mana: number; actionBusy: boolean; onEquip: (id: string) => void; onSell: (oreIds: OreId[]) => void; onRepair: (id: string, amount: number) => void; onSellMonsterItems: (itemIds: MonsterItemId[]) => void; onEnchant: (id: string) => void; onFacetAbilityStone: (stoneUid: string, optionIndex: number) => Promise<FacetAbilityStoneResult | null>; onEngraveAbilityStone: (stoneUid: string, pickaxeId: string) => void; onDismantleAbilityStone: (stoneUid: string) => void; compact?: boolean }

// 광물 기본 가치로 희귀도 단계를 정해 타일의 광채 세기를 달리합니다.
const oreRarity = (points: number) => points >= 1000 ? 'legendary' : points >= 150 ? 'epic' : points >= 25 ? 'rare' : points >= 10 ? 'uncommon' : 'common'

const STONE_FILTERS = [{ id: 'all', label: '전체' }, { id: 'cutting', label: '세공' }, { id: 'ready', label: '대기' }, { id: 'set', label: '각인' }] as const
type StoneFilter = typeof STONE_FILTERS[number]['id']

// 장비 카드: 장착·파손은 꼬리표, 마법 부여와 스톤 각인은 각자의 빛깔을 가진 표식으로 구분합니다.
function GearCard({ item, stone, onOpen }: { item: PickaxeInventoryItem; stone: AbilityStoneInventoryItem | null; onOpen: (id: string) => void }) {
  const definition = findPickaxe(item.id)
  const enchanted = isEnchanted(item)
  const engraved = hasEngravedAbilityStone(item)
  const broken = item.durability <= 0

  return (
    <button className={`aw-gear ${item.equipped ? 'is-equipped' : ''} ${broken ? 'is-broken' : ''} ${enchanted ? 'is-enchanted' : ''} ${engraved ? 'is-engraved' : ''}`} type="button" onClick={() => onOpen(item.id)}>
      <span className="aw-gear-socket" aria-hidden="true">
        {enchanted && <span className="aw-orbit" />}
        <PickaxeSprite pickaxeId={item.id} size="small" enchanted={enchanted || engraved} />
        {engraved && <StoneInlay stone={stone} />}
      </span>
      <span className="aw-gear-body">
        <span className="aw-gear-title">
          <strong>{definition?.name ?? item.id}</strong>
          {item.equipped && <span className="aw-tag aw-tag--equip"><ArcaneGlyph name="equip" />장착</span>}
          {broken && <span className="aw-tag aw-tag--broken"><ArcaneGlyph name="crack" />파손</span>}
        </span>
        {(enchanted || engraved) && (
          <span className="aw-gear-marks">
            {enchanted && (
              <span className="aw-mark aw-mark--enchant">
                <ArcaneGlyph name="sigil" />마법
              </span>
            )}
            {engraved && (
              <span className="aw-mark aw-mark--stone">
                <ArcaneGlyph name="gem" />
                {stone ? <><span className="aw-sr-only">스톤 각인</span><StoneScore stone={stone} size="sm" /></> : '스톤 각인'}
              </span>
            )}
          </span>
        )}
        <span className="aw-gear-durability">
          <Durability item={item} />
          <small><span className="aw-sr-only">내구도 </span><b>{item.durability}</b>/{item.maxDurability}</small>
        </span>
      </span>
    </button>
  )
}

// 작은 슬롯에는 점수와 상태만 남기고, 전체 옵션은 툴팁과 상세 화면에서 확인합니다.
function StoneCard({ stone, host, onOpen }: { stone: AbilityStoneInventoryItem; host: PickaxeInventoryItem | null; onOpen: (uid: string) => void }) {
  const faceted = isAbilityStoneFaceted(stone)
  const progress = abilityStoneFacetProgress(stone)
  const total = stone.options.length * ABILITY_STONE_FACET_ATTEMPTS
  const hostName = host ? findPickaxe(host.id)?.name ?? host.id : null
  const stateLabel = hostName ? `${hostName}에 각인` : faceted ? '각인 대기' : progress === 0 ? '미세공' : `세공 중 ${progress}/${total}`
  const label = `${abilityStoneTitle(stone)} ${stateLabel}`
  const tooltip = [label, ...stone.options.map((option) => findAbilityStoneOption(option.id)?.name ?? option.name ?? option.id)].join('\n')

  return (
    <button className={`aw-stone-card ${faceted ? 'is-cut' : progress === 0 ? 'is-raw' : 'is-cutting'} ${host ? 'is-set' : ''}`} type="button" title={tooltip} aria-label={label} onClick={() => onOpen(stone.uid)}>
      <StoneSocket stone={stone} hostPickaxeId={host?.id} />
      <span className="aw-stone-body">
        <span className="aw-stone-title">
          {progress > 0 ? <StoneScore stone={stone} size="sm" /> : <strong className="aw-stone-name">원석</strong>}
        </span>
        <span className={`aw-stone-foot ${host ? 'is-set' : ''}`}>
          {hostName ?? (faceted ? '각인 대기' : progress === 0 ? '미세공' : <>세공 <b>{progress}</b>/{total}</>)}
        </span>
      </span>
    </button>
  )
}

export function InventoryPanel({ inventory, mana, actionBusy, onEquip, onSell, onRepair, onSellMonsterItems, onEnchant, onFacetAbilityStone, onEngraveAbilityStone, onDismantleAbilityStone, compact = false }: InventoryPanelProps) {
  const headingId = useId()
  const [selectedOreIds, setSelectedOreIds] = useState<OreId[]>([])
  const [selectedItemIds, setSelectedItemIds] = useState<MonsterItemId[]>([])
  const [detailPickaxeId, setDetailPickaxeId] = useState<string | null>(null)
  const [detailStoneUid, setDetailStoneUid] = useState<string | null>(null)
  const [engraveContextPickaxeId, setEngraveContextPickaxeId] = useState<string | null>(null)
  const [stoneListPickaxeId, setStoneListPickaxeId] = useState<string | null>(null)
  const [stoneFilter, setStoneFilter] = useState<StoneFilter>('all')
  const pickaxes = inventory
    .filter((item): item is PickaxeInventoryItem => item.type === 'pickaxe')
    .sort((a, b) => (findPickaxe(a.id)?.rank ?? 0) - (findPickaxe(b.id)?.rank ?? 0))
  const minerals = inventory.filter((item): item is MineralInventoryItem => item.type === 'mineral')
  const monsterItems = inventory.filter((item): item is MonsterItemInventoryItem => item.type === 'monster_item')
  const abilityStones = inventory.filter((item): item is AbilityStoneInventoryItem => item.type === 'ability_stone')
  const stoneEntries = abilityStones.map((stone) => {
    const host = pickaxes.find((pickaxe) => pickaxe.abilityStoneUid === stone.uid) ?? null
    const category: Exclude<StoneFilter, 'all'> = host ? 'set' : isAbilityStoneFaceted(stone) ? 'ready' : 'cutting'
    return { stone, host, category }
  })
  const visibleStones = stoneEntries.filter((entry) => stoneFilter === 'all' || entry.category === stoneFilter)
  const stoneCounts = { all: abilityStones.length, cutting: 0, ready: 0, set: 0 }
  stoneEntries.forEach((entry) => { stoneCounts[entry.category] += 1 })
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
  const findStone = (stoneUid?: string) => stoneUid ? abilityStones.find((stone) => stone.uid === stoneUid) ?? null : null

  return <div className={`inventory-content aw-inventory ${compact ? 'inventory-content--compact' : ''}`}>
    <div className="panel-heading"><div><span className="section-kicker">보관함</span><h2>인벤토리</h2></div><span className="slot-count">{inventory.length}칸</span></div>
    <div className="inventory-scroll">
      <section className="aw-shelf" aria-labelledby={`${headingId}-gear`}>
        <header className="aw-shelf-head">
          <h3 id={`${headingId}-gear`}>곡괭이</h3><span className="aw-count">{pickaxes.length}</span>
          <span className="aw-rule" aria-hidden="true" /><span className="aw-shelf-hint">눌러서 상세</span>
        </header>
        {pickaxes.length > 0
          ? <div className="aw-gear-list">{pickaxes.map((item) => <GearCard key={item.id} item={item} stone={findStone(item.abilityStoneUid)} onOpen={setDetailPickaxeId} />)}</div>
          : <p className="aw-empty">보유한 곡괭이가 없습니다.</p>}
      </section>

      <section className="aw-shelf" aria-labelledby={`${headingId}-stone`}>
        <header className="aw-shelf-head aw-shelf-head--vein">
          <h3 id={`${headingId}-stone`}>어빌리티 스톤</h3><span className="aw-count">{abilityStones.length}</span>
          <span className="aw-rule" aria-hidden="true" />
        </header>
        {abilityStones.length > 0 ? <>
          <div className="aw-stone-filters" role="group" aria-label="스톤 분류">
            {STONE_FILTERS.map((filter) => <button key={filter.id} type="button" aria-pressed={stoneFilter === filter.id} onClick={() => setStoneFilter(filter.id)}>{filter.label}<span>{stoneCounts[filter.id]}</span></button>)}
          </div>
          {visibleStones.length > 0
            ? <div className="aw-stone-list">{visibleStones.map(({ stone, host }) => <StoneCard key={stone.uid} stone={stone} host={host} onOpen={openStoneFromInventory} />)}</div>
            : <p className="aw-empty">이 상태의 스톤이 없습니다.</p>}
        </> : <p className="aw-empty">보유한 어빌리티 스톤이 없습니다.</p>}
      </section>

      <section className="aw-shelf" aria-labelledby={`${headingId}-ore`}>
        <header className="aw-shelf-head">
          <h3 id={`${headingId}-ore`}>광물</h3><span className="aw-count">{minerals.length}</span>
          <span className="aw-rule" aria-hidden="true" />
          <button className="aw-select-all" type="button" onClick={toggleAll} disabled={minerals.length === 0}>{allSelected ? '선택 해제' : '전체 선택'}</button>
        </header>
        {minerals.length > 0 ? <div className="aw-ore-grid">{minerals.map((item, index) => {
          const ore = findOre(item.id)
          const selected = selectedOreIds.includes(item.id)
          const basePoints = ore?.points ?? 0
          const unitPoints = item.unitPoints ?? basePoints
          const priceShift = unitPoints > basePoints ? 'is-boosted' : unitPoints < basePoints ? 'is-reduced' : ''
          return <button className={`aw-ore aw-tint--${item.id} aw-rarity--${oreRarity(basePoints)} ${selected ? 'is-selected' : ''}`} key={`${item.id}-${unitPoints}-${index}`} type="button" aria-pressed={selected} title={`${ore?.name ?? item.id} ${item.quantity}개, 개당 ${unitPoints}P`} onClick={() => toggleOre(item.id)}>
            <span className="aw-ore-art">
              <span aria-hidden="true"><OreSprite oreId={item.id} /></span>
              <span className="aw-stack"><small aria-hidden="true">×</small>{item.quantity.toLocaleString('ko-KR')}<span className="aw-sr-only">개</span></span>
            </span>
            <strong className="aw-ore-name">{ore?.name ?? item.id}</strong>
            <span className={`aw-price ${priceShift}`}><small>개당</small>{unitPoints.toLocaleString('ko-KR')}<i>P</i>{priceShift && <span className="aw-sr-only">{priceShift === 'is-boosted' ? '(스톤 효과로 가치 상승)' : '(스톤 효과로 가치 하락)'}</span>}</span>
            <span className="aw-check" aria-hidden="true"><ArcaneGlyph name="check" /></span>
          </button>
        })}</div> : <p className="aw-empty">아직 채굴한 광물이 없습니다.</p>}
      </section>

      <section className="aw-shelf" aria-labelledby={`${headingId}-loot`}>
        <header className="aw-shelf-head">
          <h3 id={`${headingId}-loot`}>몬스터 아이템</h3><span className="aw-count">{monsterItems.length}</span>
          <span className="aw-rule" aria-hidden="true" />
          <button className="aw-select-all" type="button" onClick={toggleAllItems} disabled={monsterItems.length === 0}>{allItemsSelected ? '선택 해제' : '전체 선택'}</button>
        </header>
        {monsterItems.length > 0 ? <div className="aw-ore-grid">{monsterItems.map((item) => {
          const definition = findMonsterItem(item.id)
          const selected = selectedItemIds.includes(item.id)
          return <button className={`aw-ore aw-ore--loot aw-tint--${item.id} ${selected ? 'is-selected' : ''}`} key={item.id} type="button" aria-pressed={selected} title={`${definition?.name ?? item.id} ${item.quantity}개, 개당 마나 ${definition?.mana ?? 0}`} onClick={() => toggleItem(item.id)}>
            <span className="aw-ore-art">
              <span aria-hidden="true"><MonsterItemSprite itemId={item.id} /></span>
              <span className="aw-stack"><small aria-hidden="true">×</small>{item.quantity.toLocaleString('ko-KR')}<span className="aw-sr-only">개</span></span>
            </span>
            <strong className="aw-ore-name">{definition?.name ?? item.id}</strong>
            <span className="aw-price aw-price--mana"><small>개당</small>{definition?.mana ?? 0}<i>✦</i><span className="aw-sr-only">마나</span></span>
            <span className="aw-check" aria-hidden="true"><ArcaneGlyph name="check" /></span>
          </button>
        })}</div> : <p className="aw-empty">사냥으로 얻은 아이템이 없습니다.</p>}
      </section>
    </div>
    <div className="aw-dock">
      <button className="aw-dock-button aw-dock-button--points" type="button" onClick={sellSelected} disabled={actionBusy || selectedValue < 10}>
        <span>{selectedValue > 0 && selectedValue < 10 ? '최소 10P 필요' : '광물 판매'}</span>
        <strong>{selectedValue.toLocaleString('ko-KR')}<small>P</small></strong>
      </button>
      <button className="aw-dock-button aw-dock-button--mana" type="button" onClick={sellMonsterItems} disabled={actionBusy || selectedMana <= 0}>
        <span>아이템 분해</span>
        <strong>{selectedMana.toLocaleString('ko-KR')}<small>✦</small></strong>
      </button>
    </div>
    {detailPickaxe && <PickaxeDetailModal item={detailPickaxe} abilityStone={detailPickaxeStone} mana={mana} actionBusy={actionBusy} mineralQuantity={mineralQuantity} onEquip={onEquip} onRepair={onRepair} onEnchant={onEnchant} onOpenAbilityStone={openAbilityStoneFromPickaxe} onClose={() => setDetailPickaxeId(null)} />}
    {detailStone && <AbilityStoneDetailModal stone={detailStone} attachedPickaxe={detailStoneAttachedPickaxe} engraveTargetPickaxe={engraveContextPickaxe} actionBusy={actionBusy} onFacet={onFacetAbilityStone} onOpenEngraveList={openEngraveListFromStoneDetail} onDismantle={onDismantleAbilityStone} onClose={closeStoneDetail} />}
    {stoneListPickaxe && <AbilityStoneEngraveListModal pickaxe={stoneListPickaxe} abilityStones={abilityStones} pickaxes={pickaxes} actionBusy={actionBusy} onSelect={selectAbilityStoneForPickaxe} onClose={() => setStoneListPickaxeId(null)} />}
  </div>
}
