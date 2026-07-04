import { useState, type FormEvent } from 'react'
import { Modal } from './Modal'

interface CouponModalProps {
  busy: boolean
  error: string
  onClose: () => void
  onSubmit: (code: string) => void
}

export function CouponModal({ busy, error, onClose, onSubmit }: CouponModalProps) {
  const [code, setCode] = useState('')

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    const normalizedCode = code.trim()
    if (!normalizedCode || busy) return
    onSubmit(normalizedCode)
  }

  return (
    <Modal title="쿠폰 사용" labelledBy="coupon-modal-title" onClose={busy ? undefined : onClose}>
      <form className="coupon-form" onSubmit={handleSubmit}>
        <div className="coupon-emblem" aria-hidden="true">◆</div>
        <p>쿠폰 코드를 입력하면 보상이 즉시 지급됩니다.</p>
        <label htmlFor="coupon-code">쿠폰 코드</label>
        <input
          id="coupon-code"
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase().replace(/\s/g, ''))}
          placeholder="쿠폰 코드를 입력하세요"
          maxLength={64}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'coupon-error' : undefined}
          autoFocus
          disabled={busy}
        />
        {error && <p className="form-error" id="coupon-error" role="alert">{error}</p>}
        <button className="ore-button ore-button--primary" type="submit" disabled={!code.trim() || busy}>
          {busy ? '확인 중...' : '쿠폰 사용'}
        </button>
      </form>
    </Modal>
  )
}
