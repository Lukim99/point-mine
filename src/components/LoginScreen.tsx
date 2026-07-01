interface LoginScreenProps {
  onLogin: () => void
  loading: boolean
}

export function LoginScreen({ onLogin, loading }: LoginScreenProps) {
  return (
    <main className="login-screen">
      <section className="login-card" aria-labelledby="login-title">
        <div className="brand-mark" aria-hidden="true">
          <span className="brand-gem">◆</span>
          <span className="brand-pick">⛏</span>
        </div>
        <p className="eyebrow">POINT MINE</p>
        <h1 id="login-title">포인트 광산</h1>
        <p className="login-copy">
          곡괭이를 들고 광맥을 개척하세요.
          <br />발견한 광물은 포인트가 됩니다.
        </p>
        <button className="kakao-button" type="button" onClick={onLogin} disabled={loading}>
          <span className="kakao-symbol" aria-hidden="true" />
          {loading ? '광산 입장 준비 중...' : '카카오로 광산 입장'}
        </button>
        <div className="login-divider"><span>광부 출입증</span></div>
        <p className="login-notice">포인트 상점에 등록된 닉네임이 필요합니다.</p>
      </section>
      <p className="login-footer">LK COMPANY · POINT MINE</p>
    </main>
  )
}
