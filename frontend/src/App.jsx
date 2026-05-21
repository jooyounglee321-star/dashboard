import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import AdminUsersPage from './pages/AdminUsersPage'
import SuperadminPage from './pages/SuperadminPage'
import AdminPage from './pages/AdminPage'
import IndexPage from './pages/index/IndexPage'
import ProfilePage from './pages/ProfilePage'

function hasValidToken() {
  const token = localStorage.getItem('token')
  return token && token.trim() !== '' && token !== 'undefined' && token !== 'null'
}

/** 로그인 필요 페이지 — 토큰 없으면 /login으로 */
function AuthGuard({ children }) {
  if (!hasValidToken()) return <Navigate to="/login" replace />
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
        <Route path="/admin_users" element={<AuthGuard><AdminUsersPage /></AuthGuard>} />
        <Route path="/superadmin"  element={<AuthGuard><SuperadminPage /></AuthGuard>} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
