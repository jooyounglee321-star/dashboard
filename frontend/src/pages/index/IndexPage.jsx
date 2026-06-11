import { useState, useEffect, useCallback, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import './index.css'

import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, arrayMove, rectSortingStrategy } from '@dnd-kit/sortable'
import { SortableCard, DEFAULT_LAYOUT_ITEMS } from './LayoutEditor'

import HeroSection from './HeroSection'
import ScheduleCard from './ScheduleCard'
import YoutubeCard from './YoutubeCard'
import StockCard from './StockCard'
import StockStatsOverlay from './StockStatsOverlay'
import StockSettingsModal from './StockSettingsModal'
import ExpenseCard from './ExpenseCard'
import DietCard from './DietCard'
import MemoCard from './MemoCard'
import PinnedMemoCard from './PinnedMemoCard'
import NewsCard from './NewsCard'
import SitesCard from './SitesCard'
import { t } from './i18n'

const DAYS = ['일', '월', '화', '수', '목', '금', '토']
const MON = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월']
const DAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MON_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function getHeaderDate(lang = 'ko') {
  const n = new Date()
  if (lang === 'en') {
    return `${MON_EN[n.getMonth()]} ${n.getDate()}, ${n.getFullYear()} (${DAYS_EN[n.getDay()]})`
  }
  return `${n.getFullYear()}년 ${MON[n.getMonth()]} ${n.getDate()}일 (${DAYS[n.getDay()]})`
}

