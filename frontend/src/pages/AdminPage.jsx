import { useState, useEffect, useCallback, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Toast, { useToast } from '../components/Toast'
import { t, T } from './index/i18n'

/* ── 유틸 ── */
const sv = (k, v) => localStorage.setItem(k, JSON.stringify(v))
const ld = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d } catch { return d } }


const ALL_TZ = [
  { labelKey: 'tzSeoul', tz: 'Asia/Seoul' },
  { labelKey: 'tzTokyo', tz: 'Asia/Tokyo' },
  { labelKey: 'tzNY', tz: 'America/New_York' },
  { labelKey: 'tzLA', tz: 'America/Los_Angeles' },
  { labelKey: 'tzLondon', tz: 'Europe/London' },
  { labelKey: 'tzParis', tz: 'Europe/Paris' },
  { labelKey: 'tzSydney', tz: 'Australia/Sydney' },
  { labelKey: 'tzDubai', tz: 'Asia/Dubai' },
  { labelKey: 'tzSingapore', tz: 'Asia/Singapore' },
  { labelKey: 'tzChicago', tz: 'America/Chicago' },
  { labelKey: 'tzHK', tz: 'Asia/Hong_Kong' },
  { labelKey: 'tzBerlin', tz: 'Europe/Berlin' },
]
const DEFAULT_ZONES = [
  { region: '서울', tz: 'Asia/Seoul', label: 'KST' },
  { region: '뉴욕', tz: 'America/New_York', label: 'ET' },
  { region: '런던', tz: 'Europe/London', label: 'GMT' },
]
function formatPreview(tz) {
  try {
    return new Intl.DateTimeFormat('ko-KR', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date())
  } catch { return '--:--' }
}

