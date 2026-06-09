import { useState, useEffect, useCallback, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Toast, { useToast } from '../components/Toast'
import { t, T } from './index/i18n'

/* ── 유틸 ── */
const sv = (k, v) => localStorage.setItem(k, JSON.stringify(v))
const ld = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d } catch { return d } }
const genId = () => Math.random().toString(36).slice(2, 10)
const authH = () => ({ Authorization: 'Bearer ' + localStorage.getItem('token') })
const TOTAL_MODE_KEY = 'stock_total_mode'

const ALL_TZ = [
  { labelKey: 'tzSeoul', tz: 'Asia/Seoul' },
  { labelKey: 'tzTokyo', tz: 'Asia/Tokyo' },
  { labelKey: 'tzNY', tz: 'America/New_York' },
  { labelKey: 'tzLA', tz: 'America/Los_Angeles' },
  { labelKey: 'tzLondon', tz: 'Europe/London' },
  { labelKey: 'tzParis', tz: 'Europe/Paris' },
  { labelKey: 'tzSydney', tz: 'Australia/Sydney' },
  { labelKey: 'tzDubai', tz: 'Asia/Dubai' },
  { labelKey: 'tzSingapore', tz: 'Asia/Singapore' },
  { labelKey: 'tzChicago', tz: 'America/Chicago' },
  { labelKey: 'tzHK', tz: 'Asia/Hong_Kong' },
  { labelKey: 'tzBerlin', tz: 'Europe/Berlin' },
]
const DEFAULT_ZONES = [
  { region: '서울', tz: 'Asia/Seoul', label: 'KST' },
  { region: '뉴욕', tz: 'America/New_York', label: 'ET' },
  { region: '런던', tz: 'Europe/London', label: 'GMT' },
]
const GRP_COLORS = [
  { bg: '#c8deff', tx: '#1a3d7c' }, { bg: '#c0edd8', tx: '#0d4a2a' },
  { bg: '#ffd5c0', tx: '#7a2a00' }, { bg: '#ddd0f5', tx: '#3a1870' },
  { bg: '#ffefc0', tx: '#6a4a00' }, { bg: '#c0e8f5', tx: '#0a3a50' },
  { bg: '#f5c0e0', tx: '#500a30' }, { bg: '#d0f0c0', tx: '#1a4a0a' },
  { bg: '#f0d0c0', tx: '#5a2a0a' }, { bg: '#c0c8f5', tx: '#1a1a6a' },
]

function formatPreview(tz) {
  try {
    return new Intl.DateTimeFormat('ko-KR', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date())
  } catch { return '--:--' }
}

function stockSummary(s) {
  const pp = s.purchases || [], sl = s.sells || []
  const totalBuyQty  = pp.reduce((a, p) => a + (p.qty || 0), 0)
  const totalSellQty = sl.reduce((a, p) => a + (p.qty || 0), 0)
  const holdQty = Math.max(0, totalBuyQty - totalSellQty)
  const valid = pp.filter(p => (p.price || 0) > 0 && (p.qty || 0) > 0)
  const ws = valid.reduce((a, p) => a + p.price * p.qty, 0)
  const vq = valid.reduce((a, p) => a + p.qty, 0)
  const avgBuyPrice  = vq > 0 ? ws / vq : 0
  const realizedPL   = sl.reduce((a, p) => a + ((p.price || 0) - avgBuyPrice) * (p.qty || 0), 0)
  return { holdQty, totalBuyQty, totalSellQty, avgBuyPrice, realizedPL }
}

/* ── 주식 자동완성 훅 ── */
function useStockSearch() {
  const krStocksRef = useRef(null)
  const timerRef    = useRef(null)

  useEffect(() => {
    fetch('/kr_stocks.json').then(r => r.ok ? r.json() : []).then(d => { krStocksRef.current = d }).catch(() => { krStocksRef.current = [] })
  }, [])

  const isKorean    = s => /[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(s)
  const isNumeric   = s => /^\d+$/.test(s.replace(/\.(KS|KQ)$/i, ''))

  function krSearch(q, max = 8) {
    if (!krStocksRef.current?.length) return []
    const ql  = q.toLowerCase()
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
      const r = await fetch('/api/stocks/search?q=' + encodeURIComponent(q))
      if (r.ok) { const d = await r.json(); return d.results || [] }
    } catch {}
    return []
  }

  function search(q, onResults) {
    if (!q) return
    clearTimeout(timerRef.current)
    if (isKorean(q) || isNumeric(q)) {
      const results = krSearch(q)
      onResults(results)
    } else {
      timerRef.current = setTimeout(async () => {
        const results = await yfSearch(q.toUpperCase())
        onResults(results)
      }, 350)
    }
  }

  return { search, isKorean, isNumeric }
}

