import { useEffect, useRef, useState } from 'react'
import { VIP_DAYS } from '../game'

interface VipTicketEffectProps {
  expiresAt: string | null
  onClose: () => void
}

const formatUntil = (expiresAt: string | null) => {
  if (!expiresAt) return ''
  return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(expiresAt))
}

export function VipTicketEffect({ expiresAt, onClose }: VipTicketEffectProps) {
  const [revealComplete, setRevealComplete] = useState(false)
  const stageRef = useRef<HTMLDivElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    stageRef.current?.focus()
    const timer = window.setTimeout(() => {
      setRevealComplete(true)
      window.requestAnimationFrame(() => confirmRef.current?.focus())
    }, 2100)
    return () => {
      window.clearTimeout(timer)
      previouslyFocused?.focus()
    }
  }, [])

  return (
    <div className="vip-tear-overlay" role="dialog" aria-modal="true" aria-label="VIP 티켓 구매 결과">
      <div className="opening-rays" aria-hidden="true" />
      <div className="vip-tear-flash" aria-hidden="true" />
      <div className="vip-tear-stage" aria-live="polite" tabIndex={-1} ref={stageRef}>
        <p className="opening-kicker">VIP 티켓 개봉</p>

        <div className="vip-ticket">
          <div className="vip-ticket-half vip-ticket-half--left" aria-hidden="true">
            <span className="vip-ticket-badge">VIP</span>
            <span className="vip-ticket-sub">TICKET</span>
          </div>
          <div className="vip-ticket-half vip-ticket-half--right" aria-hidden="true">
            <span className="vip-ticket-title">포인트 광산</span>
            <span className="vip-ticket-days">{VIP_DAYS}일 이용권</span>
          </div>
          <span className="vip-ticket-perf" aria-hidden="true" />
        </div>

        <div className="vip-tear-card">
          <span className="vip-badge vip-badge--lg">VIP</span>
          <h2>VIP 광부 활성!</h2>
          <p>{formatUntil(expiresAt)}까지 이용할 수 있습니다</p>
        </div>

        <button className="reward-confirm vip-tear-confirm" type="button" onClick={onClose} disabled={!revealComplete} ref={confirmRef}>확인</button>
      </div>
    </div>
  )
}
