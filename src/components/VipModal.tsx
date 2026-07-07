import { BULK_CHEST_COUNT, VIP_BULK_CHEST_COUNT, VIP_BULK_DISCOUNT, VIP_DAILY_MANA, VIP_DAYS, VIP_PRICE, VIP_SINGLE_DISCOUNT, type ChestId } from '../game'
import { Modal } from './Modal'

interface VipModalProps {
  vipActive: boolean
  vipExpiresAt: string | null
  balance: number
  busy: boolean
  freeNormalAvailable: boolean
  freePremiumAvailable: boolean
  onPurchase: () => void
  onOpenFreeChest: (chestId: ChestId) => void
  onClose: () => void
}

const VIP_BENEFITS = [
  { id: 'gift', title: '매일 무료 상자 개봉', desc: '일반, 고급 상자를 하루 1회씩 무료 개봉' },
  { id: 'mana', title: `매일 마나 ${VIP_DAILY_MANA} 지급`, desc: '접속하면 자동으로 마나를 받습니다' },
  { id: 'discount', title: '상자 구매 할인', desc: `1개 구매 ${VIP_SINGLE_DISCOUNT}%, ${BULK_CHEST_COUNT}개 및 ${VIP_BULK_CHEST_COUNT}개 구매 ${VIP_BULK_DISCOUNT}% 할인` },
] as const

function BenefitIcon({ id }: { id: string }) {
  const common = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  if (id === 'gift') return (
    <svg {...common}><rect x="3" y="8" width="18" height="4" rx="1" /><path d="M5 12v8h14v-8" /><path d="M12 8v12" /><path d="M12 8s-1.8-4.5-4.2-3.4C5.6 5.6 8.2 8 12 8Z" /><path d="M12 8s1.8-4.5 4.2-3.4C18.4 5.6 15.8 8 12 8Z" /></svg>
  )
  if (id === 'mana') return (
    <svg {...common}><path d="M12 3l2.3 6.2L21 12l-6.7 2.3L12 21l-2.3-6.7L3 12l6.7-2.3z" /></svg>
  )
  return (
    <svg {...common}><path d="M6.5 6.5 17.5 17.5" /><circle cx="7" cy="7" r="1.9" /><circle cx="17" cy="17" r="1.9" /></svg>
  )
}

const formatUntil = (expiresAt: string | null) => {
  if (!expiresAt) return ''
  return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(expiresAt))
}

export function VipModal({ vipActive, vipExpiresAt, balance, busy, freeNormalAvailable, freePremiumAvailable, onPurchase, onOpenFreeChest, onClose }: VipModalProps) {
  const canBuyVip = balance >= VIP_PRICE
  const confirmVip = () => { onPurchase(); onClose() }
  const openFree = (chestId: ChestId) => { onOpenFreeChest(chestId); onClose() }

  return (
    <Modal title="포인트 광산 VIP 티켓" onClose={onClose} labelledBy="vip-modal-title">
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
            <li key={benefit.id}>
              <span className="vip-modal-icon" aria-hidden="true"><BenefitIcon id={benefit.id} /></span>
              <span className="vip-modal-text">
                <strong>{benefit.title}</strong>
                <small>{benefit.desc}</small>
              </span>
            </li>
          ))}
        </ul>

        {vipActive && (
          <div className="vip-modal-free">
            <button type="button" onClick={() => openFree('normal')} disabled={busy || !freeNormalAvailable}>
              {freeNormalAvailable ? '일반 상자 무료 개봉' : '일반 오늘 완료'}
            </button>
            <button type="button" onClick={() => openFree('premium')} disabled={busy || !freePremiumAvailable}>
              {freePremiumAvailable ? '고급 상자 무료 개봉' : '고급 오늘 완료'}
            </button>
          </div>
        )}

        {vipActive && <p className="vip-modal-note">{formatUntil(vipExpiresAt)}까지 이용 중이며, 구매하면 {VIP_DAYS}일 연장됩니다.</p>}

        <div className="vip-modal-balance"><span>보유 포인트</span><strong className={canBuyVip ? '' : 'is-short'}>{balance.toLocaleString('ko-KR')} P</strong></div>

        <button className="vip-modal-confirm" type="button" onClick={confirmVip} disabled={busy || !canBuyVip}>
          {canBuyVip ? `${VIP_PRICE.toLocaleString('ko-KR')} P로 ${vipActive ? '연장' : '구매'}하기` : '포인트가 부족합니다'}
        </button>
      </div>
    </Modal>
  )
}
