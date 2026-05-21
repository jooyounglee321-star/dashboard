import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import AdminUsersPage from './pages/AdminUsersPage'
import SuperadminPage from './pages/SuperadminPage'
import AdminPage from './pages/AdminPage'
import IndexPage from './pages/index/IndexPage'

function AuthGuard({ children }) {
  const token = localStorage.getItem('token')
  const hasToken = token && token.trim() !== '' && token !== 'undefined' && token !== 'null'
  if (!hasToken) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/" element={<AuthGuard><IndexPage /></AuthGuard>} />
        <Route path="/admin" element={<AuthGuard><AdminPage /></AuthGuard>} />
        <Route path="/admin_users" element={<AuthGuard><AdminUsersPage /></AuthGuard>} />
        <Route path="/superadmin" element={<AuthGuard><SuperadminPage /></AuthGuard>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
