import { useState } from 'react'
import '../FloorProgress.css'
import { abilityStoneEffectValue, findPickaxe, hasEngravedAbilityStone, isEnchanted, isVipActive, kstToday, type AbilityStoneInventoryItem, type AttackResult, type ChestId, type FacetAbilityStoneResult, type MineResult, type MonsterItemId, type OreId, type PickaxeInventoryItem, type UserProfile } from '../game'
import { AbilityStoneSprite } from './AbilityStoneSprite'
import { Durability } from './Durability'
import { HuntPanel } from './HuntPanel'
import { InventoryPanel } from './InventoryPanel'
import { OreSprite } from './OreSprite'
import { PickaxeSprite } from './PickaxeSprite'
import { ShopPanel } from './ShopPanel'
import { VipModal } from './VipModal'

type GameView = 'mine' | 'hunt' | 'shop'
type MobileTab = 'mine' | 'hunt' | 'shop' | 'inventory' | 'profile'

interface GameScreenProps {
  profile: UserProfile
  mining: boolean
  attacking: boolean
  actionBusy: boolean
  lastMine: MineResult | null
  lastAttack: AttackResult | null
  onMine: () => void
  onAttack: () => void
  onEquip: (id: string) => void
  onSell: (oreIds: OreId[]) => void
  onRepair: (id: string, amount: number) => void
  onSellMonsterItems: (itemIds: MonsterItemId[]) => void
  onEnchant: (id: string) => void
  onFacetAbilityStone: (stoneUid: string, optionIndex: number) => Promise<FacetAbilityStoneResult | null>
  onEngraveAbilityStone: (stoneUid: string, pickaxeId: string) => void
  onDismantleAbilityStone: (stoneUid: string) => void
  onOpenChest: (chestId: ChestId) => void
  onPurchaseAbilityStone: () => void
  onOpenChestBulk: (chestId: ChestId, count: number) => void
  onPurchaseVip: () => void
  onOpenFreeVipChest: (chestId: ChestId) => void
  onOpenCoupon: () => void
  onLogout: () => void
}

const getMineName = (floor: number) => {
  if (floor >= 100) return '지하 최심부'
  if (floor >= 80) return '심연의 광맥'
  if (floor >= 60) return '고대 광산'
  if (floor >= 40) return '붉은 광맥'
  if (floor >= 20) return '깊은 갱도'
  return '빛바랜 채굴장'
}

const getRequiredExperience = (floor: number) => 100n * (2n ** BigInt(Math.max(0, floor - 1)))

const parseExperience = (experience: string) => /^\d+$/.test(experience) ? BigInt(experience) : 0n

const formatExperience = (experience: bigint) => {
  const value = experience.toString()
  if (value.length <= 9) return experience.toLocaleString('ko-KR')
  return `${value[0]}.${value.slice(1, 3)}e${value.length - 1}`
}

