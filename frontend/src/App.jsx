import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import SuperadminPage from './pages/SuperadminPage'
import AdminPage from './pages/AdminPage'
import IndexPage from './pages/index/IndexPage'
import ProfilePage from './pages/ProfilePage'
import BudgetPage from './pages/BudgetPage'

function hasValidToken() {
  const token = localStorage.getItem('token')
  return token && token.trim() !== '' && token !== 'undefined' && token !== 'null'
}

function getStoredRole() {
  try {
    const user = JSON.parse(localStorage.getItem('user') || '{}')
    return user.role || 'free'
  } catch { return 'free' }
}

/** 로그인 필요 페이지 — 토큰 없으면 /login으로 */
function AuthGuard({ children }) {
  if (!hasValidToken()) return <Navigate to="/login" replace />
  return children
}

/** 어드민 전용 페이지 — role이 admin이 아니면 /로 리다이렉트 */
function AdminRoleGuard({ children }) {
  if (!hasValidToken()) return <Navigate to="/login" replace />
  if (getStoredRole() !== 'admin') return <Navigate to="/" replace />
  return children
}

/** 로그인/회원가입 페이지 — 이미 로그인됐으면 /로 */
function LoginGuard({ children }) {
  if (hasValidToken()) return <Navigate to="/" replace />
  return children
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login"    element={<LoginGuard><LoginPage /></LoginGuard>} />
        <Route path="/register" element={<LoginGuard><RegisterPage /></LoginGuard>} />
        <Route path="/"           element={<AuthGuard><IndexPage /></AuthGuard>} />
        <Route path="/profile"    element={<AuthGuard><ProfilePage /></AuthGuard>} />
        <Route path="/admin"      element={<AuthGuard><AdminPage /></AuthGuard>} />
        <Route path="/admin_users" element={<Navigate to="/superadmin" replace />} />
        <Route path="/superadmin"  element={<AdminRoleGuard><SuperadminPage /></AdminRoleGuard>} />
        <Route path="/budget"      element={<AuthGuard><BudgetPage /></AuthGuard>} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
