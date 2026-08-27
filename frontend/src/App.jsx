import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import SuperadminPage from './pages/SuperadminPage'
import AdminPage from './pages/AdminPage'
import IndexPage from './pages/index/IndexPage'
import ProfilePage from './pages/ProfilePage'
import BudgetPage from './pages/BudgetPage'
import DietStatsPage from './pages/DietStatsPage'
import RecurringPage from './pages/RecurringPage'
import WithdrawalPendingPage from './pages/WithdrawalPendingPage'
import DebugPanel from './DebugPanel'
import DashboardLayout from './components/DashboardLayout'

// HttpOnly Cookie는 JS에서 읽을 수 없으므로, "로그인 여부" 힌트만 localStorage에 보관.
// 실제 인증은 Cookie로 하며, 이 플래그는 UI 라우팅용 힌트일 뿐이다.
function isLoggedIn() {
  return localStorage.getItem('dashboard_logged_in') === '1'
}

function getStoredRole() {
  try {
    const user = JSON.parse(localStorage.getItem('user') || '{}')
    return user.role || 'free'
  } catch { return 'free' }
}

/** 로그인 필요 페이지 — 플래그 없으면 /login으로 */
function AuthGuard({ children }) {
  if (!isLoggedIn()) return <Navigate to="/login" replace />
  return children
}

/** 어드민 전용 페이지 — /api/auth/me 서버 재검증 후 role 확인 */
function AdminRoleGuard({ children }) {
  const [state, setState] = useState('pending') // pending | allowed | denied

  useEffect(() => {
    if (!isLoggedIn()) { setState('denied'); return }
    const ctrl = new AbortController()
    fetch('/api/auth/me', { credentials: 'include', signal: ctrl.signal })
      .then(r => r.ok ? r.json() : null)
      .then(d => setState(d?.role === 'admin' ? 'allowed' : 'denied'))
      .catch(err => { if (err?.name !== 'AbortError') setState('denied') })
    return () => ctrl.abort()
  }, [])

  if (!isLoggedIn()) return <Navigate to="/login" replace />
  if (state === 'pending') return null
  if (state === 'denied') return <Navigate to="/" replace />
  return children
}

/** 캘린더 연동 팝업 콜백 — 부모 창에 신호 보내고 팝업 닫기 */
function CalendarCallbackPage() {
  const nav = useNavigate()
  useEffect(() => {
    if (window.opener) {
      window.opener.postMessage('gcal_connected', window.location.origin)
      window.close()
    } else {
      nav('/', { replace: true })
    }
  }, [nav])
  return null
}

/** YouTube 연동 팝업 콜백 — 부모 창에 신호 보내고 팝업 닫기 */
function YoutubeCallbackPage() {
  const nav = useNavigate()
  useEffect(() => {
    if (window.opener) {
      window.opener.postMessage('youtube_connected', window.location.origin)
      window.close()
    } else {
      nav('/', { replace: true })
    }
  }, [nav])
  return null
}

/** OAuth 콜백 처리 — /api/auth/me로 인증 확인 후 localStorage 설정 */
function SocialCallbackPage() {
  const nav = useNavigate()
  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(user => {
        if (user) {
          localStorage.setItem('dashboard_logged_in', '1')
          localStorage.setItem('user', JSON.stringify(user))
          nav('/', { replace: true })
        } else {
          nav('/login?error=oauth_failed', { replace: true })
        }
      })
      .catch(() => nav('/login?error=oauth_failed', { replace: true }))
  }, [])
  return null
}

/** 로그인/회원가입 페이지 — 이미 로그인됐으면 /로 */
function LoginGuard({ children }) {
  if (isLoggedIn()) return <Navigate to="/" replace />
  return children
}

export default function App() {
  const [debugMode, setDebugMode] = useState(
    () => localStorage.getItem('dashboard_debug_mode') === 'true'
  )

  useEffect(() => {
    const handler = () => setDebugMode(localStorage.getItem('dashboard_debug_mode') === 'true')
    window.addEventListener('storage', handler)
    window.addEventListener('dashboard_debug_toggle', handler)
    return () => {
      window.removeEventListener('storage', handler)
      window.removeEventListener('dashboard_debug_toggle', handler)
    }
  }, [])

  // 세션당 한 번만 자동 로그인 카운트
  useEffect(() => {
    if (!isLoggedIn()) return
    if (sessionStorage.getItem('session_pinged')) return
    fetch('/api/auth/session-ping', {
      method: 'POST',
      credentials: 'include',
    }).then(() => {
      sessionStorage.setItem('session_pinged', '1')
    }).catch(() => {})
  }, [])

  // 월별 1회 정기지출 자동 등록 (월이 바뀌면 재실행, 500 실패 시 재시도)
  useEffect(() => {
    if (!isLoggedIn()) return
    const ym = new Date().toISOString().slice(0, 7)
    if (sessionStorage.getItem(`recurring_applied_${ym}`)) return
    fetch('/api/expense/recurring/apply', {
      method: 'POST',
      credentials: 'include',
    }).then(r => {
      if (r.ok) sessionStorage.setItem(`recurring_applied_${ym}`, '1')
    }).catch(() => {})
  }, [])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login"    element={<LoginGuard><LoginPage /></LoginGuard>} />
        <Route path="/register" element={<LoginGuard><RegisterPage /></LoginGuard>} />
        <Route path="/"           element={<AuthGuard><DashboardLayout><IndexPage /></DashboardLayout></AuthGuard>} />
        <Route path="/profile"    element={<AuthGuard><DashboardLayout><ProfilePage /></DashboardLayout></AuthGuard>} />
        <Route path="/admin"      element={<AdminRoleGuard><DashboardLayout><AdminPage /></DashboardLayout></AdminRoleGuard>} />
        <Route path="/admin_users" element={<Navigate to="/superadmin" replace />} />
        <Route path="/superadmin"  element={<AdminRoleGuard><DashboardLayout><SuperadminPage /></DashboardLayout></AdminRoleGuard>} />
        <Route path="/budget"      element={<AuthGuard><DashboardLayout><BudgetPage /></DashboardLayout></AuthGuard>} />
        <Route path="/recurring"   element={<AuthGuard><DashboardLayout><RecurringPage /></DashboardLayout></AuthGuard>} />
        <Route path="/diet-stats"  element={<AuthGuard><DashboardLayout><DietStatsPage /></DashboardLayout></AuthGuard>} />
        <Route path="/auth/social-callback" element={<SocialCallbackPage />} />
        <Route path="/auth/calendar-callback" element={<CalendarCallbackPage />} />
        <Route path="/auth/youtube-callback" element={<YoutubeCallbackPage />} />
        <Route path="/withdrawal-pending" element={<WithdrawalPendingPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
      {debugMode && <DebugPanel />}
    </BrowserRouter>
  )
}
