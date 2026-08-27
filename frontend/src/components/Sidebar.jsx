import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

const NAV = [
  { path: '/',           icon: '🏠', ko: '홈',       en: 'Home' },
  { path: '/budget',     icon: '📒', ko: '가계부',   en: 'Budget' },
  { path: '/recurring',  icon: '🔄', ko: '정기지출', en: 'Recurring' },
  { path: '/diet-stats', icon: '🥗', ko: '식단 통계',en: 'Diet Stats' },
  { path: '/admin',      icon: '⚙️', ko: '설정',     en: 'Settings' },
  { path: '/profile',    icon: '👤', ko: '프로필',   en: 'Profile' },
]
const ADMIN_NAV = { path: '/superadmin', icon: '🛡️', ko: '슈퍼어드민', en: 'Superadmin' }

export default function Sidebar({ collapsed, onToggle, lang = 'ko', userRole = '', userName = '', avatarSrc = null, onLogout }) {
  const location = useLocation()
  const isActive = (path) => path === '/' ? location.pathname === '/' : location.pathname.startsWith(path)
  const label = (item) => lang === 'en' ? item.en : item.ko
  const items = userRole === 'admin' ? [...NAV, ADMIN_NAV] : NAV

  return (
    <aside className={`sidebar${collapsed ? ' collapsed' : ''}`}>
      {/* 로고 */}
      <div className="sidebar-logo">
        <span className="sidebar-logo-icon">✦</span>
        {!collapsed && <span className="sidebar-logo-text">Dashboard</span>}
      </div>

      {/* 네비게이션 */}
      <nav className="sidebar-nav">
        {items.map(item => (
          <Link
            key={item.path}
            to={item.path}
            className={`sidebar-item${isActive(item.path) ? ' active' : ''}`}
            title={collapsed ? label(item) : undefined}
          >
            <span className="sidebar-icon">{item.icon}</span>
            {!collapsed && <span className="sidebar-label">{label(item)}</span>}
          </Link>
        ))}
      </nav>

      {/* 유저 영역 */}
      <div className="sidebar-user">
        <div className="sidebar-avatar">
          {avatarSrc
            ? <img src={avatarSrc} alt="" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }} />
            : <span style={{ fontSize: '1rem' }}>👤</span>}
        </div>
        {!collapsed && (
          <div className="sidebar-user-info">
            <span className="sidebar-user-name">{userName || '...'}</span>
            <button className="sidebar-logout" onClick={onLogout}>
              {lang === 'en' ? 'Logout' : '로그아웃'}
            </button>
          </div>
        )}
      </div>

      {/* 접기 버튼 */}
      <button className="sidebar-toggle" onClick={onToggle} title={collapsed ? '펼치기' : '접기'}>
        {collapsed ? '›' : '‹'}
      </button>
    </aside>
  )
}
