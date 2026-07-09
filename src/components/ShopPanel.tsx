import { useState } from 'react'
import { ABILITY_STONE_PRICE, BULK_CHEST_COUNT, CHESTS, discountedChestPrice, findPickaxe, VIP_BULK_CHEST_COUNT, VIP_BULK_DISCOUNT, VIP_DAILY_MANA, VIP_DAYS, VIP_PRICE, VIP_SINGLE_DISCOUNT, type ChestDefinition, type ChestId } from '../game'
import { AbilityStoneSprite } from './AbilityStoneSprite'
import { ChestSprite } from './ChestSprite'
import { Modal } from './Modal'

interface ShopPanelProps {
  balance: number
  busy: boolean
  vipActive: boolean
  vipExpiresAt: string | null
  freeNormalAvailable: boolean
  freePremiumAvailable: boolean
  onOpenChest: (chestId: ChestId) => void
  onPurchaseAbilityStone: () => void
  onOpenChestBulk: (chestId: ChestId, count: number) => void
  onOpenVipModal: () => void
  onOpenFreeVipChest: (chestId: ChestId) => void
}

const formatChance = (chance: number) => {
  const fractionDigits = chance % 1 === 0 ? 0 : (chance * 10) % 1 === 0 ? 1 : 2
  return `${chance.toFixed(fractionDigits)}%`
}

const formatVipUntil = (vipExpiresAt: string | null) => {
  if (!vipExpiresAt) return ''
  const date = new Date(vipExpiresAt)
  return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date)
}