export default function IndexPage() {
  const navigate = useNavigate()

  // Mobile tab state
  const [mobileTab, setMobileTab] = useState('home')

  // Server health banner
  const [serverDown, setServerDown] = useState(false)

  // Timezone zones (from API)
  const [zones, setZones] = useState(null)

  // Stock data
  const [stockGroups, setStockGroups] = useState([])
  const [priceMap, setPriceMap] = useState({})
  const [fxRate, setFxRate] = useState(null)
  const [stockLoading, setStockLoading] = useState(true)
  const [stockError, setStockError] = useState(false)

  // Stats overlay
  const [statsOpen, setStatsOpen] = useState(false)
  const [stockSettingsOpen, setStockSettingsOpen] = useState(false)

  // 위젯 설정 (localStorage 캐시로 언어 즉시 반영)
  const [widgetCfg, setWidgetCfg] = useState(() => {
    try {
      const lang = localStorage.getItem('dashboard_lang')
      if (lang) return { language: lang }
    } catch {}
    return null
  })
  // widgetCfg가 null(로딩 중)이면 모두 보여줌, 이후 설정대로 표시
  const w = (key) => !widgetCfg || widgetCfg[key]?.enabled !== false

  // 고정 메모 접기/펼치기 (localStorage 유지)
  const [pinnedOpen, setPinnedOpen] = useState(() => {
    try { return localStorage.getItem('pinned_memo_open') !== 'false' } catch { return true }
  })
  function togglePinned() {
    setPinnedOpen(o => {
      try { localStorage.setItem('pinned_memo_open', String(!o)) } catch {}
      return !o
    })
  }

  // ── 레이아웃 편집 상태 ────────────────────────────────────────────────────
  const [editMode,     setEditMode]     = useState(false)
  const [layoutItems,  setLayoutItems]  = useState(DEFAULT_LAYOUT_ITEMS)
  const [draftItems,   setDraftItems]   = useState([])
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))
  const activeItems = editMode ? draftItems : layoutItems

  // 포트폴리오 백필 — IndexPage 마운트 시 1회 (로그인 직후 및 페이지 새로고침 모두 커버)
  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token || token.trim() === '' || token === 'undefined' || token === 'null') return
    fetch('/api/portfolio/backfill', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token },
    })
      .then(r => r.json())
      .then(d => { if (d.backfilled > 0) console.log('[BACKFILL] 포트폴리오 백필 완료:', d) })
      .catch(err => console.warn('[BACKFILL] 백필 실패:', err))
  }, [])

  // Header date tick (localStorage 캐시 언어로 초기화)
  const cachedLang = (() => { try { return localStorage.getItem('dashboard_lang') || 'ko' } catch { return 'ko' } })()
  const headerLangRef = useRef(cachedLang)
  const [headerDate, setHeaderDate] = useState(() => getHeaderDate(cachedLang))
  useEffect(() => {
    const id = setInterval(() => setHeaderDate(getHeaderDate(headerLangRef.current)), 10000)
    return () => clearInterval(id)
  }, [])

  // 로그아웃
  async function handleLogout() {
    const token = localStorage.getItem('token')
    try { await fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + (token || '') } }).catch(() => {}) } catch {}
    localStorage.clear()
    sessionStorage.clear()
    navigate('/login', { replace: true })
  }

  // 헤더 닉네임 + role
  const [userName, setUserName] = useState('')
  const [userRole, setUserRole] = useState('')
  const [avatarSrc, setAvatarSrc] = useState(null)
  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) return
    // 로컬 캐시 우선 표시
    try {
      const cached = JSON.parse(localStorage.getItem('user') || '{}')
      if (cached.name) setUserName(cached.name)
      if (cached.role) setUserRole(cached.role)
    } catch {}
    // 아바타
    const av = localStorage.getItem('avatar_data')
    if (av) setAvatarSrc(av)
    // API 최신 닉네임 + role
    fetch('/api/auth/me', { headers: { Authorization: 'Bearer ' + token } })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.name) setUserName(d.name)
        if (d?.role) setUserRole(d.role)
      })
      .catch(() => {})
  }, [])

  // Load timezone zones
  useEffect(() => {
    fetch('/api/timezone', { headers: { Authorization: 'Bearer ' + localStorage.getItem('token') } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.zones?.length === 3) setZones(d.zones) })
      .catch(() => {})
  }, [])

  // 위젯 설정 로드
  useEffect(() => {
    fetch('/api/auth/widget-config', { headers: { Authorization: 'Bearer ' + localStorage.getItem('token') } })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.config) {
          setWidgetCfg(d.config)
          // BudgetPage 등 다른 페이지가 localStorage에서 언어를 읽으므로 동기화
          if (d.config.language) {
            try { localStorage.setItem('dashboard_lang', d.config.language) } catch {}
          }
        }
      })
      .catch(() => {})
  }, [])

  // 언어 변경 시 헤더 날짜 동기화
  useEffect(() => {
    const newLang = widgetCfg?.language ?? 'ko'
    headerLangRef.current = newLang
    setHeaderDate(getHeaderDate(newLang))
  }, [widgetCfg])

  // 저장된 레이아웃 복원 — 새로 추가된 위젯은 끝에 자동 병합
  useEffect(() => {
    const saved = widgetCfg?.layout?.items
    if (Array.isArray(saved) && saved.length) {
      const savedIds = new Set(saved.map(i => i.id))
      const newItems = DEFAULT_LAYOUT_ITEMS.filter(i => !savedIds.has(i.id))
      setLayoutItems(newItems.length ? [...saved, ...newItems] : saved)
    }
  }, [widgetCfg])

  // ProfilePage에서 언어 저장 시 실시간 반영 (같은 탭 내)
  useEffect(() => {
    function onLanguageChanged() {
      try {
        const newLang = localStorage.getItem('dashboard_lang') || 'ko'
        setWidgetCfg(prev => prev ? { ...prev, language: newLang } : { language: newLang })
      } catch {}
    }
    window.addEventListener('languageChanged', onLanguageChanged)
    return () => window.removeEventListener('languageChanged', onLanguageChanged)
  }, [])

  // Server health check
  const checkHealth = useCallback(async () => {
    try {
      const r = await fetch('/api/health', { signal: AbortSignal.timeout(5000) })
      setServerDown(!r.ok)
    } catch {
      setServerDown(true)
    }
  }, [])

  useEffect(() => {
    checkHealth()
    const id = setInterval(checkHealth, 30000)
    return () => clearInterval(id)
  }, [checkHealth])

  // Load stock data
  const loadStocks = useCallback(async () => {
    setStockLoading(true)
    setStockError(false)
    try {
      const dbRes = await fetch('/api/portfolio/groups', { signal: AbortSignal.timeout(8000), headers: { Authorization: 'Bearer ' + localStorage.getItem('token') } })
      if (!dbRes.ok) throw new Error('HTTP ' + dbRes.status)
      const dbJson = await dbRes.json()
      const rawGroups = dbJson.data || []
      // Filter deleted stocks
      const activeGroups = rawGroups.map(g => ({ ...g, stocks: (g.stocks || []).filter(s => !s.is_deleted) }))
      setStockGroups(activeGroups)

      // Build ticker→category map
      const tickerCatMap = {}
      activeGroups.forEach(g => {
        const cat = g.currency === 'KRW' ? 'kor-stock' : 'us'
        g.stocks.forEach(s => { if (s.ticker && !tickerCatMap[s.ticker]) tickerCatMap[s.ticker] = cat })
      })

      // Fetch prices + fx in parallel
      const newPriceMap = {}
      let newFxRate = null
      const ctrl = new AbortController()
      const abortTimer = setTimeout(() => ctrl.abort(), 7000)

      const [fxResult, ...priceResults] = await Promise.allSettled([
        fetch('/api/stocks/exchange-rate', { signal: ctrl.signal }).then(r => r.ok ? r.json() : null).catch(() => null),
        ...Object.entries(tickerCatMap).map(async ([t, cat]) => {
          try {
            const r = await fetch(`/api/stocks/price/${encodeURIComponent(t)}?category=${cat}`, { signal: ctrl.signal })
            if (r.ok) newPriceMap[t] = await r.json()
          } catch {}
        }),
      ])
      clearTimeout(abortTimer)

      newFxRate = fxResult.status === 'fulfilled' ? (fxResult.value?.usd_krw ?? null) : null
      setPriceMap(newPriceMap)
      setFxRate(newFxRate)
    } catch {
      setStockError(true)
    } finally {
      setStockLoading(false)
    }
  }, [])

  useEffect(() => { loadStocks() }, [loadStocks])

  // Daily snapshot at 23:59
  useEffect(() => {
    let lastSnapshotDate = null
    const id = setInterval(async () => {
      const now = new Date()
      if (now.getHours() === 23 && now.getMinutes() === 59) {
        const today = now.toISOString().slice(0, 10)
        if (lastSnapshotDate === today) return
        try {
          // Re-fetch stock data for snapshot
          const dbRes = await fetch('/api/portfolio/groups', { signal: AbortSignal.timeout(8000), headers: { Authorization: 'Bearer ' + localStorage.getItem('token') } })
          if (!dbRes.ok) return
          const dbJson = await dbRes.json()
          const groups = (dbJson.data || []).map(g => ({ ...g, stocks: (g.stocks || []).filter(s => !s.is_deleted) }))

          const tickerCatMap = {}
          groups.forEach(g => {
            const cat = g.currency === 'KRW' ? 'kor-stock' : 'us'
            g.stocks.forEach(s => { if (s.ticker) tickerCatMap[s.ticker] = cat })
          })

          const snapPriceMap = {}
          let snapFxRate = null
          const [fxRes, ...priceRes] = await Promise.allSettled([
            fetch('/api/stocks/exchange-rate').then(r => r.ok ? r.json() : null).catch(() => null),
            ...Object.entries(tickerCatMap).map(async ([t, cat]) => {
              try {
                const r = await fetch(`/api/stocks/price/${encodeURIComponent(t)}?category=${cat}`)
                if (r.ok) snapPriceMap[t] = await r.json()
              } catch {}
            }),
          ])
          snapFxRate = fxRes.status === 'fulfilled' ? (fxRes.value?.usd_krw ?? null) : null

          // Calculate totals for snapshot
          const snapToday = new Date().toISOString().split('T')[0]
          let grandUSD = 0, grandKRW = 0
          const snapshotGroups = groups.map(g => {
            const isKRW = g.currency === 'KRW'
            let grpTotal = 0
            const stocks = g.stocks.map(s => {
              const pp = s.purchases || []; const sl = s.sells || []
              // 오늘 날짜 기준: date 없으면 항상 포함(하위호환), date 있으면 오늘 이하만
              const activePP = pp.filter(p => !p.date || p.date <= snapToday)
              const activeSL = sl.filter(p => !p.date || p.date <= snapToday)
              const bq = activePP.reduce((a, p) => a + (p.qty || 0), 0)
              const sq = activeSL.reduce((a, p) => a + (p.qty || 0), 0)
              const hq = Math.max(0, bq - sq)
              const validPP = activePP.filter(p => (p.price || 0) > 0 && (p.qty || 0) > 0)
              const ws = validPP.reduce((a, p) => a + p.price * p.qty, 0)
              const vqt = validPP.reduce((a, p) => a + p.qty, 0)
              const avg = vqt > 0 ? ws / vqt : 0
              const priceObj = snapPriceMap[s.ticker]
              const cur = priceObj?.current_price ?? avg
              const val = cur * hq
              grpTotal += val
              const realPL = activeSL.reduce((a, p) => a + ((p.price || 0) - avg) * (p.qty || 0), 0)
              const evalPL = avg > 0 ? (cur - avg) * hq : null
              return { ticker: s.ticker, name: s.name || null, current_price: priceObj?.current_price ?? null, hold_qty: hq, eval_amount: val, avg_buy_price: avg || null, eval_pl: evalPL, realized_pl: realPL }
            })
            if (isKRW) grandKRW += grpTotal; else grandUSD += grpTotal
            return { name: g.name, currency: g.currency, total: grpTotal, stocks }
          })

          const payload = {
            snapshot_date: today,
            usd_krw: snapFxRate ?? null,
            total_usd: grandUSD,
            total_krw: grandKRW,
            total_krw_equiv: grandKRW + (snapFxRate ? grandUSD * snapFxRate : 0),
            groups: snapshotGroups,
          }

          const r = await fetch('/api/portfolio/snapshot', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('token') },
            body: JSON.stringify(payload),
          })
          if (r.ok) {
            lastSnapshotDate = today
            console.log('[SNAPSHOT] 저장 완료 →', today)
          }
        } catch (e) {
          console.warn('[SNAPSHOT] 오류:', e.message)
        }
      }
    }, 60000)
    return () => clearInterval(id)
  }, [])

  const stockData = stockError ? null : { groups: stockGroups, priceMap, fxRate }
  const lang = widgetCfg?.language ?? 'ko'

  // ── 레이아웃 편집 함수 ──────────────────────────────────────────────────
  function enterEditMode() { setDraftItems([...layoutItems]); setEditMode(true) }
  function cancelEdit()    { setEditMode(false); setDraftItems([]) }

  async function saveEdit() {
    const token  = localStorage.getItem('token')
    const newCfg = { ...(widgetCfg || {}), layout: { items: draftItems } }
    try {
      await fetch('/api/auth/widget-config', {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body:    JSON.stringify({ config: newCfg }),
      })
      setLayoutItems(draftItems)
      setWidgetCfg(newCfg)
      setEditMode(false)
      setDraftItems([])
    } catch (e) { console.error('[Layout] 저장 실패:', e) }
  }

  function handleDragEnd({ active, over }) {
    if (!over || active.id === over.id) return
    setDraftItems(prev => {
      const from = prev.findIndex(i => i.id === active.id)
      const to   = prev.findIndex(i => i.id === over.id)
      return arrayMove(prev, from, to)
    })
  }

  function handleSizeChange(id, span) {
    setDraftItems(prev => prev.map(item => item.id === id ? { ...item, span } : item))
  }

  function renderWidget(item) {
    if (!w(item.id)) return null
    switch (item.id) {
      case 'hero':     return <HeroSection zones={zones} clockCount={widgetCfg?.hero?.clock_count ?? 3} tempUnit={widgetCfg?.hero?.temp_unit ?? 'C'} lang={lang} />
      case 'schedule': return <ScheduleCard lang={lang} />
      case 'youtube':  return <YoutubeCard maxCount={widgetCfg?.youtube?.max_count ?? 10} lang={lang} />
      case 'stock':    return <StockCard groups={stockGroups} priceMap={priceMap} fxRate={fxRate} loading={stockLoading} onOpenStats={() => setStatsOpen(true)} onOpenSettings={() => setStockSettingsOpen(true)} currencyDisplay={widgetCfg?.stock?.currency_display} lang={lang} />
      case 'expense':  return <ExpenseCard lang={lang} />
      case 'diet':     return <DietCard mealConfig={widgetCfg?.diet?.meals} lang={lang} />
      case 'memo':        return <MemoCard lang={lang} />
      case 'news':        return <NewsCard defaultTab={widgetCfg?.news?.default_tab ?? 'kr'} lang={lang} />
      case 'sites':    return <SitesCard lang={lang} />
      default:         return null
    }
  }

  // 보이는 항목만 SortableContext에 전달
  const visibleItems = activeItems.map(item => ({ ...item, el: renderWidget(item) })).filter(i => i.el !== null)

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      {/* 서버 오프라인 배너 */}
      {serverDown && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
          background: '#c0392b', color: '#fff', textAlign: 'center',
          padding: '10px 16px', fontSize: 14, fontWeight: 600,
          letterSpacing: '0.01em', boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        }}>
          {t(lang, 'serverDown')}&nbsp;
          <a href="https://railway.app" target="_blank" rel="noreferrer"
            style={{ color: '#ffe', textDecoration: 'underline', fontWeight: 700 }}>
            {t(lang, 'serverLink')}
          </a>
        </div>
      )}

      {/* 주식 통계 전체화면 오버레이 */}
      <StockStatsOverlay
        isOpen={statsOpen}
        onClose={() => setStatsOpen(false)}
        stockData={stockData}
        lang={lang}
      />

      {/* 내 주식 설정 모달 */}
      <StockSettingsModal
        isOpen={stockSettingsOpen}
        onClose={() => setStockSettingsOpen(false)}
        lang={lang}
      />

      {/* 헤더 */}
      <header className="header">
        <span className="header-title" style={{ fontFamily: "'Playfair Display', serif", fontSize: '1.25rem', color: 'var(--accent2)' }}>
          ✦ {userName ? `${userName}${t(lang, 'ofDay')}` : t(lang, 'myDay')}
        </span>
        <div className="header-right">
          <span className="header-date">{headerDate}</span>
          <Link to="/admin" className="admin-link">{t(lang, 'adminLink')}</Link>
          {userRole === 'admin' && (
            <Link to="/superadmin" style={{
              fontSize: '0.78rem', color: '#c0392b', textDecoration: 'none',
              border: '1px solid rgba(192,57,43,0.45)', padding: '0.28rem 0.7rem',
              borderRadius: 20, fontFamily: 'inherit', fontWeight: 500,
            }}>{t(lang, 'superadminBtn')}</Link>
          )}
          <button
            onClick={handleLogout}
            title={t(lang, 'logout')}
            style={{
              fontSize: '0.78rem', color: '#c0392b', background: 'none',
              border: '1px solid rgba(192,57,43,0.35)', padding: '0.28rem 0.7rem',
              borderRadius: 20, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 400,
            }}
          >
            {t(lang, 'logout')}
          </button>
          <Link
            to="/profile"
            title="내 프로필"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 30, height: 30, borderRadius: '50%',
              background: 'rgba(232,160,96,0.15)', border: '1px solid rgba(232,160,96,0.35)',
              color: 'var(--accent2)', textDecoration: 'none', fontSize: '1rem',
              overflow: 'hidden', flexShrink: 0,
            }}
          >
            {avatarSrc
              ? <img src={avatarSrc} alt="프로필" style={{ width: 30, height: 30, objectFit: 'cover', borderRadius: '50%' }} />
              : '👤'}
          </Link>
          {/* ── 레이아웃 편집 버튼 (모바일 숨김) ── */}
          {!editMode && (
            <button className="layout-edit-btn" onClick={enterEditMode} title="레이아웃 편집">
              ⊞ {lang === 'ko' ? '레이아웃 편집' : 'Edit Layout'}
            </button>
          )}
        </div>
      </header>

      {/* ── 편집모드 툴바 (sticky) ── */}
      {editMode && (
        <div className="layout-toolbar">
          <span className="layout-toolbar-tip">
            ⠿ {lang === 'ko' ? '드래그로 순서 변경  ·  S / M / L 버튼으로 크기 조정' : 'Drag to reorder  ·  S / M / L to resize'}
          </span>
          <div className="layout-toolbar-actions">
            <button className="layout-btn-cancel" onClick={cancelEdit}>
              {lang === 'ko' ? '취소' : 'Cancel'}
            </button>
            <button className="layout-btn-save" onClick={saveEdit}>
              {lang === 'ko' ? '저장' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {/* ═══ 고정 메모 영역 (위젯 외부 최상단) ═══ */}
      <div className="pinned-memo-zone">
        <div className="pinned-memo-zone-header" onClick={togglePinned} style={{ cursor: 'pointer' }}>
          <span style={{ fontWeight: 600, fontSize: '0.78rem', color: 'var(--ink2)', letterSpacing: '0.06em' }}>
            📌 {t(lang, 'pinnedMemoTitle')}
          </span>
          <span style={{ fontSize: '0.85rem', color: 'var(--ink3)', transition: 'transform 0.2s', display: 'inline-block', transform: pinnedOpen ? 'rotate(0deg)' : 'rotate(-90deg)' }}>
            ▾
          </span>
        </div>
        {pinnedOpen && <PinnedMemoCard lang={lang} />}
      </div>

      {/* ═══ PC 레이아웃 ═══ */}
      <main className="main">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={visibleItems.map(i => i.id)} strategy={rectSortingStrategy}>
            {visibleItems.map(({ id, span, el }) => (
              <SortableCard
                key={id}
                id={id}
                span={span}
                editMode={editMode}
                onSizeChange={handleSizeChange}
              >
                {el}
              </SortableCard>
            ))}
          </SortableContext>
        </DndContext>
      </main>

      {/* ═══ 모바일 고정 메모 ═══ */}
      <div className="pinned-memo-zone pinned-memo-zone--mobile">
        <div className="pinned-memo-zone-header" onClick={togglePinned} style={{ cursor: 'pointer' }}>
          <span style={{ fontWeight: 600, fontSize: '0.78rem', color: 'var(--ink2)', letterSpacing: '0.06em' }}>
            📌 {t(lang, 'pinnedMemoTitle')}
          </span>
          <span style={{ fontSize: '0.85rem', color: 'var(--ink3)', transition: 'transform 0.2s', display: 'inline-block', transform: pinnedOpen ? 'rotate(0deg)' : 'rotate(-90deg)' }}>
            ▾
          </span>
        </div>
        {pinnedOpen && <PinnedMemoCard lang={lang} />}
      </div>

      {/* ═══ 모바일 레이아웃 ═══ */}
      <div className="mobile-view">

        {/* 홈: 시간+날씨+일정+사이트 */}
        <div className={`mob-section${mobileTab === 'home' ? ' active' : ''}`}>
          {w('hero') && <HeroSection zones={zones} isMobile clockCount={widgetCfg?.hero?.clock_count ?? 3} tempUnit={widgetCfg?.hero?.temp_unit ?? 'C'} lang={lang} />}
          {w('schedule') && <ScheduleCard isMobile lang={lang} />}
          {w('sites') && <SitesCard isMobile lang={lang} />}
        </div>

        {/* 가계부: 지출+주식 */}
        <div className={`mob-section${mobileTab === 'money' ? ' active' : ''}`}>
          {w('expense') && <ExpenseCard isMobile lang={lang} />}
          {w('stock') && (
            <StockCard
              groups={stockGroups}
              priceMap={priceMap}
              fxRate={fxRate}
              loading={stockLoading}
              onOpenStats={() => setStatsOpen(true)}
              onOpenSettings={() => setStockSettingsOpen(true)}
              currencyDisplay={widgetCfg?.stock?.currency_display}
              isMobile
              lang={lang}
            />
          )}
        </div>

        {/* 건강: 식단+메모 */}
        <div className={`mob-section${mobileTab === 'health' ? ' active' : ''}`}>
          {w('diet') && <DietCard isMobile mealConfig={widgetCfg?.diet?.meals} lang={lang} />}
          {w('memo') && <MemoCard isMobile lang={lang} />}
        </div>

        {/* 미디어: 뉴스+유튜브 */}
        <div className={`mob-section${mobileTab === 'media' ? ' active' : ''}`}>
          {w('news') && <NewsCard isMobile defaultTab={widgetCfg?.news?.default_tab ?? 'kr'} lang={lang} />}
          {w('youtube') && <YoutubeCard isMobile maxCount={widgetCfg?.youtube?.max_count ?? 10} lang={lang} />}
        </div>

      </div>

      {/* ═══ 모바일 하단 네비게이션 ═══ */}
      <nav className="mobile-nav">
        {[
          { key: 'home', icon: '🏠', label: t(lang, 'navHome') },
          { key: 'money', icon: '💰', label: t(lang, 'navMoney') },
          { key: 'health', icon: '🥗', label: t(lang, 'navHealth') },
          { key: 'media', icon: '📰', label: t(lang, 'navMedia') },
        ].map(({ key, icon, label }) => (
          <button
            key={key}
            className={`mnav-item${mobileTab === key ? ' active' : ''}`}
            onClick={() => setMobileTab(key)}
          >
            <span className="mnav-icon">{icon}</span>
            {label}
          </button>
        ))}
        <Link to="/admin" className="mnav-item">
          <span className="mnav-icon">⚙️</span>
          {t(lang, 'navAdmin')}
        </Link>
        <Link to="/budget" className="mnav-item">
          <span className="mnav-icon">📒</span>
          {t(lang, 'budgetNavLink')}
        </Link>
      </nav>
    </div>
  )
}