function MineArea({ equipped, abilityStone, mining, lastMine, floor, experience, onMine }: {
  equipped?: PickaxeInventoryItem
  abilityStone?: AbilityStoneInventoryItem | null
  mining: boolean
  lastMine: MineResult | null
  floor: number
  experience: string
  onMine: () => void
}) {
  const definition = equipped ? findPickaxe(equipped.id) : null
  // 취약(+레벨)·더블 채굴(2배)로 늘어난 내구도 소모량. 이보다 내구도가 적으면 채굴 불가.
  const mineDurCost = (1 + (equipped?.enchants?.fragile ?? 0) + Math.max(0, abilityStoneEffectValue(abilityStone, 'durability_cost'))) * ((equipped?.enchants?.double_mine ?? 0) > 0 ? 2 : 1)
  const canMine = Boolean(equipped && equipped.durability >= mineDurCost)
  const isMaxFloor = floor >= 100
  const currentExperience = parseExperience(experience)
  const requiredExperience = isMaxFloor ? 0n : getRequiredExperience(floor)
  const progress = isMaxFloor ? 100 : Number((currentExperience * 10_000n) / requiredExperience) / 100
  const experienceLabel = isMaxFloor ? 'MAX' : `${formatExperience(currentExperience)} / ${formatExperience(requiredExperience)} EXP`

  return (
    <section className="mine-area" aria-labelledby="mine-title">
      <div className="mine-title-row">
        <div><span className="section-kicker">지하 {floor}층 · {floor >= 20 ? '상급 광맥' : '초보 광맥'}</span><h2 id="mine-title">{getMineName(floor)}</h2></div>
        <div className="mine-floor-meter" aria-label={isMaxFloor ? '최대 층 도달' : `경험치 ${currentExperience} / ${requiredExperience}`}>
          <div className="mine-floor-meter__label"><span>{isMaxFloor ? '최대 깊이' : '다음 층까지'}</span><strong>{experienceLabel}</strong></div>
          <div className="mine-floor-meter__track"><span style={{ width: `${progress}%` }} /></div>
        </div>
      </div>
      <div className={`mine-stage ${mining ? 'is-mining' : ''}`}>
        <div className="cave-light" />
        <span className="hanging-chain hanging-chain--left" aria-hidden="true" />
        <span className="hanging-chain hanging-chain--right" aria-hidden="true" />
        <div className="rock-face" aria-hidden="true">
          <span className="ore-vein vein-one" />
          <span className="ore-vein vein-two" />
          <span className="ore-vein vein-three" />
        </div>
        {equipped && <PickaxeSprite pickaxeId={equipped.id} size="large" className="active-pickaxe" enchanted={isEnchanted(equipped) || hasEngravedAbilityStone(equipped)} />}
        {lastMine?.status === 'success' && (
          lastMine.mined === false ? (
            <div className="mine-result" key={`miss-${lastMine.remaining_durability}`}>
              <span aria-hidden="true">✕</span>
              <strong>허탕</strong>
              <small>불운으로 채굴에 실패했습니다</small>
              {lastMine.ability_stone && <em className="stone-drop-line"><AbilityStoneSprite variant={lastMine.ability_stone.variant} size="small" /> 어빌리티 스톤 획득!</em>}
            </div>
          ) : (
            <div className="mine-result" key={`${lastMine.ore_id}-${lastMine.remaining_durability}`}>
              <OreSprite oreId={lastMine.ore_id ?? ''} size="medium" />
              <strong>{lastMine.ore_name}{(lastMine.quantity ?? 1) > 1 ? ` ×${lastMine.quantity}` : ''}</strong>
              <small>+{lastMine.points}P 가치 · +{lastMine.xp_gained} EXP</small>
              {lastMine.ability_stone && <em className="stone-drop-line"><AbilityStoneSprite variant={lastMine.ability_stone.variant} size="small" /> 어빌리티 스톤 획득!</em>}
              {lastMine.floor_up && <em>지하 {lastMine.mine_floor}층 도달!</em>}
            </div>
          )
        )}
        <div className="mine-controls">
          <p>{definition ? `${definition.name} 장착 중 · 채굴당 ${definition.rank + 1} EXP` : '인벤토리에서 곡괭이를 장착하세요'}</p>
          {equipped && <Durability item={equipped} />}
          <button className="mine-button" type="button" onClick={onMine} disabled={!canMine || mining}>
            <span aria-hidden="true">⛏</span>{mining ? '채굴 중...' : '광맥 채굴'}
          </button>
          {equipped && <small>남은 내구도 {equipped.durability} / {equipped.maxDurability}</small>}
          {equipped && equipped.durability > 0 && equipped.durability < mineDurCost && <small className="hunt-warn">내구도가 부족해 채굴할 수 없습니다 (필요 {mineDurCost})</small>}
        </div>
      </div>
    </section>
  )
}

