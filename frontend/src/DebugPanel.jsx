import { useState } from 'react'
import { apiLog } from './api'

function getLocalStorageSnapshot() {
  const snap = {}
  try {
    const KEYS = ['token', 'user', 'dashboard_lang', 'theme', 'stock_total_mode']
    KEYS.forEach(k => {
      const v = localStorage.getItem(k)
      if (v !== null) snap[k] = v.length > 80 ? v.slice(0, 80) + '…' : v
    })
  } catch {}
  return snap
}

export default function DebugPanel() {
  const [open, setOpen] = useState(false)
  const [tick, setTick] = useState(0)

  if (localStorage.getItem('dashboard_debug_mode') !== 'true') return null

  const refresh = () => setTick(t => t + 1)

  let user = null
  try { user = JSON.parse(localStorage.getItem('user') || 'null') } catch {}
  const token = localStorage.getItem('token')
  const lsSnap = getLocalStorageSnapshot()

  const statusColor = (s) => {
    if (s === 0) return '#9ca3af'
    if (s < 300) return '#16a34a'
    if (s < 400) return '#d97706'
    return '#dc2626'
  }

  return (
    <>
      {/* 🐛 토글 버튼 */}
      <button
        onClick={() => { setOpen(o => !o); refresh() }}
        style={{
          position: 'fixed', bottom: '1.2rem', right: '1.2rem', zIndex: 9000,
          width: 42, height: 42, borderRadius: '50%',
          background: open ? '#1d4ed8' : '#1e293b',
          color: '#fff', border: '2px solid #3b82f6',
          fontSize: '1.1rem', cursor: 'pointer', boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'background 0.15s',
        }}
        title="Debug Panel"
      >🐛</button>

      {/* 패널 */}
      {open && (
        <div style={{
          position: 'fixed', bottom: '4.5rem', right: '1.2rem', zIndex: 8999,
          width: 340, maxHeight: '70vh', overflowY: 'auto',
          background: '#0f172a', border: '1px solid #334155',
          borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
          fontSize: '0.75rem', color: '#cbd5e1', fontFamily: 'monospace',
        }}>
          {/* 헤더 */}
          <div style={{ padding: '0.6rem 0.9rem', borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 700, color: '#60a5fa' }}>🐛 Debug Panel</span>
            <button onClick={refresh} style={{ background: 'none', border: '1px solid #334155', borderRadius: 4, color: '#94a3b8', cursor: 'pointer', fontSize: '0.7rem', padding: '0.15rem 0.45rem' }}>↻ 새로고침</button>
          </div>

          {/* 사용자 정보 */}
          <div style={{ padding: '0.6rem 0.9rem', borderBottom: '1px solid #1e293b' }}>
            <div style={{ color: '#94a3b8', marginBottom: '0.3rem', fontWeight: 600 }}>USER</div>
            <div>id: <span style={{ color: '#e2e8f0' }}>{user?.id ?? '—'}</span></div>
            <div>email: <span style={{ color: '#e2e8f0' }}>{user?.email ?? '—'}</span></div>
            <div>role: <span style={{ color: '#e2e8f0' }}>{user?.role ?? '—'}</span></div>
            <div style={{ marginTop: '0.25rem' }}>
              token: <span style={{ color: token ? '#4ade80' : '#f87171' }}>{token ? '✓ 있음' : '✗ 없음'}</span>
            </div>
          </div>

          {/* localStorage */}
          <div style={{ padding: '0.6rem 0.9rem', borderBottom: '1px solid #1e293b' }}>
            <div style={{ color: '#94a3b8', marginBottom: '0.3rem', fontWeight: 600 }}>LOCALSTORAGE</div>
            {Object.entries(lsSnap).map(([k, v]) => (
              <div key={k} style={{ wordBreak: 'break-all', marginBottom: '0.15rem' }}>
                <span style={{ color: '#7dd3fc' }}>{k}</span>: <span style={{ color: '#e2e8f0' }}>{v}</span>
              </div>
            ))}
          </div>

          {/* API 로그 */}
          <div style={{ padding: '0.6rem 0.9rem' }}>
            <div style={{ color: '#94a3b8', marginBottom: '0.3rem', fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
              <span>API LOG ({apiLog.length})</span>
              {apiLog.length > 0 && (
                <button onClick={() => { apiLog.length = 0; refresh() }} style={{ background: 'none', border: '1px solid #334155', borderRadius: 4, color: '#94a3b8', cursor: 'pointer', fontSize: '0.65rem', padding: '0.1rem 0.35rem' }}>지우기</button>
              )}
            </div>
            {apiLog.length === 0
              ? <div style={{ color: '#475569', fontStyle: 'italic' }}>아직 API 호출 없음</div>
              : apiLog.map((entry, i) => (
                <div key={i} style={{ marginBottom: '0.3rem', padding: '0.25rem 0.4rem', background: '#1e293b', borderRadius: 4, borderLeft: `2px solid ${statusColor(entry.status)}` }}>
                  <span style={{ color: '#7dd3fc' }}>{entry.method}</span>{' '}
                  <span style={{ color: '#e2e8f0', wordBreak: 'break-all' }}>{entry.url}</span>
                  <div style={{ marginTop: '0.1rem' }}>
                    <span style={{ color: statusColor(entry.status) }}>{entry.status || 'ERR'}</span>
                    {' · '}
                    <span style={{ color: '#94a3b8' }}>{entry.ms}ms</span>
                    {entry.error && <span style={{ color: '#f87171' }}> · {entry.error}</span>}
                  </div>
                </div>
              ))
            }
          </div>
        </div>
      )}
    </>
  )
}
