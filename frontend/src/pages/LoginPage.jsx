import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { t } from '../i18n'

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
  const [lang, setLang] = useState(() => {
    try { return localStorage.getItem('dashboard_lang') || 'ko' } catch { return 'ko' }
  })
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [autoLogin, setAutoLogin] = useState(false)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState({ type: '', text: '' })

  useEffect(() => {
    function handleLangChange() {
      try { setLang(localStorage.getItem('dashboard_lang') || 'ko') } catch {}
    }
    window.addEventListener('languageChanged', handleLangChange)
    return () => window.removeEventListener('languageChanged', handleLangChange)
  }, [])

  // 구글 OAuth 콜백 토큰 처리
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token = params.get('token')
    const error = params.get('error')
    if (token) {
      localStorage.setItem('token', token)
      window.history.replaceState({}, '', '/login')
      navigate('/')
    } else if (error) {
      setMsg({ type: 'error', text: t(lang, 'auth.errLogin') })
      window.history.replaceState({}, '', '/login')
    }
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setMsg({ type: '', text: '' })
    if (!email || !password) {
      setMsg({ type: 'error', text: t(lang, 'auth.errRequiredLogin') })
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
        // access_token 키가 없거나 빈값이면 명시적으로 경고
        const jwt = data.access_token || data.token || ''
        if (!jwt) {
          setMsg({ type: 'error', text: t(lang, 'auth.errLogin') })
          return
        }
        const storage = autoLogin ? localStorage : sessionStorage
        storage.setItem('token', jwt)
        if (data.user) storage.setItem('user', JSON.stringify(data.user))
        setMsg({ type: 'success', text: t(lang, 'auth.successLogin') })
        setTimeout(() => navigate('/'), 800)
      } else {
        setMsg({ type: 'error', text: data.detail || t(lang, 'auth.errLogin') })
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
        <Link to="/register" className="nav-link">{t(lang, 'auth.toRegister')}</Link>
      </header>

      <div className="auth-center">
        <div className="auth-card">
          <div className="card-eyebrow">{t(lang, 'auth.welcome')}</div>
          <div className="card-title-auth">{t(lang, 'auth.loginTitle')}</div>
          <div className="card-sub">{t(lang, 'auth.loginSub')}</div>

          <div className="social-btns">
            <button className="btn-social btn-google" type="button" onClick={() => { window.location.href = '/api/auth/google/login' }}>
              <GoogleLogo /> {t(lang, 'auth.googleLogin')}
            </button>
            <button className="btn-social btn-facebook" type="button" onClick={() => alert(t(lang, 'auth.facebookComingSoon'))}>
              <div style={{ width: 20, height: 20, background: '#fff', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ color: '#1877f2', fontSize: '1rem', fontWeight: 700, lineHeight: 1, marginTop: 1 }}>f</span>
              </div>
              {t(lang, 'auth.facebookLogin')}
            </button>
          </div>

          <div className="divider"><span className="divider-text">{t(lang, 'auth.orEmailLogin')}</span></div>

          <form onSubmit={handleSubmit} noValidate>
            <div className="field">
              <label htmlFor="email">{t(lang, 'auth.email')}</label>
              <input
                type="email" id="email" placeholder="example@email.com"
                autoComplete="email" value={email}
                onChange={e => setEmail(e.target.value)} required
              />
            </div>
            <div className="field">
              <label htmlFor="password">{t(lang, 'auth.password')}</label>
              <div className="pw-wrap">
                <input
                  type={showPw ? 'text' : 'password'} id="password"
                  placeholder={t(lang, 'auth.passwordPlaceholder')} autoComplete="current-password"
                  value={password} onChange={e => setPassword(e.target.value)} required
                />
                <button type="button" className="btn-eye" onClick={() => setShowPw(v => !v)}>
                  {showPw ? '🙈' : '👁️'}
                </button>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0 12px' }}>
              <input
                type="checkbox" id="autoLogin"
                checked={autoLogin} onChange={e => setAutoLogin(e.target.checked)}
                style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--accent)' }}
              />
              <label htmlFor="autoLogin" style={{ fontSize: '0.875rem', color: 'var(--text-sub)', cursor: 'pointer', userSelect: 'none' }}>
                {t(lang, 'auth.autoLogin')}
              </label>
            </div>
            <button type="submit" className="btn-submit" disabled={loading}>
              {loading ? t(lang, 'auth.processing') : t(lang, 'auth.loginBtn')}
            </button>
          </form>

          {msg.text && <div className={`msg ${msg.type}`}>{msg.text}</div>}

          <div className="footer-link">
            {t(lang, 'auth.noAccount')} <Link to="/register">{t(lang, 'auth.toRegister')}</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