function ProfilePanel({ profile, equipped, onOpenCoupon, onLogout }: { profile: UserProfile; equipped?: PickaxeInventoryItem; onOpenCoupon: () => void; onLogout: () => void }) {
  const vip = isVipActive(profile.vipExpiresAt)
  return (
    <div className={`profile-panel ${vip ? 'is-vip' : ''}`}>
      <div className="miner-avatar"><span>⛏</span></div>
      <span className="section-kicker">{vip ? 'VIP 광부' : '광부'}</span>
      <h2>{profile.nickname}</h2>
      <div className="balance-card"><span>보유 포인트</span><strong>{profile.balance.toLocaleString('ko-KR')}<small>P</small></strong></div>
      <div className="balance-card mana-card"><span>보유 마나</span><strong>{profile.mana.toLocaleString('ko-KR')}<small>✦</small></strong></div>
      <div className="equipped-card">
        <span className="inventory-label">현재 장비</span>
        {equipped ? (
          <div><PickaxeSprite pickaxeId={equipped.id} size="medium" enchanted={isEnchanted(equipped) || hasEngravedAbilityStone(equipped)} /><strong>{findPickaxe(equipped.id)?.name}</strong><Durability item={equipped} /></div>
        ) : <p>장착된 곡괭이 없음</p>}
      </div>
      <div className="profile-actions">
        <button className="coupon-button" type="button" onClick={onOpenCoupon}><span aria-hidden="true">◆</span> 쿠폰 사용</button>
        <button className="text-button logout-button" type="button" onClick={onLogout}>광산에서 나가기</button>
      </div>
    </div>
  )
}

