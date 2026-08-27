import { useState, useEffect } from 'react'
import { t } from './i18n'


function getFavicon(url) {
  try { return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=32` }
  catch { return null }
}

const QUICK = [
  ['네이버', 'https://www.naver.com'],
  ['다음', 'https://www.daum.net'],
  ['유튜브', 'https://www.youtube.com'],
  ['구글', 'https://www.google.com'],
  ['카카오', 'https://www.kakao.com'],
  ['네이버증권', 'https://finance.naver.com'],
  ['쿠팡', 'https://www.coupang.com'],
]

export default function SitesSettingsModal({ isOpen, onClose, onChanged, lang = 'ko' }) {
  const [sites, setSites]   = useState([])
  const [name, setName]     = useState('')
  const [url, setUrl]       = useState('')
  const [adding, setAdding] = useState(false)

  async function load() {
    const data = await fetch('/api/bookmarks', { credentials: 'include' })
      .then(r => r.ok ? r.json() : []).catch(() => [])
    setSites(data)
  }

  useEffect(() => { if (isOpen) load() }, [isOpen])

  async function add() {
    const n = name.trim()
    let u = url.trim()
    if (!n || !u) return
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u
    if (sites.find(s => s.url === u)) { alert('이미 추가된 사이트입니다'); return }
    setAdding(true)
    await fetch('/api/bookmarks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ title: n, url: u }),
    })
    setName(''); setUrl('')
    await load()
    setAdding(false)
    onChanged?.()
  }

  async function quick(n, u) {
    if (sites.find(s => s.url === u)) return
    await fetch('/api/bookmarks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ title: n, url: u }),
    })
    await load()
    onChanged?.()
  }

  async function del(id) {
    await fetch('/api/bookmarks/' + id, { method: 'DELETE', credentials: 'include' })
    await load()
    onChanged?.()
  }

  if (!isOpen) return null

  const inp = {
    padding: '0.45rem 0.7rem', fontSize: '0.85rem', borderRadius: 8,
    border: '1.5px solid var(--border, #e5e7eb)', background: 'var(--bg, #fff)',
    color: 'var(--ink, #111)', fontFamily: 'inherit', outline: 'none', width: '100%', boxSizing: 'border-box',
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(15,23,42,0.50)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: 480, maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow-md)' }}>

        {/* 헤더 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.25rem', borderBottom: '1px solid var(--border, #e5e7eb)', flexShrink: 0 }}>
          <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--ink, #111)' }}>🌐 사이트 설정</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.3rem', color: 'var(--ink3, #9ca3af)', lineHeight: 1 }}>×</button>
        </div>

        <div style={{ overflowY: 'auto', padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {/* 입력 폼 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <input style={inp} placeholder="사이트 이름 (예: 네이버)" value={name} onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && add()} />
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input style={{ ...inp, flex: 1 }} placeholder="주소 (예: https://naver.com)" value={url} onChange={e => setUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && add()} />
              <button onClick={add} disabled={adding || !name.trim() || !url.trim()} style={{ padding: '0.45rem 1rem', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', background: 'var(--accent, #e07a3a)', color: '#fff', border: 'none', borderRadius: 8, fontFamily: 'inherit', whiteSpace: 'nowrap', opacity: (adding || !name.trim() || !url.trim()) ? 0.5 : 1 }}>
                + 추가
              </button>
            </div>
          </div>

          {/* 빠른 추가 */}
          <div>
            <div style={{ fontSize: '0.72rem', color: 'var(--ink3, #9ca3af)', marginBottom: '0.4rem' }}>빠른 추가</div>
            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
              {QUICK.map(([n, u]) => {
                const already = sites.find(s => s.url === u)
                return (
                  <button key={n} onClick={() => !already && quick(n, u)} style={{ padding: '0.28rem 0.65rem', fontSize: '0.75rem', cursor: already ? 'default' : 'pointer', background: already ? 'var(--bg2, #f3f4f6)' : 'transparent', color: already ? 'var(--ink3)' : 'var(--accent, #e07a3a)', border: `1px solid ${already ? 'var(--border)' : 'var(--accent, #e07a3a)'}`, borderRadius: 6, fontFamily: 'inherit', opacity: already ? 0.5 : 1 }}>
                    {n}{already ? ' ✓' : ''}
                  </button>
                )
              })}
            </div>
          </div>

          {/* 사이트 목록 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            {!sites.length
              ? <div style={{ fontSize: '0.82rem', color: 'var(--ink3)', textAlign: 'center', padding: '1rem', fontStyle: 'italic' }}>추가된 사이트가 없습니다</div>
              : sites.map(s => {
                  const fav = getFavicon(s.url)
                  return (
                    <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.5rem 0.6rem', borderRadius: 8, background: 'var(--bg2, #f9fafb)', border: '1px solid var(--border, #e5e7eb)' }}>
                      <div style={{ width: 22, flexShrink: 0 }}>
                        {fav && <img src={fav} width={18} height={18} style={{ borderRadius: 3 }} onError={e => { e.target.style.display = 'none' }} alt="" />}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--ink3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.url}</div>
                      </div>
                      <button onClick={() => del(s.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', fontSize: '0.8rem', padding: '0.2rem 0.4rem', borderRadius: 4, flexShrink: 0 }}>삭제</button>
                    </div>
                  )
                })
            }
          </div>
        </div>
      </div>
    </div>
  )
}
