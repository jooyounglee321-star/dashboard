import { useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import Toast, { useToast } from '../components/Toast'
import { t } from '../i18n'

const PAGE_SIZE = 25

function fmtDate(iso, lang) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(lang === 'en' ? 'en-US' : 'ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
}
function fmtDatetime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`
}
function planLabel(p)   { return p === 'premium' ? 'Premium' : 'Free' }
function roleLabel(r)   { return { admin:'admin', premium:'premium', free:'free', guest:'guest' }[r] || r || '—' }

function debounce(fn, ms) {
  let timer
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms) }
}

export default function SuperadminPage() {
  const { toast, showToast } = useToast()
  const [allUsers, setAllUsers] = useState([])
  const [stats, setStats] = useState(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [planFilter, setPlanFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [sortSelect, setSortSelect] = useState('created_at|desc')

  const [lang, setLang] = useState(() => {
    try { return localStorage.getItem('dashboard_lang') || 'ko' } catch { return 'ko' }
  })
  const [modal, setModal] = useState(null)
  const [modalListPos, setModalListPos] = useState(null)
  const [modalPlan, setModalPlan] = useState('free')
  const [modalExpires, setModalExpires] = useState('')
  const [modalMemo, setModalMemo] = useState('')
  const [pwResult, setPwResult] = useState('')

  const [changelog, setChangelog] = useState([])
  const [clLoading, setClLoading] = useState(false)
  const [clSearch, setClSearch] = useState('')
  const [clOpen, setClOpen] = useState(new Set())

  const [debugMode, setDebugMode] = useState(
    () => localStorage.getItem('dashboard_debug_mode') === 'true'
  )

  function toggleDebugMode() {
    const next = !debugMode
    if (next) localStorage.setItem('dashboard_debug_mode', 'true')
    else localStorage.removeItem('dashboard_debug_mode')
    setDebugMode(next)
    window.dispatchEvent(new Event('dashboard_debug_toggle'))
  }

  useEffect(() => {
    function handleLangChange() {
      try { setLang(localStorage.getItem('dashboard_lang') || 'ko') } catch {}
    }
    window.addEventListener('languageChanged', handleLangChange)
    return () => window.removeEventListener('languageChanged', handleLangChange)
  }, [])

  function statusLabel(s) {
    const map = { active: t(lang, 'superadmin.statusActive'), inactive: t(lang, 'superadmin.statusInactive'), suspended: t(lang, 'superadmin.statusSuspended') }
    return map[s] || s || '—'
  }

  const loadUsers = useCallback(async (overrides = {}) => {
    setLoading(true)
    const s   = overrides.search       ?? search
    const p   = overrides.planFilter   ?? planFilter
    const st  = overrides.statusFilter ?? statusFilter
    const srt = overrides.sortSelect   ?? sortSelect
    const [sortBy, order] = srt.split('|')
    const params = new URLSearchParams({ sort_by: sortBy, order })
    if (s)  params.set('search', s)
    if (p)  params.set('plan', p)
    if (st) params.set('status', st)
    const tok = { Authorization: 'Bearer ' + localStorage.getItem('token') }
    try {
      const [usersRes, statsRes] = await Promise.all([
        fetch('/api/admin/users?' + params, { headers: tok }),
        fetch('/api/admin/stats', { headers: tok }),
      ])
      setAllUsers(usersRes.ok ? await usersRes.json() : [])
      if (statsRes.ok) setStats(await statsRes.json())
    } catch { setAllUsers([]) }
    finally { setLoading(false) }
  }, [search, planFilter, statusFilter, sortSelect])

  useEffect(() => { loadUsers() }, []) // eslint-disable-line

  useEffect(() => {
    setClLoading(true)
    const tok = { Authorization: 'Bearer ' + localStorage.getItem('token') }
    fetch('/api/admin/superadmin/changelog', { headers: tok })
      .then(r => r.ok ? r.json() : [])
      .catch(() => [])
      .then(data => {
        setChangelog(data)
        // 최신 3개는 기본 펼침
        setClOpen(new Set(data.slice(0, 3).map((_, i) => i)))
      })
      .finally(() => setClLoading(false))
  }, [])

  const debouncedSearch = useRef(debounce((val) => {
    setSearch(val)
    loadUsers({ search: val })
  }, 350)).current

  const start = (currentPage - 1) * PAGE_SIZE
  const page  = allUsers.slice(start, start + PAGE_SIZE)
  const pages = Math.ceil(allUsers.length / PAGE_SIZE)

  async function openModal(id) {
    setPwResult('')
    try {
      const res = await fetch(`/api/admin/users/${id}`, { headers: { Authorization: 'Bearer ' + localStorage.getItem('token') } })
      if (!res.ok) throw new Error()
      const u = await res.json()
      setModal(u)
      setModalPlan(u.plan || 'free')
      setModalExpires(u.plan_expires_at ? u.plan_expires_at.slice(0,10) : '')
      setModalMemo(u.admin_memo || '')
    } catch { showToast(t(lang, 'superadmin.toastLoadErr'), 'err') }
  }

  async function savePlan() {
    if (!modal) return
    const res = await fetch(`/api/admin/users/${modal.id}/plan`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('token') },
      body: JSON.stringify({ plan: modalPlan, plan_expires_at: modalExpires || null }),
    })
    if (res.ok) { showToast(t(lang, 'superadmin.toastPlanSaved'), 'ok'); loadUsers() }
    else showToast(t(lang, 'superadmin.toastSaveErr'), 'err')
  }

  async function saveStatus(status) {
    if (!modal) return
    const res = await fetch(`/api/admin/users/${modal.id}/status`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('token') },
      body: JSON.stringify({ status }),
    })
    if (res.ok) {
      showToast(`[${statusLabel(status)}]`, 'ok')
      loadUsers()
      const r2 = await fetch(`/api/admin/users/${modal.id}`, { headers: { Authorization: 'Bearer ' + localStorage.getItem('token') } })
      if (r2.ok) { const u = await r2.json(); setModal(u) }
    } else showToast(t(lang, 'superadmin.toastSaveErr'), 'err')
  }

  async function resetPassword() {
    if (!modal) return
    if (!window.confirm(t(lang, 'superadmin.confirmResetPw'))) return
    const res = await fetch(`/api/admin/users/${modal.id}/reset-password`, { method: 'POST', headers: { Authorization: 'Bearer ' + localStorage.getItem('token') } })
    if (res.ok) {
      const data = await res.json()
      setPwResult(data.new_password)
      showToast(t(lang, 'superadmin.toastPwIssued'), 'ok')
    } else {
      const err = await res.json().catch(() => ({}))
      showToast(err.detail || t(lang, 'superadmin.toastPwErr'), 'err')
    }
  }

  async function saveMemo() {
    if (!modal) return
    const res = await fetch(`/api/admin/users/${modal.id}/memo`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('token') },
      body: JSON.stringify({ admin_memo: modalMemo }),
    })
    if (res.ok) showToast(t(lang, 'superadmin.toastMemoSaved'), 'ok')
    else showToast(t(lang, 'superadmin.toastSaveErr'), 'err')
  }

  function handleSortChange(val) {
    setSortSelect(val)
    loadUsers({ sortSelect: val })
  }
  function handlePlanFilterChange(val) {
    setPlanFilter(val)
    loadUsers({ planFilter: val })
  }
  function handleStatusFilterChange(val) {
    setStatusFilter(val)
    loadUsers({ statusFilter: val })
  }

  const TYPE_BADGE = {
    feat:     { bg: '#dbeafe', color: '#1d4ed8' },
    fix:      { bg: '#dcfce7', color: '#166534' },
    design:   { bg: '#f3e8ff', color: '#6b21a8' },
    refactor: { bg: '#ffedd5', color: '#9a3412' },
    perf:     { bg: '#fef9c3', color: '#854d0e' },
    docs:     { bg: '#e0f2fe', color: '#0369a1' },
    chore:    { bg: '#f1f5f9', color: '#475569' },
  }
  function typeBadge(type) {
    const s = (type || 'feat').toLowerCase()
    const { bg, color } = TYPE_BADGE[s] || { bg: '#f1f5f9', color: '#475569' }
    return (
      <span style={{ fontSize: '0.68rem', fontWeight: 600, background: bg, color, padding: '0.1em 0.45em', borderRadius: 4, letterSpacing: '0.04em', whiteSpace: 'nowrap', flexShrink: 0 }}>
        {s}
      </span>
    )
  }

  function renderDesc(text) {
    const parts = []
    let key = 0
    const re = /(`([^`]+)`)/g
    let last = 0, m
    re.lastIndex = 0
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) parts.push(<span key={key++}>{text.slice(last, m.index)}</span>)
      parts.push(<code key={key++} style={{ background: 'var(--bg2)', padding: '0.1em 0.35em', borderRadius: 3, fontSize: '0.82em', fontFamily: 'monospace' }}>{m[2]}</code>)
      last = m.index + m[0].length
    }
    if (last < text.length) parts.push(<span key={key++}>{text.slice(last)}</span>)
    return parts
  }

  const clFiltered = changelog.filter(entry => {
    if (!clSearch.trim()) return true
    const q = clSearch.toLowerCase()
    return entry.date.includes(q) ||
      (entry.titles || []).some(title => title.toLowerCase().includes(q)) ||
      entry.items.some(item =>
        (item.widget || '').toLowerCase().includes(q) ||
        (item.desc || '').toLowerCase().includes(q) ||
        (item.type || '').toLowerCase().includes(q)
      )
  })

  function toggleCl(i) {
    setClOpen(prev => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
  }

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      <header className="header">
        <div className="header-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {t(lang, 'superadmin.title')}
          <span style={{ fontSize: '0.65rem', background: '#c0392b', color: '#fff', padding: '0.15rem 0.5rem', borderRadius: 4, fontFamily: "'Noto Sans KR',sans-serif", fontWeight: 500, letterSpacing: '0.08em' }}>
            SUPER ADMIN
          </span>
        </div>
        <nav className="header-nav">
          <Link to="/admin" className="nav-link">{t(lang, 'superadmin.dashSettings')}</Link>
          <Link to="/superadmin" className="nav-link active">{t(lang, 'superadmin.superadminLink')}</Link>
          <Link to="/" className="nav-link">{t(lang, 'superadmin.homeLink')}</Link>
        </nav>
      </header>

      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '1.5rem 1.2rem' }}>
        {/* 요약 칩 */}
        <div className="summary-bar">
          <div className="chip"><div className="chip-label">{t(lang, 'superadmin.totalUsers')}</div><div className="chip-value">{stats ? stats.total.toLocaleString() : '—'}</div></div>
          <div className="chip"><div className="chip-label">{t(lang, 'superadmin.todayNew')}</div><div className="chip-value accent">{stats ? stats.today_new.toLocaleString() : '—'}</div></div>
          <div className="chip"><div className="chip-label">{t(lang, 'superadmin.premiumUsers')}</div><div className="chip-value green">{stats ? stats.premium.toLocaleString() : '—'}</div></div>
          <div className="chip"><div className="chip-label">{t(lang, 'superadmin.monthNew')}</div><div className="chip-value blue">{stats ? stats.month_new.toLocaleString() : '—'}</div></div>
          <div className="chip"><div className="chip-label">{t(lang, 'superadmin.monthPayment')}</div><div className="chip-value">{stats ? '₩' + Math.round(stats.month_payment).toLocaleString() : '—'}</div></div>
        </div>

        {/* 테이블 카드 */}
        <div className="card">
          <div className="card-top">
            <span className="card-title-txt">{t(lang, 'superadmin.memberList')}</span>
            <div className="filter-bar">
              <input type="text" placeholder={t(lang, 'superadmin.searchPlaceholder')}
                onChange={e => debouncedSearch(e.target.value)} />
              <select value={planFilter} onChange={e => handlePlanFilterChange(e.target.value)}>
                <option value="">{t(lang, 'superadmin.allPlans')}</option>
                <option value="free">Free</option>
                <option value="premium">Premium</option>
              </select>
              <select value={statusFilter} onChange={e => handleStatusFilterChange(e.target.value)}>
                <option value="">{t(lang, 'superadmin.allStatus')}</option>
                <option value="active">{t(lang, 'superadmin.statusActive')}</option>
                <option value="inactive">{t(lang, 'superadmin.statusInactive')}</option>
                <option value="suspended">{t(lang, 'superadmin.statusSuspended')}</option>
              </select>
              <select value={sortSelect} onChange={e => handleSortChange(e.target.value)}>
                <option value="created_at|desc">{t(lang, 'superadmin.sortNewest')}</option>
                <option value="created_at|asc">{t(lang, 'superadmin.sortOldest')}</option>
                <option value="last_login_at|desc">{t(lang, 'superadmin.sortLastLogin')}</option>
                <option value="login_count|desc">{t(lang, 'superadmin.sortLoginCount')}</option>
                <option value="total_payment|desc">{t(lang, 'superadmin.sortPayment')}</option>
              </select>
              <button className="btn btn-primary" onClick={() => loadUsers()}>{t(lang, 'common.refresh')}</button>
            </div>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t(lang, 'superadmin.colId')}</th>
                  <th>{t(lang, 'superadmin.colName')}</th>
                  <th>{t(lang, 'superadmin.colEmail')}</th>
                  <th>{t(lang, 'superadmin.colProvider')}</th>
                  <th>{t(lang, 'superadmin.colJoined')}</th>
                  <th>{t(lang, 'superadmin.colPlan')}</th>
                  <th>{t(lang, 'superadmin.colRole')}</th>
                  <th>{t(lang, 'superadmin.colExpires')}</th>
                  <th>{t(lang, 'superadmin.colStatus')}</th>
                  <th>{t(lang, 'superadmin.colLastLogin')}</th>
                  <th>{t(lang, 'superadmin.colLogins')}</th>
                  <th>{t(lang, 'superadmin.colAutoLogins')}</th>
                  <th>{t(lang, 'superadmin.colPayment')}</th>
                  <th>{t(lang, 'superadmin.colDevice')}</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr className="state-row"><td colSpan={14}>{t(lang, 'superadmin.loading')}</td></tr>
                ) : !page.length ? (
                  <tr className="state-row"><td colSpan={14}>{t(lang, 'superadmin.noResults')}</td></tr>
                ) : page.map((u, i) => (
                  <tr key={u.id} style={{ cursor: 'pointer' }} onClick={() => {
                    setPwResult('')
                    setModal(u)
                    setModalListPos(start + i + 1)
                    setModalPlan(u.plan || 'free')
                    setModalExpires(u.plan_expires_at ? u.plan_expires_at.slice(0, 10) : '')
                    setModalMemo(u.admin_memo || '')
                  }}>
                    <td style={{ color: 'var(--ink3)', fontSize: '0.75rem' }}>{start + i + 1}</td>
                    <td>{u.name || '—'}</td>
                    <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</td>
                    <td style={{ whiteSpace: 'nowrap', fontSize: '0.8rem' }}>
                      {u.social_provider === 'google' ? '🔵 구글'
                        : u.social_provider === 'facebook' ? '🔷 페이스북'
                        : '📧 이메일'}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(u.created_at, lang)}</td>
                    <td><span className={`badge badge-${u.plan}`}>{planLabel(u.plan)}</span></td>
                    <td><span className={`badge badge-role-${u.role}`}>{roleLabel(u.role)}</span></td>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(u.plan_expires_at, lang)}</td>
                    <td><span className={`badge badge-${u.status}`}>{statusLabel(u.status)}</span></td>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDatetime(u.last_login_at)}</td>
                    <td style={{ textAlign: 'right' }}>{(u.login_count ?? 0).toLocaleString()}</td>
                    <td style={{ textAlign: 'right' }}>{(u.auto_login_count ?? 0).toLocaleString()}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>₩{Math.round(u.total_payment ?? 0).toLocaleString()}</td>
                    <td>{u.primary_device
                      ? <span className={`badge badge-${u.primary_device.toLowerCase()}`}>{u.primary_device}</span>
                      : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="pagination">
            <span className="page-info">
              {allUsers.length > 0 ? `${start+1}–${Math.min(start+PAGE_SIZE, allUsers.length)} / ${allUsers.length}` : ''}
            </span>
            <button className="page-btn" onClick={() => setCurrentPage(p => p-1)} disabled={currentPage <= 1}>{t(lang, 'superadmin.prevPage')}</button>
            <button className="page-btn" onClick={() => setCurrentPage(p => p+1)} disabled={currentPage >= pages}>{t(lang, 'superadmin.nextPage')}</button>
          </div>
        </div>

        {/* ── CHANGELOG 섹션 ── */}
        <div style={{ marginTop: '2.5rem' }}>
          <hr style={{ border: 'none', borderTop: '1px solid var(--border)', marginBottom: '2rem' }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: 'var(--ink)' }}>{t(lang, 'superadmin.changelogTitle')}</h2>
            <input
              type="text"
              placeholder={t(lang, 'superadmin.changelogSearch')}
              value={clSearch}
              onChange={e => setClSearch(e.target.value)}
              style={{ padding: '0.4rem 0.75rem', fontSize: '0.82rem', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg)', color: 'var(--ink)', fontFamily: 'inherit', width: 260 }}
            />
          </div>

          {clLoading && <p style={{ color: 'var(--ink3)', fontSize: '0.85rem' }}>{t(lang, 'superadmin.changelogLoading')}</p>}

          {!clLoading && clFiltered.length === 0 && (
            <p style={{ color: 'var(--ink3)', fontSize: '0.85rem' }}>{t(lang, 'superadmin.changelogEmpty')}</p>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {clFiltered.map((entry, i) => {
              const isOpen = clOpen.has(i)
              return (
                <div key={entry.date + i} style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', background: 'var(--card)' }}>
                  <button
                    onClick={() => toggleCl(i)}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.7rem 1rem', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', gap: '0.75rem' }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.25rem', minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--ink)', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>{entry.date}</span>
                        <span style={{ fontSize: '0.72rem', background: 'var(--bg2)', color: 'var(--ink3)', padding: '0.1rem 0.45rem', borderRadius: 10, whiteSpace: 'nowrap' }}>
                          {entry.items.length}{t(lang, 'superadmin.changelogCount')}
                        </span>
                      </div>
                      {(entry.titles || []).length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                          {(entry.titles || []).map((title, ti) => {
                            const tm = title.match(/^(feat|fix|refactor|design|perf|docs|chore|style|test)\s*[—-]\s*/i)
                            const label = tm ? title.slice(tm[0].length) : title
                            return (
                              <span key={ti} style={{ fontSize: '0.72rem', color: 'var(--ink3)', lineHeight: 1.4 }}>
                                {ti > 0 && <span style={{ marginRight: '0.3rem', opacity: 0.4 }}>·</span>}
                                {label}
                              </span>
                            )
                          })}
                        </div>
                      )}
                    </div>
                    <span style={{ color: 'var(--ink3)', fontSize: '0.8rem', flexShrink: 0 }}>{isOpen ? '▲' : '▼'}</span>
                  </button>
                  {isOpen && (
                    <div style={{ padding: '0 1rem 0.85rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                      {entry.items.map((item, j) => {
                        const isLast = j === entry.items.length - 1
                        return (
                          <div key={j} style={{ display: 'flex', alignItems: 'baseline', gap: '0.45rem', fontSize: '0.83rem', color: 'var(--ink)', lineHeight: 1.55 }}>
                            <span style={{ color: 'var(--ink3)', fontFamily: 'monospace', fontSize: '0.78rem', flexShrink: 0, userSelect: 'none' }}>{isLast ? '└──' : '├──'}</span>
                            {typeBadge(item.type)}
                            {item.widget && <strong style={{ color: 'var(--ink)', fontWeight: 600, flexShrink: 0 }}>{item.widget}</strong>}
                            <span style={{ color: 'var(--ink2)' }}>{renderDesc(item.desc)}</span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* ── 디버그 모드 섹션 ── */}
        <div style={{ marginTop: '2.5rem' }}>
          <hr style={{ border: 'none', borderTop: '1px solid var(--border)', marginBottom: '2rem' }} />
          <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 1rem 0', color: 'var(--ink)' }}>🐛 디버그 모드</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
              padding: '0.28rem 0.75rem', borderRadius: 20, fontSize: '0.82rem', fontWeight: 600,
              background: debugMode ? 'rgba(22,163,74,0.12)' : 'rgba(156,163,175,0.15)',
              color: debugMode ? '#16a34a' : '#9ca3af',
              border: `1px solid ${debugMode ? 'rgba(22,163,74,0.3)' : 'rgba(156,163,175,0.3)'}`,
            }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: debugMode ? '#16a34a' : '#9ca3af', display: 'inline-block' }} />
              {debugMode ? 'ON' : 'OFF'}
            </span>
            <button
              onClick={toggleDebugMode}
              style={{
                padding: '0.42rem 1.1rem', fontSize: '0.85rem', fontWeight: 500,
                border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
                background: debugMode ? '#dc2626' : '#16a34a',
                color: '#fff', transition: 'background 0.15s',
              }}
            >
              {debugMode ? '디버그 모드 끄기' : '디버그 모드 켜기'}
            </button>
          </div>
          <p style={{ marginTop: '0.6rem', fontSize: '0.78rem', color: 'var(--ink3)', margin: '0.6rem 0 0' }}>
            디버그 모드 활성화 시 화면 우측 하단에 🐛 버튼이 표시됩니다.
          </p>
        </div>
      </div>

      {/* 회원 상세 모달 */}
      {modal && (
        <div className="modal-overlay open" onClick={e => { if (e.target === e.currentTarget) setModal(null) }}>
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">#{modalListPos} {modal.email}</span>
              <button className="modal-close" onClick={() => setModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              {/* 기본 정보 */}
              <div style={{ fontSize: '0.7rem', fontWeight: 500, letterSpacing: '0.1em', color: 'var(--ink3)', textTransform: 'uppercase', marginBottom: '0.75rem' }}>{t(lang, 'superadmin.basicInfo')}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem 1.2rem', marginBottom: '1.2rem' }}>
                {[
                  [t(lang, 'superadmin.fieldId'), modal.id],
                  [t(lang, 'superadmin.fieldName'), modal.name || '—'],
                  [t(lang, 'superadmin.fieldEmail'), modal.email],
                  [t(lang, 'superadmin.fieldRole'), modal.role],
                  [t(lang, 'superadmin.fieldProvider'),
                    modal.social_provider === 'google' ? '🔵 구글'
                    : modal.social_provider === 'facebook' ? '🔷 페이스북'
                    : '📧 이메일'],
                  [t(lang, 'superadmin.fieldJoined'), fmtDatetime(modal.created_at)],
                  [t(lang, 'superadmin.fieldPlan'), planLabel(modal.plan)],
                  [t(lang, 'superadmin.fieldExpires'), fmtDate(modal.plan_expires_at, lang)],
                  [t(lang, 'superadmin.fieldStatus'), statusLabel(modal.status)],
                  [t(lang, 'superadmin.fieldLastLogin'), fmtDatetime(modal.last_login_at)],
                  [t(lang, 'superadmin.fieldLoginCount'), `${(modal.login_count ?? 0).toLocaleString()} / ${(modal.auto_login_count ?? 0).toLocaleString()}`],
                  [t(lang, 'superadmin.fieldPayment'), '₩' + Math.round(modal.total_payment ?? 0).toLocaleString()],
                ].map(([label, val]) => (
                  <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                    <span style={{ fontSize: '0.67rem', color: 'var(--ink3)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{label}</span>
                    <span style={{ fontSize: '0.85rem', color: 'var(--ink)' }}>{String(val)}</span>
                  </div>
                ))}
              </div>
              <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '1rem 0' }} />

              {/* 플랜 변경 */}
              <div style={{ fontSize: '0.7rem', fontWeight: 500, letterSpacing: '0.1em', color: 'var(--ink3)', textTransform: 'uppercase', marginBottom: '0.75rem' }}>{t(lang, 'superadmin.changePlan')}</div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                <select value={modalPlan} onChange={e => setModalPlan(e.target.value)}
                  style={{ padding: '0.35rem 0.6rem', fontSize: '0.8rem', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg)', color: 'var(--ink)', fontFamily: 'inherit' }}>
                  <option value="free">Free</option>
                  <option value="premium">Premium</option>
                </select>
                <input type="date" value={modalExpires} onChange={e => setModalExpires(e.target.value)}
                  style={{ padding: '0.35rem 0.6rem', fontSize: '0.8rem', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg)', color: 'var(--ink)', fontFamily: 'inherit' }} />
                <button className="btn btn-primary btn-sm" onClick={savePlan}>{t(lang, 'common.save')}</button>
              </div>
              <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '1rem 0' }} />

              {/* 계정 상태 */}
              <div style={{ fontSize: '0.7rem', fontWeight: 500, letterSpacing: '0.1em', color: 'var(--ink3)', textTransform: 'uppercase', marginBottom: '0.75rem' }}>{t(lang, 'superadmin.changeStatus')}</div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                <button className="btn btn-green btn-sm" onClick={() => saveStatus('active')}>{t(lang, 'superadmin.activate')}</button>
                <button className="btn btn-gray btn-sm" onClick={() => saveStatus('inactive')}>{t(lang, 'superadmin.deactivate')}</button>
                <button className="btn btn-red btn-sm" onClick={() => saveStatus('suspended')}>{t(lang, 'superadmin.suspend')}</button>
              </div>
              <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '1rem 0' }} />

              {/* 비밀번호 초기화 */}
              <div style={{ fontSize: '0.7rem', fontWeight: 500, letterSpacing: '0.1em', color: 'var(--ink3)', textTransform: 'uppercase', marginBottom: '0.75rem' }}>{t(lang, 'superadmin.resetPassword')}</div>
              <p style={{ fontSize: '0.8rem', color: 'var(--ink3)', marginBottom: '0.5rem' }}>{t(lang, 'superadmin.resetPwNote')}</p>
              <button className="btn btn-blue btn-sm"
                disabled={!!modal.social_provider}
                onClick={resetPassword}>{t(lang, 'superadmin.resetPwBtn')}</button>
              {pwResult && (
                <div style={{ marginTop: '0.5rem' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--ink3)', marginBottom: '0.25rem' }}>{t(lang, 'superadmin.newPwLabel')}</div>
                  <div style={{ background: 'var(--card2)', border: '1px solid var(--border)', borderRadius: 8, padding: '0.65rem 1rem', fontFamily: 'monospace', fontSize: '1rem', letterSpacing: '0.12em', color: 'var(--ink)', wordBreak: 'break-all' }}>
                    {pwResult}
                  </div>
                </div>
              )}
              <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '1rem 0' }} />

              {/* 관리자 메모 */}
              <div style={{ fontSize: '0.7rem', fontWeight: 500, letterSpacing: '0.1em', color: 'var(--ink3)', textTransform: 'uppercase', marginBottom: '0.75rem' }}>{t(lang, 'superadmin.adminMemo')}</div>
              <textarea
                value={modalMemo} onChange={e => setModalMemo(e.target.value)}
                placeholder={t(lang, 'superadmin.memoPlaceholder')}
                style={{ width: '100%', minHeight: 80, resize: 'vertical', padding: '0.55rem 0.75rem', fontSize: '0.83rem', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg)', color: 'var(--ink)', fontFamily: 'inherit', marginBottom: '0.5rem' }}
              />
              <button className="btn btn-outline btn-sm" onClick={saveMemo}>{t(lang, 'superadmin.memoSave')}</button>
            </div>
          </div>
        </div>
      )}

      <Toast toast={toast} />
      <style>{`
        .badge-free     { background: #ede8e0; color: #6b5e4a; }
        .badge-premium  { background: #ffd5c0; color: #7a2a00; }
        .badge-active   { background: #c0edd8; color: #0d4a2a; }
        .badge-inactive { background: #e8e4dc; color: #6b5e4a; }
        .badge-suspended{ background: #fce0dc; color: #7a1a0d; }
        .badge-local    { background: #ede8e0; color: #6b5e4a; }
        .badge-google   { background: #fce8e6; color: #c5221f; }
        .badge-facebook { background: #dce8ff; color: #1a3d7c; }
        .badge-pc       { background: #dce8ff; color: #1a3d7c; }
        .badge-mobile   { background: #d8f0e8; color: #1a4d2a; }
        .badge-role-admin   { background: #fce0dc; color: #7a1a0d; font-weight: 600; }
        .badge-role-premium { background: #fff0c0; color: #7a5a00; font-weight: 600; }
        .badge-role-free    { background: #e8e4dc; color: #6b5e4a; }
        .badge-role-guest   { background: #f0eeec; color: #9a9080; }
      `}</style>
    </div>
  )
}
