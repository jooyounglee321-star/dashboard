import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { t } from '../i18n'

const KakaoLogo = () => (
  <svg viewBox="0 0 24 24" style={{ width: 20, height: 20, flexShrink: 0 }}>
    <path fill="#3C1E1E" d="M12 3C6.477 3 2 6.477 2 10.8c0 2.7 1.6 5.1 4.1 6.6l-1 3.7 4.3-2.8c.85.15 1.72.22 2.6.22 5.523 0 10-3.477 10-7.8S17.523 3 12 3z"/>
  </svg>
)

const GoogleLogo = () => (
  <svg viewBox="0 0 48 48" style={{ width: 20, height: 20, flexShrink: 0 }}>
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
  </svg>
)

export default function RegisterPage() {
  const navigate = useNavigate()
  const [lang, setLang] = useState(() => {
    try { return localStorage.getItem('dashboard_lang') || 'ko' } catch { return 'ko' }
  })
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [showPw2, setShowPw2] = useState(false)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState({ type: '', text: '' })

  useEffect(() => {
    function handleLangChange() {
      try { setLang(localStorage.getItem('dashboard_lang') || 'ko') } catch {}
    }
    window.addEventListener('languageChanged', handleLangChange)
    return () => window.removeEventListener('languageChanged', handleLangChange)
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setMsg({ type: '', text: '' })
    if (!email || !password || !password2) {
      setMsg({ type: 'error', text: t(lang, 'auth.errRequired') }); return
    }
    if (password.length < 8) {
      setMsg({ type: 'error', text: t(lang, 'auth.errPwLength') }); return
    }
    if (!/\d/.test(password)) {
      setMsg({ type: 'error', text: t(lang, 'auth.errPwDigit') }); return
    }
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      setMsg({ type: 'error', text: t(lang, 'auth.errPwSpecial') }); return
    }
    if (password !== password2) {
      setMsg({ type: 'error', text: t(lang, 'auth.errPwMatch') }); return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (res.ok) {
        // Cookie는 서버가 설정. 로그인 상태 힌트와 유저 정보만 저장
        localStorage.setItem('dashboard_logged_in', '1')
        if (data.user) localStorage.setItem('user', JSON.stringify(data.user))
        setMsg({ type: 'success', text: t(lang, 'auth.successRegister') })
        setTimeout(() => navigate('/'), 1800)
      } else {
        setMsg({ type: 'error', text: data.detail || t(lang, 'auth.errRegister') })
      }
    } catch {
      setMsg({ type: 'error', text: t(lang, 'auth.errServer') })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header className="header">
        <Link to="/" className="header-title">{t(lang, 'auth.siteTitle')}</Link>
        <Link to="/login" className="nav-link">{t(lang, 'auth.toLogin')}</Link>
      </header>

      <div className="auth-center">
        <div className="auth-card">
          <div className="card-eyebrow">{t(lang, 'auth.startNow')}</div>
          <div className="card-title-auth" style={{ fontSize: '1.6rem' }}>{t(lang, 'auth.registerTitle')}</div>
          <div className="card-sub">{t(lang, 'auth.registerSub')}</div>

          <div className="social-btns">
            <button className="btn-social btn-kakao" type="button" onClick={() => { window.location.href = '/api/auth/kakao/login' }}>
              <KakaoLogo /> {t(lang, 'auth.kakaoRegister')}
            </button>
            <button className="btn-social btn-google" type="button" onClick={() => alert(t(lang, 'auth.googleComingSoon'))}>
              <GoogleLogo /> {t(lang, 'auth.googleRegister')}
            </button>
            <button className="btn-social btn-facebook" type="button" onClick={() => alert(t(lang, 'auth.facebookComingSoon'))}>
              <div style={{ width: 22, height: 22, background: '#fff', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ color: '#1877f2', fontSize: 14, fontWeight: 700, lineHeight: 1, marginTop: 1 }}>f</span>
              </div>
              {t(lang, 'auth.facebookRegister')}
            </button>
          </div>

          <div className="divider"><span className="divider-text">{t(lang, 'auth.orEmailRegister')}</span></div>

          <form onSubmit={handleSubmit} noValidate>
            <div className="field">
              <label htmlFor="email">{t(lang, 'auth.email')}</label>
              <input type="email" id="email" placeholder="example@email.com"
                autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="password">{t(lang, 'auth.password')}</label>
              <div className="pw-wrap">
                <input type={showPw ? 'text' : 'password'} id="password"
                  placeholder={t(lang, 'auth.passwordHint')} autoComplete="new-password"
                  value={password} onChange={e => setPassword(e.target.value)} required minLength={8} />
                <button type="button" className="btn-eye" onClick={() => setShowPw(v => !v)}>
                  {showPw ? '🙈' : '👁️'}
                </button>
              </div>
            </div>
            <div className="field">
              <label htmlFor="password2">{t(lang, 'auth.confirmPassword')}</label>
              <div className="pw-wrap">
                <input type={showPw2 ? 'text' : 'password'} id="password2"
                  placeholder={t(lang, 'auth.confirmPlaceholder')} autoComplete="new-password"
                  value={password2} onChange={e => setPassword2(e.target.value)} required />
                <button type="button" className="btn-eye" onClick={() => setShowPw2(v => !v)}>
                  {showPw2 ? '🙈' : '👁️'}
                </button>
              </div>
            </div>
            <button type="submit" className="btn-submit" disabled={loading}>
              {loading ? t(lang, 'auth.processing') : t(lang, 'auth.registerBtn')}
            </button>
          </form>

          {msg.text && <div className={`msg ${msg.type}`}>{msg.text}</div>}

          <div style={{ fontSize: '0.72rem', color: 'var(--ink3)', textAlign: 'center', marginTop: '1.1rem', lineHeight: 1.6 }}>
            {t(lang, 'auth.termsPrefix')}
            <a href="#" style={{ color: 'var(--ink2)', textDecoration: 'underline' }}>{t(lang, 'auth.terms')}</a>
            {t(lang, 'auth.termsMid')}
            <a href="#" style={{ color: 'var(--ink2)', textDecoration: 'underline' }}>{t(lang, 'auth.privacy')}</a>
            {t(lang, 'auth.termsSuffix')}
          </div>
          <div className="footer-link">
            {t(lang, 'auth.hasAccount')} <Link to="/login">{t(lang, 'auth.toLogin')}</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
