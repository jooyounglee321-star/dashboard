import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { t } from '../i18n'

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
  const [withdrawModal, setWithdrawModal] = useState(false)
  const [withdrawing, setWithdrawing]     = useState(false)
  const [widgetCfg, setWidgetCfg] = useState(null)
  const [langSaving, setLangSaving] = useState(false)
  const fileRef = useRef(null)
  // 신체정보 상태
  const [birthYear,   setBirthYear]   = useState('')
  const [gender,      setGender]      = useState('')
  const [heightVal,   setHeightVal]   = useState('')
  const [heightUnit,  setHeightUnit]  = useState('cm')   // 'cm' | 'ft'
  const [weightVal,   setWeightVal]   = useState('')
  const [weightUnit,  setWeightUnit]  = useState('kg')   // 'kg' | 'lb'

  const lang = widgetCfg?.language ?? 'ko'

  useEffect(() => {
    // 아바타 로드 (localStorage)
    const saved = localStorage.getItem('avatar_data')
    if (saved) setAvatarSrc(saved)

    // 프로필 로드
    fetch('/api/auth/me', { credentials: 'include' })
      .then(r => { if (r.status === 401) navigate('/login', { replace: true }); return r.ok ? r.json() : null })
      .then(d => {
        if (!d) return
        setName(d.name || '')
        setEmail(d.email || '')
        setPlan(d.plan || 'free')
        if (d.created_at) {
          const dt = new Date(d.created_at)
          setJoinedAt(`${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`)
        }
        // 신체정보 로드 (항상 cm/kg로 DB 저장되어 있음)
        setBirthYear(d.birth_year ? String(d.birth_year) : '')
        setGender(d.gender || '')
        setHeightVal(d.height_cm ? String(d.height_cm) : '')
        setWeightVal(d.weight_kg ? String(d.weight_kg) : '')
      })
      .catch(() => {})
  }, [navigate])

  // 위젯 설정(언어) 로드
  useEffect(() => {
    fetch('/api/auth/widget-config', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.config) setWidgetCfg(d.config) })
      .catch(() => {})
  }, [])

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
      const res = await fetch('/api/auth/widget-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ config: next }),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.detail || `HTTP ${res.status}`)
      }
      // 대시보드 즉시 반영을 위해 localStorage에도 캐시 + 이벤트 발생
      try {
        localStorage.setItem('dashboard_lang', newLang)
        window.dispatchEvent(new Event('languageChanged'))
      } catch {}
      setMsg({ type: 'success', text: t(newLang, 'profile.langSaved') })
    } catch (e) {
      setMsg({ type: 'error', text: e.message || t(lang, 'profile.errServer') })
    } finally {
      setLangSaving(false)
    }
  }

  function onAvatarChange(e) {
    const file = e.target.files[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { setMsg({ type: 'error', text: t(lang, 'profile.errImageSize') }); return }
    const reader = new FileReader()
    reader.onload = ev => {
      localStorage.setItem('avatar_data', ev.target.result)
      setAvatarSrc(ev.target.result)
      setMsg({ type: 'success', text: t(lang, 'profile.successAvatar') })
    }
    reader.readAsDataURL(file)
  }

  async function handleSave(e) {
    e.preventDefault()
    setMsg(null)

    if (newPw) {
      if (newPw.length < 8)  { setMsg({ type: 'error', text: t(lang, 'profile.errPwLength') }); return }
      if (newPw !== confPw)  { setMsg({ type: 'error', text: t(lang, 'profile.errPwMatch') }); return }
      if (!curPw)            { setMsg({ type: 'error', text: t(lang, 'profile.errNoCurPw') }); return }
    }

    // 단위 변환: 항상 cm/kg로 변환 후 저장
    const heightCm = heightVal
      ? (heightUnit === 'ft' ? Math.round(parseFloat(heightVal) * 30.48 * 10) / 10 : parseFloat(heightVal))
      : null
    const weightKg = weightVal
      ? (weightUnit === 'lb' ? Math.round(parseFloat(weightVal) * 0.4536 * 10) / 10 : parseFloat(weightVal))
      : null

    const body = { name: name.trim() || null }
    if (newPw) { body.current_password = curPw; body.new_password = newPw }
    if (birthYear)  body.birth_year = parseInt(birthYear, 10)
    if (gender)     body.gender     = gender
    if (heightCm)   body.height_cm  = heightCm
    if (weightKg)   body.weight_kg  = weightKg

    setSaving(true)
    try {
      const res = await fetch('/api/auth/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (res.ok) {
        try {
          const stored = JSON.parse(localStorage.getItem('user') || '{}')
          localStorage.setItem('user', JSON.stringify({ ...stored, name: data.name }))
        } catch {}
        if (newPw) { setCurPw(''); setNewPw(''); setConfPw('') }
        setMsg({ type: 'success', text: t(lang, 'profile.successSave') })
      } else {
        setMsg({ type: 'error', text: data.detail || t(lang, 'profile.errSave') })
      }
    } catch {
      setMsg({ type: 'error', text: t(lang, 'profile.errServer') })
    } finally {
      setSaving(false)
    }
  }

  async function handleWithdraw() {
    setWithdrawing(true)
    try {
      const res = await fetch('/api/auth/withdraw', {
        method: 'POST',
        credentials: 'include',
      })
      if (res.ok) {
        setWithdrawModal(false)
        localStorage.removeItem('dashboard_logged_in')
        localStorage.removeItem('user')
        navigate('/login')
      } else {
        const d = await res.json().catch(() => ({}))
        setMsg({ type: 'error', text: d.detail || t(lang, 'profile.withdrawError') })
        setWithdrawModal(false)
      }
    } catch {
      setMsg({ type: 'error', text: t(lang, 'profile.withdrawError') })
      setWithdrawModal(false)
    } finally {
      setWithdrawing(false)
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
          {t(lang, 'profile.myDay')}
        </span>
        <div className="header-right">
          <Link to="/" className="admin-link">{t(lang, 'profile.backToDashboard')}</Link>
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
              title={t(lang, 'profile.avatarTitle')}
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
            <span style={{ fontSize: '0.72rem', color: 'var(--ink3)' }}>{t(lang, 'profile.avatarClick')}</span>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onAvatarChange} />
          </div>

          <form onSubmit={handleSave}>
            {/* 기본 정보 */}
            <SectionLabel>{t(lang, 'profile.basicInfo')}</SectionLabel>

            <Field label={t(lang, 'profile.nickname')}>
              <input
                type="text" value={name} onChange={e => setName(e.target.value)}
                placeholder={t(lang, 'profile.nicknamePlaceholder')} maxLength={50}
                style={inputStyle}
              />
            </Field>

            <Field label={t(lang, 'profile.emailLabel')}>
              <input type="email" value={email} disabled style={{ ...inputStyle, background: 'var(--bg)', color: 'var(--ink3)', cursor: 'not-allowed', border: '1.5px solid transparent' }} />
              <div style={{ fontSize: '0.73rem', color: 'var(--ink3)', marginTop: '0.3rem' }}>{t(lang, 'profile.emailNote')}</div>
            </Field>

            {/* 계정 정보 */}
            <SectionLabel>{t(lang, 'profile.accountInfo')}</SectionLabel>

            <InfoRow label={t(lang, 'profile.plan')}>
              <span style={{ display: 'inline-block', padding: '0.18rem 0.65rem', borderRadius: 20, fontSize: '0.72rem', fontWeight: 500, ...planStyle }}>
                {planLabel}
              </span>
            </InfoRow>
            <InfoRow label={t(lang, 'profile.joinDate')}>
              <span style={{ fontSize: '0.88rem', color: 'var(--ink)' }}>{joinedAt || '—'}</span>
            </InfoRow>

            {/* 언어 설정 */}
            <SectionLabel>{t(lang, 'profile.language')}</SectionLabel>
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
                {langSaving && <span style={{ fontSize: '0.75rem', color: 'var(--ink3)', alignSelf: 'center' }}>{t(lang, 'profile.langSavingMsg')}</span>}
              </div>
              <div style={{ fontSize: '0.73rem', color: 'var(--ink3)', lineHeight: 1.6 }}>
                {t(lang, 'profile.langHint')}<br />
                {t(lang, 'profile.langHint2')}
              </div>
            </div>

            {/* 비밀번호 변경 */}
            <SectionLabel>{t(lang, 'profile.changePassword')}</SectionLabel>

            <Field label={t(lang, 'profile.currentPassword')}>
              <PwField value={curPw} onChange={setCurPw} show={showCur} toggleShow={() => togglePw(setShowCur)} placeholder={t(lang, 'profile.currentPasswordPlaceholder')} />
            </Field>
            <Field label={t(lang, 'profile.newPassword')}>
              <PwField value={newPw} onChange={setNewPw} show={showNew} toggleShow={() => togglePw(setShowNew)} placeholder={t(lang, 'profile.newPasswordPlaceholder')} />
            </Field>
            <Field label={t(lang, 'profile.confirmNewPassword')}>
              <PwField value={confPw} onChange={setConfPw} show={showConf} toggleShow={() => togglePw(setShowConf)} placeholder={t(lang, 'profile.confirmPasswordPlaceholder')} />
            </Field>

            {/* 식단 관리 정보 */}
            <SectionLabel>🥗 {t(lang, 'profile.dietSectionTitle')}</SectionLabel>
            <div style={{ fontSize: '0.75rem', color: 'var(--ink3)', marginBottom: '1rem', lineHeight: 1.6 }}>
              {t(lang, 'profile.dietSectionDesc')}
            </div>

            <Field label={t(lang, 'profile.birthYear')}>
              <input
                type="number" value={birthYear} onChange={e => setBirthYear(e.target.value)}
                min="1900" max={new Date().getFullYear()}
                placeholder={lang === 'ko' ? '예: 1990' : 'e.g. 1990'}
                style={inputStyle}
              />
            </Field>

            <Field label={t(lang, 'profile.gender')}>
              <select value={gender} onChange={e => setGender(e.target.value)} style={inputStyle}>
                <option value="">{lang === 'ko' ? '선택하세요' : 'Select'}</option>
                <option value="male">{t(lang, 'profile.male')}</option>
                <option value="female">{t(lang, 'profile.female')}</option>
                <option value="other">{t(lang, 'profile.other')}</option>
              </select>
            </Field>

            <Field label={t(lang, 'profile.height')}>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="number" value={heightVal} onChange={e => setHeightVal(e.target.value)}
                  min="0" step="0.1"
                  placeholder={heightUnit === 'cm' ? '예: 170' : 'e.g. 5.7'}
                  style={{ ...inputStyle, flex: 1 }}
                />
                <UnitToggle
                  options={['cm', 'ft']}
                  value={heightUnit}
                  onChange={u => {
                    if (!heightVal) { setHeightUnit(u); return }
                    const v = parseFloat(heightVal)
                    if (u === 'ft' && heightUnit === 'cm')
                      setHeightVal(String(Math.round(v / 30.48 * 10) / 10))
                    else if (u === 'cm' && heightUnit === 'ft')
                      setHeightVal(String(Math.round(v * 30.48 * 10) / 10))
                    setHeightUnit(u)
                  }}
                />
              </div>
            </Field>

            <Field label={t(lang, 'profile.weight')}>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="number" value={weightVal} onChange={e => setWeightVal(e.target.value)}
                  min="0" step="0.1"
                  placeholder={weightUnit === 'kg' ? '예: 65' : 'e.g. 143'}
                  style={{ ...inputStyle, flex: 1 }}
                />
                <UnitToggle
                  options={['kg', 'lb']}
                  value={weightUnit}
                  onChange={u => {
                    if (!weightVal) { setWeightUnit(u); return }
                    const v = parseFloat(weightVal)
                    if (u === 'lb' && weightUnit === 'kg')
                      setWeightVal(String(Math.round(v / 0.4536 * 10) / 10))
                    else if (u === 'kg' && weightUnit === 'lb')
                      setWeightVal(String(Math.round(v * 0.4536 * 10) / 10))
                    setWeightUnit(u)
                  }}
                />
              </div>
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
              {saving ? t(lang, 'profile.savingBtn') : t(lang, 'profile.saveBtn')}
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

          {/* 계정 탈퇴 섹션 */}
          <div style={{ marginTop: '2.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border)' }}>
            <SectionLabel>{t(lang, 'profile.withdrawSection')}</SectionLabel>
            <p style={{ fontSize: '0.8rem', color: 'var(--ink3)', lineHeight: 1.6, marginBottom: '1rem' }}>
              {t(lang, 'profile.withdrawConfirmBody').split('\n').map((line, i) => (
                <span key={i}>{line}<br /></span>
              ))}
            </p>
            <button
              type="button"
              onClick={() => setWithdrawModal(true)}
              style={{
                padding: '0.6rem 1.4rem', fontSize: '0.85rem', fontWeight: 500,
                background: 'transparent', color: '#c0392b',
                border: '1.5px solid #c0392b', borderRadius: 8,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              {t(lang, 'profile.withdrawBtn')}
            </button>
          </div>

        </div>
      </div>

      {/* 탈퇴 확인 모달 */}
      {withdrawModal && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.50)',
            backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
          }}
          onClick={e => { if (e.target === e.currentTarget) setWithdrawModal(false) }}
        >
          <div style={{
            background: '#FFFFFF', borderRadius: 16, padding: '2rem',
            width: '100%', maxWidth: 360, boxShadow: '0 20px 60px rgba(15,23,42,0.18)',
          }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#c0392b', marginBottom: '0.8rem' }}>
              {t(lang, 'profile.withdrawConfirmTitle')}
            </h3>
            <p style={{ fontSize: '0.83rem', color: 'var(--ink2)', lineHeight: 1.7, marginBottom: '1.5rem', whiteSpace: 'pre-line' }}>
              {t(lang, 'profile.withdrawConfirmBody')}
            </p>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => setWithdrawModal(false)}
                style={{
                  flex: 1, padding: '0.65rem', fontSize: '0.88rem', fontWeight: 500,
                  background: 'var(--card2)', color: 'var(--ink2)',
                  border: '1.5px solid var(--border)', borderRadius: 8,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                {t(lang, 'profile.withdrawConfirmCancel')}
              </button>
              <button
                type="button"
                onClick={handleWithdraw}
                disabled={withdrawing}
                style={{
                  flex: 1, padding: '0.65rem', fontSize: '0.88rem', fontWeight: 500,
                  background: withdrawing ? '#e88' : '#c0392b', color: '#fff',
                  border: 'none', borderRadius: 8,
                  cursor: withdrawing ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                }}
              >
                {withdrawing ? '처리 중…' : t(lang, 'profile.withdrawConfirmOk')}
              </button>
            </div>
          </div>
        </div>
      )}

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

function UnitToggle({ options, value, onChange }) {
  return (
    <div style={{ display: 'flex', borderRadius: 9, border: '1.5px solid var(--border)', overflow: 'hidden', flexShrink: 0 }}>
      {options.map(opt => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          style={{
            padding: '0 0.75rem', fontSize: '0.8rem', fontWeight: 500,
            background: value === opt ? 'var(--accent)' : 'var(--card2)',
            color: value === opt ? '#fff' : 'var(--ink2)',
            border: 'none', cursor: 'pointer', fontFamily: 'inherit',
            borderRight: opt === options[0] ? '1px solid var(--border)' : 'none',
          }}
        >{opt}</button>
      ))}
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
