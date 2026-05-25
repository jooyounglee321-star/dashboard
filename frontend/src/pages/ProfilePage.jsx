import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'

function togglePw(setFn) {
  setFn(v => !v)
}

export default function ProfilePage() {
  const navigate = useNavigate()
  const [name, setName]         = useState('')
  const [email, setEmail]       = useState('')
  const [plan, setPlan]         = useState('free')
  const [joinedAt, setJoinedAt] = useState('')
  const [curPw, setCurPw]       = useState('')
  const [newPw, setNewPw]       = useState('')
  const [confPw, setConfPw]     = useState('')
  const [showCur, setShowCur]   = useState(false)
  const [showNew, setShowNew]   = useState(false)
  const [showConf, setShowConf] = useState(false)
  const [avatarSrc, setAvatarSrc] = useState(null)
  const [saving, setSaving]     = useState(false)
  const [msg, setMsg]           = useState(null) // { type: 'success'|'error', text }
  const [widgetCfg, setWidgetCfg] = useState(null)
  const [langSaving, setLangSaving] = useState(false)
  const fileRef = useRef(null)

  const token = localStorage.getItem('token')

  useEffect(() => {
    // 아바타 로드 (localStorage)
    const saved = localStorage.getItem('avatar_data')
    if (saved) setAvatarSrc(saved)

    // 프로필 로드
    fetch('/api/auth/me', { headers: { Authorization: 'Bearer ' + token } })
      .then(r => { if (r.status === 401) navigate('/login', { replace: true }); return r.ok ? r.json() : null })
      .then(d => {
        if (!d) return
        setName(d.name || '')
        setEmail(d.email || '')
        setPlan(d.plan || 'free')
        if (d.created_at) {
          const dt = new Date(d.created_at)
          setJoinedAt(`${dt.getFullYear()}년 ${dt.getMonth()+1}월 ${dt.getDate()}일`)
        }
      })
      .catch(() => {})
  }, [token, navigate])

  // 위젯 설정(언어) 로드
  useEffect(() => {
    fetch('/api/auth/widget-config', { headers: { Authorization: 'Bearer ' + token } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.config) setWidgetCfg(d.config) })
      .catch(() => {})
  }, [token])

  // 언어 변경 — 온도단위(수동 미설정 시)·통화 자동 연동 후 즉시 저장
  async function handleLangChange(newLang) {
    if (!widgetCfg) return
    const next = { ...widgetCfg, language: newLang }
    if (!widgetCfg.hero?.temp_unit_manual) {
      next.hero = { ...next.hero, temp_unit: newLang === 'en' ? 'F' : 'C' }
    }
    next.stock = { ...next.stock, currency_display: newLang === 'en' ? 'USD' : 'KRW' }
    setWidgetCfg(next)
    setLangSaving(true)
    try {
      await fetch('/api/auth/widget-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ config: next }),
      })
      setMsg({ type: 'success', text: '언어 설정이 저장되었습니다.' })
    } catch {
      setMsg({ type: 'error', text: '언어 설정 저장에 실패했습니다.' })
    } finally {
      setLangSaving(false)
    }
  }

  function onAvatarChange(e) {
    const file = e.target.files[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { setMsg({ type: 'error', text: '이미지 크기는 2MB 이하여야 합니다.' }); return }
    const reader = new FileReader()
    reader.onload = ev => {
      localStorage.setItem('avatar_data', ev.target.result)
      setAvatarSrc(ev.target.result)
      setMsg({ type: 'success', text: '프로필 사진이 변경되었습니다. (기기에만 저장)' })
    }
    reader.readAsDataURL(file)
  }

  async function handleSave(e) {
    e.preventDefault()
    setMsg(null)

    if (newPw) {
      if (newPw.length < 8)  { setMsg({ type: 'error', text: '새 비밀번호는 8자 이상이어야 합니다.' }); return }
      if (newPw !== confPw)  { setMsg({ type: 'error', text: '새 비밀번호와 확인이 일치하지 않습니다.' }); return }
      if (!curPw)            { setMsg({ type: 'error', text: '현재 비밀번호를 입력해주세요.' }); return }
    }

    const body = { name: name.trim() || null }
    if (newPw) { body.current_password = curPw; body.new_password = newPw }

    setSaving(true)
    try {
      const res = await fetch('/api/auth/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (res.ok) {
        try {
          const stored = JSON.parse(localStorage.getItem('user') || '{}')
          localStorage.setItem('user', JSON.stringify({ ...stored, name: data.name }))
        } catch {}
        if (newPw) { setCurPw(''); setNewPw(''); setConfPw('') }
        setMsg({ type: 'success', text: '프로필이 저장되었습니다.' })
      } else {
        setMsg({ type: 'error', text: data.detail || '저장에 실패했습니다.' })
      }
    } catch {
      setMsg({ type: 'error', text: '서버 연결에 실패했습니다.' })
    } finally {
      setSaving(false)
    }
  }

  const planLabel = plan === 'premium' ? 'Premium' : 'Free'
  const planStyle = plan === 'premium'
    ? { background: '#fff3e0', color: '#b56000', border: '1px solid #f0c060' }
    : { background: '#e8e0d4', color: 'var(--ink2)' }

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <header className="header">
        <span style={{ fontFamily: "'Playfair Display', serif", fontSize: '1.2rem', color: 'var(--accent2)' }}>
          ✦ 나의 하루
        </span>
        <div className="header-right">
          <Link to="/" className="admin-link">← 대시보드</Link>
        </div>
      </header>

      {/* Content */}
      <div style={{ flex: 1, display: 'flex', justifyContent: 'center', padding: '2rem 1rem 3rem' }}>
        <div style={{
          background: 'var(--card)', borderRadius: 18, border: '1px solid var(--border)',
          boxShadow: '0 4px 24px rgba(100,70,30,0.10)', padding: '2.2rem 2.4rem',
          width: '100%', maxWidth: 500,
        }}>

          {/* 아바타 */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '2rem' }}>
            <div
              onClick={() => fileRef.current?.click()}
              title="프로필 사진 변경"
              style={{
                position: 'relative', width: 88, height: 88, cursor: 'pointer',
                marginBottom: '0.5rem',
              }}
            >
              <div style={{
                width: 88, height: 88, borderRadius: '50%',
                background: 'var(--card2)', border: '2px solid var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '2.6rem', overflow: 'hidden',
              }}>
                {avatarSrc
                  ? <img src={avatarSrc} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                  : '👤'}
              </div>
              <div style={{
                position: 'absolute', inset: 0, borderRadius: '50%',
                background: 'rgba(44,36,22,0.4)', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                fontSize: '1.2rem', color: '#fff', opacity: 0,
                transition: 'opacity 0.18s',
              }}
                onMouseEnter={e => e.currentTarget.style.opacity = 1}
                onMouseLeave={e => e.currentTarget.style.opacity = 0}
              >📷</div>
            </div>
            <span style={{ fontSize: '0.72rem', color: 'var(--ink3)' }}>클릭하여 사진 변경</span>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onAvatarChange} />
          </div>

          <form onSubmit={handleSave}>
            {/* 기본 정보 */}
            <SectionLabel>기본 정보</SectionLabel>

            <Field label="닉네임 / 이름">
              <input
                type="text" value={name} onChange={e => setName(e.target.value)}
                placeholder="표시될 이름을 입력하세요" maxLength={50}
                style={inputStyle}
              />
            </Field>

            <Field label="이메일">
              <input type="email" value={email} disabled style={{ ...inputStyle, background: 'var(--bg)', color: 'var(--ink3)', cursor: 'not-allowed', border: '1.5px solid transparent' }} />
              <div style={{ fontSize: '0.73rem', color: 'var(--ink3)', marginTop: '0.3rem' }}>이메일은 변경할 수 없습니다.</div>
            </Field>

            {/* 계정 정보 */}
            <SectionLabel>계정 정보</SectionLabel>

            <InfoRow label="플랜">
              <span style={{ display: 'inline-block', padding: '0.18rem 0.65rem', borderRadius: 20, fontSize: '0.72rem', fontWeight: 500, ...planStyle }}>
                {planLabel}
              </span>
            </InfoRow>
            <InfoRow label="가입일">
              <span style={{ fontSize: '0.88rem', color: 'var(--ink)' }}>{joinedAt || '—'}</span>
            </InfoRow>

            {/* 언어 설정 */}
            <SectionLabel>언어 / Language</SectionLabel>
            <div style={{ marginBottom: '1.2rem' }}>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.6rem' }}>
                {[['ko', '🇰🇷 한국어'], ['en', '🇺🇸 English']].map(([v, l]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => handleLangChange(v)}
                    disabled={langSaving || !widgetCfg}
                    style={{
                      padding: '0.45rem 1.1rem', borderRadius: 9,
                      border: '1.5px solid var(--border)',
                      background: (widgetCfg?.language ?? 'ko') === v ? 'var(--accent)' : 'var(--card2)',
                      color: (widgetCfg?.language ?? 'ko') === v ? '#fff' : 'var(--ink)',
                      cursor: (langSaving || !widgetCfg) ? 'not-allowed' : 'pointer',
                      fontSize: '0.88rem', fontFamily: 'inherit', fontWeight: 500,
                      opacity: (langSaving || !widgetCfg) ? 0.6 : 1,
                    }}
                  >{l}</button>
                ))}
                {langSaving && <span style={{ fontSize: '0.75rem', color: 'var(--ink3)', alignSelf: 'center' }}>저장 중…</span>}
              </div>
              <div style={{ fontSize: '0.73rem', color: 'var(--ink3)', lineHeight: 1.6 }}>
                언어 변경 시 온도 단위, 통화, 날짜 형식이 자동으로 연동됩니다.<br />
                온도·통화를 위젯 설정에서 직접 변경한 경우 수동 설정이 우선됩니다.
              </div>
            </div>

            {/* 비밀번호 변경 */}
            <SectionLabel>비밀번호 변경</SectionLabel>

            <Field label="현재 비밀번호">
              <PwField value={curPw} onChange={setCurPw} show={showCur} toggleShow={() => togglePw(setShowCur)} placeholder="현재 비밀번호" />
            </Field>
            <Field label="새 비밀번호">
              <PwField value={newPw} onChange={setNewPw} show={showNew} toggleShow={() => togglePw(setShowNew)} placeholder="8자 이상" />
            </Field>
            <Field label="새 비밀번호 확인">
              <PwField value={confPw} onChange={setConfPw} show={showConf} toggleShow={() => togglePw(setShowConf)} placeholder="동일하게 입력" />
            </Field>

            <button
              type="submit" disabled={saving}
              style={{
                width: '100%', padding: '0.78rem', fontSize: '0.95rem', fontWeight: 500,
                cursor: saving ? 'not-allowed' : 'pointer',
                background: saving ? 'var(--ink3)' : 'var(--accent)', color: '#fff',
                border: 'none', borderRadius: 10, fontFamily: 'inherit',
                marginTop: '1.6rem', letterSpacing: '0.02em',
              }}
            >
              {saving ? '저장 중…' : '저장하기'}
            </button>
          </form>

          {/* 메시지 */}
          {msg && (
            <div style={{
              fontSize: '0.82rem', marginTop: '0.9rem', padding: '0.6rem 0.9rem',
              borderRadius: 8, lineHeight: 1.5,
              ...(msg.type === 'success'
                ? { background: '#e8f5ec', color: 'var(--green)', border: '1px solid #a8d5b5' }
                : { background: '#fdecea', color: 'var(--red)',   border: '1px solid #f0b0aa' }),
            }}>
              {msg.text}
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

/* ── 서브 컴포넌트 ── */
function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: '0.68rem', fontWeight: 500, letterSpacing: '0.12em',
      color: 'var(--accent)', textTransform: 'uppercase',
      marginBottom: '1rem', marginTop: '1.8rem',
      paddingBottom: '0.4rem', borderBottom: '1px solid var(--border)',
    }}>{children}</div>
  )
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: '1rem' }}>
      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 500, color: 'var(--ink2)', marginBottom: '0.35rem' }}>
        {label}
      </label>
      {children}
    </div>
  )
}

function InfoRow({ label, children }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0.6rem 0', borderBottom: '1px solid var(--border)',
    }}>
      <span style={{ fontSize: '0.8rem', color: 'var(--ink3)' }}>{label}</span>
      {children}
    </div>
  )
}

function PwField({ value, onChange, show, toggleShow, placeholder }) {
  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ ...inputStyle, paddingRight: '2.6rem', flex: 1 }}
      />
      <button
        type="button" onClick={toggleShow}
        style={{ position: 'absolute', right: '0.75rem', background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', color: 'var(--ink3)', padding: '0.2rem', lineHeight: 1 }}
      >
        {show ? '🙈' : '👁️'}
      </button>
    </div>
  )
}

const inputStyle = {
  width: '100%', padding: '0.62rem 0.85rem',
  border: '1.5px solid var(--border)', borderRadius: 9,
  fontSize: '0.9rem', fontFamily: 'inherit', fontWeight: 300,
  color: 'var(--ink)', background: 'var(--card2)',
  outline: 'none',
}
