import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Sidebar from './Sidebar'

const SIDEBAR_KEY = 'sidebar_collapsed'

export default function DashboardLayout({ children }) {
  const navigate = useNavigate()

  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(SIDEBAR_KEY) === 'true' } catch { return false }
  })
  const [lang, setLang] = useState(() => {
    try { return localStorage.getItem('dashboard_lang') || 'ko' } catch { return 'ko' }
  })
  const [userRole, setUserRole] = useState('')
  const [userName, setUserName] = useState('')
  const [avatarSrc, setAvatarSrc] = useState(null)

  useEffect(() => {
    try {
      const user = JSON.parse(localStorage.getItem('user') || '{}')
      if (user.role) setUserRole(user.role)
      if (user.name) setUserName(user.name)
      const av = localStorage.getItem('avatar_data')
      if (av) setAvatarSrc(av)
    } catch {}

    // lang 변경 동기화
    const onLangChange = () => {
      try { setLang(localStorage.getItem('dashboard_lang') || 'ko') } catch {}
    }
    window.addEventListener('languageChanged', onLangChange)

    // 서버에서 최신 user 정보 갱신
    fetch('/api/auth/me', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.name) setUserName(d.name)
        if (d?.role) setUserRole(d.role)
      })
      .catch(() => {})

    return () => window.removeEventListener('languageChanged', onLangChange)
  }, [])

  function toggle() {
    setCollapsed(c => {
      try { localStorage.setItem(SIDEBAR_KEY, String(!c)) } catch {}
      return !c
    })
  }

  async function handleLogout() {
    try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }) } catch {}
    try { localStorage.removeItem('dashboard_logged_in'); localStorage.removeItem('user') } catch {}
    try { sessionStorage.clear() } catch {}
    navigate('/login', { replace: true })
  }

  return (
    <div className="dashboard-root">
      <Sidebar
        collapsed={collapsed}
        onToggle={toggle}
        lang={lang}
        userRole={userRole}
        userName={userName}
        avatarSrc={avatarSrc}
        onLogout={handleLogout}
      />
      <div className={`dashboard-content${collapsed ? ' sidebar-collapsed' : ''}`}>
        {children}
      </div>
    </div>
  )
}