export function ShopPanel({ balance, busy, vipActive, vipExpiresAt, freeNormalAvailable, freePremiumAvailable, onOpenChest, onPurchaseAbilityStone, onOpenChestBulk, onOpenVipModal, onOpenFreeVipChest }: ShopPanelProps) {
  const [rateChest, setRateChest] = useState<ChestDefinition | null>(null)
  const canBuyAbilityStone = balance >= ABILITY_STONE_PRICE

  return (
    <section className="shop-panel" aria-labelledby="shop-title">
      <div className="shop-heading">
        <div>
          <span className="section-kicker">광부 조달소</span>
          <h2 id="shop-title">상점</h2>
          <p>상자를 열어 새로운 장비를 획득하세요.</p>
        </div>
        <div className="shop-balance"><span>사용 가능</span><strong>{balance.toLocaleString('ko-KR')} P</strong></div>
      </div>

      <div className={`vip-card ${vipActive ? 'is-active' : ''}`}>
        <div className="vip-card-head">
          <span className="vip-badge">VIP</span>
          <div>
            <strong>포인트 광산 VIP 티켓</strong>
            <p>{vipActive ? `${formatVipUntil(vipExpiresAt)}까지 이용 중` : `${VIP_PRICE.toLocaleString('ko-KR')} P / ${VIP_DAYS}일`}</p>
          </div>
        </div>
        <ul className="vip-benefits">
          <li>매일 일반, 고급 상자 무료 개봉 1회</li>
          <li>매일 마나 {VIP_DAILY_MANA}✦ 지급</li>
          <li>상자 가격 할인</li>
        </ul>
        {vipActive ? (
          <div className="vip-free-actions">
            <button className="vip-free-button" type="button" onClick={() => onOpenFreeVipChest('normal')} disabled={busy || !freeNormalAvailable}>
              {freeNormalAvailable ? '일반 상자 무료 개봉' : '일반 오늘 완료'}
            </button>
            <button className="vip-free-button" type="button" onClick={() => onOpenFreeVipChest('premium')} disabled={busy || !freePremiumAvailable}>
              {freePremiumAvailable ? '고급 상자 무료 개봉' : '고급 오늘 완료'}
            </button>
            <button className="vip-buy-button" type="button" onClick={onOpenVipModal} disabled={busy}>{VIP_DAYS}일 연장하기</button>
          </div>
        ) : (
          <button className="vip-buy-button" type="button" onClick={onOpenVipModal} disabled={busy}>
            VIP 티켓 구매하기
          </button>
        )}
      </div>

      <article className="ability-stone-shop-card">
        <div className="ability-stone-shop-visual">
          <span className="ability-stone-shop-ring" aria-hidden="true" />
          <AbilityStoneSprite variant={1} size="large" />
        </div>
        <div className="ability-stone-shop-copy">
          <span className="chest-tier">ABILITY SUPPLY</span>
          <h3>어빌리티 스톤</h3>
          <p>획득 순간 긍정 옵션 2개와 부정 옵션 1개가 결정됩니다. 곡괭이에 각인한 스톤은 언제든 교체할 수 있습니다.</p>
          <small>백금 이상 곡괭이로 채굴해도 1% 확률로 획득</small>
        </div>
        <button className="buy-chest-button ability-stone-buy-button" type="button" onClick={onPurchaseAbilityStone} disabled={busy || !canBuyAbilityStone}>
          <span>{busy ? '구매 처리 중...' : canBuyAbilityStone ? '어빌리티 스톤 구매' : '포인트 부족'}</span>
          <strong>{ABILITY_STONE_PRICE.toLocaleString('ko-KR')} P</strong>
        </button>
      </article>

      <div className="chest-shop-grid">
        {CHESTS.map((chest) => {
          const singleBasePrice = chest.price
          const bulkBasePrice = chest.price * BULK_CHEST_COUNT
          const singlePrice = discountedChestPrice(chest.price, vipActive, VIP_SINGLE_DISCOUNT)
          const bulkUnit = discountedChestPrice(chest.price, vipActive, VIP_BULK_DISCOUNT)
          const bulkPrice = bulkUnit * BULK_CHEST_COUNT
          const vipBulkBasePrice = chest.price * VIP_BULK_CHEST_COUNT
          const vipBulkPrice = bulkUnit * VIP_BULK_CHEST_COUNT
          const canBuy = balance >= singlePrice
          const canBuyBulk = balance >= bulkPrice
          const canBuyVipBulk = balance >= vipBulkPrice
          return (
            <article className={`chest-card chest-card--${chest.id}`} key={chest.id}>
              <div className="chest-display">
                <span className="chest-aura" />
                <ChestSprite spriteIndex={chest.spriteIndex} />
              </div>
              <div className="chest-card-copy">
                <span className="chest-tier">{chest.id === 'normal' ? 'NORMAL SUPPLY' : 'PREMIUM SUPPLY'}</span>
                <h3>{chest.name}</h3>
                <p>{chest.description}</p>
                <button className="rate-button" type="button" onClick={() => setRateChest(chest)}>획득 확률 보기</button>
              </div>
              <div className="buy-chest-actions">
                <button
                  className="buy-chest-button"
                  type="button"
                  onClick={() => onOpenChest(chest.id)}
                  disabled={busy || !canBuy}
                >
                  <span>{busy ? '개봉 준비 중...' : canBuy ? '상자 구매 및 개봉' : '포인트 부족'}</span>
                  <span className="chest-price">
                    {vipActive && <><del>{singleBasePrice.toLocaleString('ko-KR')} P</del><small>VIP {VIP_SINGLE_DISCOUNT}% 할인</small></>}
                    <strong>{singlePrice.toLocaleString('ko-KR')} P</strong>
                  </span>
                </button>
                <button
                  className="buy-chest-button buy-chest-button--bulk"
                  type="button"
                  onClick={() => onOpenChestBulk(chest.id, BULK_CHEST_COUNT)}
                  disabled={busy || !canBuyBulk}
                >
                  <span>{busy ? '개봉 준비 중...' : canBuyBulk ? `${BULK_CHEST_COUNT}개 구매 및 개봉` : '포인트 부족'}</span>
                  <span className="chest-price">
                    {vipActive && <><del>{bulkBasePrice.toLocaleString('ko-KR')} P</del><small>VIP {VIP_BULK_DISCOUNT}% 할인</small></>}
                    <strong>{bulkPrice.toLocaleString('ko-KR')} P</strong>
                  </span>
                </button>
                {vipActive && (
                  <button
                    className="buy-chest-button buy-chest-button--bulk buy-chest-button--vip-bulk"
                    type="button"
                    onClick={() => onOpenChestBulk(chest.id, VIP_BULK_CHEST_COUNT)}
                    disabled={busy || !canBuyVipBulk}
                  >
                    <span>{busy ? '개봉 준비 중...' : canBuyVipBulk ? `${VIP_BULK_CHEST_COUNT}개 구매 및 개봉` : '포인트 부족'}</span>
                    <span className="chest-price">
                      <del>{vipBulkBasePrice.toLocaleString('ko-KR')} P</del><small>VIP {VIP_BULK_DISCOUNT}% 할인</small>
                      <strong>{vipBulkPrice.toLocaleString('ko-KR')} P</strong>
                    </span>
                  </button>
                )}
              </div>
            </article>
          )
        })}
      </div>

      <p className="shop-footnote">중복 곡괭이는 기존 장비에 기본 내구도가 합산됩니다.{vipActive ? ' VIP 할인 적용가입니다.' : ''}</p>

      {rateChest && (
        <Modal title={`${rateChest.name} 확률`} onClose={() => setRateChest(null)} labelledBy="chest-rates-title">
          <div className="rate-table-wrap">
            <table className="rate-table">
              <thead><tr><th>곡괭이</th><th>기본 내구도</th><th>확률</th></tr></thead>
              <tbody>
                {rateChest.drops.map((drop) => {
                  const pickaxe = findPickaxe(drop.pickaxeId)
                  return (
                    <tr key={drop.pickaxeId}>
                      <td>{pickaxe?.name}</td>
                      <td>{pickaxe?.durability}</td>
                      <td>{formatChance(drop.chance)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Modal>
      )}
    </section>
  )
}
