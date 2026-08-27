import { useState, useEffect } from 'react'
import { apiLog } from './api'

function getLocalStorageSnapshot() {
  const snap = {}
  try {
    const KEYS = ['dashboard_logged_in', 'user', 'dashboard_lang', 'theme', 'stock_total_mode']
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
  const [expandedLog, setExpandedLog] = useState(new Set())
  const [copied, setCopied] = useState(false)
  const [stockDbg, setStockDbg] = useState(null)

  useEffect(() => {
    if (!open) return
    const id = setInterval(() => setStockDbg(window.__debugStockData ?? null), 1000)
    return () => clearInterval(id)
  }, [open])

  const toggleLog = (i) => setExpandedLog(prev => {
    const next = new Set(prev)
    next.has(i) ? next.delete(i) : next.add(i)
    return next
  })

  if (localStorage.getItem('dashboard_debug_mode') !== 'true') return null

  const refresh = () => setTick(t => t + 1)

  let user = null
  try { user = JSON.parse(localStorage.getItem('user') || 'null') } catch {}
  const loggedIn = localStorage.getItem('dashboard_logged_in') === '1'
  const lsSnap = getLocalStorageSnapshot()

  const statusColor = (s) => {
    if (s === 0) return 'var(--ink3)'
    if (s < 300) return 'var(--green)'
    if (s < 400) return 'var(--warning)'
    return 'var(--red)'
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
              cookie: <span style={{ color: loggedIn ? '#4ade80' : '#f87171' }}>{loggedIn ? '✓ 로그인' : '✗ 미로그인'}</span>
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

          {/* STOCK DATA */}
          {stockDbg && (
            <div style={{ padding: '0.6rem 0.9rem', borderBottom: '1px solid #1e293b' }}>
              <div style={{ color: '#94a3b8', marginBottom: '0.3rem', fontWeight: 600 }}>STOCK DATA</div>
              <div>groups: <span style={{ color: '#e2e8f0' }}>{stockDbg.groups?.length ?? 0}개</span></div>
              {stockDbg.groups?.map((g, i) => (
                <div key={i} style={{ color: '#e2e8f0', marginTop: '0.15rem', paddingLeft: '0.5rem' }}>
                  {g.name || '(unnamed)'}: 전체{g.total} / 삭제{g.deleted} / 활성{g.active}
                </div>
              ))}
              <div style={{ marginTop: '0.3rem' }}>grpTotals: <span style={{ color: '#e2e8f0' }}>{stockDbg.grpTotals}개</span></div>
              <div>stockValues: <span style={{ color: '#e2e8f0' }}>{stockDbg.stockValues}개</span></div>
            </div>
          )}

          {/* API 로그 */}
          <div style={{ padding: '0.6rem 0.9rem' }}>
            <div style={{ color: '#94a3b8', marginBottom: '0.3rem', fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
              <span>API LOG ({apiLog.length})</span>
              {apiLog.length > 0 && (
                <div style={{ display: 'flex', gap: '0.3rem' }}>
                  <button
                    onClick={() => {
                      const ls = {}
                      try {
                        const COPY_KEYS = ['dashboard_lang', 'stock_total_mode']
                        COPY_KEYS.forEach(k => { const v = localStorage.getItem(k); if (v !== null) ls[k] = v })
                      } catch {}
                      const payload = {
                        timestamp: new Date().toISOString().slice(0, 19),
                        user: { id: user?.id ?? null, email: user?.email ?? null, role: user?.role ?? null },
                        localStorage: ls,
                        apiLogs: apiLog.map(e => ({ method: e.method, url: e.url, status: e.status, duration: e.ms, responseBody: e.responseBody ?? null })),
                      }
                      navigator.clipboard.writeText(JSON.stringify(payload, null, 2)).then(() => {
                        setCopied(true)
                        setTimeout(() => setCopied(false), 1500)
                      })
                    }}
                    style={{ background: 'none', border: '1px solid #334155', borderRadius: 4, color: copied ? '#4ade80' : '#94a3b8', cursor: 'pointer', fontSize: '0.65rem', padding: '0.1rem 0.35rem' }}
                  >{copied ? '✅ 복사됨!' : '로그 복사'}</button>
                  <button onClick={() => { apiLog.length = 0; refresh() }} style={{ background: 'none', border: '1px solid #334155', borderRadius: 4, color: '#94a3b8', cursor: 'pointer', fontSize: '0.65rem', padding: '0.1rem 0.35rem' }}>지우기</button>
                </div>
              )}
            </div>
            {apiLog.length === 0
              ? <div style={{ color: '#475569', fontStyle: 'italic' }}>아직 API 호출 없음</div>
              : apiLog.map((entry, i) => {
                const expanded = expandedLog.has(i)
                return (
                  <div key={i} style={{ marginBottom: '0.3rem', borderRadius: 4, borderLeft: `2px solid ${statusColor(entry.status)}`, overflow: 'hidden' }}>
                    {/* 헤더 행 — 클릭으로 토글 */}
                    <div
                      onClick={() => toggleLog(i)}
                      style={{ padding: '0.25rem 0.4rem', background: '#1e293b', cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: '0.3rem' }}
                    >
                      <span style={{ color: '#64748b', flexShrink: 0, marginTop: '0.05rem' }}>{expanded ? '▼' : '▶'}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ color: '#7dd3fc' }}>{entry.method}</span>{' '}
                        <span style={{ color: '#e2e8f0', wordBreak: 'break-all' }}>{entry.url}</span>
                        <div style={{ marginTop: '0.1rem' }}>
                          <span style={{ color: statusColor(entry.status) }}>{entry.status || 'ERR'}</span>
                          {' · '}
                          <span style={{ color: '#94a3b8' }}>{entry.ms}ms</span>
                          {entry.error && <span style={{ color: '#f87171' }}> · {entry.error}</span>}
                        </div>
                      </div>
                    </div>
                    {/* 상세 패널 */}
                    {expanded && (
                      <div style={{ background: '#1a1a2e', padding: '0.4rem 0.5rem' }}>
                        <div style={{ color: '#64748b', fontSize: '0.68rem', marginBottom: '0.2rem' }}>Response Body</div>
                        <pre style={{
                          margin: 0, color: '#a8ff78', fontSize: '0.7rem',
                          maxHeight: 200, overflowY: 'auto',
                          whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                          fontFamily: 'monospace',
                        }}>
                          {entry.responseBody === null || entry.responseBody === undefined
                            ? '(없음)'
                            : typeof entry.responseBody === 'string'
                              ? entry.responseBody
                              : JSON.stringify(entry.responseBody, null, 2)
                          }
                        </pre>
                      </div>
                    )}
                  </div>
                )
              })
            }
          </div>
        </div>
      )}
    </>
  )
}
