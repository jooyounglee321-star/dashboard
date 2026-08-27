import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { t } from '../i18n'

export default function WithdrawalPendingPage() {
  const navigate = useNavigate()
  const lang = (() => { try { return localStorage.getItem('dashboard_lang') || 'ko' } catch { return 'ko' } })()

  const [cancelling, setCancelling] = useState(false)
  const [msg, setMsg] = useState(null)

  // withdrawal_requested_at은 user 스토리지에서 읽거나 없으면 today
  const stored = (() => { try { return JSON.parse(localStorage.getItem('user') || '{}') } catch { return {} } })()
  const requestedAt = stored.withdrawal_requested_at ? new Date(stored.withdrawal_requested_at) : new Date()
  const deleteAt = new Date(requestedAt.getTime() + 30 * 24 * 60 * 60 * 1000)

  const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`

  async function handleCancel() {
    setCancelling(true)
    setMsg(null)
    try {
      const res = await fetch('/api/auth/withdraw/cancel', {
        method: 'POST',
        credentials: 'include',
      })
      if (res.ok) {
        localStorage.setItem('dashboard_logged_in', '1')
        setMsg({ type: 'success', text: t(lang, 'withdrawal.cancelSuccess') })
        setTimeout(() => navigate('/'), 1200)
      } else {
        const d = await res.json().catch(() => ({}))
        setMsg({ type: 'error', text: d.detail || t(lang, 'withdrawal.cancelError') })
      }
    } catch {
      setMsg({ type: 'error', text: t(lang, 'withdrawal.cancelError') })
    } finally {
      setCancelling(false)
    }
  }

  function handleLogout() {
    localStorage.removeItem('dashboard_logged_in')
    localStorage.removeItem('user')
    fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {})
    navigate('/login')
  }

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem 1rem' }}>
      <div style={{
        background: 'var(--card)', borderRadius: 18, border: '1.5px solid rgba(229,72,77,0.25)',
        boxShadow: 'var(--shadow-md)', padding: '2.5rem 2.4rem',
        width: '100%', maxWidth: 420, textAlign: 'center',
      }}>
        <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>⚠️</div>
        <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--red)', marginBottom: '0.5rem' }}>
          {t(lang, 'withdrawal.title')}
        </h2>
        <p style={{ fontSize: '0.85rem', color: 'var(--ink2)', marginBottom: '1.6rem', lineHeight: 1.6 }}>
          {t(lang, 'withdrawal.desc')}
        </p>

        <div style={{ background: 'var(--card2)', borderRadius: 10, padding: '1rem 1.2rem', marginBottom: '1.8rem', textAlign: 'left' }}>
          <InfoRow label={t(lang, 'withdrawal.requestedAt')} value={fmt(requestedAt)} />
          <InfoRow label={t(lang, 'withdrawal.deleteAt')}    value={fmt(deleteAt)} isLast />
        </div>

        {msg && (
          <div style={{
            fontSize: '0.82rem', marginBottom: '1rem', padding: '0.6rem 0.9rem',
            borderRadius: 8, lineHeight: 1.5,
            ...(msg.type === 'success'
              ? { background: 'rgba(22,163,74,0.08)', color: 'var(--green)', border: '1px solid rgba(22,163,74,0.25)' }
              : { background: 'rgba(229,72,77,0.08)', color: 'var(--red)', border: '1px solid rgba(229,72,77,0.25)' }),
          }}>
            {msg.text}
          </div>
        )}

        <button
          type="button"
          onClick={handleCancel}
          disabled={cancelling}
          style={{
            width: '100%', padding: '0.78rem', fontSize: '0.95rem', fontWeight: 600,
            background: cancelling ? 'var(--ink3)' : 'var(--accent)', color: '#fff',
            border: 'none', borderRadius: 10, cursor: cancelling ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit', marginBottom: '0.75rem',
          }}
        >
          {cancelling ? '처리 중…' : t(lang, 'withdrawal.cancelBtn')}
        </button>

        <button
          type="button"
          onClick={handleLogout}
          style={{
            width: '100%', padding: '0.65rem', fontSize: '0.85rem', fontWeight: 500,
            background: 'transparent', color: 'var(--ink3)',
            border: '1.5px solid var(--border)', borderRadius: 10,
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          {t(lang, 'withdrawal.backToLogin')}
        </button>
      </div>
    </div>
  )
}

function InfoRow({ label, value, isLast }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '0.45rem 0',
      borderBottom: isLast ? 'none' : '1px solid var(--border)',
    }}>
      <span style={{ fontSize: '0.8rem', color: 'var(--ink3)' }}>{label}</span>
      <span style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--ink)' }}>{value}</span>
    </div>
  )
}
