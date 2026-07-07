import { useState } from 'react'
import { BULK_CHEST_COUNT, CHESTS, discountedChestPrice, findPickaxe, VIP_BULK_DISCOUNT, VIP_DAILY_MANA, VIP_DAYS, VIP_PRICE, VIP_SINGLE_DISCOUNT, type ChestDefinition, type ChestId } from '../game'
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
  onOpenChestBulk: (chestId: ChestId) => void
  onPurchaseVip: () => void
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

const VIP_BENEFITS = [
  { icon: '🎁', title: '매일 무료 상자 개봉', desc: '일반, 고급 상자를 하루 1회씩 무료 개봉' },
  { icon: '✦', title: `매일 마나 ${VIP_DAILY_MANA} 지급`, desc: '접속하면 자동으로 마나를 받습니다' },
  { icon: '％', title: '상자 구매 할인', desc: `1개 구매 ${VIP_SINGLE_DISCOUNT}%, ${BULK_CHEST_COUNT}개 구매 ${VIP_BULK_DISCOUNT}% 할인` },
]

export function ShopPanel({ balance, busy, vipActive, vipExpiresAt, freeNormalAvailable, freePremiumAvailable, onOpenChest, onOpenChestBulk, onPurchaseVip, onOpenFreeVipChest }: ShopPanelProps) {
  const [rateChest, setRateChest] = useState<ChestDefinition | null>(null)
  const [vipModalOpen, setVipModalOpen] = useState(false)
  const canBuyVip = balance >= VIP_PRICE
  const confirmVip = () => { onPurchaseVip(); setVipModalOpen(false) }

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
          <li>상자 1개 {VIP_SINGLE_DISCOUNT}%, {BULK_CHEST_COUNT}개 {VIP_BULK_DISCOUNT}% 할인</li>
        </ul>
        {vipActive ? (
          <div className="vip-free-actions">
            <button className="vip-free-button" type="button" onClick={() => onOpenFreeVipChest('normal')} disabled={busy || !freeNormalAvailable}>
              {freeNormalAvailable ? '일반 상자 무료 개봉' : '일반 오늘 완료'}
            </button>
            <button className="vip-free-button" type="button" onClick={() => onOpenFreeVipChest('premium')} disabled={busy || !freePremiumAvailable}>
              {freePremiumAvailable ? '고급 상자 무료 개봉' : '고급 오늘 완료'}
            </button>
            <button className="vip-buy-button" type="button" onClick={() => setVipModalOpen(true)} disabled={busy}>{VIP_DAYS}일 연장하기</button>
          </div>
        ) : (
          <button className="vip-buy-button" type="button" onClick={() => setVipModalOpen(true)} disabled={busy}>
            VIP 티켓 구매하기
          </button>
        )}
      </div>

      <div className="chest-shop-grid">
        {CHESTS.map((chest) => {
          const singlePrice = discountedChestPrice(chest.price, vipActive, VIP_SINGLE_DISCOUNT)
          const bulkUnit = discountedChestPrice(chest.price, vipActive, VIP_BULK_DISCOUNT)
          const bulkPrice = bulkUnit * BULK_CHEST_COUNT
          const canBuy = balance >= singlePrice
          const canBuyBulk = balance >= bulkPrice
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
                  <strong>{singlePrice.toLocaleString('ko-KR')} P{vipActive ? ' ▼' : ''}</strong>
                </button>
                <button
                  className="buy-chest-button buy-chest-button--bulk"
                  type="button"
                  onClick={() => onOpenChestBulk(chest.id)}
                  disabled={busy || !canBuyBulk}
                >
                  <span>{busy ? '개봉 준비 중...' : canBuyBulk ? `${BULK_CHEST_COUNT}개 구매 및 개봉` : '포인트 부족'}</span>
                  <strong>{bulkPrice.toLocaleString('ko-KR')} P{vipActive ? ' ▼' : ''}</strong>
                </button>
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

      {vipModalOpen && (
        <Modal title="포인트 광산 VIP 티켓" onClose={() => setVipModalOpen(false)} labelledBy="vip-modal-title">
          <div className="vip-modal">
            <div className="vip-modal-hero">
              <span className="vip-badge vip-badge--lg">VIP</span>
              <div className="vip-modal-price">
                <strong>{VIP_PRICE.toLocaleString('ko-KR')}<small> P</small></strong>
                <span>{VIP_DAYS}일 이용권</span>
              </div>
            </div>

            <ul className="vip-modal-benefits">
              {VIP_BENEFITS.map((benefit) => (
                <li key={benefit.title}>
                  <span className="vip-modal-icon" aria-hidden="true">{benefit.icon}</span>
                  <span className="vip-modal-text">
                    <strong>{benefit.title}</strong>
                    <small>{benefit.desc}</small>
                  </span>
                </li>
              ))}
            </ul>

            {vipActive && <p className="vip-modal-note">이미 VIP 이용 중이며, 구매하면 {formatVipUntil(vipExpiresAt)}에서 {VIP_DAYS}일 연장됩니다.</p>}

            <div className="vip-modal-balance"><span>보유 포인트</span><strong className={canBuyVip ? '' : 'is-short'}>{balance.toLocaleString('ko-KR')} P</strong></div>

            <button className="vip-modal-confirm" type="button" onClick={confirmVip} disabled={busy || !canBuyVip}>
              {canBuyVip ? `${VIP_PRICE.toLocaleString('ko-KR')} P로 ${vipActive ? '연장' : '구매'}하기` : '포인트가 부족합니다'}
            </button>
          </div>
        </Modal>
      )}
    </section>
  )
}
