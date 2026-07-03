import { useState, useEffect, useRef } from 'react'
import Toast, { useToast } from '../../components/Toast'
import { t } from './i18n'

import { apiFetch } from '../../api'
/* ── 유틸 ── */
const sv = (k, v) => localStorage.setItem(k, JSON.stringify(v))
const ld = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d } catch { return d } }
const genId = () => Math.random().toString(36).slice(2, 10)
const GRP_COLORS = [
  { bg: '#c8deff', tx: '#1a3d7c' }, { bg: '#c0edd8', tx: '#0d4a2a' },
  { bg: '#ffd5c0', tx: '#7a2a00' }, { bg: '#ddd0f5', tx: '#3a1870' },
  { bg: '#ffefc0', tx: '#6a4a00' }, { bg: '#c0e8f5', tx: '#0a3a50' },
  { bg: '#f5c0e0', tx: '#500a30' }, { bg: '#d0f0c0', tx: '#1a4a0a' },
  { bg: '#f0d0c0', tx: '#5a2a0a' }, { bg: '#c0c8f5', tx: '#1a1a6a' },
]

function stockSummary(s) {
  const pp = s.purchases || [], sl = s.sells || []
  const totalBuyQty  = pp.reduce((a, p) => a + (p.qty || 0), 0)
  const totalSellQty = sl.reduce((a, p) => a + (p.qty || 0), 0)
  const holdQty = Math.max(0, totalBuyQty - totalSellQty)
  const valid = pp.filter(p => (p.price || 0) > 0 && (p.qty || 0) > 0)
  const ws = valid.reduce((a, p) => a + p.price * p.qty, 0)
  const vq = valid.reduce((a, p) => a + p.qty, 0)
  const avgBuyPrice = vq > 0 ? ws / vq : 0
  return { holdQty, totalBuyQty, totalSellQty, avgBuyPrice }
}

