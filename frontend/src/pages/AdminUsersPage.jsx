import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'

const PAGE_SIZE = 20

function fmtDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

function ProviderBadge({ provider }) {
  const labels = { local: '이메일', google: '구글', facebook: '페이스북' }
  const label = labels[provider] || provider
  const dotStyle = {
    local: { background: '#a89880' },
    google: { background: '#ea4335' },
    facebook: { background: '#1877f2' },
  }
  return (
    <span className={`badge badge-${provider}`}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', display: 'inline-block', ...(dotStyle[provider] || {}) }} />
      {label}
    </span>
  )
}

export default function AdminUsersPage() {
  const [allUsers, setAllUsers] = useState([])
  const [filtered, setFiltered] = useState([])
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [providerFilter, setProviderFilter] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [loading, setLoading] = useState(true)

  const loadUsers = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/auth/users', { headers: { Authorization: 'Bearer ' + localStorage.getItem('token') } })
      const data = res.ok ? await res.json() : []
      setAllUsers(data)
    } catch { setAllUsers([]) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { loadUsers() }, [loadUsers])

  useEffect(() => {
    const kw = search.trim().toLowerCase()
    const result = allUsers.filter(u =>
      (!kw || u.email.toLowerCase().includes(kw)) &&
      (!roleFilter || u.role === roleFilter) &&
      (!providerFilter || u.provider === providerFilter)
    )
    setFiltered(result)
    setCurrentPage(1)
  }, [allUsers, search, roleFilter, providerFilter])

  const count = (key, val) => allUsers.filter(u => u[key] === val).length
  const start = (currentPage - 1) * PAGE_SIZE
  const page = filtered.slice(start, start + PAGE_SIZE)
  const pages = Math.ceil(filtered.length / PAGE_SIZE)

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      <header className="header">
        <div className="header-title">어드민 — 회원관리</div>
        <nav className="header-nav">
          <Link to="/admin" className="nav-link">대시보드 설정</Link>
          <Link to="/admin_users" className="nav-link active">회원관리</Link>
          <Link to="/" className="nav-link">홈으로</Link>
        </nav>
      </header>

      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '1.5rem 1.2rem' }}>
        {/* 요약 칩 */}
        <div className="summary-bar">
          <div className="chip"><div className="chip-label">전체 회원</div><div className="chip-value">{allUsers.length || '—'}</div></div>
          <div className="chip"><div className="chip-label">이메일 가입</div><div className="chip-value">{allUsers.length ? count('provider', 'local') : '—'}</div></div>
          <div className="chip"><div className="chip-label">구글</div><div className="chip-value accent">{allUsers.length ? count('provider', 'google') : '—'}</div></div>
          <div className="chip"><div className="chip-label">페이스북</div><div className="chip-value">{allUsers.length ? count('provider', 'facebook') : '—'}</div></div>
          <div className="chip"><div className="chip-label">관리자</div><div className="chip-value">{allUsers.length ? count('role', 'Admin') : '—'}</div></div>
        </div>

        <div className="card">
          <div className="card-top">
            <span className="card-title-txt">가입 회원 목록</span>
            <div className="filter-bar">
              <input type="text" placeholder="이메일 검색…" value={search} onChange={e => setSearch(e.target.value)} style={{ width: 190 }} />
              <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
                <option value="">전체 역할</option>
                <option value="Admin">Admin</option>
                <option value="Member">Member</option>
              </select>
              <select value={providerFilter} onChange={e => setProviderFilter(e.target.value)}>
                <option value="">전체 가입경로</option>
                <option value="local">이메일</option>
                <option value="google">구글</option>
                <option value="facebook">페이스북</option>
              </select>
              <button className="btn btn-primary" onClick={loadUsers}>새로고침</button>
            </div>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th><th>이메일</th><th>역할</th><th>가입경로</th><th>가입일</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr className="state-row"><td colSpan={5}>불러오는 중…</td></tr>
                ) : !page.length ? (
                  <tr className="state-row"><td colSpan={5}>가입된 회원이 없습니다.</td></tr>
                ) : page.map(u => (
                  <tr key={u.id}>
                    <td>{u.id}</td>
                    <td>{u.email}</td>
                    <td><span className={`badge badge-${u.role}`}>{u.role}</span></td>
                    <td><ProviderBadge provider={u.provider} /></td>
                    <td>{fmtDate(u.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="pagination">
            <span className="page-info">
              {filtered.length > 0
                ? `${start + 1}–${Math.min(start + PAGE_SIZE, filtered.length)} / ${filtered.length}명`
                : ''}
            </span>
            <button className="page-btn" onClick={() => setCurrentPage(p => p - 1)} disabled={currentPage <= 1}>← 이전</button>
            <button className="page-btn" onClick={() => setCurrentPage(p => p + 1)} disabled={currentPage >= pages}>다음 →</button>
          </div>
        </div>
      </div>

      <style>{`
        .badge-Admin   { background: #ffd5c0; color: #7a2a00; }
        .badge-Member  { background: #c0edd8; color: #0d4a2a; }
        .badge-local   { background: #ede8e0; color: #6b5e4a; }
        .badge-google  { background: #fce8e6; color: #c5221f; }
        .badge-facebook{ background: #dce8ff; color: #1a3d7c; }
      `}</style>
    </div>
  )
}
