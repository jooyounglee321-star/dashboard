import { useState, useEffect, useCallback, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { calcStock } from '../../utils/calcStock'
import { apiFetch } from '../../api'
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
import { t, T } from './i18n'

const CACHE_TTL = 30000
function ssGet(key) {
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    const { data, ts } = JSON.parse(raw)
    return Date.now() - ts < CACHE_TTL ? data : null
  } catch { return null }
}
function ssSet(key, data) {
  try { sessionStorage.setItem(key, JSON.stringify({ data, ts: Date.now() })) } catch {}
}

function buildTickerCatMap(groups) {
  const map = {}
  groups.forEach(g => {
    const cat = g.currency === 'KRW' ? 'kor-stock' : 'us'
    g.stocks.forEach(s => { if (s.ticker && !map[s.ticker]) map[s.ticker] = cat })
  })
  return map
}

function getHeaderDate(lang = 'ko') {
  const n = new Date()
  const days = T[lang]?.common?.days ?? T.ko.common.days
  const months = T[lang]?.common?.months ?? T.ko.common.months
  if (lang === 'en') {
    return `${months[n.getMonth()]} ${n.getDate()}, ${n.getFullYear()} (${days[n.getDay()]})`
  }
  return `${n.getFullYear()}년 ${months[n.getMonth()]} ${n.getDate()}일 (${days[n.getDay()]})`
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

  // localStorage 안전 접근 (Safari Private 모드 등 대비)
  const getLsItem = (k) => { try { return localStorage.getItem(k) } catch { return null } }

  // Stats overlay
  const [statsOpen, setStatsOpen] = useState(() => sessionStorage.getItem('statsOpen') === 'true')
  const setStatsOpenPersist = (v) => { sessionStorage.setItem('statsOpen', String(v)); setStatsOpen(v) }
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
  const pinnedRef = useRef(null)
  const [pinnedOpen, setPinnedOpen] = useState(() => {
    try { return localStorage.getItem('pinned_memo_open') !== 'false' } catch { return true }
  })
  function togglePinned() {
    setPinnedOpen(o => {
      try { localStorage.setItem('pinned_memo_open', String(!o)) } catch {}
      return !o
    })
  }
  function handlePinnedAdd() {
    if (!pinnedOpen) {
      setPinnedOpen(true)
      try { localStorage.setItem('pinned_memo_open', 'true') } catch {}
    }
    setTimeout(() => pinnedRef.current?.openAdd(), 0)
  }

  // ── 레이아웃 편집 상태 ────────────────────────────────────────────────────
  const [editMode,     setEditMode]     = useState(false)
  const [layoutItems,  setLayoutItems]  = useState(DEFAULT_LAYOUT_ITEMS)
  const [draftItems,   setDraftItems]   = useState([])
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))
  const activeItems = editMode ? draftItems : layoutItems

  // 포트폴리오 백필 — IndexPage 마운트 시 1회 (로그인 직후 및 페이지 새로고침 모두 커버)
  useEffect(() => {
    const ctrl = new AbortController()
    apiFetch('/api/portfolio/backfill', { method: 'POST', signal: ctrl.signal })
      .then(d => { if (d.backfilled > 0) console.log('[BACKFILL] 포트폴리오 백필 완료:', d) })
      .catch(err => { if (err?.name !== 'AbortError') console.warn('[BACKFILL] 백필 실패:', err) })
    return () => ctrl.abort()
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
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  async function handleLogout() {
    setShowLogoutConfirm(false)
    try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {}) } catch {}
    try { localStorage.removeItem('dashboard_logged_in'); localStorage.removeItem('user') } catch {}
    try { sessionStorage.clear() } catch {}
    navigate('/login', { replace: true })
  }

  // 헤더 닉네임 + role
  const [userName, setUserName] = useState('')
  const [userRole, setUserRole] = useState('')
  const [avatarSrc, setAvatarSrc] = useState(null)

  // auth/me + timezone + widget-config 병렬 로드
  useEffect(() => {
    // 로컬 캐시 우선 표시
    try {
      const cached = JSON.parse(getLsItem('user') || '{}')
      if (cached.name) setUserName(cached.name)
      if (cached.role) setUserRole(cached.role)
    } catch {}
    const av = getLsItem('avatar_data')
    if (av) setAvatarSrc(av)

    const ctrl = new AbortController()
    const sig = { signal: ctrl.signal, credentials: 'include' }

    const meCache = ssGet('cache_me')
    const tzCache = ssGet('cache_timezone')
    const wcCache = ssGet('cache_widget_config')

    Promise.all([
      meCache ? Promise.resolve(meCache)
        : fetch('/api/auth/me', sig).then(r => r.ok ? r.json() : null).catch(() => null).then(d => { if (d) ssSet('cache_me', d); return d }),
      tzCache ? Promise.resolve(tzCache)
        : fetch('/api/timezone', sig).then(r => r.ok ? r.json() : null).catch(() => null).then(d => { if (d) ssSet('cache_timezone', d); return d }),
      wcCache ? Promise.resolve(wcCache)
        : fetch('/api/auth/widget-config', sig).then(r => r.ok ? r.json() : null).catch(() => null).then(d => { if (d) ssSet('cache_widget_config', d); return d }),
    ]).then(([me, tz, wc]) => {
      if (me?.name) setUserName(me.name)
      if (me?.role) setUserRole(me.role)
      if (tz?.zones?.length === 3) setZones(tz.zones)
      if (wc?.config) {
        setWidgetCfg(wc.config)
        if (wc.config.language) {
          try { localStorage.setItem('dashboard_lang', wc.config.language) } catch {}
        }
      }
    }).catch(err => { if (err?.name !== 'AbortError') console.warn('[init fetch]', err) })

    return () => ctrl.abort()
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
  const loadStocks = useCallback(async (signal) => {
    setStockLoading(true)
    setStockError(false)
    try {
      const dbJson = await apiFetch('/api/portfolio/groups', { signal })
      const rawGroups = dbJson.data || []
      // Filter deleted stocks
      const activeGroups = rawGroups.map(g => ({ ...g, stocks: (g.stocks || []).filter(s => !s.is_deleted) }))
      setStockGroups(activeGroups)

      // Build ticker→category map
      const tickerCatMap = buildTickerCatMap(activeGroups)

      // Fetch prices + fx in parallel
      const newPriceMap = {}
      let newFxRate = null

      const [fxResult] = await Promise.allSettled([
        apiFetch('/api/stocks/exchange-rate', { signal }).catch(() => null),
        ...Object.entries(tickerCatMap).map(async ([t, cat]) => {
          try {
            newPriceMap[t] = await apiFetch(`/api/stocks/price/${encodeURIComponent(t)}?category=${cat}`, { signal })
          } catch (e) {
            console.warn(`[PRICE FAIL] ${t} (${cat}):`, e?.message || e)
          }
        }),
      ])

      newFxRate = fxResult.status === 'fulfilled' ? (fxResult.value?.usd_krw ?? null) : null
      setPriceMap(newPriceMap)
      setFxRate(newFxRate)
    } catch (err) {
      if (err?.name !== 'AbortError') setStockError(true)
    } finally {
      setStockLoading(false)
    }
  }, [])

  useEffect(() => {
    const ctrl = new AbortController()
    loadStocks(ctrl.signal)
    return () => ctrl.abort()
  }, [loadStocks])

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
          const dbJson = await apiFetch('/api/portfolio/groups', { signal: AbortSignal.timeout(8000) })
          const groups = (dbJson.data || []).map(g => ({ ...g, stocks: (g.stocks || []).filter(s => !s.is_deleted) }))

          const tickerCatMap = buildTickerCatMap(groups)

          const snapPriceMap = {}
          let snapFxRate = null
          const [fxRes, ...priceRes] = await Promise.allSettled([
            apiFetch('/api/stocks/exchange-rate').catch(() => null),
            ...Object.entries(tickerCatMap).map(async ([t, cat]) => {
              try {
                snapPriceMap[t] = await apiFetch(`/api/stocks/price/${encodeURIComponent(t)}?category=${cat}`)
              } catch (e) {
                console.warn(`[PRICE FAIL] ${t} (${cat}):`, e?.message || e)
              }
            }),
          ])
          snapFxRate = fxRes.status === 'fulfilled' ? (fxRes.value?.usd_krw ?? null) : null

          // Calculate totals for snapshot
          let grandUSD = 0, grandKRW = 0
          const snapshotGroups = groups.map(g => {
            const isKRW = g.currency === 'KRW'
            let grpTotal = 0
            const stocks = g.stocks.map(s => {
              const { holdQty: hq, avgCost: avg, cur, val, evalPL, realizedPL: realPL } = calcStock(s, snapPriceMap)
              grpTotal += val
              return { ticker: s.ticker, name: s.name || null, current_price: snapPriceMap[s.ticker]?.current_price ?? null, hold_qty: hq, eval_amount: val, avg_buy_price: avg || null, eval_pl: evalPL, realized_pl: realPL }
            })
            if (isKRW) grandKRW += grpTotal; else grandUSD += grpTotal
            return { id: g.id, name: g.name, currency: g.currency, total: grpTotal, stocks }
          })

          const payload = {
            snapshot_date: today,
            usd_krw: snapFxRate ?? null,
            total_usd: grandUSD,
            total_krw: grandKRW,
            total_krw_equiv: grandKRW + (snapFxRate ? grandUSD * snapFxRate : 0),
            groups: snapshotGroups,
          }

          await apiFetch('/api/portfolio/snapshot', {
            method: 'POST',
            body: JSON.stringify(payload),
          })
          lastSnapshotDate = today
          console.log('[SNAPSHOT] 저장 완료 →', today)
        } catch (e) {
          console.warn('[SNAPSHOT] 오류:', e.message)
        }
      }
    }, 60000)
    return () => clearInterval(id)
  }, [])

  const stockData = stockError ? null : { groups: stockGroups, priceMap, fxRate }
  const lang = widgetCfg?.language ?? 'ko'

  // 통화 표시 방식 변경 → widget_config 서버 저장
  async function saveCurrencyDisplay(mode) {
    const newCfg = { ...(widgetCfg || {}), stock: { ...(widgetCfg?.stock || {}), currency_display: mode } }
    setWidgetCfg(newCfg)
    try {
      await fetch('/api/auth/widget-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(newCfg),
      })
    } catch (e) { console.warn('widget-config 저장 실패', e) }
  }

  // ── 레이아웃 편집 함수 ──────────────────────────────────────────────────
  function enterEditMode() { setDraftItems([...layoutItems]); setEditMode(true) }
  function cancelEdit()    { setEditMode(false); setDraftItems([]) }

  async function saveEdit() {
    const newCfg = { ...(widgetCfg || {}), layout: { items: draftItems } }
    try {
      await fetch('/api/auth/widget-config', {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
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

  function handleRowsChange(id, rows) {
    setDraftItems(prev => prev.map(item => item.id === id ? { ...item, rows } : item))
  }

  function renderWidget(item) {
    if (!w(item.id)) return null
    switch (item.id) {
      case 'hero':     return <HeroSection zones={zones} clockCount={widgetCfg?.hero?.clock_count ?? 3} tempUnit={widgetCfg?.hero?.temp_unit ?? 'C'} lang={lang} />
      case 'schedule': return <ScheduleCard lang={lang} />
      case 'youtube':  return <YoutubeCard lang={lang} />
      case 'stock':    return <StockCard groups={stockGroups} priceMap={priceMap} fxRate={fxRate} loading={stockLoading} onOpenStats={() => setStatsOpenPersist(true)} onOpenSettings={() => setStockSettingsOpen(true)} currencyDisplay={widgetCfg?.stock?.currency_display} onCurrencyChange={saveCurrencyDisplay} lang={lang} />
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
        onClose={() => setStatsOpenPersist(false)}
        stockData={stockData}
        lang={lang}
      />

      {/* 내 주식 설정 모달 */}
      <StockSettingsModal
        isOpen={stockSettingsOpen}
        onClose={() => { setStockSettingsOpen(false); loadStocks() }}
        onCurrencyChange={saveCurrencyDisplay}
        lang={lang}
        userRole={userRole}
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
              fontSize: '0.78rem', color: '#6B4A28', textDecoration: 'none',
              border: '1px solid rgba(196,149,106,0.4)', padding: '0.28rem 0.7rem',
              borderRadius: 20, fontFamily: 'inherit', fontWeight: 500,
            }}>{t(lang, 'superadminBtn')}</Link>
          )}
          <button
            onClick={() => setShowLogoutConfirm(true)}
            title={t(lang, 'logout')}
            style={{
              fontSize: '0.78rem', color: '#6B4A28', background: 'none',
              border: '1px solid rgba(196,149,106,0.4)', padding: '0.28rem 0.7rem',
              borderRadius: 20, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 400,
              transition: 'all 0.15s',
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
        <div className="pinned-memo-zone-header">
          <span className="pinned-zone-title" onClick={togglePinned}>
            📌 {t(lang, 'pinnedMemoTitle')}
            <span className="pinned-zone-chevron" style={{ transform: pinnedOpen ? 'rotate(0deg)' : 'rotate(-90deg)' }}>▾</span>
          </span>
          <div className="pinned-zone-actions">
            <button className="pinned-zone-add-btn" onClick={handlePinnedAdd}>
              + {t(lang, 'pinnedMemoAdd')}
            </button>
          </div>
        </div>
        {pinnedOpen && <PinnedMemoCard ref={pinnedRef} lang={lang} />}
      </div>

      {/* ═══ PC 레이아웃 ═══ */}
      <main className="main">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={visibleItems.map(i => i.id)} strategy={rectSortingStrategy}>
            {visibleItems.map(({ id, span, rows, el }) => (
              <SortableCard
                key={id}
                id={id}
                span={span}
                rows={rows ?? 1}
                editMode={editMode}
                onSizeChange={handleSizeChange}
                onRowsChange={handleRowsChange}
              >
                {el}
              </SortableCard>
            ))}
          </SortableContext>
        </DndContext>
      </main>

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
              onOpenStats={() => setStatsOpenPersist(true)}
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
          {w('youtube') && <YoutubeCard isMobile lang={lang} />}
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

      {/* 로그아웃 확인 모달 */}
      {showLogoutConfirm && (
        <div className="modal-overlay open" onClick={e => { if (e.target === e.currentTarget) setShowLogoutConfirm(false) }}>
          <div className="modal" style={{ maxWidth: 360 }}>
            <div className="modal-header">
              <span className="modal-title">{t(lang, 'logoutConfirmTitle')}</span>
              <button className="modal-close" onClick={() => setShowLogoutConfirm(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                <button className="btn btn-gray btn-sm" onClick={() => setShowLogoutConfirm(false)}>
                  {t(lang, 'common.cancel')}
                </button>
                <button className="btn btn-red btn-sm" onClick={handleLogout}>
                  {t(lang, 'logout')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