function useStockSearch() {
  const krStocksRef = useRef(null)
  const timerRef    = useRef(null)
  useEffect(() => {
    fetch('/kr_stocks.json').then(r => r.ok ? r.json() : []).then(d => { krStocksRef.current = d }).catch(() => { krStocksRef.current = [] })
  }, [])
  const isKorean  = s => /[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(s)
  const isNumeric = s => /^\d+$/.test(s.replace(/\.(KS|KQ)$/i, ''))
  function krSearch(q, max = 8) {
    if (!krStocksRef.current?.length) return []
    const ql = q.toLowerCase()
    const res = []
    for (const s of krStocksRef.current) {
      const match = isKorean(q) ? s.name.includes(q)
        : s.ticker.toLowerCase().startsWith(ql) || s.ticker.replace(/\.(KS|KQ)$/i, '').toLowerCase().startsWith(ql)
      if (match) res.push({ ticker: s.ticker, name: s.name, exchange: s.market, type: 'EQUITY' })
      if (res.length >= max) break
    }
    return res
  }
  async function yfSearch(q) {
    try {
      const d = await apiFetch('/api/stocks/search?q=' + encodeURIComponent(q))
      return d.results || []
    } catch {}
    return []
  }
  function search(q, onResults) {
    if (!q) return
    clearTimeout(timerRef.current)
    if (isKorean(q) || isNumeric(q)) {
      onResults(krSearch(q))
    } else {
      timerRef.current = setTimeout(async () => onResults(await yfSearch(q.toUpperCase())), 350)
    }
  }
  return { search, isKorean, isNumeric }
}

function StockDropdown({ results, onPick, anchorRef }) {
  if (!results.length) return null
  const rect = anchorRef.current?.getBoundingClientRect()
  return (
    <div style={{
      position: 'fixed', zIndex: 9000,
      top: rect ? rect.bottom + 2 : 0, left: rect ? rect.left : 0,
      minWidth: Math.max(rect?.width || 0, 240),
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
      maxHeight: 220, overflowY: 'auto',
    }}>
      {results.map((r, i) => (
        <div key={i} onMouseDown={e => { e.preventDefault(); onPick(r) }}
          style={{ display: 'flex', alignItems: 'center', padding: '0.42rem 0.75rem', cursor: 'pointer', fontSize: '0.82rem', borderBottom: '1px solid var(--border)', gap: '0.2rem' }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--card2)'}
          onMouseLeave={e => e.currentTarget.style.background = ''}>
          <strong style={{ flexShrink: 0, minWidth: 60, color: 'var(--ink)' }}>{r.ticker}</strong>
          <span style={{ flex: 1, color: 'var(--ink2)', fontSize: '0.78rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
          <span style={{ flexShrink: 0, fontSize: '0.68rem', color: 'var(--ink3)', paddingLeft: '0.35rem' }}>{r.exchange}</span>
        </div>
      ))}
    </div>
  )
}

function AddStockRow({ gid, onAdd }) {
  const [ticker, setTicker]     = useState('')
  const [name,   setName]       = useState('')
  const [ddResults, setDdResults] = useState([])
  const tickerRef = useRef(null)
  const nameRef   = useRef(null)
  const { search, isKorean, isNumeric } = useStockSearch()
  const inp = { padding: '0.32rem 0.45rem', fontSize: '0.82rem', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg)', color: 'var(--ink)', fontFamily: 'inherit' }

  function handleTickerInput(q) {
    setTicker(q)
    if (!q) { setDdResults([]); return }
    search(q, results => {
      setDdResults(results)
      if (!isKorean(q) && !isNumeric(q)) {
        const exact = results.find(r => r.ticker.toUpperCase() === q.toUpperCase())
        if (exact && !name) setName(exact.name)
      }
    })
  }
  function handleNameInput(q) {
    setName(q)
    if (!q) { setDdResults([]); return }
    search(q, results => setDdResults(results))
  }
  return (
    <div style={{ padding: '0.5rem 0.8rem 0.75rem', borderTop: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative' }}>
          <input ref={tickerRef} type="text" placeholder="티커" value={ticker}
            onChange={e => handleTickerInput(e.target.value)}
            onBlur={() => setTimeout(() => setDdResults([]), 180)}
            style={{ ...inp, width: 80 }} />
          <StockDropdown results={ddResults} onPick={r => { setTicker(r.ticker); setName(r.name); setDdResults([]) }} anchorRef={tickerRef} />
        </div>
        <div style={{ position: 'relative' }}>
          <input ref={nameRef} type="text" placeholder="종목명" value={name}
            onChange={e => handleNameInput(e.target.value)}
            onBlur={() => setTimeout(() => setDdResults([]), 180)}
            autoComplete="off" style={{ ...inp, minWidth: 80 }} />
          <StockDropdown results={ddResults} onPick={r => { setTicker(r.ticker); setName(r.name); setDdResults([]) }} anchorRef={nameRef} />
        </div>
        <button style={{ padding: '0.35rem 0.8rem', fontSize: '0.82rem', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500 }}
          onClick={() => { if (!ticker) return; onAdd(ticker, name); setTicker(''); setName('') }}>
          + 종목 추가
        </button>
      </div>
      <div style={{ fontSize: '0.7rem', color: 'var(--ink3)', marginTop: '0.3rem' }}>💡 KOR 숫자 입력(005930) → .KS/.KQ 자동처리</div>
    </div>
  )
}

function StockDetailPanel({ g, s, onUpdate }) {
  const [buyDate,   setBuyDate]   = useState(() => new Date().toISOString().split('T')[0])
  const [buyQty,    setBuyQty]    = useState('')
  const [buyPrice,  setBuyPrice]  = useState('')
  const [sellDate,  setSellDate]  = useState('')
  const [sellQty,   setSellQty]   = useState('')
  const [sellPrice, setSellPrice] = useState('')
  const [editRec,   setEditRec]   = useState(null)
  const { toast, showToast } = useToast()
  const sym  = g.currency === 'USD' ? '$' : '₩'
  const fmtA = v => g.currency === 'USD' ? Number(v).toFixed(2) : Math.round(v).toLocaleString('ko-KR')
  const { holdQty } = stockSummary(s)

  async function fetchHistPrice(date) {
    const cat = g.currency === 'KRW' ? 'kor-stock' : 'us'
    try {
      const d = await apiFetch(`/api/stocks/history/${encodeURIComponent(s.ticker)}?date=${date}&category=${cat}`)
      return d.close
    } catch {}
    return null
  }
  async function submitBuy() {
    const qty = parseFloat(buyQty) || 0
    if (!qty) { showToast('수량을 입력해주세요', 'err'); return }
    let price = parseFloat(buyPrice) || 0
    if (buyDate && !price) {
      showToast('⏳ 해당일 시세 조회 중…', 'info')
      const close = await fetchHistPrice(buyDate)
      if (close != null) { price = close; showToast(`✓ ${buyDate} 종가: ${sym}${close}`, 'ok') }
      else showToast('⚠ 시세 조회 실패', 'err')
    }
    onUpdate(g.id, s.id, 'addPurchase', { id: genId(), date: buyDate || new Date().toISOString().split('T')[0], qty, price: price || 0 })
    setBuyDate(''); setBuyQty(''); setBuyPrice('')
    showToast('✓ 매입 내역 등록', 'ok')
  }
  async function submitSell() {
    const qty = parseFloat(sellQty) || 0
    if (!qty) { showToast('수량을 입력해주세요', 'err'); return }
    if (qty > holdQty) { showToast(`보유수량(${holdQty})을 초과할 수 없습니다`, 'err'); return }
    let price = parseFloat(sellPrice) || 0
    if (sellDate && !price) {
      showToast('⏳ 해당일 시세 조회 중…', 'info')
      const close = await fetchHistPrice(sellDate)
      if (close != null) { price = close; showToast(`✓ ${sellDate} 종가: ${sym}${close}`, 'ok') }
      else showToast('⚠ 시세 조회 실패', 'err')
    }
    onUpdate(g.id, s.id, 'addSell', { id: genId(), date: sellDate || new Date().toISOString().split('T')[0], qty, price: price || 0 })
    setSellDate(''); setSellQty(''); setSellPrice('')
    showToast('✓ 매도 내역 등록', 'ok')
  }
  function saveEdit() {
    const qty = parseFloat(editRec.qty) || 0
    if (!qty) { showToast('수량을 입력해주세요', 'err'); return }
    onUpdate(g.id, s.id, 'editRecord', { type: editRec.type, id: editRec.id, date: editRec.date || null, qty, price: parseFloat(editRec.price) || 0 })
    setEditRec(null)
    showToast('✓ 내역 수정 완료', 'ok')
  }
  function deleteRecord(type, id) {
    if (!window.confirm('이 내역을 삭제하시겠습니까?')) return
    onUpdate(g.id, s.id, 'deleteRecord', { type, id })
    showToast('✓ 내역 삭제 완료', 'ok')
  }

  const inpS = { padding: '0.35rem 0.5rem', fontSize: '0.83rem', border: '1px solid var(--border)', borderRadius: 7, background: 'var(--bg)', color: 'var(--ink)', fontFamily: 'inherit', boxSizing: 'border-box', width: '100%' }
  const allRows = [
    ...(s.purchases || []).map(r => ({ ...r, type: 'buy' })),
    ...(s.sells     || []).map(r => ({ ...r, type: 'sell' })),
  ].sort((a, b) => { if (!a.date && !b.date) return 0; if (!a.date) return 1; if (!b.date) return -1; return a.date.localeCompare(b.date) })

  return (
    <div style={{ borderTop: '1px solid var(--border)', background: 'rgba(255,255,255,0.35)', padding: '0.7rem 0.9rem', display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
      {/* 매입 폼 */}
      <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '0.6rem 0.75rem' }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#1d4ed8', marginBottom: '0.5rem' }}>📈 매입</div>
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 1, minWidth: 100 }}><div style={{ fontSize: '0.7rem', color: '#475569', marginBottom: '0.18rem' }}>매입일</div><input type="date" value={buyDate} onChange={e => setBuyDate(e.target.value)} style={inpS} /></div>
          <div style={{ flex: 1, minWidth: 70 }}><div style={{ fontSize: '0.7rem', color: '#475569', marginBottom: '0.18rem' }}>수량 *</div><input type="number" value={buyQty} onChange={e => setBuyQty(e.target.value)} placeholder="수량" min="0.0001" step="any" style={inpS} /></div>
          <div style={{ flex: 1, minWidth: 90 }}><div style={{ fontSize: '0.7rem', color: '#475569', marginBottom: '0.18rem' }}>매입가 (선택)</div><input type="number" value={buyPrice} onChange={e => setBuyPrice(e.target.value)} placeholder={`${sym} 단가`} min="0" step="any" style={inpS} /></div>
          <button onClick={submitBuy} style={{ padding: '0.36rem 0.9rem', fontSize: '0.82rem', border: 'none', borderRadius: 7, background: '#2563eb', color: '#fff', cursor: 'pointer', fontWeight: 500, whiteSpace: 'nowrap', flexShrink: 0 }}>매입</button>
        </div>
      </div>
      {/* 매도 폼 */}
      <div style={{ background: '#fff1f2', border: '1px solid #fecaca', borderRadius: 8, padding: '0.6rem 0.75rem' }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#b91c1c', marginBottom: '0.5rem' }}>📉 매도 <span style={{ fontWeight: 400, fontSize: '0.7rem', color: '#64748b' }}>(현재 보유 {holdQty.toLocaleString()}주)</span></div>
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 1, minWidth: 100 }}><div style={{ fontSize: '0.7rem', color: '#475569', marginBottom: '0.18rem' }}>매도일</div><input type="date" value={sellDate} onChange={e => setSellDate(e.target.value)} style={inpS} /></div>
          <div style={{ flex: 1, minWidth: 70 }}><div style={{ fontSize: '0.7rem', color: '#475569', marginBottom: '0.18rem' }}>수량 * (최대 {holdQty})</div><input type="number" value={sellQty} onChange={e => setSellQty(e.target.value)} placeholder="수량" min="0.0001" max={holdQty} step="any" style={inpS} /></div>
          <div style={{ flex: 1, minWidth: 90 }}><div style={{ fontSize: '0.7rem', color: '#475569', marginBottom: '0.18rem' }}>매도가 (선택)</div><input type="number" value={sellPrice} onChange={e => setSellPrice(e.target.value)} placeholder={`${sym} 단가`} min="0" step="any" style={inpS} /></div>
          <button onClick={submitSell} style={{ padding: '0.36rem 0.9rem', fontSize: '0.82rem', border: 'none', borderRadius: 7, background: '#dc2626', color: '#fff', cursor: 'pointer', fontWeight: 500, whiteSpace: 'nowrap', flexShrink: 0 }}>매도</button>
        </div>
      </div>
      {/* 거래 내역 */}
      <div>
        <div style={{ fontSize: '0.72rem', fontWeight: 500, color: 'var(--ink2)', marginBottom: '0.4rem' }}>📋 거래 내역</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.28rem' }}>
          {!allRows.length
            ? <div style={{ fontSize: '0.75rem', color: 'var(--ink3)', textAlign: 'center', padding: '0.5rem' }}>아직 내역이 없습니다</div>
            : allRows.map(r => {
              const isBuy = r.type === 'buy'
              const bg = isBuy ? '#eff6ff' : '#fff1f2'
              const borderC = isBuy ? '#bfdbfe' : '#fecaca'
              const badgeStyle = { fontSize: '0.65rem', padding: '0.08rem 0.38rem', borderRadius: 4, background: isBuy ? '#dbeafe' : '#fee2e2', color: isBuy ? '#1d4ed8' : '#b91c1c', fontWeight: 600 }
              if (editRec?.id === r.id) {
                return (
                  <div key={r.id} style={{ background: bg, border: `1px solid ${borderC}`, borderRadius: 7, padding: '0.45rem 0.6rem' }}>
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                      <div style={{ flex: 1, minWidth: 95 }}><div style={{ fontSize: '0.67rem', color: '#64748b', marginBottom: '0.12rem' }}>날짜</div><input type="date" value={editRec.date || ''} onChange={e => setEditRec(r => ({ ...r, date: e.target.value }))} style={{ ...inpS, fontSize: '0.8rem' }} /></div>
                      <div style={{ flex: 1, minWidth: 65 }}><div style={{ fontSize: '0.67rem', color: '#64748b', marginBottom: '0.12rem' }}>수량</div><input type="number" value={editRec.qty || ''} onChange={e => setEditRec(r => ({ ...r, qty: e.target.value }))} min="0.0001" step="any" style={{ ...inpS, fontSize: '0.8rem' }} /></div>
                      <div style={{ flex: 1, minWidth: 85 }}><div style={{ fontSize: '0.67rem', color: '#64748b', marginBottom: '0.12rem' }}>단가</div><input type="number" value={editRec.price || ''} onChange={e => setEditRec(r => ({ ...r, price: e.target.value }))} min="0" step="any" placeholder={sym} style={{ ...inpS, fontSize: '0.8rem' }} /></div>
                      <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0 }}>
                        <button onClick={saveEdit} style={{ padding: '0.3rem 0.65rem', fontSize: '0.78rem', border: 'none', borderRadius: 6, background: '#2563eb', color: '#fff', cursor: 'pointer', fontWeight: 500 }}>저장</button>
                        <button onClick={() => setEditRec(null)} style={{ padding: '0.3rem 0.55rem', fontSize: '0.78rem', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--card2)', color: 'var(--ink)', cursor: 'pointer' }}>취소</button>
                      </div>
                    </div>
                  </div>
                )
              }
              return (
                <div key={r.id} style={{ background: bg, border: `1px solid ${borderC}`, borderRadius: 7, padding: '0.38rem 0.6rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={badgeStyle}>{isBuy ? '매입' : '매도'}</span>
                  <span style={{ fontSize: '0.78rem', color: 'var(--ink2)', minWidth: 72 }}>{r.date || '날짜 없음'}</span>
                  <span style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--ink)' }}>{(r.qty || 0).toLocaleString()}주</span>
                  <span style={{ fontSize: '0.78rem', color: 'var(--ink2)', flex: 1 }}>{r.price ? sym + fmtA(r.price) : '단가 없음'}</span>
                  <div style={{ display: 'flex', gap: '0.22rem', flexShrink: 0 }}>
                    <button onClick={() => setEditRec({ ...r })} style={{ padding: '0.22rem 0.5rem', fontSize: '0.72rem', border: `1px solid ${isBuy ? '#93c5fd' : '#fca5a5'}`, borderRadius: 5, background: 'transparent', color: isBuy ? '#1d4ed8' : '#b91c1c', cursor: 'pointer' }}>수정</button>
                    <button onClick={() => deleteRecord(r.type, r.id)} style={{ padding: '0.22rem 0.5rem', fontSize: '0.72rem', border: '1px solid #fca5a5', borderRadius: 5, background: 'transparent', color: '#b91c1c', cursor: 'pointer' }}>삭제</button>
                  </div>
                </div>
              )
            })
          }
        </div>
      </div>
      <Toast toast={toast} />
    </div>
  )
}

/* ── 메인 컴포넌트 ── */
// embedded=true: 모달 오버레이 없이 내용만 렌더 (AdminPage 재사용용)
// embedded=false (기본): 전체화면 오버레이 모달
export default function StockSettingsModal({ isOpen, onClose, lang = 'ko', embedded = false }) {
  const { toast, showToast } = useToast()
  const [groups,      setGroups]      = useState([])
  const [expanded,    setExpanded]    = useState(new Set())
  const [deleteModal, setDeleteModal] = useState(null)
  const [newsOpen,    setNewsOpen]    = useState(null) // stock id
  const [newsDraft,   setNewsDraft]   = useState({})   // { source, query, lang }

  useEffect(() => {
    if (embedded || isOpen) loadGroups()
  }, [isOpen, embedded])

  // body scroll lock
  useEffect(() => {
    if (!embedded && isOpen) {
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = '' }
    }
  }, [isOpen, embedded])

  async function loadGroups() {
    try {
      const json = await apiFetch('/api/portfolio/groups', { signal: AbortSignal.timeout(8000) })
      let data = json.data || []
      data = data.map(g => ({ ...g, stocks: (g.stocks || []).map(s => ({ ...s, purchases: s.purchases || [], sells: s.sells || [] })) }))
      setGroups(data)
    } catch { setGroups([]) }
  }

  async function saveGroupsToDB(newGroups) {
    setGroups(newGroups)
    await apiFetch('/api/portfolio/groups', {
      method: 'POST',
      body: JSON.stringify({ data: newGroups }),
    }).catch(e => console.warn('[saveGroups] DB 저장 실패:', e))
  }

  function addGroup() {
    if (groups.length >= 10) { showToast('그룹은 최대 10개까지 가능합니다', 'err'); return }
    saveGroupsToDB([...groups, { id: genId(), name: t(lang, 'admin.newGroup'), currency: 'USD', stocks: [] }])
  }
  function delGroup(gid) {
    if (!window.confirm('그룹과 모든 종목을 삭제하시겠습니까?')) return
    saveGroupsToDB(groups.filter(g => g.id !== gid))
    showToast('삭제되었습니다', 'ok')
  }
  function updateGroup(gid, field, value) {
    saveGroupsToDB(groups.map(g => g.id === gid ? { ...g, [field]: value } : g))
  }
  function addStock(gid, ticker, name) {
    if (!ticker) { showToast('티커 심볼을 입력해주세요', 'err'); return }
    const g = groups.find(g => g.id === gid)
    if (!g) return
    if (g.stocks.filter(s => !s.is_deleted).length >= 10) { showToast('그룹당 최대 10개까지 가능합니다', 'err'); return }
    const upper = ticker.toUpperCase()
    if (g.stocks.some(s => !s.is_deleted && s.ticker.toUpperCase() === upper)) {
      showToast(`${upper} 은(는) 이미 이 그룹에 있습니다`, 'err'); return
    }
    saveGroupsToDB(groups.map(gr => gr.id === gid
      ? { ...gr, stocks: [...gr.stocks, { id: genId(), ticker: upper, name, purchases: [], sells: [] }] }
      : gr))
    showToast(`✓ ${upper} 추가`, 'ok')
  }
  function handleStockUpdate(gid, sid, action, payload) {
    setGroups(prev => {
      const next = prev.map(g => {
        if (g.id !== gid) return g
        const stocks = g.stocks.map(s => {
          if (s.id !== sid) return s
          if (action === 'addPurchase') return { ...s, purchases: [...(s.purchases || []), payload] }
          if (action === 'addSell')     return { ...s, sells: [...(s.sells || []), payload] }
          if (action === 'editRecord') {
            const arr = payload.type === 'buy' ? 'purchases' : 'sells'
            return { ...s, [arr]: s[arr].map(r => r.id === payload.id ? { ...r, date: payload.date, qty: payload.qty, price: payload.price } : r) }
          }
          if (action === 'deleteRecord') {
            const arr = payload.type === 'buy' ? 'purchases' : 'sells'
            return { ...s, [arr]: s[arr].filter(r => r.id !== payload.id) }
          }
          return s
        })
        return { ...g, stocks }
      })
      apiFetch('/api/portfolio/groups', { method: 'POST', body: JSON.stringify({ data: next }) }).catch(() => {})
      return next
    })
    setExpanded(prev => new Set([...prev, sid]))
  }
  function openNewsSettings(s) {
    const cfg = s.news_config || {}
    setNewsDraft({
      source: cfg.source || 'google',
      query:  cfg.query  || s.name || s.ticker,
      lang:   cfg.lang   || 'ko',
    })
    setNewsOpen(s.id)
  }
  function saveNewsConfig(gid, sid) {
    const cfg = { source: newsDraft.source, query: newsDraft.query, lang: newsDraft.lang }
    const next = groups.map(g => g.id !== gid ? g : {
      ...g, stocks: g.stocks.map(s => s.id !== sid ? s : { ...s, news_config: cfg }),
    })
    saveGroupsToDB(next)
    setNewsOpen(null)
    showToast('✓ 뉴스 설정 저장', 'ok')
  }

  function confirmDelStock(gid, sid) { setDeleteModal({ gid, sid }) }
  function doDelStock() {
    if (!deleteModal) return
    setGroups(prev => {
      const next = prev.map(g => g.id !== deleteModal.gid ? g
        : { ...g, stocks: g.stocks.map(s => s.id !== deleteModal.sid ? s : { ...s, is_deleted: true }) })
      apiFetch('/api/portfolio/groups', { method: 'POST', body: JSON.stringify({ data: next }) }).catch(() => {})
      return next
    })
    setExpanded(prev => { const n = new Set(prev); n.delete(deleteModal.sid); return n })
    setDeleteModal(null)
    showToast('종목이 삭제되었습니다', 'ok')
  }

  const itemRow  = { display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.45rem 0.8rem', borderBottom: '1px solid var(--border)' }
  const itemInfo = { flex: 1, minWidth: 0 }

  const content = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <Toast toast={toast} />

      <p style={{ fontSize: '0.78rem', color: 'var(--ink3)', margin: 0 }}>{t(lang, 'admin.stockHint')}</p>

      {/* 그룹 목록 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {!groups.length
          ? <div style={{ fontSize: '0.82rem', color: 'var(--ink3)', fontStyle: 'italic', textAlign: 'center', padding: '0.5rem' }}>그룹을 추가해보세요</div>
          : groups.map((g, gi) => {
            const col = GRP_COLORS[gi % GRP_COLORS.length]
            const sym = g.currency === 'USD' ? '$' : '₩'
            const fmtA = v => g.currency === 'USD' ? Number(v).toFixed(2) : Math.round(v).toLocaleString('ko-KR')
            const activeStocks = g.stocks.filter(s => !s.is_deleted)
            const inpGrp = { padding: '0.32rem 0.45rem', fontSize: '0.82rem', border: '1px solid var(--border)', borderRadius: 6, background: 'rgba(255,255,255,0.6)', color: col.tx, fontFamily: 'inherit', fontWeight: 500 }
            return (
              <div key={g.id} style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.6rem 0.9rem', background: col.bg }}>
                  <input type="text" value={g.name} placeholder="그룹 이름"
                    onChange={e => updateGroup(g.id, 'name', e.target.value)}
                    style={{ ...inpGrp, flex: 1 }} />
                  <span style={{ fontSize: '0.72rem', color: col.tx, opacity: 0.7 }}>{g.stocks.length}/10</span>
                  <button onClick={() => delGroup(g.id)} style={{ padding: '0.28rem 0.65rem', fontSize: '0.78rem', cursor: 'pointer', background: 'transparent', color: '#c0392b', border: '1px solid #c0392b', borderRadius: 6, fontFamily: 'inherit', transition: 'all 0.15s' }}>{t(lang, 'admin.delGroup')}</button>
                </div>
                <div style={{ background: 'var(--card2)' }}>
                  {!activeStocks.length
                    ? <div style={{ fontSize: '0.78rem', color: 'var(--ink3)', fontStyle: 'italic', textAlign: 'center', padding: '0.4rem 0.8rem' }}>종목이 없습니다. 아래에서 추가하세요.</div>
                    : activeStocks.map(s => {
                      const { holdQty, avgBuyPrice, totalSellQty } = stockSummary(s)
                      const isOpenS = expanded.has(s.id)
                      return (
                        <div key={s.id}>
                          <div style={itemRow}>
                            <div style={{ ...itemInfo, cursor: 'pointer' }} onClick={() => setExpanded(prev => { const n = new Set(prev); isOpenS ? n.delete(s.id) : n.add(s.id); return n })}>
                              <div style={{ fontSize: '0.85rem', color: 'var(--ink)', fontWeight: 400 }}>
                                <strong>{s.ticker}</strong>{s.name ? ` · ${s.name}` : ''} <span style={{ fontSize: '0.68rem', color: 'var(--ink3)' }}>{isOpenS ? '▲' : '▼'}</span>
                              </div>
                              <div style={{ fontSize: '0.72rem', color: 'var(--ink3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {holdQty > 0 ? `보유 ${holdQty.toLocaleString()}주` : '수량 미등록'}
                                {avgBuyPrice > 0 ? ` · 평균 ${sym}${fmtA(avgBuyPrice)}` : ''}
                                {totalSellQty > 0 ? ` · 매도 ${totalSellQty.toLocaleString()}주` : ''}
                              </div>
                            </div>
                            <button onClick={() => openNewsSettings(s)} style={{ padding: '0.16rem 0.48rem', fontSize: '0.72rem', cursor: 'pointer', border: '1px solid var(--border)', borderRadius: 5, background: 'transparent', color: 'var(--ink2)', fontFamily: 'inherit', transition: 'all 0.12s' }}>📰 {t(lang, 'stock.newsSettings')}</button>
                            <button onClick={() => confirmDelStock(g.id, s.id)} style={{ padding: '0.16rem 0.48rem', fontSize: '0.72rem', cursor: 'pointer', border: '1px solid #c0392b', borderRadius: 5, background: 'transparent', color: '#c0392b', fontFamily: 'inherit', transition: 'all 0.12s' }}>{t(lang, 'admin.delStock')}</button>
                          </div>
                          {newsOpen === s.id && (
                            <div style={{ borderTop: '1px solid var(--border)', background: '#f8faff', padding: '0.7rem 0.9rem', display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                              {/* 뉴스 소스 */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '0.75rem', color: 'var(--ink2)', minWidth: 60 }}>{t(lang, 'stock.newsSource')}</span>
                                {[['google', 'Google'], ['naver', 'Naver']].map(([val, label]) => (
                                  <label key={val} style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '0.28rem', cursor: 'pointer' }}>
                                    <input type="radio" name={`ns-src-${s.id}`} value={val} checked={newsDraft.source === val}
                                      onChange={() => setNewsDraft(d => ({ ...d, source: val, lang: val === 'naver' ? 'ko' : d.lang }))} />
                                    {label}
                                  </label>
                                ))}
                              </div>
                              {/* 검색어 */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '0.75rem', color: 'var(--ink2)', minWidth: 60 }}>{t(lang, 'stock.newsQuery')}</span>
                                <input type="text" value={newsDraft.query}
                                  onChange={e => setNewsDraft(d => ({ ...d, query: e.target.value }))}
                                  style={{ flex: 1, minWidth: 140, padding: '0.28rem 0.5rem', fontSize: '0.8rem', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg)', color: 'var(--ink)', fontFamily: 'inherit' }} />
                              </div>
                              {/* 언어 */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '0.75rem', color: 'var(--ink2)', minWidth: 60 }}>{t(lang, 'stock.newsLang')}</span>
                                {[['ko', t(lang, 'stock.newsLangKo')], ['en', t(lang, 'stock.newsLangEn')]].map(([val, label]) => (
                                  <label key={val} style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '0.28rem', cursor: newsDraft.source === 'naver' && val === 'en' ? 'not-allowed' : 'pointer', opacity: newsDraft.source === 'naver' && val === 'en' ? 0.4 : 1 }}>
                                    <input type="radio" name={`ns-lang-${s.id}`} value={val} checked={newsDraft.lang === val}
                                      disabled={newsDraft.source === 'naver' && val === 'en'}
                                      onChange={() => setNewsDraft(d => ({ ...d, lang: val }))} />
                                    {label}
                                  </label>
                                ))}
                              </div>
                              {/* 버튼 */}
                              <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                                <button onClick={() => setNewsOpen(null)} style={{ padding: '0.3rem 0.8rem', fontSize: '0.78rem', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--card2)', color: 'var(--ink)', cursor: 'pointer' }}>{t(lang, 'common.cancel')}</button>
                                <button onClick={() => saveNewsConfig(g.id, s.id)} style={{ padding: '0.3rem 0.9rem', fontSize: '0.78rem', border: 'none', borderRadius: 6, background: 'var(--accent)', color: '#fff', cursor: 'pointer', fontWeight: 500 }}>{t(lang, 'common.save')}</button>
                              </div>
                            </div>
                          )}
                          {isOpenS && <StockDetailPanel g={g} s={s} onUpdate={handleStockUpdate} />}
                        </div>
                      )
                    })}
                </div>
                {activeStocks.length < 10
                  ? <AddStockRow gid={g.id} onAdd={(tk, nm) => addStock(g.id, tk, nm)} />
                  : <div style={{ fontSize: '0.75rem', color: 'var(--ink3)', textAlign: 'center', padding: '0.4rem' }}>최대 10개 종목 도달</div>
                }
              </div>
            )
          })}
      </div>

      {groups.length < 10 && (
        <button onClick={addGroup} style={{ alignSelf: 'flex-start', padding: '0.48rem 1.1rem', fontSize: '0.85rem', fontWeight: 500, cursor: 'pointer', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontFamily: 'inherit', transition: 'background 0.15s' }}>
          {t(lang, 'admin.addGroup')}
        </button>
      )}

      {/* 종목 삭제 확인 모달 */}
      {deleteModal && (() => {
        const delStock = groups.find(g => g.id === deleteModal.gid)?.stocks.find(s => s.id === deleteModal.sid)
        const hasPurchases = (delStock?.purchases || []).length > 0
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
            <div style={{ background: 'var(--card)', borderRadius: 14, padding: '1.4rem 1.5rem', width: 'min(420px,100%)', boxShadow: '0 8px 40px rgba(0,0,0,0.25)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.9rem' }}>
                <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--ink)' }}>⚠️ 종목 삭제</div>
                <button onClick={() => setDeleteModal(null)} style={{ background: 'none', border: 'none', fontSize: '1.1rem', cursor: 'pointer', color: 'var(--ink3)', lineHeight: 1 }}>✕</button>
              </div>
              {hasPurchases && (
                <div style={{ fontSize: '0.85rem', color: '#92400e', lineHeight: 1.7, marginBottom: '0.75rem', padding: '0.65rem 0.8rem', background: '#fef3c7', borderRadius: 8, borderLeft: '3px solid #f59e0b' }}>
                  🔔 <strong>매수 이력이 있는 종목입니다.</strong><br />
                  삭제하면 과거 백필 결산에서 이 종목의 손익이 계산되지 않습니다.<br />
                  <strong>매도 처리 후 삭제를 권장합니다.</strong>
                </div>
              )}
              <div style={{ fontSize: '0.87rem', color: 'var(--ink)', lineHeight: 1.7, marginBottom: '1.1rem', padding: '0.65rem 0.8rem', background: 'var(--card2)', borderRadius: 8, borderLeft: '3px solid #dc2626' }}>
                이 종목의 모든 거래내역이 삭제됩니다.<br />정말 삭제하시겠습니까?
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                <button onClick={() => setDeleteModal(null)} style={{ padding: '0.42rem 1rem', fontSize: '0.85rem', border: '1px solid var(--border)', borderRadius: 7, background: 'var(--card2)', color: 'var(--ink)', cursor: 'pointer' }}>취소</button>
                <button onClick={doDelStock} style={{ padding: '0.42rem 1.1rem', fontSize: '0.85rem', border: 'none', borderRadius: 7, background: '#dc2626', color: '#fff', cursor: 'pointer', fontWeight: 500 }}>삭제</button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )

  // embedded 모드: 오버레이 없이 내용만 반환 (AdminPage 재사용)
  if (embedded) return content

  if (!isOpen) return null

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 600, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '3rem 1rem 1rem', overflowY: 'auto' }}
      onClick={onClose}
    >
      <div
        style={{ background: 'var(--bg)', borderRadius: 14, padding: '1.5rem 1.8rem', width: '100%', maxWidth: 680, boxShadow: '0 8px 40px rgba(0,0,0,0.22)', maxHeight: '80vh', overflowY: 'auto', position: 'relative' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem' }}>
          <span style={{ fontWeight: 700, fontSize: '1rem' }}>📈 {t(lang, 'admin.stockMgmt')}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: 'var(--ink3)', lineHeight: 1 }}>✕</button>
        </div>
        {content}
      </div>
    </div>
  )
}
