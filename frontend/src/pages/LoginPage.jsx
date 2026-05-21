import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

const GoogleLogo = () => (
  <svg className="g-logo" viewBox="0 0 48 48" style={{ width: 20, height: 20, flexShrink: 0 }}>
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
  </svg>
)

export default function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState({ type: '', text: '' })

  async function handleSubmit(e) {
    e.preventDefault()
    setMsg({ type: '', text: '' })
    if (!email || !password) {
      setMsg({ type: 'error', text: '이메일과 비밀번호를 모두 입력해주세요.' })
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (res.ok) {
        localStorage.setItem('token', data.access_token)
        if (data.user) localStorage.setItem('user', JSON.stringify(data.user))
        setMsg({ type: 'success', text: '로그인 성공! 잠시 후 이동합니다.' })
        setTimeout(() => navigate('/'), 800)
      } else {
        setMsg({ type: 'error', text: data.detail || '로그인에 실패했습니다.' })
      }
    } catch {
      setMsg({ type: 'error', text: '서버 연결에 실패했습니다. 잠시 후 다시 시도해주세요.' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header className="header">
        <Link to="/" className="header-title">나의 하루 대시보드</Link>
        <Link to="/register" className="nav-link">회원가입</Link>
      </header>

      <div className="auth-center">
        <div className="auth-card">
          <div className="card-eyebrow">환영합니다</div>
          <div className="card-title-auth">로그인</div>
          <div className="card-sub">소셜 계정이나 이메일로 간편하게 로그인하세요.</div>

          <div className="social-btns">
            <button className="btn-social btn-google" type="button" onClick={() => alert('구글 로그인 준비 중입니다.')}>
              <GoogleLogo /> 구글로 로그인
            </button>
            <button className="btn-social btn-facebook" type="button" onClick={() => alert('페이스북 로그인 준비 중입니다.')}>
              <div style={{ width: 20, height: 20, background: '#fff', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ color: '#1877f2', fontSize: '1rem', fontWeight: 700, lineHeight: 1, marginTop: 1 }}>f</span>
              </div>
              페이스북으로 로그인
            </button>
          </div>

          <div className="divider"><span className="divider-text">또는 이메일로 로그인</span></div>

          <form onSubmit={handleSubmit} noValidate>
            <div className="field">
              <label htmlFor="email">이메일</label>
              <input
                type="email" id="email" placeholder="example@email.com"
                autoComplete="email" value={email}
                onChange={e => setEmail(e.target.value)} required
              />
            </div>
            <div className="field">
              <label htmlFor="password">비밀번호</label>
              <div className="pw-wrap">
                <input
                  type={showPw ? 'text' : 'password'} id="password"
                  placeholder="비밀번호 입력" autoComplete="current-password"
                  value={password} onChange={e => setPassword(e.target.value)} required
                />
                <button type="button" className="btn-eye" onClick={() => setShowPw(v => !v)}>
                  {showPw ? '🙈' : '👁️'}
                </button>
              </div>
            </div>
            <button type="submit" className="btn-submit" disabled={loading}>
              {loading ? '처리 중…' : '로그인'}
            </button>
          </form>

          {msg.text && <div className={`msg ${msg.type}`}>{msg.text}</div>}

          <div className="footer-link">
            아직 계정이 없으신가요? <Link to="/register">회원가입</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