/* ── 메인 AdminPage ── */
export default function AdminPage() {
  const navigate = useNavigate()
  const { toast, showToast } = useToast()


  const [ytAccount, setYtAccount] = useState(() => ld('yt_account', { email: '', name: '' }))
  const [ytAccName, setYtAccName] = useState('')
  const [ytAccEmail,setYtAccEmail]= useState('')
  const [ytChannels,setYtChannels]= useState([])
  const [ytName,    setYtName]    = useState('')
  const [ytUrl,     setYtUrl]     = useState('')



  const [tzData,    setTzData]    = useState(DEFAULT_ZONES)
  const [tzPreviews,setTzPreviews]= useState(['--:--', '--:--', '--:--'])


  /* ── 위젯 설정 ── */
  const DEFAULT_WIDGET_CFG = {
    language: 'ko',
    hero:     { enabled: true, clock_count: 3, temp_unit: 'C', temp_unit_manual: false },
    schedule: { enabled: true },
    youtube:  { enabled: true, max_count: 10 },
    stock:    { enabled: true, currency_display: 'KRW' },
    expense:  { enabled: true },
    diet:     { enabled: true, meals: { 아침: true, 점심: true, 저녁: true, 간식: true } },
    memo:        { enabled: true },
    news:        { enabled: true, default_tab: 'kr' },
    sites:       { enabled: true },
  }
  const WIDGET_ICONS = {
    hero: '🕐', schedule: '📅', youtube: '▶', stock: '📈',
    expense: '💳', diet: '🥗', memo: '📝', news: '📰', sites: '🌐',
  }
  const WIDGET_LABEL_KEYS = {
    hero: 'admin.wHero', schedule: 'admin.wSchedule', youtube: 'admin.wYoutube',
    stock: 'admin.wStock', expense: 'admin.wExpense', diet: 'admin.wDiet',
    memo: 'admin.wMemo', news: 'admin.wNews', sites: 'admin.wSites',
  }
  const [widgetCfg, setWidgetCfg] = useState(() => {
    const cached = localStorage.getItem('dashboard_lang')
    return { ...DEFAULT_WIDGET_CFG, language: cached || 'ko' }
  })
  const lang = widgetCfg?.language ?? 'ko'

  /* ── 초기 데이터 로드 ── */
  useEffect(() => {
    loadYTChannels(); loadTZData(); loadWidgetCfg()
    setYtAccName(ld('yt_account', { name: '' }).name || '')
    setYtAccEmail(ld('yt_account', { email: '' }).email || '')
  }, [])

  /* ── 시간대 미리보기 타이머 ── */
  useEffect(() => {
    const update = () => setTzPreviews(tzData.map(z => formatPreview(z.tz)))
    update()
    const t = setInterval(update, 10000)
    return () => clearInterval(t)
  }, [tzData])

  /* ── 유튜브 ── */
  async function loadYTChannels() {
    const ch = await fetch('/api/youtube-channels', { credentials: 'include' }).then(r => r.ok ? r.json() : []).catch(() => [])
    setYtChannels(ch)
  }
  function saveYTAccount() {
    const acc = { name: ytAccName.trim(), email: ytAccEmail.trim() }
    sv('yt_account', acc); setYtAccount(acc)
    showToast(t(lang, 'admin.toastYtAccountSaved'), 'ok')
  }
  async function addYT() {
    if (!ytName || !ytUrl) { showToast(t(lang, 'admin.toastYtNameRequired'), 'err'); return }
    try {
      const r = await fetch('/api/youtube-channels', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ channel_name: ytName, channel_url: ytUrl }) })
      if (!r.ok) throw new Error('HTTP ' + r.status)
      setYtName(''); setYtUrl(''); await loadYTChannels(); showToast(t(lang, 'admin.toastYtChannelAdded'), 'ok')
    } catch { showToast(t(lang, 'admin.toastSaveError'), 'err') }
  }
  async function delYT(id) {
    try {
      const r = await fetch('/api/youtube-channels/' + id, { method: 'DELETE', credentials: 'include' })
      if (!r.ok) throw new Error('HTTP ' + r.status)
      await loadYTChannels(); showToast(t(lang, 'common.deleteSuccess'), 'ok')
    } catch { showToast(t(lang, 'admin.toastDeleteError'), 'err') }
  }

  /* ── 시간대 ── */
  async function loadTZData() {
    try {
      const r = await fetch('/api/timezone', { credentials: 'include' })
      if (r.ok) { const d = await r.json(); if (d.zones?.length === 3) setTzData(d.zones) }
    } catch {}
  }
  async function saveTZ() {
    try {
      await fetch('/api/timezone', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ zones: tzData }) })
      showToast(t(lang, 'admin.toastTzSaved'), 'ok')
    } catch { showToast(t(lang, 'admin.toastSaveError'), 'err') }
  }
  function updateTz(i, field, value) {
    setTzData(prev => prev.map((z, idx) => idx === i ? { ...z, [field]: value } : z))
  }

  /* ── 위젯 설정 로드/저장 ── */
  async function loadWidgetCfg() {
    try {
      const r = await fetch('/api/auth/widget-config', { credentials: 'include' })
      if (r.ok) { const d = await r.json(); setWidgetCfg(d.config) }
    } catch {}
  }
  async function saveWidgetCfg() {
    try {
      const r = await fetch('/api/auth/widget-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ config: widgetCfg }),
      })
      if (r.ok) showToast(t(lang, 'admin.toastWidgetSaved'), 'ok')
      else showToast(t(lang, 'admin.toastSaveFail'), 'err')
    } catch { showToast(t(lang, 'admin.toastSaveError'), 'err') }
  }
  function setWidget(key, field, value) {
    setWidgetCfg(prev => ({ ...prev, [key]: { ...prev[key], [field]: value } }))
  }

  /* ── 전체 저장 ── */
  async function saveAll() {
    await Promise.all([saveTZ(), saveWidgetCfg()])
    sv('yt_account', ytAccount)
    showToast(t(lang, 'admin.toastSaveAll'), 'ok')
    setTimeout(() => navigate('/'), 1000)
  }

  const secStyle   = { background: 'var(--card)', borderRadius: 14, border: '1px solid var(--border)', boxShadow: 'var(--shadow)', overflow: 'hidden' }
  const secHdStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.9rem 1.3rem', borderBottom: '1px solid var(--border)', background: 'var(--card2)' }
  const secBdStyle = { padding: '1.1rem 1.3rem', display: 'flex', flexDirection: 'column', gap: '0.9rem' }
  const secTitle   = { fontSize: '0.88rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.5rem' }
  const formGrp    = { display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1, minWidth: 110 }
  const lbl        = { fontSize: '0.72rem', color: 'var(--ink3)', letterSpacing: '0.05em' }
  const inp        = { padding: '0.48rem 0.75rem', fontSize: '0.85rem', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg)', color: 'var(--ink)', fontFamily: 'inherit', transition: 'border-color 0.15s', width: '100%' }
  const itemRow    = { display: 'flex', alignItems: 'center', gap: '0.7rem', padding: '0.6rem 0.8rem', background: 'var(--card2)', borderRadius: 8, border: '1px solid var(--border)' }
  const itemInfo   = { flex: 1, minWidth: 0 }

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', color: 'var(--ink)', fontFamily: "'Noto Sans KR', sans-serif", fontWeight: 300 }}>
      <header className="header">
        <span className="header-title">⚙ {t(lang, 'admin.title')}</span>
        <Link to="/" className="nav-link">← {t(lang, 'admin.toDashboard')}</Link>
      </header>

      <main style={{ maxWidth: 860, margin: '0 auto', padding: '1.5rem 1.2rem 4rem', display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>

        {/* ① 위젯 설정 */}
        <div style={secStyle}>
          <div style={secHdStyle}>
            <span style={secTitle}>🧩 {t(lang, 'admin.widgetSettings')}</span>
            <button className="btn btn-primary btn-sm" onClick={saveWidgetCfg}>{t(lang, 'admin.save')}</button>
          </div>
          <div style={{ ...secBdStyle, gap: '0' }}>
            <p style={{ fontSize: '0.78rem', color: 'var(--ink3)', marginBottom: '0.9rem' }}>
              {t(lang, 'admin.widgetDesc')}
            </p>

            {Object.entries(WIDGET_ICONS).map(([key, icon]) => (
              <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.65rem 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <span style={{ fontSize: '1rem', width: 22, textAlign: 'center' }}>{icon}</span>
                  <span style={{ fontSize: '0.88rem', color: widgetCfg[key]?.enabled !== false ? 'var(--ink)' : 'var(--ink3)' }}>{t(lang, WIDGET_LABEL_KEYS[key])}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                  {/* 시계 위젯: 시계 개수 + 온도 단위 */}
                  {key === 'hero' && widgetCfg.hero?.enabled !== false && (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span style={{ fontSize: '0.72rem', color: 'var(--ink3)' }}>{t(lang, 'admin.clockLabel')}</span>
                        {[1, 2, 3].map(n => (
                          <button
                            key={n}
                            onClick={() => setWidget('hero', 'clock_count', n)}
                            style={{
                              width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)',
                              background: widgetCfg.hero?.clock_count === n ? 'var(--accent)' : 'var(--card2)',
                              color: widgetCfg.hero?.clock_count === n ? '#fff' : 'var(--ink)',
                              cursor: 'pointer', fontSize: '0.8rem', fontFamily: 'inherit', fontWeight: 500,
                            }}
                          >{n}</button>
                        ))}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span style={{ fontSize: '0.72rem', color: 'var(--ink3)' }}>{t(lang, 'admin.tempLabel')}</span>
                        {['C', 'F'].map(u => (
                          <button
                            key={u}
                            onClick={() => setWidgetCfg(prev => ({ ...prev, hero: { ...prev.hero, temp_unit: u, temp_unit_manual: true } }))}
                            style={{
                              width: 30, height: 28, borderRadius: 6, border: '1px solid var(--border)',
                              background: (widgetCfg.hero?.temp_unit ?? 'C') === u ? 'var(--accent)' : 'var(--card2)',
                              color: (widgetCfg.hero?.temp_unit ?? 'C') === u ? '#fff' : 'var(--ink)',
                              cursor: 'pointer', fontSize: '0.78rem', fontFamily: 'inherit', fontWeight: 500,
                            }}
                          >°{u}</button>
                        ))}
                      </div>
                    </>
                  )}
                  {/* 유튜브: 최대 표시 개수 */}
                  {key === 'youtube' && widgetCfg.youtube?.enabled !== false && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span style={{ fontSize: '0.72rem', color: 'var(--ink3)' }}>{t(lang, 'admin.max')}</span>
                      <input
                        type="number" min="1" max="20"
                        value={widgetCfg.youtube?.max_count ?? 10}
                        onChange={e => setWidget('youtube', 'max_count', Math.max(1, Math.min(20, parseInt(e.target.value) || 10)))}
                        style={{ width: 44, padding: '0.22rem 0.35rem', fontSize: '0.8rem', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg)', color: 'var(--ink)', fontFamily: 'inherit', textAlign: 'center' }}
                      />
                      <span style={{ fontSize: '0.72rem', color: 'var(--ink3)' }}>{t(lang, 'admin.maxUnit')}</span>
                    </div>
                  )}

                  {/* 식단: 표시할 끼니 */}
                  {key === 'diet' && widgetCfg.diet?.enabled !== false && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {['아침', '점심', '저녁', '간식'].map(m => (
                        <label key={m} style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', cursor: 'pointer', fontSize: '0.72rem', color: 'var(--ink2)' }}>
                          <input
                            type="checkbox"
                            checked={(widgetCfg.diet?.meals ?? { 아침: true, 점심: true, 저녁: true, 간식: true })[m] !== false}
                            onChange={e => setWidget('diet', 'meals', { ...(widgetCfg.diet?.meals ?? { 아침: true, 점심: true, 저녁: true, 간식: true }), [m]: e.target.checked })}
                            style={{ width: 13, height: 13 }}
                          />
                          {(T[lang]?.dietMeals ?? T.ko.dietMeals)[m]}
                        </label>
                      ))}
                    </div>
                  )}
                  {/* 뉴스: 기본 탭 */}
                  {key === 'news' && widgetCfg.news?.enabled !== false && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      {[['kr', t(lang, 'newsKr')], ['us', t(lang, 'newsUs')]].map(([v, l]) => (
                        <button
                          key={v}
                          onClick={() => setWidget('news', 'default_tab', v)}
                          style={{
                            padding: '0.2rem 0.48rem', borderRadius: 6, border: '1px solid var(--border)',
                            background: (widgetCfg.news?.default_tab ?? 'kr') === v ? 'var(--accent)' : 'var(--card2)',
                            color: (widgetCfg.news?.default_tab ?? 'kr') === v ? '#fff' : 'var(--ink)',
                            cursor: 'pointer', fontSize: '0.72rem', fontFamily: 'inherit',
                          }}
                        >{l}</button>
                      ))}
                    </div>
                  )}
                  {/* ON/OFF 토글 */}
                  <label style={{ position: 'relative', display: 'inline-block', width: 40, height: 22, cursor: 'pointer', flexShrink: 0 }}>
                    <input
                      type="checkbox"
                      checked={widgetCfg[key]?.enabled !== false}
                      onChange={e => setWidget(key, 'enabled', e.target.checked)}
                      style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }}
                    />
                    <span style={{
                      position: 'absolute', inset: 0, borderRadius: 22,
                      background: widgetCfg[key]?.enabled !== false ? 'var(--accent)' : '#ccc',
                      transition: 'background 0.2s',
                    }} />
                    <span style={{
                      position: 'absolute', top: 3, left: widgetCfg[key]?.enabled !== false ? 21 : 3,
                      width: 16, height: 16, borderRadius: '50%', background: '#fff',
                      transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                    }} />
                  </label>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ② Google Calendar */}
        <div style={secStyle}>
          <div style={secHdStyle}>
            <span style={secTitle}>{t(lang, 'admin.gcalTitle')}</span>
            <span style={{ fontSize: '0.72rem', color: 'var(--ink3)', background: 'var(--card2)', padding: '0.2rem 0.6rem', borderRadius: 10, border: '1px solid var(--border)' }}>{t(lang, 'admin.gcalBadge')}</span>
          </div>
          <div style={secBdStyle}>
            <div style={{ background: 'var(--card2)', borderRadius: 10, padding: '0.8rem 1rem', borderLeft: '3px solid var(--accent)' }}>
              <p style={{ fontSize: '0.82rem', color: 'var(--ink2)', lineHeight: 1.7 }}>
                <strong style={{ color: 'var(--ink)', fontWeight: 500 }}>{t(lang, 'admin.gcalHowToLabel')}</strong><br />
                1. Google Cloud Console → OAuth 2.0 {t(lang, 'admin.gcalStep1')}<br />
                2. Spring Boot {t(lang, 'admin.gcalStep2')}<br />
                3. {t(lang, 'admin.gcalStep3')}
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ ...formGrp, flex: 2 }}>
                <label style={lbl}>Google Client ID</label>
                <input type="text" placeholder={t(lang, 'admin.gcalClientIdPh')} style={inp} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ ...formGrp, flex: 2 }}>
                <label style={lbl}>Google Client Secret</label>
                <input type="password" placeholder={t(lang, 'admin.gcalSecretPh')} style={inp} />
              </div>
              <button onClick={() => showToast(t(lang, 'admin.gcalToastSaved'), 'ok')}
                style={{ padding: '0.48rem 1.1rem', fontSize: '0.85rem', fontWeight: 500, cursor: 'pointer', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontFamily: 'inherit', alignSelf: 'flex-end' }}>{t(lang, 'admin.save')}</button>
            </div>
          </div>
        </div>

        {/* ③ 유튜브 */}
        <div style={secStyle}>
          <div style={secHdStyle}><span style={secTitle}>{t(lang, 'admin.ytSectionTitle')}</span></div>
          <div style={secBdStyle}>
            <p style={{ fontSize: '0.78rem', color: 'var(--ink3)' }}>{t(lang, 'admin.ytAccountDesc')}</p>
            <div style={{ background: 'var(--card2)', borderRadius: 10, border: '1px solid var(--border)', padding: '0.9rem 1rem', display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#ff0000', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '1.2rem', flexShrink: 0 }}>▶</div>
              <div><div style={{ fontSize: '0.88rem', color: 'var(--ink)', fontWeight: 400 }}>{ytAccount.email || t(lang, 'admin.ytNoAccount')}</div><div style={{ fontSize: '0.72rem', color: 'var(--ink3)' }}>{t(lang, 'admin.ytPremiumLabel')}</div></div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={formGrp}><label style={lbl}>{t(lang, 'admin.ytNameLabel')}</label><input type="text" value={ytAccName} onChange={e => setYtAccName(e.target.value)} placeholder={t(lang, 'admin.ytNamePh')} style={inp} /></div>
              <div style={{ ...formGrp, flex: 2 }}><label style={lbl}>{t(lang, 'admin.ytEmailLabel')}</label><input type="email" value={ytAccEmail} onChange={e => setYtAccEmail(e.target.value)} placeholder="example@gmail.com" style={inp} /></div>
              <button onClick={saveYTAccount} style={{ padding: '0.48rem 1.1rem', fontSize: '0.85rem', fontWeight: 500, cursor: 'pointer', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontFamily: 'inherit', alignSelf: 'flex-end' }}>{t(lang, 'admin.ytSaveAccountBtn')}</button>
            </div>
            <div style={{ height: '0.5px', background: 'var(--border)' }} />
            <p style={{ fontSize: '0.78rem', color: 'var(--ink3)' }}>{t(lang, 'admin.ytChannelDesc')}</p>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={formGrp}><label style={lbl}>{t(lang, 'admin.ytChannelNameLabel')}</label><input type="text" value={ytName} onChange={e => setYtName(e.target.value)} placeholder={t(lang, 'admin.ytChannelNamePh')} style={inp} /></div>
              <div style={{ ...formGrp, flex: 2 }}><label style={lbl}>{t(lang, 'admin.ytUrlLabel')}</label><input type="url" value={ytUrl} onChange={e => setYtUrl(e.target.value)} placeholder="https://www.youtube.com/@channel" style={inp} /></div>
              <button onClick={addYT} style={{ padding: '0.48rem 1.1rem', fontSize: '0.85rem', fontWeight: 500, cursor: 'pointer', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontFamily: 'inherit', alignSelf: 'flex-end' }}>{t(lang, 'admin.ytAddBtn')}</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {!ytChannels.length
                ? <div style={{ fontSize: '0.82rem', color: 'var(--ink3)', fontStyle: 'italic', textAlign: 'center', padding: '0.5rem' }}>{t(lang, 'admin.ytNoChannels')}</div>
                : ytChannels.map(c => (
                  <div key={c.id} style={itemRow}>
                    <div style={{ width: 32, height: 22, background: '#ff0000', borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.7rem', flexShrink: 0 }}>▶</div>
                    <div style={itemInfo}><div style={{ fontSize: '0.85rem', color: 'var(--ink)' }}>{c.channel_name}</div><div style={{ fontSize: '0.72rem', color: 'var(--ink3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.channel_url || ''}</div></div>
                    <button className="btn-danger" onClick={() => delYT(c.id)}>{t(lang, 'admin.delStock')}</button>
                  </div>
                ))}
            </div>
          </div>
        </div>

        {/* ⑤ 시간대 설정 */}
        <div style={secStyle}>
          <div style={secHdStyle}>
            <span style={secTitle}>🕐 {t(lang, 'admin.tzTitle')}</span>
            <button onClick={saveTZ} style={{ padding: '0.48rem 1.1rem', fontSize: '0.85rem', fontWeight: 500, cursor: 'pointer', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontFamily: 'inherit' }}>{t(lang, 'admin.save')}</button>
          </div>
          <div style={secBdStyle}>
            <p style={{ fontSize: '0.82rem', color: 'var(--ink3)' }}>{t(lang, 'admin.tzDesc')}</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '0.8rem' }}>
              {[t(lang, 'admin.tzZone1'), t(lang, 'admin.tzZone2'), t(lang, 'admin.tzZone3')].map((label, i) => (
                <div key={i} style={{ background: 'var(--card2)', borderRadius: 10, border: '1px solid var(--border)', padding: '0.9rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 500, color: 'var(--ink3)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{label}</div>
                  <div style={{ fontFamily: "'Playfair Display',serif", fontSize: '1.4rem', fontWeight: 300, color: 'var(--ink)' }}>{tzPreviews[i]}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--ink2)' }}>{tzData[i]?.region}</div>
                  <select value={tzData[i]?.tz || ''} onChange={e => updateTz(i, 'tz', e.target.value)}
                    style={{ padding: '0.4rem 0.6rem', fontSize: '0.82rem', border: '1px solid var(--border)', borderRadius: 7, background: 'var(--bg)', color: 'var(--ink)', fontFamily: 'inherit', width: '100%' }}>
                    {ALL_TZ.map(tz => <option key={tz.tz} value={tz.tz}>{t(lang, 'admin.' + tz.labelKey)}</option>)}
                  </select>
                  <input type="text" value={tzData[i]?.region || ''} onChange={e => updateTz(i, 'region', e.target.value)}
                    placeholder={t(lang, `admin.tzPlaceholder${i + 1}`)}
                    style={{ padding: '0.4rem 0.6rem', fontSize: '0.82rem', border: '1px solid var(--border)', borderRadius: 7, background: 'var(--bg)', color: 'var(--ink)', fontFamily: 'inherit', width: '100%' }} />
                </div>
              ))}
            </div>
          </div>
        </div>

        <button onClick={saveAll} style={{ padding: '0.9rem 2rem', fontSize: '0.95rem', fontWeight: 700, cursor: 'pointer', background: 'var(--green)', color: '#fff', border: 'none', borderRadius: 12, fontFamily: 'inherit', width: '100%', letterSpacing: '0.04em', transition: 'background 0.15s' }}>
          {t(lang, 'admin.saveAll')}
        </button>
      </main>

      <Toast toast={toast} />
    </div>
  )
}
