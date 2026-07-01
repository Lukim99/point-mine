import { useState } from 'react'
import { findPickaxe, type ChestId, type MineResult, type OreId, type PickaxeInventoryItem, type UserProfile } from '../game'
import { Durability } from './Durability'
import { InventoryPanel } from './InventoryPanel'
import { OreSprite } from './OreSprite'
import { PickaxeSprite } from './PickaxeSprite'
import { ShopPanel } from './ShopPanel'

type GameView = 'mine' | 'shop'
type MobileTab = 'mine' | 'shop' | 'inventory' | 'profile'

interface GameScreenProps {
  profile: UserProfile
  mining: boolean
  actionBusy: boolean
  lastMine: MineResult | null
  onMine: () => void
  onEquip: (id: string) => void
  onSell: (oreIds: OreId[]) => void
  onRepair: (id: string, amount: number) => void
  onOpenChest: (chestId: ChestId) => void
  onLogout: () => void
}

function MineArea({ equipped, mining, lastMine, onMine }: {
  equipped?: PickaxeInventoryItem
  mining: boolean
  lastMine: MineResult | null
  onMine: () => void
}) {
  const definition = equipped ? findPickaxe(equipped.id) : null
  const canMine = Boolean(equipped && equipped.durability > 0)

  return (
    <section className="mine-area" aria-labelledby="mine-title">
      <div className="mine-title-row">
        <div><span className="section-kicker">지하 1층 · 초보 광맥</span><h2 id="mine-title">빛바랜 채굴장</h2></div>
        <span className="mine-status"><i /> 채굴 가능</span>
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
        {equipped && <PickaxeSprite pickaxeId={equipped.id} size="large" className="active-pickaxe" />}
        {lastMine?.status === 'success' && (
          <div className="mine-result" key={`${lastMine.ore_id}-${lastMine.remaining_durability}`}>
            <OreSprite oreId={lastMine.ore_id ?? ''} size="medium" />
            <strong>{lastMine.ore_name}</strong>
            <small>+{lastMine.points}P 가치</small>
          </div>
        )}
        <div className="mine-controls">
          <p>{definition ? `${definition.name} 장착 중` : '인벤토리에서 곡괭이를 장착하세요'}</p>
          {equipped && <Durability item={equipped} />}
          <button className="mine-button" type="button" onClick={onMine} disabled={!canMine || mining}>
            <span aria-hidden="true">⛏</span>{mining ? '채굴 중...' : '광맥 채굴'}
          </button>
          {equipped && <small>남은 내구도 {equipped.durability} / {equipped.maxDurability}</small>}
        </div>
      </div>
    </section>
  )
}

function ProfilePanel({ profile, equipped, onLogout }: { profile: UserProfile; equipped?: PickaxeInventoryItem; onLogout: () => void }) {
  return (
    <div className="profile-panel">
      <div className="miner-avatar"><span>⛏</span></div>
      <span className="section-kicker">등록 광부</span>
      <h2>{profile.nickname}</h2>
      <div className="balance-card"><span>보유 포인트</span><strong>{profile.balance.toLocaleString('ko-KR')}<small>P</small></strong></div>
      <div className="equipped-card">
        <span className="inventory-label">현재 장비</span>
        {equipped ? (
          <div><PickaxeSprite pickaxeId={equipped.id} size="medium" /><strong>{findPickaxe(equipped.id)?.name}</strong><Durability item={equipped} /></div>
        ) : <p>장착된 곡괭이 없음</p>}
      </div>
      <button className="text-button logout-button" type="button" onClick={onLogout}>광산에서 나가기</button>
    </div>
  )
}

export function GameScreen({ profile, mining, actionBusy, lastMine, onMine, onEquip, onSell, onRepair, onOpenChest, onLogout }: GameScreenProps) {
  const [desktopView, setDesktopView] = useState<GameView>('mine')
  const [mobileTab, setMobileTab] = useState<MobileTab>('mine')
  const equipped = profile.inventory.find((item): item is PickaxeInventoryItem => item.type === 'pickaxe' && item.equipped)
  const inventoryProps = { inventory: profile.inventory, actionBusy, onEquip, onSell, onRepair }

  return (
    <main className="game-screen">
      <header className="game-header">
        <div className="mini-brand"><span>⛏</span><div><strong>포인트 광산</strong><small>POINT MINE</small></div></div>
        <nav className="game-view-tabs" aria-label="게임 화면">
          <button type="button" className={desktopView === 'mine' ? 'is-active' : ''} onClick={() => setDesktopView('mine')}>채굴장</button>
          <button type="button" className={desktopView === 'shop' ? 'is-active' : ''} onClick={() => setDesktopView('shop')}>상점</button>
        </nav>
        <div className="header-balance"><span>보유 포인트</span><strong>{profile.balance.toLocaleString('ko-KR')} P</strong></div>
      </header>

      {desktopView === 'mine' ? (
        <div className="desktop-layout">
          <aside className="wood-panel"><ProfilePanel profile={profile} equipped={equipped} onLogout={onLogout} /></aside>
          <MineArea equipped={equipped} mining={mining} lastMine={lastMine} onMine={onMine} />
          <aside className="stone-panel"><InventoryPanel {...inventoryProps} compact /></aside>
        </div>
      ) : (
        <div className="desktop-layout shop-layout">
          <aside className="wood-panel"><ProfilePanel profile={profile} equipped={equipped} onLogout={onLogout} /></aside>
          <ShopPanel balance={profile.balance} busy={actionBusy} onOpenChest={onOpenChest} />
        </div>
      )}

      <div className="mobile-layout">
        <div className="mobile-content">
          {mobileTab === 'mine' && <MineArea equipped={equipped} mining={mining} lastMine={lastMine} onMine={onMine} />}
          {mobileTab === 'shop' && <ShopPanel balance={profile.balance} busy={actionBusy} onOpenChest={onOpenChest} />}
          {mobileTab === 'inventory' && <section className="stone-panel mobile-panel"><InventoryPanel {...inventoryProps} /></section>}
          {mobileTab === 'profile' && <section className="wood-panel mobile-panel"><ProfilePanel profile={profile} equipped={equipped} onLogout={onLogout} /></section>}
        </div>
        <nav className="mobile-nav" aria-label="주 메뉴">
          <button type="button" className={mobileTab === 'mine' ? 'is-active' : ''} onClick={() => setMobileTab('mine')}><span>⛏</span>채굴</button>
          <button type="button" className={mobileTab === 'shop' ? 'is-active' : ''} onClick={() => setMobileTab('shop')}><span>▣</span>상점</button>
          <button type="button" className={mobileTab === 'inventory' ? 'is-active' : ''} onClick={() => setMobileTab('inventory')}><span>▦</span>인벤토리</button>
          <button type="button" className={mobileTab === 'profile' ? 'is-active' : ''} onClick={() => setMobileTab('profile')}><span>♟</span>광부 정보</button>
        </nav>
      </div>
    </main>
  )
}
