import { useState, useEffect, useCallback, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import './index.css'

import HeroSection from './HeroSection'
import ScheduleCard from './ScheduleCard'
import YoutubeCard from './YoutubeCard'
import StockCard from './StockCard'
import StockStatsOverlay from './StockStatsOverlay'
import ExpenseCard from './ExpenseCard'
import DietCard from './DietCard'
import MemoCard from './MemoCard'
import NewsCard from './NewsCard'
import SitesCard from './SitesCard'

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

  // 위젯 설정
  const [widgetCfg, setWidgetCfg] = useState(null)
  // widgetCfg가 null(로딩 중)이면 모두 보여줌, 이후 설정대로 표시
  const w = (key) => !widgetCfg || widgetCfg[key]?.enabled !== false

  // Header date tick
  const headerLangRef = useRef('ko')
  const [headerDate, setHeaderDate] = useState(getHeaderDate)
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
      .then(d => { if (d?.config) setWidgetCfg(d.config) })
      .catch(() => {})
  }, [])

  // 언어 변경 시 헤더 날짜 동기화
  useEffect(() => {
    const newLang = widgetCfg?.language ?? 'ko'
    headerLangRef.current = newLang
    setHeaderDate(getHeaderDate(newLang))
  }, [widgetCfg])

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
          let grandUSD = 0, grandKRW = 0
          const snapshotGroups = groups.map(g => {
            const isKRW = g.currency === 'KRW'
            let grpTotal = 0
            const stocks = g.stocks.map(s => {
              const pp = s.purchases || []; const sl = s.sells || []
              const bq = pp.reduce((a, p) => a + (p.qty || 0), 0)
              const sq = sl.reduce((a, p) => a + (p.qty || 0), 0)
              const hq = Math.max(0, bq - sq)
              const validPP = pp.filter(p => (p.price || 0) > 0 && (p.qty || 0) > 0)
              const ws = validPP.reduce((a, p) => a + p.price * p.qty, 0)
              const vqt = validPP.reduce((a, p) => a + p.qty, 0)
              const avg = vqt > 0 ? ws / vqt : 0
              const priceObj = snapPriceMap[s.ticker]
              const cur = priceObj?.current_price ?? avg
              const val = cur * hq
              grpTotal += val
              const realPL = sl.reduce((a, p) => a + ((p.price || 0) - avg) * (p.qty || 0), 0)
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
          ⚠️ 서버가 꺼져 있습니다.&nbsp;
          <a href="https://railway.app" target="_blank" rel="noreferrer"
            style={{ color: '#ffe', textDecoration: 'underline', fontWeight: 700 }}>
            Railway에서 서버를 켜주세요
          </a>
        </div>
      )}

      {/* 주식 통계 전체화면 오버레이 */}
      <StockStatsOverlay
        isOpen={statsOpen}
        onClose={() => setStatsOpen(false)}
        stockData={stockData}
      />

      {/* 헤더 */}
      <header className="header">
        <span className="header-title" style={{ fontFamily: "'Playfair Display', serif", fontSize: '1.25rem', color: 'var(--accent2)' }}>
          ✦ {userName ? `${userName}의 하루` : '나의 하루'}
        </span>
        <div className="header-right">
          <span className="header-date">{headerDate}</span>
          <Link to="/admin" className="admin-link">⚙ 관리자</Link>
          {userRole === 'admin' && (
            <Link to="/superadmin" className="admin-link">👑 슈퍼어드민</Link>
          )}
          <button
            onClick={handleLogout}
            title="로그아웃"
            style={{
              fontSize: '0.78rem', color: '#c0392b', background: 'none',
              border: '1px solid rgba(192,57,43,0.35)', padding: '0.28rem 0.7rem',
              borderRadius: 20, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 400,
            }}
          >
            로그아웃
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
        </div>
      </header>

      {/* ═══ PC 레이아웃 ═══ */}
      <main className="main">
        {/* ① 시간 + 날씨 */}
        {w('hero') && (
          <HeroSection
            zones={zones}
            clockCount={widgetCfg?.hero?.clock_count ?? 3}
            tempUnit={widgetCfg?.hero?.temp_unit ?? 'C'}
            lang={widgetCfg?.language ?? 'ko'}
          />
        )}

        {/* ② 일정 */}
        {w('schedule') && <ScheduleCard />}

        {/* ③ 유튜브 */}
        {w('youtube') && <YoutubeCard maxCount={widgetCfg?.youtube?.max_count ?? 10} />}

        {/* ④ 주식 */}
        {w('stock') && (
          <StockCard
            groups={stockGroups}
            priceMap={priceMap}
            fxRate={fxRate}
            loading={stockLoading}
            onOpenStats={() => setStatsOpen(true)}
            currencyDisplay={widgetCfg?.stock?.currency_display}
          />
        )}

        {/* ⑤ 지출 */}
        {w('expense') && <ExpenseCard />}

        {/* ⑥ 식단 */}
        {w('diet') && <DietCard mealConfig={widgetCfg?.diet?.meals} />}

        {/* ⑦ 메모 */}
        {w('memo') && <MemoCard />}

        {/* ⑧ 뉴스 */}
        {w('news') && <NewsCard defaultTab={widgetCfg?.news?.default_tab ?? 'kr'} />}

        {/* ⑨ 즐겨찾기 */}
        {w('sites') && <SitesCard />}
      </main>

      {/* ═══ 모바일 레이아웃 ═══ */}
      <div className="mobile-view">

        {/* 홈: 시간+날씨+일정+사이트 */}
        <div className={`mob-section${mobileTab === 'home' ? ' active' : ''}`}>
          {w('hero') && <HeroSection zones={zones} isMobile clockCount={widgetCfg?.hero?.clock_count ?? 3} tempUnit={widgetCfg?.hero?.temp_unit ?? 'C'} lang={widgetCfg?.language ?? 'ko'} />}
          {w('schedule') && <ScheduleCard isMobile />}
          {w('sites') && <SitesCard isMobile />}
        </div>

        {/* 가계부: 지출+주식 */}
        <div className={`mob-section${mobileTab === 'money' ? ' active' : ''}`}>
          {w('expense') && <ExpenseCard isMobile />}
          {w('stock') && (
            <StockCard
              groups={stockGroups}
              priceMap={priceMap}
              fxRate={fxRate}
              loading={stockLoading}
              onOpenStats={() => setStatsOpen(true)}
              currencyDisplay={widgetCfg?.stock?.currency_display}
              isMobile
            />
          )}
        </div>

        {/* 건강: 식단+메모 */}
        <div className={`mob-section${mobileTab === 'health' ? ' active' : ''}`}>
          {w('diet') && <DietCard isMobile mealConfig={widgetCfg?.diet?.meals} />}
          {w('memo') && <MemoCard isMobile />}
        </div>

        {/* 미디어: 뉴스+유튜브 */}
        <div className={`mob-section${mobileTab === 'media' ? ' active' : ''}`}>
          {w('news') && <NewsCard isMobile defaultTab={widgetCfg?.news?.default_tab ?? 'kr'} />}
          {w('youtube') && <YoutubeCard isMobile maxCount={widgetCfg?.youtube?.max_count ?? 10} />}
        </div>

      </div>

      {/* ═══ 모바일 하단 네비게이션 ═══ */}
      <nav className="mobile-nav">
        {[
          { key: 'home', icon: '🏠', label: '홈' },
          { key: 'money', icon: '💰', label: '가계부' },
          { key: 'health', icon: '🥗', label: '건강' },
          { key: 'media', icon: '📰', label: '미디어' },
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
          관리
        </Link>
      </nav>
    </div>
  )
}
