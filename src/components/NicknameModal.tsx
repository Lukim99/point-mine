import { type FormEvent, useState } from 'react'
import { Modal } from './Modal'

interface NicknameModalProps {
  onSubmit: (nickname: string) => Promise<void>
  onLogout: () => void
  error: string
}

export function NicknameModal({ onSubmit, onLogout, error }: NicknameModalProps) {
  const [nickname, setNickname] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const value = nickname.trim()
    if (!value || submitting) return
    setSubmitting(true)
    await onSubmit(value)
    setSubmitting(false)
  }

  return (
    <Modal title="광부 등록" labelledBy="nickname-modal-title">
      <form className="nickname-form" onSubmit={handleSubmit}>
        <div className="modal-emblem" aria-hidden="true">⛏</div>
        <p>포인트 상점에서 사용 중인 닉네임을 입력하세요.</p>
        <label htmlFor="nickname">상점 닉네임</label>
        <input
          id="nickname"
          name="nickname"
          type="text"
          value={nickname}
          onChange={(event) => setNickname(event.target.value)}
          autoComplete="nickname"
          maxLength={24}
          placeholder="닉네임 입력"
          autoFocus
        />
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="ore-button ore-button--primary" type="submit" disabled={!nickname.trim() || submitting}>
          {submitting ? '계정 확인 중...' : '광산 계정 연동'}
        </button>
        <button className="text-button" type="button" onClick={onLogout}>다른 카카오 계정으로 로그인</button>
      </form>
    </Modal>
  )
}