/* ── 드롭다운 컴포넌트 ── */
function StockDropdown({ results, onPick, anchorRef }) {
  if (!results.length) return null
  const rect = anchorRef.current?.getBoundingClientRect()
  return (
    <div style={{
      position: 'fixed', zIndex: 9000,
      top: rect ? rect.bottom + 2 : 0,
      left: rect ? rect.left : 0,
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

/* ── 종목 추가 행 ── */
function AddStockRow({ gid, onAdd }) {
  const [ticker, setTicker]     = useState('')
  const [name, setName]         = useState('')
  const [ddResults, setDdResults] = useState([])
  const tickerRef = useRef(null)
  const nameRef   = useRef(null)
  const { search, isKorean, isNumeric } = useStockSearch()

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
  function pickFromTicker(item) {
    setTicker(item.ticker); setName(item.name); setDdResults([])
  }
  function pickFromName(item) {
    setTicker(item.ticker); setName(item.name); setDdResults([])
  }

  const inp = { padding: '0.32rem 0.45rem', fontSize: '0.82rem', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg)', color: 'var(--ink)', fontFamily: 'inherit' }

  return (
    <div style={{ padding: '0.5rem 0.8rem 0.75rem', borderTop: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative' }}>
          <input ref={tickerRef} type="text" placeholder="티커" value={ticker}
            onChange={e => handleTickerInput(e.target.value)}
            onBlur={() => setTimeout(() => setDdResults([]), 180)}
            style={{ ...inp, width: 80 }} />
          <StockDropdown results={ddResults} onPick={pickFromTicker} anchorRef={tickerRef} />
        </div>
        <div style={{ position: 'relative' }}>
          <input ref={nameRef} type="text" placeholder="종목명" value={name}
            onChange={e => handleNameInput(e.target.value)}
            onBlur={() => setTimeout(() => setDdResults([]), 180)}
            autoComplete="off" style={{ ...inp, minWidth: 80 }} />
          <StockDropdown results={ddResults} onPick={pickFromName} anchorRef={nameRef} />
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

/* ── 거래내역 패널 ── */
function StockDetailPanel({ g, s, onUpdate }) {
  const [buyDate,   setBuyDate]   = useState(() => new Date().toISOString().split('T')[0])
  const [buyQty,    setBuyQty]    = useState('')
  const [buyPrice,  setBuyPrice]  = useState('')
  const [sellDate,  setSellDate]  = useState('')
  const [sellQty,   setSellQty]   = useState('')
  const [sellPrice, setSellPrice] = useState('')
  const [editRec,   setEditRec]   = useState(null) // {type, id, date, qty, price}
  const { toast, showToast } = useToast()

  const sym  = g.currency === 'USD' ? '$' : '₩'
  const fmtA = v => g.currency === 'USD' ? Number(v).toFixed(2) : Math.round(v).toLocaleString('ko-KR')
  const { holdQty } = stockSummary(s)

  async function fetchHistPrice(date) {
    const cat = g.currency === 'KRW' ? 'kor-stock' : 'us'
    try {
      const r = await fetch(`/api/stocks/history/${encodeURIComponent(s.ticker)}?date=${date}&category=${cat}`)
      if (r.ok) { const d = await r.json(); return d.close }
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
    const newPurchase = { id: genId(), date: buyDate || new Date().toISOString().split('T')[0], qty, price: price || 0 }
    onUpdate(g.id, s.id, 'addPurchase', newPurchase)
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
    const newSell = { id: genId(), date: sellDate || new Date().toISOString().split('T')[0], qty, price: price || 0 }
    onUpdate(g.id, s.id, 'addSell', newSell)
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

/* ── 메인 AdminPage ── */
export default function AdminPage() {
  const navigate = useNavigate()
  const { toast, showToast } = useToast()

  const [groups,    setGroups]    = useState([])
  const [totalMode, setTotalMode] = useState(() => ld(TOTAL_MODE_KEY, 'KRW'))
  const [expanded,  setExpanded]  = useState(new Set())

  const [ytAccount, setYtAccount] = useState(() => ld('yt_account', { email: '', name: '' }))
  const [ytAccName, setYtAccName] = useState('')
  const [ytAccEmail,setYtAccEmail]= useState('')
  const [ytChannels,setYtChannels]= useState([])
  const [ytName,    setYtName]    = useState('')
  const [ytUrl,     setYtUrl]     = useState('')

  const [sites,     setSites]     = useState([])
  const [siteName,  setSiteName]  = useState('')
  const [siteUrl,   setSiteUrl]   = useState('')

  const [tzData,    setTzData]    = useState(DEFAULT_ZONES)
  const [tzPreviews,setTzPreviews]= useState(['--:--', '--:--', '--:--'])

  const [deleteModal, setDeleteModal] = useState(null) // {gid, sid}

  /* ── 위젯 설정 ── */
  const DEFAULT_WIDGET_CFG = {
    language: 'ko',
    hero:     { enabled: true, clock_count: 3, temp_unit: 'C', temp_unit_manual: false },
    schedule: { enabled: true },
    youtube:  { enabled: true, max_count: 10 },
    stock:    { enabled: true, currency_display: 'KRW' },
    expense:  { enabled: true },
    diet:     { enabled: true, meals: { 아침: true, 점심: true, 저녁: true, 간식: true } },
    memo:     { enabled: true },
    news:     { enabled: true, default_tab: 'kr' },
    sites:    { enabled: true },
  }
  const WIDGET_ICONS = {
    hero: '🕐', schedule: '📅', youtube: '▶', stock: '📈',
    expense: '💳', diet: '🥗', memo: '📝', news: '📰', sites: '🌐',
  }
  const WIDGET_LABEL_KEYS = {
    hero: 'admin.wHero', schedule: 'admin.wSchedule', youtube: 'admin.wYoutube',
    stock: 'admin.wStock', expense: 'admin.wExpense', diet: 'admin.wDiet',
    memo: 'admin.wMemo', news: 'admin.wNews', sites: 'admin.wSites',
  }
  const [widgetCfg, setWidgetCfg] = useState(() => {
    const cached = localStorage.getItem('dashboard_lang')
    return { ...DEFAULT_WIDGET_CFG, language: cached || 'ko' }
  })
  const lang = widgetCfg?.language ?? 'ko'

  /* ── 초기 데이터 로드 ── */
  useEffect(() => {
    loadGroups(); loadYTChannels(); loadSites(); loadTZData(); loadWidgetCfg()
    setYtAccName(ld('yt_account', { name: '' }).name || '')
    setYtAccEmail(ld('yt_account', { email: '' }).email || '')
  }, [])

  /* ── 시간대 미리보기 타이머 ── */
  useEffect(() => {
    const update = () => setTzPreviews(tzData.map(z => formatPreview(z.tz)))
    update()
    const t = setInterval(update, 10000)
    return () => clearInterval(t)
  }, [tzData])

  async function loadGroups() {
    try {
      const res = await fetch('/api/portfolio/groups', { signal: AbortSignal.timeout(8000), headers: authH() })
      if (!res.ok) throw new Error()
      const json = await res.json()
      let data = json.data || []
      // 마이그레이션
      data = data.map(g => ({ ...g, stocks: (g.stocks || []).map(s => ({ ...s, purchases: s.purchases || [], sells: s.sells || [] })) }))
      setGroups(data)
    } catch { setGroups([]) }
  }

  async function saveGroupsToDB(newGroups) {
    setGroups(newGroups)
    await fetch('/api/portfolio/groups', {
      method: 'POST', headers: { ...authH(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: newGroups }),
    }).catch(e => console.warn('[saveGroups] DB 저장 실패:', e))
  }

  /* ── 그룹 CRUD ── */
  function addGroup() {
    if (groups.length >= 10) { showToast('그룹은 최대 10개까지 가능합니다', 'err'); return }
    saveGroupsToDB([...groups, { id: genId(), name: t(lang, 'admin.newGroup'), currency: 'KRW', stocks: [] }])
  }
  function delGroup(gid) {
    if (!window.confirm('그룹과 모든 종목을 삭제하시겠습니까?')) return
    saveGroupsToDB(groups.filter(g => g.id !== gid))
    showToast('삭제되었습니다', 'ok')
  }
  function updateGroup(gid, field, value) {
    saveGroupsToDB(groups.map(g => g.id === gid ? { ...g, [field]: value } : g))
  }

  /* ── 종목 CRUD ── */
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
      ? { ...gr, stocks: [...gr.stocks, { id: genId(), ticker: ticker.toUpperCase(), name, purchases: [], sells: [] }] }
      : gr))
    showToast(`✓ ${ticker.toUpperCase()} 추가`, 'ok')
  }

  /* ── 거래내역 업데이트 ── */
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
      fetch('/api/portfolio/groups', { method: 'POST', headers: { ...authH(), 'Content-Type': 'application/json' }, body: JSON.stringify({ data: next }) }).catch(() => {})
      return next
    })
    setExpanded(prev => new Set([...prev, sid]))
  }

  function confirmDelStock(gid, sid) {
    setDeleteModal({ gid, sid })
  }
  function doDelStock() {
    if (!deleteModal) return
    setGroups(prev => {
      const next = prev.map(g => g.id !== deleteModal.gid ? g
        : { ...g, stocks: g.stocks.map(s => s.id !== deleteModal.sid ? s : { ...s, is_deleted: true }) })
      fetch('/api/portfolio/groups', { method: 'POST', headers: { ...authH(), 'Content-Type': 'application/json' }, body: JSON.stringify({ data: next }) }).catch(() => {})
      return next
    })
    setExpanded(prev => { const n = new Set(prev); n.delete(deleteModal.sid); return n })
    setDeleteModal(null)
    showToast('종목이 삭제되었습니다', 'ok')
  }

  /* ── 유튜브 ── */
  async function loadYTChannels() {
    const ch = await fetch('/api/youtube-channels', { headers: authH() }).then(r => r.ok ? r.json() : []).catch(() => [])
    setYtChannels(ch)
  }
  function saveYTAccount() {
    const acc = { name: ytAccName.trim(), email: ytAccEmail.trim() }
    sv('yt_account', acc); setYtAccount(acc)
    showToast('✓ YouTube 계정이 저장되었습니다', 'ok')
  }
  async function addYT() {
    if (!ytName || !ytUrl) { showToast('이름과 URL을 모두 입력해주세요', 'err'); return }
    await fetch('/api/youtube-channels', { method: 'POST', headers: { ...authH(), 'Content-Type': 'application/json' }, body: JSON.stringify({ channel_name: ytName, channel_url: ytUrl }) })
    setYtName(''); setYtUrl(''); await loadYTChannels(); showToast('✓ 채널이 추가되었습니다', 'ok')
  }
  async function delYT(id) {
    await fetch('/api/youtube-channels/' + id, { method: 'DELETE', headers: authH() })
    await loadYTChannels(); showToast('삭제되었습니다', 'ok')
  }

  /* ── 사이트 ── */
  async function loadSites() {
    const data = await fetch('/api/bookmarks', { headers: authH() }).then(r => r.ok ? r.json() : []).catch(() => [])
    setSites(data)
  }
  async function addSite() {
    let url = siteUrl.trim(); let name = siteName.trim()
    if (!url) { showToast('URL을 입력해주세요', 'err'); return }
    if (!url.startsWith('http')) url = 'https://' + url
    if (!name) name = url
    await fetch('/api/bookmarks', { method: 'POST', headers: { ...authH(), 'Content-Type': 'application/json' }, body: JSON.stringify({ title: name, url }) })
    setSiteName(''); setSiteUrl(''); await loadSites(); showToast('✓ 사이트가 추가되었습니다', 'ok')
  }
  async function quickSite(name, url) {
    if (sites.find(s => s.url === url)) { showToast('이미 추가된 사이트입니다', 'err'); return }
    await fetch('/api/bookmarks', { method: 'POST', headers: { ...authH(), 'Content-Type': 'application/json' }, body: JSON.stringify({ title: name, url }) })
    await loadSites(); showToast(`✓ ${name} 추가!`, 'ok')
  }
  async function delSite(id) {
    await fetch('/api/bookmarks/' + id, { method: 'DELETE', headers: authH() })
    await loadSites(); showToast('삭제되었습니다', 'ok')
  }

  /* ── 시간대 ── */
  async function loadTZData() {
    try {
      const r = await fetch('/api/timezone', { headers: authH() })
      if (r.ok) { const d = await r.json(); if (d.zones?.length === 3) setTzData(d.zones) }
    } catch {}
  }
  async function saveTZ() {
    try {
      await fetch('/api/timezone', { method: 'PUT', headers: { ...authH(), 'Content-Type': 'application/json' }, body: JSON.stringify({ zones: tzData }) })
      showToast('✓ 시간대가 저장되었습니다', 'ok')
    } catch { showToast('저장 실패 - 서버 연결을 확인해주세요', 'err') }
  }
  function updateTz(i, field, value) {
    setTzData(prev => prev.map((z, idx) => idx === i ? { ...z, [field]: value } : z))
  }

  /* ── 위젯 설정 로드/저장 ── */
  async function loadWidgetCfg() {
    try {
      const r = await fetch('/api/auth/widget-config', { headers: authH() })
      if (r.ok) { const d = await r.json(); setWidgetCfg(d.config) }
    } catch {}
  }
  async function saveWidgetCfg() {
    try {
      const r = await fetch('/api/auth/widget-config', {
        method: 'PUT',
        headers: { ...authH(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: widgetCfg }),
      })
      if (r.ok) showToast('✓ 위젯 설정이 저장되었습니다', 'ok')
      else showToast('저장 실패', 'err')
    } catch { showToast('저장 실패 - 서버 연결을 확인해주세요', 'err') }
  }
  function setWidget(key, field, value) {
    setWidgetCfg(prev => ({ ...prev, [key]: { ...prev[key], [field]: value } }))
  }

  /* ── 전체 저장 ── */
  async function saveAll() {
    await saveTZ()
    sv('yt_account', ytAccount)
    showToast('✅ 저장 완료! 이동합니다...', 'ok')
    setTimeout(() => navigate('/'), 1000)
  }

  const secStyle   = { background: 'var(--card)', borderRadius: 14, border: '1px solid var(--border)', boxShadow: 'var(--shadow)', overflow: 'hidden' }
  const secHdStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.9rem 1.3rem', borderBottom: '1px solid var(--border)', background: 'var(--card2)' }
  const secBdStyle = { padding: '1.1rem 1.3rem', display: 'flex', flexDirection: 'column', gap: '0.9rem' }
  const secTitle   = { fontSize: '0.88rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.5rem' }
  const formGrp    = { display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1, minWidth: 110 }
  const lbl        = { fontSize: '0.72rem', color: 'var(--ink3)', letterSpacing: '0.05em' }
  const inp        = { padding: '0.48rem 0.75rem', fontSize: '0.85rem', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg)', color: 'var(--ink)', fontFamily: 'inherit', transition: 'border-color 0.15s', width: '100%' }
  const itemRow    = { display: 'flex', alignItems: 'center', gap: '0.7rem', padding: '0.6rem 0.8rem', background: 'var(--card2)', borderRadius: 8, border: '1px solid var(--border)' }
  const itemInfo   = { flex: 1, minWidth: 0 }

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', color: 'var(--ink)', fontFamily: "'Noto Sans KR', sans-serif", fontWeight: 300 }}>
      <header className="header">
        <span className="header-title">⚙ {t(lang, 'admin.title')}</span>
        <Link to="/" className="nav-link">← {t(lang, 'admin.toDashboard')}</Link>
      </header>

      <main style={{ maxWidth: 860, margin: '0 auto', padding: '1.5rem 1.2rem 4rem', display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>

        {/* ① 위젯 설정 */}
        <div style={secStyle}>
          <div style={secHdStyle}>
            <span style={secTitle}>🧩 {t(lang, 'admin.widgetSettings')}</span>
            <button className="btn btn-primary btn-sm" onClick={saveWidgetCfg}>{t(lang, 'admin.save')}</button>
          </div>
          <div style={{ ...secBdStyle, gap: '0' }}>
            <p style={{ fontSize: '0.78rem', color: 'var(--ink3)', marginBottom: '0.9rem' }}>
              대시보드에 표시할 위젯을 선택하세요. 설정은 이 계정에만 적용됩니다.
            </p>

            {Object.entries(WIDGET_ICONS).map(([key, icon]) => (
              <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.65rem 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <span style={{ fontSize: '1rem', width: 22, textAlign: 'center' }}>{icon}</span>
                  <span style={{ fontSize: '0.88rem', color: widgetCfg[key]?.enabled !== false ? 'var(--ink)' : 'var(--ink3)' }}>{t(lang, WIDGET_LABEL_KEYS[key])}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                  {/* 시계 위젯: 시계 개수 + 온도 단위 */}
                  {key === 'hero' && widgetCfg.hero?.enabled !== false && (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span style={{ fontSize: '0.72rem', color: 'var(--ink3)' }}>{t(lang, 'admin.clockLabel')}</span>
                        {[1, 2, 3].map(n => (
                          <button
                            key={n}
                            onClick={() => setWidget('hero', 'clock_count', n)}
                            style={{
                              width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)',
                              background: widgetCfg.hero?.clock_count === n ? 'var(--accent)' : 'var(--card2)',
                              color: widgetCfg.hero?.clock_count === n ? '#fff' : 'var(--ink)',
                              cursor: 'pointer', fontSize: '0.8rem', fontFamily: 'inherit', fontWeight: 500,
                            }}
                          >{n}</button>
                        ))}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span style={{ fontSize: '0.72rem', color: 'var(--ink3)' }}>{t(lang, 'admin.tempLabel')}</span>
                        {['C', 'F'].map(u => (
                          <button
                            key={u}
                            onClick={() => setWidgetCfg(prev => ({ ...prev, hero: { ...prev.hero, temp_unit: u, temp_unit_manual: true } }))}
                            style={{
                              width: 30, height: 28, borderRadius: 6, border: '1px solid var(--border)',
                              background: (widgetCfg.hero?.temp_unit ?? 'C') === u ? 'var(--accent)' : 'var(--card2)',
                              color: (widgetCfg.hero?.temp_unit ?? 'C') === u ? '#fff' : 'var(--ink)',
                              cursor: 'pointer', fontSize: '0.78rem', fontFamily: 'inherit', fontWeight: 500,
                            }}
                          >°{u}</button>
                        ))}
                      </div>
                    </>
                  )}
                  {/* 유튜브: 최대 표시 개수 */}
                  {key === 'youtube' && widgetCfg.youtube?.enabled !== false && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span style={{ fontSize: '0.72rem', color: 'var(--ink3)' }}>{t(lang, 'admin.max')}</span>
                      <input
                        type="number" min="1" max="20"
                        value={widgetCfg.youtube?.max_count ?? 10}
                        onChange={e => setWidget('youtube', 'max_count', Math.max(1, Math.min(20, parseInt(e.target.value) || 10)))}
                        style={{ width: 44, padding: '0.22rem 0.35rem', fontSize: '0.8rem', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg)', color: 'var(--ink)', fontFamily: 'inherit', textAlign: 'center' }}
                      />
                      <span style={{ fontSize: '0.72rem', color: 'var(--ink3)' }}>{t(lang, 'admin.maxUnit')}</span>
                    </div>
                  )}
                  {/* 주식: 합계 표시 통화 */}
                  {key === 'stock' && widgetCfg.stock?.enabled !== false && (
                    <select
                      value={widgetCfg.stock?.currency_display ?? 'KRW'}
                      onChange={e => setWidget('stock', 'currency_display', e.target.value)}
                      style={{ fontSize: '0.75rem', padding: '0.22rem 0.5rem', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg)', color: 'var(--ink)', fontFamily: 'inherit' }}
                    >
                      <option value="KRW">{t(lang, 'admin.krwOnly')}</option>
                      <option value="USD">{t(lang, 'admin.usdOnly')}</option>
                      <option value="BOTH">{t(lang, 'admin.bothFull')}</option>
                    </select>
                  )}
                  {/* 식단: 표시할 끼니 */}
                  {key === 'diet' && widgetCfg.diet?.enabled !== false && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {['아침', '점심', '저녁', '간식'].map(m => (
                        <label key={m} style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', cursor: 'pointer', fontSize: '0.72rem', color: 'var(--ink2)' }}>
                          <input
                            type="checkbox"
                            checked={(widgetCfg.diet?.meals ?? { 아침: true, 점심: true, 저녁: true, 간식: true })[m] !== false}
                            onChange={e => setWidget('diet', 'meals', { ...(widgetCfg.diet?.meals ?? { 아침: true, 점심: true, 저녁: true, 간식: true }), [m]: e.target.checked })}
                            style={{ width: 13, height: 13 }}
                          />
                          {(T[lang]?.dietMeals ?? T.ko.dietMeals)[m]}
                        </label>
                      ))}
                    </div>
                  )}
                  {/* 뉴스: 기본 탭 */}
                  {key === 'news' && widgetCfg.news?.enabled !== false && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      {[['kr', t(lang, 'newsKr')], ['us', t(lang, 'newsUs')]].map(([v, l]) => (
                        <button
                          key={v}
                          onClick={() => setWidget('news', 'default_tab', v)}
                          style={{
                            padding: '0.2rem 0.48rem', borderRadius: 6, border: '1px solid var(--border)',
                            background: (widgetCfg.news?.default_tab ?? 'kr') === v ? 'var(--accent)' : 'var(--card2)',
                            color: (widgetCfg.news?.default_tab ?? 'kr') === v ? '#fff' : 'var(--ink)',
                            cursor: 'pointer', fontSize: '0.72rem', fontFamily: 'inherit',
                          }}
                        >{l}</button>
                      ))}
                    </div>
                  )}
                  {/* ON/OFF 토글 */}
                  <label style={{ position: 'relative', display: 'inline-block', width: 40, height: 22, cursor: 'pointer', flexShrink: 0 }}>
                    <input
                      type="checkbox"
                      checked={widgetCfg[key]?.enabled !== false}
                      onChange={e => setWidget(key, 'enabled', e.target.checked)}
                      style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }}
                    />
                    <span style={{
                      position: 'absolute', inset: 0, borderRadius: 22,
                      background: widgetCfg[key]?.enabled !== false ? 'var(--accent)' : '#ccc',
                      transition: 'background 0.2s',
                    }} />
                    <span style={{
                      position: 'absolute', top: 3, left: widgetCfg[key]?.enabled !== false ? 21 : 3,
                      width: 16, height: 16, borderRadius: '50%', background: '#fff',
                      transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                    }} />
                  </label>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ③ 보유 주식 관리 */}
        <div style={secStyle}>
          <div style={secHdStyle}>
            <span style={secTitle}>📈 {t(lang, 'admin.stockMgmt')}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.72rem', color: 'var(--ink3)' }}>{t(lang, 'admin.totalDisplay')}</label>
              <select value={totalMode} onChange={e => { setTotalMode(e.target.value); sv(TOTAL_MODE_KEY, e.target.value); showToast('✓ 합계 표시 방식이 저장되었습니다', 'ok') }}
                style={{ fontSize: '0.78rem', padding: '0.22rem 0.5rem', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg)', color: 'var(--ink)', fontFamily: 'inherit' }}>
                <option value="KRW">{t(lang, 'admin.krwOnly')}</option>
                <option value="USD">{t(lang, 'admin.usdOnly')}</option>
                <option value="BOTH">{t(lang, 'admin.bothFull')}</option>
              </select>
            </div>
          </div>
          <div style={secBdStyle}>
            <p style={{ fontSize: '0.78rem', color: 'var(--ink3)' }}>{t(lang, 'admin.stockHint')}</p>
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
                      {/* 그룹 헤더 */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.6rem 0.9rem', background: col.bg }}>
                        <input type="text" value={g.name} placeholder="그룹 이름"
                          onChange={e => updateGroup(g.id, 'name', e.target.value)}
                          style={{ ...inpGrp, flex: 1 }} />
                        <select value={g.currency} onChange={e => updateGroup(g.id, 'currency', e.target.value)} style={inpGrp}>
                          <option value="KRW">₩ KRW</option>
                          <option value="USD">$ USD</option>
                        </select>
                        <span style={{ fontSize: '0.72rem', color: col.tx, opacity: 0.7 }}>{g.stocks.length}/10</span>
                        <button onClick={() => delGroup(g.id)} style={{ padding: '0.28rem 0.65rem', fontSize: '0.78rem', cursor: 'pointer', background: 'transparent', color: '#c0392b', border: '1px solid #c0392b', borderRadius: 6, fontFamily: 'inherit', transition: 'all 0.15s' }}>{t(lang, 'admin.delGroup')}</button>
                      </div>
                      {/* 종목 목록 */}
                      <div style={{ background: 'var(--card2)' }}>
                        {!activeStocks.length
                          ? <div style={{ fontSize: '0.78rem', color: 'var(--ink3)', fontStyle: 'italic', textAlign: 'center', padding: '0.4rem 0.8rem' }}>종목이 없습니다. 아래에서 추가하세요.</div>
                          : activeStocks.map(s => {
                            const { holdQty, avgBuyPrice, totalSellQty } = stockSummary(s)
                            const isOpen = expanded.has(s.id)
                            return (
                              <div key={s.id}>
                                <div style={itemRow}>
                                  <div style={{ ...itemInfo, cursor: 'pointer' }} onClick={() => setExpanded(prev => { const n = new Set(prev); isOpen ? n.delete(s.id) : n.add(s.id); return n })}>
                                    <div style={{ fontSize: '0.85rem', color: 'var(--ink)', fontWeight: 400 }}>
                                      <strong>{s.ticker}</strong>{s.name ? ` · ${s.name}` : ''} <span style={{ fontSize: '0.68rem', color: 'var(--ink3)' }}>{isOpen ? '▲' : '▼'}</span>
                                    </div>
                                    <div style={{ fontSize: '0.72rem', color: 'var(--ink3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {holdQty > 0 ? `보유 ${holdQty.toLocaleString()}주` : '수량 미등록'}
                                      {avgBuyPrice > 0 ? ` · 평균 ${sym}${fmtA(avgBuyPrice)}` : ''}
                                      {totalSellQty > 0 ? ` · 매도 ${totalSellQty.toLocaleString()}주` : ''}
                                    </div>
                                  </div>
                                  <button onClick={() => confirmDelStock(g.id, s.id)} style={{ padding: '0.16rem 0.48rem', fontSize: '0.72rem', cursor: 'pointer', border: '1px solid #c0392b', borderRadius: 5, background: 'transparent', color: '#c0392b', fontFamily: 'inherit', transition: 'all 0.12s' }}>{t(lang, 'admin.delStock')}</button>
                                </div>
                                {isOpen && <StockDetailPanel g={g} s={s} onUpdate={handleStockUpdate} />}
                              </div>
                            )
                          })}
                      </div>
                      {/* 종목 추가 폼 */}
                      {activeStocks.length < 10
                        ? <AddStockRow gid={g.id} onAdd={(t, n) => addStock(g.id, t, n)} />
                        : <div style={{ fontSize: '0.75rem', color: 'var(--ink3)', textAlign: 'center', padding: '0.4rem' }}>최대 10개 종목 도달</div>
                      }
                    </div>
                  )
                })}
            </div>
            {groups.length < 10 && (
              <button onClick={addGroup} style={{ alignSelf: 'flex-start', marginTop: '0.2rem', padding: '0.48rem 1.1rem', fontSize: '0.85rem', fontWeight: 500, cursor: 'pointer', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontFamily: 'inherit', transition: 'background 0.15s' }}>
                {t(lang, 'admin.addGroup')}
              </button>
            )}
          </div>
        </div>

        {/* ② Google Calendar */}
        <div style={secStyle}>
          <div style={secHdStyle}>
            <span style={secTitle}>📅 Google Calendar 연동</span>
            <span style={{ fontSize: '0.72rem', color: 'var(--ink3)', background: 'var(--card2)', padding: '0.2rem 0.6rem', borderRadius: 10, border: '1px solid var(--border)' }}>Spring Boot 필요</span>
          </div>
          <div style={secBdStyle}>
            <div style={{ background: 'var(--card2)', borderRadius: 10, padding: '0.8rem 1rem', borderLeft: '3px solid var(--accent)' }}>
              <p style={{ fontSize: '0.82rem', color: 'var(--ink2)', lineHeight: 1.7 }}>
                <strong style={{ color: 'var(--ink)', fontWeight: 500 }}>연동 방법 (나중에 Spring Boot 구성 후):</strong><br />
                1. Google Cloud Console → OAuth 2.0 클라이언트 ID 발급<br />
                2. Spring Boot에 spring-security-oauth2-client 추가<br />
                3. 발급받은 Client ID · Secret을 아래에 입력
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ ...formGrp, flex: 2 }}>
                <label style={lbl}>Google Client ID</label>
                <input type="text" placeholder="추후 입력 (Spring Boot 구성 후)" style={inp} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ ...formGrp, flex: 2 }}>
                <label style={lbl}>Google Client Secret</label>
                <input type="password" placeholder="추후 입력" style={inp} />
              </div>
              <button onClick={() => showToast('✓ Google Calendar 설정이 저장되었습니다 (Spring Boot 구성 후 활성화)', 'ok')}
                style={{ padding: '0.48rem 1.1rem', fontSize: '0.85rem', fontWeight: 500, cursor: 'pointer', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontFamily: 'inherit', alignSelf: 'flex-end' }}>저장</button>
            </div>
          </div>
        </div>

        {/* ③ 유튜브 */}
        <div style={secStyle}>
          <div style={secHdStyle}><span style={secTitle}>▶ 유튜브 설정</span></div>
          <div style={secBdStyle}>
            <p style={{ fontSize: '0.78rem', color: 'var(--ink3)' }}>프리미엄 계정 정보를 저장하면 대시보드에서 해당 계정으로 연결됩니다.</p>
            <div style={{ background: 'var(--card2)', borderRadius: 10, border: '1px solid var(--border)', padding: '0.9rem 1rem', display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#ff0000', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '1.2rem', flexShrink: 0 }}>▶</div>
              <div><div style={{ fontSize: '0.88rem', color: 'var(--ink)', fontWeight: 400 }}>{ytAccount.email || '계정이 설정되지 않았습니다'}</div><div style={{ fontSize: '0.72rem', color: 'var(--ink3)' }}>YouTube Premium 계정</div></div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={formGrp}><label style={lbl}>이름 (닉네임)</label><input type="text" value={ytAccName} onChange={e => setYtAccName(e.target.value)} placeholder="예: 홍길동" style={inp} /></div>
              <div style={{ ...formGrp, flex: 2 }}><label style={lbl}>Google 이메일</label><input type="email" value={ytAccEmail} onChange={e => setYtAccEmail(e.target.value)} placeholder="예: example@gmail.com" style={inp} /></div>
              <button onClick={saveYTAccount} style={{ padding: '0.48rem 1.1rem', fontSize: '0.85rem', fontWeight: 500, cursor: 'pointer', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontFamily: 'inherit', alignSelf: 'flex-end' }}>계정 저장</button>
            </div>
            <div style={{ height: '0.5px', background: 'var(--border)' }} />
            <p style={{ fontSize: '0.78rem', color: 'var(--ink3)' }}>즐겨 듣는 유튜브 채널을 추가하세요.</p>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={formGrp}><label style={lbl}>채널 이름</label><input type="text" value={ytName} onChange={e => setYtName(e.target.value)} placeholder="예: 뉴스공장" style={inp} /></div>
              <div style={{ ...formGrp, flex: 2 }}><label style={lbl}>유튜브 URL</label><input type="url" value={ytUrl} onChange={e => setYtUrl(e.target.value)} placeholder="예: https://www.youtube.com/@newsfactory" style={inp} /></div>
              <button onClick={addYT} style={{ padding: '0.48rem 1.1rem', fontSize: '0.85rem', fontWeight: 500, cursor: 'pointer', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontFamily: 'inherit', alignSelf: 'flex-end' }}>+ 추가</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {!ytChannels.length
                ? <div style={{ fontSize: '0.82rem', color: 'var(--ink3)', fontStyle: 'italic', textAlign: 'center', padding: '0.5rem' }}>추가된 채널이 없습니다</div>
                : ytChannels.map(c => (
                  <div key={c.id} style={itemRow}>
                    <div style={{ width: 32, height: 22, background: '#ff0000', borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.7rem', flexShrink: 0 }}>▶</div>
                    <div style={itemInfo}><div style={{ fontSize: '0.85rem', color: 'var(--ink)' }}>{c.channel_name}</div><div style={{ fontSize: '0.72rem', color: 'var(--ink3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.channel_url || ''}</div></div>
                    <button className="btn-danger" onClick={() => delYT(c.id)}>삭제</button>
                  </div>
                ))}
            </div>
          </div>
        </div>

        {/* ④ 즐겨찾기 */}
        <div style={secStyle}>
          <div style={secHdStyle}><span style={secTitle}>🌐 단골 사이트</span></div>
          <div style={secBdStyle}>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={formGrp}><label style={lbl}>사이트 이름</label><input type="text" value={siteName} onChange={e => setSiteName(e.target.value)} placeholder="예: 네이버" style={inp} /></div>
              <div style={{ ...formGrp, flex: 2 }}><label style={lbl}>주소 (URL)</label><input type="url" value={siteUrl} onChange={e => setSiteUrl(e.target.value)} placeholder="예: https://www.naver.com" style={inp} /></div>
              <button onClick={addSite} style={{ padding: '0.48rem 1.1rem', fontSize: '0.85rem', fontWeight: 500, cursor: 'pointer', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontFamily: 'inherit', alignSelf: 'flex-end' }}>+ 추가</button>
            </div>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--ink3)', alignSelf: 'center' }}>빠른 추가 →</span>
              {[['네이버','https://www.naver.com'],['다음','https://www.daum.net'],['유튜브','https://www.youtube.com'],['카카오','https://www.kakao.com'],['네이버증권','https://finance.naver.com'],['구글','https://www.google.com'],['쿠팡','https://www.coupang.com']].map(([n, u]) => (
                <button key={n} onClick={() => quickSite(n, u)} style={{ padding: '0.28rem 0.7rem', fontSize: '0.75rem', cursor: 'pointer', background: 'transparent', color: 'var(--blue)', border: '1px solid var(--blue)', borderRadius: 6, fontFamily: 'inherit', transition: 'all 0.15s' }}>{n}</button>
              ))}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {!sites.length
                ? <div style={{ fontSize: '0.82rem', color: 'var(--ink3)', fontStyle: 'italic', textAlign: 'center', padding: '0.5rem' }}>추가된 사이트가 없습니다</div>
                : sites.map(s => {
                  const dom = (() => { try { return new URL(s.url).hostname } catch { return '' } })()
                  return (
                    <div key={s.id} style={itemRow}>
                      <div style={{ width: 24, display: 'flex', alignItems: 'center' }}>
                        {dom && <img src={`https://www.google.com/s2/favicons?domain=${dom}&sz=32`} width={18} height={18} style={{ borderRadius: 3 }} onError={e => { e.target.style.display = 'none' }} alt="" />}
                      </div>
                      <div style={itemInfo}><div style={{ fontSize: '0.85rem', color: 'var(--ink)' }}>{s.title}</div><div style={{ fontSize: '0.72rem', color: 'var(--ink3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.url}</div></div>
                      <button className="btn-danger" onClick={() => delSite(s.id)}>삭제</button>
                    </div>
                  )
                })}
            </div>
          </div>
        </div>

        {/* ⑤ 안내 */}
        <div style={{ ...secStyle, background: 'var(--card2)' }}>
          <div style={secBdStyle}>
            <div style={{ background: 'var(--card2)', borderRadius: 10, padding: '0.8rem 1rem', borderLeft: '3px solid var(--accent)' }}>
              <p style={{ fontSize: '0.82rem', color: 'var(--ink2)', lineHeight: 1.7 }}>
                <strong style={{ color: 'var(--ink)', fontWeight: 500 }}>📌 나중에 Spring Boot 추가 시 확장되는 기능</strong><br />
                • Google Calendar 실시간 연동<br />• 주식 시세 자동 업데이트 (Yahoo Finance API + @Scheduled)<br />
                • 지출 → 가계부 앱 연동 (API 확장)<br />• 뉴스 RSS 자동 수집 (한국 · 미국)
              </p>
            </div>
          </div>
        </div>

        {/* ⑥ 시간대 설정 */}
        <div style={secStyle}>
          <div style={secHdStyle}>
            <span style={secTitle}>🕐 {t(lang, 'admin.tzTitle')}</span>
            <button onClick={saveTZ} style={{ padding: '0.48rem 1.1rem', fontSize: '0.85rem', fontWeight: 500, cursor: 'pointer', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontFamily: 'inherit' }}>{t(lang, 'admin.save')}</button>
          </div>
          <div style={secBdStyle}>
            <p style={{ fontSize: '0.82rem', color: 'var(--ink3)' }}>{t(lang, 'admin.tzDesc')}</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '0.8rem' }}>
              {[t(lang, 'admin.tzZone1'), t(lang, 'admin.tzZone2'), t(lang, 'admin.tzZone3')].map((label, i) => (
                <div key={i} style={{ background: 'var(--card2)', borderRadius: 10, border: '1px solid var(--border)', padding: '0.9rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 500, color: 'var(--ink3)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{label}</div>
                  <div style={{ fontFamily: "'Playfair Display',serif", fontSize: '1.4rem', fontWeight: 300, color: 'var(--ink)' }}>{tzPreviews[i]}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--ink2)' }}>{tzData[i]?.region}</div>
                  <select value={tzData[i]?.tz || ''} onChange={e => updateTz(i, 'tz', e.target.value)}
                    style={{ padding: '0.4rem 0.6rem', fontSize: '0.82rem', border: '1px solid var(--border)', borderRadius: 7, background: 'var(--bg)', color: 'var(--ink)', fontFamily: 'inherit', width: '100%' }}>
                    {ALL_TZ.map(tz => <option key={tz.tz} value={tz.tz}>{t(lang, 'admin.' + tz.labelKey)}</option>)}
                  </select>
                  <input type="text" value={tzData[i]?.region || ''} onChange={e => updateTz(i, 'region', e.target.value)}
                    placeholder={t(lang, `admin.tzPlaceholder${i + 1}`)}
                    style={{ padding: '0.4rem 0.6rem', fontSize: '0.82rem', border: '1px solid var(--border)', borderRadius: 7, background: 'var(--bg)', color: 'var(--ink)', fontFamily: 'inherit', width: '100%' }} />
                </div>
              ))}
            </div>
          </div>
        </div>

        <button onClick={saveAll} style={{ padding: '0.9rem 2rem', fontSize: '0.95rem', fontWeight: 700, cursor: 'pointer', background: 'var(--green)', color: '#fff', border: 'none', borderRadius: 12, fontFamily: 'inherit', width: '100%', letterSpacing: '0.04em', transition: 'background 0.15s' }}>
          {t(lang, 'admin.saveAll')}
        </button>
      </main>

      {/* 종목 삭제 확인 모달 */}
      {deleteModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: 'var(--card)', borderRadius: 14, padding: '1.4rem 1.5rem', width: 'min(420px,100%)', boxShadow: '0 8px 40px rgba(0,0,0,0.25)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.9rem' }}>
              <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--ink)' }}>⚠️ 종목 삭제</div>
              <button onClick={() => setDeleteModal(null)} style={{ background: 'none', border: 'none', fontSize: '1.1rem', cursor: 'pointer', color: 'var(--ink3)', lineHeight: 1 }}>✕</button>
            </div>
            <div style={{ fontSize: '0.87rem', color: 'var(--ink)', lineHeight: 1.7, marginBottom: '1.1rem', padding: '0.65rem 0.8rem', background: 'var(--card2)', borderRadius: 8, borderLeft: '3px solid #dc2626' }}>
              이 종목의 모든 거래내역이 삭제됩니다.<br />정말 삭제하시겠습니까?
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button onClick={() => setDeleteModal(null)} style={{ padding: '0.42rem 1rem', fontSize: '0.85rem', border: '1px solid var(--border)', borderRadius: 7, background: 'var(--card2)', color: 'var(--ink)', cursor: 'pointer' }}>취소</button>
              <button onClick={doDelStock} style={{ padding: '0.42rem 1.1rem', fontSize: '0.85rem', border: 'none', borderRadius: 7, background: '#dc2626', color: '#fff', cursor: 'pointer', fontWeight: 500 }}>삭제</button>
            </div>
          </div>
        </div>
      )}

      <Toast toast={toast} />
    </div>
  )
}