export function GameScreen({ profile, mining, attacking, actionBusy, lastMine, lastAttack, onMine, onAttack, onEquip, onSell, onRepair, onSellMonsterItems, onEnchant, onFacetAbilityStone, onEngraveAbilityStone, onDismantleAbilityStone, onOpenChest, onPurchaseAbilityStone, onOpenChestBulk, onPurchaseVip, onOpenFreeVipChest, onOpenCoupon, onLogout }: GameScreenProps) {
  const [desktopView, setDesktopView] = useState<GameView>('mine')
  const [mobileTab, setMobileTab] = useState<MobileTab>('mine')
  const [vipModalOpen, setVipModalOpen] = useState(false)
  const equipped = profile.inventory.find((item): item is PickaxeInventoryItem => item.type === 'pickaxe' && item.equipped)
  const equippedAbilityStone = equipped?.abilityStoneUid
    ? profile.inventory.find((item): item is AbilityStoneInventoryItem => item.type === 'ability_stone' && item.uid === equipped.abilityStoneUid) ?? null
    : null
  const vipActive = isVipActive(profile.vipExpiresAt)
  const today = kstToday()
  const freeNormalAvailable = vipActive && profile.vipLastNormalFree !== today
  const freePremiumAvailable = vipActive && profile.vipLastPremiumFree !== today
  const inventoryProps = { inventory: profile.inventory, mana: profile.mana, actionBusy, onEquip, onSell, onRepair, onSellMonsterItems, onEnchant, onFacetAbilityStone, onEngraveAbilityStone, onDismantleAbilityStone }
  const mineAreaProps = { equipped, abilityStone: equippedAbilityStone, mining, lastMine, floor: profile.mineFloor, experience: profile.mineExperience, onMine }
  const huntAreaProps = { equipped, abilityStone: equippedAbilityStone, floor: profile.mineFloor, huntMonster: profile.huntMonster, huntMonsterHp: profile.huntMonsterHp, attacking, lastAttack, onAttack }
  const shopProps = { balance: profile.balance, busy: actionBusy, vipActive, vipExpiresAt: profile.vipExpiresAt, freeNormalAvailable, freePremiumAvailable, onOpenChest, onPurchaseAbilityStone, onOpenChestBulk, onOpenVipModal: () => setVipModalOpen(true), onOpenFreeVipChest }

  return (
    <main className="game-screen">
      <header className="game-header">
        <div className="mini-brand"><span>⛏</span><div><strong>포인트 광산</strong><small>POINT MINE</small></div></div>
        <nav className="game-view-tabs" aria-label="게임 화면">
          <button type="button" className={desktopView === 'mine' ? 'is-active' : ''} onClick={() => setDesktopView('mine')}>채굴장</button>
          <button type="button" className={desktopView === 'hunt' ? 'is-active' : ''} onClick={() => setDesktopView('hunt')}>사냥터</button>
          <button type="button" className={desktopView === 'shop' ? 'is-active' : ''} onClick={() => setDesktopView('shop')}>상점</button>
        </nav>
        <div className="header-right">
          <button type="button" className={`header-vip-ticket ${vipActive ? 'is-active' : ''}`} onClick={() => setVipModalOpen(true)} title={vipActive ? 'VIP 이용 중' : 'VIP 티켓 구매'}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2 2 2 0 0 0 0 4 2 2 0 0 1 0 4 2 2 0 0 1-2 2H5a2 2 0 0 1-2-2 2 2 0 0 0 0-4 2 2 0 0 1 0-4Z" />
              <path d="M9 6v12" strokeDasharray="2 2" />
            </svg>
            VIP
          </button>
          <div className="header-balance"><span>보유 포인트</span><strong>{profile.balance.toLocaleString('ko-KR')} P</strong></div>
        </div>
      </header>

      {desktopView === 'shop' ? (
        <div className="desktop-layout shop-layout">
          <aside className="wood-panel"><ProfilePanel profile={profile} equipped={equipped} onOpenCoupon={onOpenCoupon} onLogout={onLogout} /></aside>
          <ShopPanel {...shopProps} />
        </div>
      ) : (
        <div className="desktop-layout">
          <aside className="wood-panel"><ProfilePanel profile={profile} equipped={equipped} onOpenCoupon={onOpenCoupon} onLogout={onLogout} /></aside>
          {desktopView === 'hunt' ? <HuntPanel {...huntAreaProps} /> : <MineArea {...mineAreaProps} />}
          <aside className="stone-panel"><InventoryPanel {...inventoryProps} compact /></aside>
        </div>
      )}

      <div className="mobile-layout">
        <div className="mobile-content">
          {mobileTab === 'mine' && <MineArea {...mineAreaProps} />}
          {mobileTab === 'hunt' && <HuntPanel {...huntAreaProps} />}
          {mobileTab === 'shop' && <ShopPanel {...shopProps} />}
          {mobileTab === 'inventory' && <section className="stone-panel mobile-panel"><InventoryPanel {...inventoryProps} /></section>}
          {mobileTab === 'profile' && <section className="wood-panel mobile-panel"><ProfilePanel profile={profile} equipped={equipped} onOpenCoupon={onOpenCoupon} onLogout={onLogout} /></section>}
        </div>
        <nav className="mobile-nav" aria-label="주 메뉴">
          <button type="button" className={mobileTab === 'mine' ? 'is-active' : ''} onClick={() => setMobileTab('mine')}><span>⛏</span>채굴</button>
          <button type="button" className={mobileTab === 'hunt' ? 'is-active' : ''} onClick={() => setMobileTab('hunt')}><span>⚔</span>사냥</button>
          <button type="button" className={mobileTab === 'shop' ? 'is-active' : ''} onClick={() => setMobileTab('shop')}><span>▣</span>상점</button>
          <button type="button" className={mobileTab === 'inventory' ? 'is-active' : ''} onClick={() => setMobileTab('inventory')}><span>▦</span>인벤토리</button>
          <button type="button" className={mobileTab === 'profile' ? 'is-active' : ''} onClick={() => setMobileTab('profile')}><span>♟</span>광부 정보</button>
        </nav>
      </div>

      {vipModalOpen && (
        <VipModal
          vipActive={vipActive}
          vipExpiresAt={profile.vipExpiresAt}
          balance={profile.balance}
          busy={actionBusy}
          freeNormalAvailable={freeNormalAvailable}
          freePremiumAvailable={freePremiumAvailable}
          onPurchase={onPurchaseVip}
          onOpenFreeChest={onOpenFreeVipChest}
          onClose={() => setVipModalOpen(false)}
        />
      )}
    </main>
  )
}
