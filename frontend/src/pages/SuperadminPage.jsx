import { useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import Toast, { useToast } from '../components/Toast'

const PAGE_SIZE = 25

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
}
function fmtDatetime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`
}
function planLabel(p)   { return p === 'premium' ? 'Premium' : 'Free' }
function statusLabel(s) { return { active:'활성', inactive:'비활성', suspended:'정지' }[s] || s || '—' }

function debounce(fn, ms) {
  let t
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms) }
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

  const [modal, setModal] = useState(null)        // user object
  const [modalPlan, setModalPlan] = useState('free')
  const [modalExpires, setModalExpires] = useState('')
  const [modalMemo, setModalMemo] = useState('')
  const [pwResult, setPwResult] = useState('')

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
    try {
      const [usersRes, statsRes] = await Promise.all([
        fetch('/api/admin/users?' + params),
        fetch('/api/admin/stats'),
      ])
      setAllUsers(usersRes.ok ? await usersRes.json() : [])
      if (statsRes.ok) setStats(await statsRes.json())
    } catch { setAllUsers([]) }
    finally { setLoading(false) }
  }, [search, planFilter, statusFilter, sortSelect])

  useEffect(() => { loadUsers() }, []) // eslint-disable-line

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
      const res = await fetch(`/api/admin/users/${id}`)
      if (!res.ok) throw new Error()
      const u = await res.json()
      setModal(u)
      setModalPlan(u.plan || 'free')
      setModalExpires(u.plan_expires_at ? u.plan_expires_at.slice(0,10) : '')
      setModalMemo(u.admin_memo || '')
    } catch { showToast('회원 정보를 불러올 수 없습니다.', 'err') }
  }

  async function savePlan() {
    if (!modal) return
    const res = await fetch(`/api/admin/users/${modal.id}/plan`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: modalPlan, plan_expires_at: modalExpires || null }),
    })
    if (res.ok) { showToast('플랜이 변경되었습니다.', 'ok'); loadUsers() }
    else showToast('변경 실패', 'err')
  }

  async function saveStatus(status) {
    if (!modal) return
    const res = await fetch(`/api/admin/users/${modal.id}/status`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (res.ok) {
      showToast(`계정 상태가 [${statusLabel(status)}]로 변경되었습니다.`, 'ok')
      loadUsers()
      const r2 = await fetch(`/api/admin/users/${modal.id}`)
      if (r2.ok) { const u = await r2.json(); setModal(u) }
    } else showToast('변경 실패', 'err')
  }

  async function resetPassword() {
    if (!modal) return
    if (!window.confirm('임시 비밀번호를 발급하시겠습니까? 기존 비밀번호는 즉시 무효화됩니다.')) return
    const res = await fetch(`/api/admin/users/${modal.id}/reset-password`, { method: 'POST' })
    if (res.ok) {
      const data = await res.json()
      setPwResult(data.new_password)
      showToast('임시 비밀번호가 발급되었습니다.', 'ok')
    } else {
      const err = await res.json().catch(() => ({}))
      showToast(err.detail || '초기화 실패', 'err')
    }
  }

  async function saveMemo() {
    if (!modal) return
    const res = await fetch(`/api/admin/users/${modal.id}/memo`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ admin_memo: modalMemo }),
    })
    if (res.ok) showToast('메모가 저장되었습니다.', 'ok')
    else showToast('저장 실패', 'err')
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

  const fmtKRW = v => Math.round(v).toLocaleString()

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      <header className="header">
        <div className="header-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          슈퍼어드민 — 회원관리
          <span style={{ fontSize: '0.65rem', background: '#c0392b', color: '#fff', padding: '0.15rem 0.5rem', borderRadius: 4, fontFamily: "'Noto Sans KR',sans-serif", fontWeight: 500, letterSpacing: '0.08em' }}>
            SUPER ADMIN
          </span>
        </div>
        <nav className="header-nav">
          <Link to="/admin" className="nav-link">대시보드 설정</Link>
          <Link to="/admin_users" className="nav-link">회원관리(구)</Link>
          <Link to="/superadmin" className="nav-link active">슈퍼어드민</Link>
          <Link to="/" className="nav-link">홈으로</Link>
        </nav>
      </header>

      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '1.5rem 1.2rem' }}>
        {/* 요약 칩 */}
        <div className="summary-bar">
          <div className="chip"><div className="chip-label">전체 회원</div><div className="chip-value">{stats ? stats.total.toLocaleString() : '—'}</div></div>
          <div className="chip"><div className="chip-label">오늘 가입자</div><div className="chip-value accent">{stats ? stats.today_new.toLocaleString() : '—'}</div></div>
          <div className="chip"><div className="chip-label">유료 회원</div><div className="chip-value green">{stats ? stats.premium.toLocaleString() : '—'}</div></div>
          <div className="chip"><div className="chip-label">이번달 신규</div><div className="chip-value blue">{stats ? stats.month_new.toLocaleString() : '—'}</div></div>
          <div className="chip"><div className="chip-label">이번달 결제</div><div className="chip-value">{stats ? '₩' + Math.round(stats.month_payment).toLocaleString() : '—'}</div></div>
        </div>

        {/* 테이블 카드 */}
        <div className="card">
          <div className="card-top">
            <span className="card-title-txt">가입 회원 목록</span>
            <div className="filter-bar">
              <input type="text" placeholder="이름 / 이메일 검색…"
                onChange={e => debouncedSearch(e.target.value)} />
              <select value={planFilter} onChange={e => handlePlanFilterChange(e.target.value)}>
                <option value="">전체 플랜</option>
                <option value="free">Free</option>
                <option value="premium">Premium</option>
              </select>
              <select value={statusFilter} onChange={e => handleStatusFilterChange(e.target.value)}>
                <option value="">전체 상태</option>
                <option value="active">활성</option>
                <option value="inactive">비활성</option>
                <option value="suspended">정지</option>
              </select>
              <select value={sortSelect} onChange={e => handleSortChange(e.target.value)}>
                <option value="created_at|desc">가입일 최신순</option>
                <option value="created_at|asc">가입일 오래된순</option>
                <option value="last_login_at|desc">마지막 접속 최신순</option>
                <option value="login_count|desc">로그인 많은순</option>
                <option value="total_payment|desc">결제 많은순</option>
              </select>
              <button className="btn btn-primary" onClick={() => loadUsers()}>새로고침</button>
            </div>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th><th>이름</th><th>이메일</th><th>가입일</th>
                  <th>플랜</th><th>플랜 만료일</th><th>계정 상태</th>
                  <th>마지막 접속</th><th>로그인</th><th>누적결제</th><th>기기</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr className="state-row"><td colSpan={11}>불러오는 중…</td></tr>
                ) : !page.length ? (
                  <tr className="state-row"><td colSpan={11}>일치하는 회원이 없습니다.</td></tr>
                ) : page.map((u, i) => (
                  <tr key={u.id} style={{ cursor: 'pointer' }} onClick={() => openModal(u.id)}>
                    <td style={{ color: 'var(--ink3)', fontSize: '0.75rem' }}>{start + i + 1}</td>
                    <td>{u.name || '—'}</td>
                    <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(u.created_at)}</td>
                    <td><span className={`badge badge-${u.plan}`}>{planLabel(u.plan)}</span></td>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(u.plan_expires_at)}</td>
                    <td><span className={`badge badge-${u.status}`}>{statusLabel(u.status)}</span></td>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDatetime(u.last_login_at)}</td>
                    <td style={{ textAlign: 'right' }}>{(u.login_count ?? 0).toLocaleString()}</td>
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
              {allUsers.length > 0 ? `${start+1}–${Math.min(start+PAGE_SIZE, allUsers.length)} / ${allUsers.length}명` : ''}
            </span>
            <button className="page-btn" onClick={() => setCurrentPage(p => p-1)} disabled={currentPage <= 1}>← 이전</button>
            <button className="page-btn" onClick={() => setCurrentPage(p => p+1)} disabled={currentPage >= pages}>다음 →</button>
          </div>
        </div>
      </div>

      {/* 회원 상세 모달 */}
      {modal && (
        <div className="modal-overlay open" onClick={e => { if (e.target === e.currentTarget) setModal(null) }}>
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">#{modal.id} {modal.name || modal.email}</span>
              <button className="modal-close" onClick={() => setModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              {/* 기본 정보 */}
              <div style={{ fontSize: '0.7rem', fontWeight: 500, letterSpacing: '0.1em', color: 'var(--ink3)', textTransform: 'uppercase', marginBottom: '0.75rem' }}>기본 정보</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem 1.2rem', marginBottom: '1.2rem' }}>
                {[
                  ['ID', modal.id], ['이름', modal.name || '—'], ['이메일', modal.email],
                  ['역할', modal.role], ['가입경로', modal.provider], ['가입일', fmtDatetime(modal.created_at)],
                  ['플랜', planLabel(modal.plan)], ['플랜 만료', fmtDate(modal.plan_expires_at)],
                  ['상태', statusLabel(modal.status)], ['마지막 접속', fmtDatetime(modal.last_login_at)],
                  ['로그인 횟수', (modal.login_count ?? 0).toLocaleString() + '회'],
                  ['누적 결제', '₩' + Math.round(modal.total_payment ?? 0).toLocaleString()],
                ].map(([label, val]) => (
                  <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                    <span style={{ fontSize: '0.67rem', color: 'var(--ink3)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{label}</span>
                    <span style={{ fontSize: '0.85rem', color: 'var(--ink)' }}>{String(val)}</span>
                  </div>
                ))}
              </div>
              <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '1rem 0' }} />

              {/* 플랜 변경 */}
              <div style={{ fontSize: '0.7rem', fontWeight: 500, letterSpacing: '0.1em', color: 'var(--ink3)', textTransform: 'uppercase', marginBottom: '0.75rem' }}>플랜 변경</div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                <select value={modalPlan} onChange={e => setModalPlan(e.target.value)}
                  style={{ padding: '0.35rem 0.6rem', fontSize: '0.8rem', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg)', color: 'var(--ink)', fontFamily: 'inherit' }}>
                  <option value="free">Free</option>
                  <option value="premium">Premium</option>
                </select>
                <input type="date" value={modalExpires} onChange={e => setModalExpires(e.target.value)}
                  style={{ padding: '0.35rem 0.6rem', fontSize: '0.8rem', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg)', color: 'var(--ink)', fontFamily: 'inherit' }} />
                <button className="btn btn-primary btn-sm" onClick={savePlan}>저장</button>
              </div>
              <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '1rem 0' }} />

              {/* 계정 상태 */}
              <div style={{ fontSize: '0.7rem', fontWeight: 500, letterSpacing: '0.1em', color: 'var(--ink3)', textTransform: 'uppercase', marginBottom: '0.75rem' }}>계정 상태 변경</div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                <button className="btn btn-green btn-sm" onClick={() => saveStatus('active')}>✓ 활성화</button>
                <button className="btn btn-gray btn-sm" onClick={() => saveStatus('inactive')}>비활성</button>
                <button className="btn btn-red btn-sm" onClick={() => saveStatus('suspended')}>⊘ 정지</button>
              </div>
              <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '1rem 0' }} />

              {/* 비밀번호 초기화 */}
              <div style={{ fontSize: '0.7rem', fontWeight: 500, letterSpacing: '0.1em', color: 'var(--ink3)', textTransform: 'uppercase', marginBottom: '0.75rem' }}>비밀번호 초기화</div>
              <p style={{ fontSize: '0.8rem', color: 'var(--ink3)', marginBottom: '0.5rem' }}>이메일(local) 가입 계정만 가능합니다.</p>
              <button className="btn btn-blue btn-sm"
                disabled={modal.provider !== 'local'}
                title={modal.provider !== 'local' ? '소셜 로그인 계정은 지원하지 않습니다.' : ''}
                onClick={resetPassword}>🔑 임시 비밀번호 발급</button>
              {pwResult && (
                <div style={{ marginTop: '0.5rem' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--ink3)', marginBottom: '0.25rem' }}>새 비밀번호 (사용자에게 전달하세요)</div>
                  <div style={{ background: 'var(--card2)', border: '1px solid var(--border)', borderRadius: 8, padding: '0.65rem 1rem', fontFamily: 'monospace', fontSize: '1rem', letterSpacing: '0.12em', color: 'var(--ink)', wordBreak: 'break-all' }}>
                    {pwResult}
                  </div>
                </div>
              )}
              <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '1rem 0' }} />

              {/* 관리자 메모 */}
              <div style={{ fontSize: '0.7rem', fontWeight: 500, letterSpacing: '0.1em', color: 'var(--ink3)', textTransform: 'uppercase', marginBottom: '0.75rem' }}>관리자 메모</div>
              <textarea
                value={modalMemo} onChange={e => setModalMemo(e.target.value)}
                placeholder="이 회원에 대한 내부 메모를 입력하세요…"
                style={{ width: '100%', minHeight: 80, resize: 'vertical', padding: '0.55rem 0.75rem', fontSize: '0.83rem', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg)', color: 'var(--ink)', fontFamily: 'inherit', marginBottom: '0.5rem' }}
              />
              <button className="btn btn-outline btn-sm" onClick={saveMemo}>메모 저장</button>
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
      `}</style>
    </div>
  )
}
