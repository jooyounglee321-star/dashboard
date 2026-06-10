import { useEffect, useRef, useMemo, useState } from 'react'
import { Chart, registerables } from 'chart.js'
import 'chartjs-adapter-date-fns'
import { t } from './i18n'
Chart.register(...registerables)

const CHART_COLORS = ['#2563eb', '#16a34a', '#d97706', '#9333ea', '#dc2626', '#0891b2', '#65a30d', '#c026d3']

function fmtKRW(v) { return Math.round(v).toLocaleString('ko-KR') }
function fmtUSD(v) { return Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }

function computeStockStats(stockData, userJoinDate) {
  if (!stockData) return null
  const { groups, priceMap, fxRate } = stockData

  const grpTotals = groups.map(g => {
    const isKRW = g.currency === 'KRW'
    const tot = g.stocks.reduce((a, s) => {
      const pp = s.purchases || []; const sl = s.sells || []
      const bq = pp.reduce((x, p) => x + (p.qty || 0), 0)
      const sq = sl.reduce((x, p) => x + (p.qty || 0), 0)
      const hq = Math.max(0, bq - sq)
      const priceObj = priceMap[s.ticker]
      const livePrice = priceObj?.current_price
      const validPP = pp.filter(p => (p.price || 0) > 0 && (p.qty || 0) > 0)
      const ws = validPP.reduce((x, p) => x + p.price * p.qty, 0)
      const vqt = validPP.reduce((x, p) => x + p.qty, 0)
      const avg = vqt > 0 ? ws / vqt : 0
      return a + (livePrice ?? avg) * hq
    }, 0)
    return { name: g.name, currency: g.currency, total: tot, isKRW }
  })

  let grandUSD = 0, grandKRW = 0
  grpTotals.forEach(g => { if (g.isKRW) grandKRW += g.total; else grandUSD += g.total })
  const totalKRW = grandKRW + (fxRate ? grandUSD * fxRate : 0)

  const stockEvals = []
  groups.forEach(g => {
    const isKRW = g.currency === 'KRW'
    const sym = isKRW ? '₩' : '$'
    g.stocks.forEach(s => {
      const pp = s.purchases || []; const sl = s.sells || []
      const bq = pp.reduce((a, p) => a + (p.qty || 0), 0)
      const sq = sl.reduce((a, p) => a + (p.qty || 0), 0)
      const hq = Math.max(0, bq - sq)
      const validPP = pp.filter(p => (p.price || 0) > 0 && (p.qty || 0) > 0)
      const ws = validPP.reduce((a, p) => a + p.price * p.qty, 0)
      const vqt = validPP.reduce((a, p) => a + p.qty, 0)
      const avg = vqt > 0 ? ws / vqt : 0
      const cur = priceMap[s.ticker]?.current_price ?? avg
      const evalPL = avg > 0 ? (cur - avg) * hq : null
      if (evalPL != null) stockEvals.push({ label: s.ticker, name: s.name || s.ticker, evalPL, sym, isKRW })
    })
  })

  // 전체 그룹의 모든 매수 날짜 수집
  const allDateSet = new Set()
  groups.forEach(g => {
    g.stocks.forEach(s => {
      ;(s.purchases || []).forEach(p => { if (p.date) allDateSet.add(p.date) })
    })
  })
  const allDates = [...allDateSet].sort()   // YYYY-MM-DD 문자열 정렬 = 시간순

  // 시작일 = MAX(최초 purchase.date, 가입일) — 가입 전 이력 차트 제외
  const minPurchaseDate = allDates[0] ?? null
  const joinDate = userJoinDate ?? null
  const startDate = minPurchaseDate && joinDate
    ? (minPurchaseDate > joinDate ? minPurchaseDate : joinDate)
    : (joinDate ?? minPurchaseDate)
  const globalDates = startDate ? allDates.filter(d => d >= startDate) : allDates

  // DEBUG: 첫 번째 그룹 첫 번째 종목 purchases 확인
  if (groups[0]?.stocks[0]) {
    console.log('[DEBUG] groups[0].name:', groups[0].name, '| currency:', groups[0].currency)
    console.log('[DEBUG] stocks[0].ticker:', groups[0].stocks[0].ticker)
    console.log('[DEBUG] purchases:', JSON.parse(JSON.stringify(groups[0].stocks[0].purchases || [])))
    console.log('[DEBUG] startDate:', startDate, '| globalDates:', globalDates)
  }

  const lineDatasets = []
  groups.forEach((g, gi) => {
    // 그룹 내 날짜별 매수금액 합산 (date 없는 항목 및 startDate 이전 제외)
    const dailyMap = {}
    g.stocks.forEach(s => {
      ;(s.purchases || []).filter(p => !p.date || !startDate || p.date >= startDate).forEach(p => {
        const rawAmt = (p.qty || 0) * (p.price || 0)
        const amt = g.currency === 'USD' ? rawAmt * (fxRate ?? 1) : rawAmt
        const dateKey = p.date || startDate
        if (!dateKey) return
        dailyMap[dateKey] = (dailyMap[dateKey] ?? 0) + amt
      })
    })
    if (!Object.keys(dailyMap).length) return

    // 전역 날짜 축 기준으로 누적합 계산 (carry-forward: 이전값 유지)
    let cum = 0
    let started = false
    const pts = []
    globalDates.forEach(date => {
      if (dailyMap[date]) { cum += dailyMap[date]; started = true }
      if (started) pts.push({ x: date, y: Math.round(cum) })
    })
    if (!pts.length) return

    lineDatasets.push({
      label: g.name,
      data: pts,
      borderColor: CHART_COLORS[gi % CHART_COLORS.length],
      backgroundColor: 'transparent',
      tension: 0.3,
      pointRadius: 3,
    })
  })

  return { grpTotals, grandUSD, grandKRW, totalKRW, stockEvals, lineDatasets, fxRate }
}

export default function StockStatsOverlay({ isOpen, onClose, stockData, lang = 'ko' }) {
  const pieRef = useRef(null)
  const lineRef = useRef(null)
  const barRef = useRef(null)
  const chartsRef = useRef([])
  const histLineRef = useRef(null)
  const histChartRef = useRef(null)
  const [barMode, setBarMode] = useState('KRW')
  const [summaryTab, setSummaryTab] = useState('group')
  const [mainTab, setMainTab] = useState('overview')
  const [userJoinDate, setUserJoinDate] = useState(null)
  const [histData, setHistData] = useState([])
  const [histLoading, setHistLoading] = useState(false)
  const [histRange, setHistRange] = useState('1m')
  const [histPage, setHistPage] = useState(0)
  const HIST_PAGE_SIZE = 20

  // 회원가입일 로드 (localStorage 우선 → /api/auth/me 폴백)
  useEffect(() => {
    if (!isOpen || userJoinDate) return
    try {
      const u = JSON.parse(localStorage.getItem('user') || '{}')
      if (u.created_at) { setUserJoinDate(u.created_at.slice(0, 10)); return }
    } catch {}
    const token = localStorage.getItem('token')
    fetch('/api/auth/me', { headers: { Authorization: 'Bearer ' + token } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.created_at) setUserJoinDate(d.created_at.slice(0, 10)) })
      .catch(() => {})
  }, [isOpen])

  const computed = useMemo(() => computeStockStats(stockData, userJoinDate), [stockData, userJoinDate])

  useEffect(() => {
    if (!isOpen || !computed) return

    // Destroy previous chart instances
    chartsRef.current.forEach(c => c.destroy())
    chartsRef.current = []

    const { grpTotals, stockEvals, lineDatasets, fxRate } = computed

    // Pie / doughnut chart
    if (pieRef.current) {
      const toKRW = (g) => g.currency === 'USD' ? g.total * (fxRate ?? 1) : g.total
      const pieTotal = grpTotals.reduce((a, g) => a + toKRW(g), 0) || 1
      const inst = new Chart(pieRef.current, {
        type: 'doughnut',
        data: {
          labels: grpTotals.map(g => `${g.name} (${(toKRW(g) / pieTotal * 100).toFixed(1)}%)`),
          datasets: [{
            data: grpTotals.map(g => parseFloat(toKRW(g).toFixed(2))),
            backgroundColor: CHART_COLORS.slice(0, grpTotals.length),
            borderWidth: 2,
            borderColor: '#fffef9',
          }],
        },
        options: {
          responsive: true,
          plugins: { legend: { position: 'bottom', labels: { font: { size: 12 }, padding: 12 } } },
        },
      })
      chartsRef.current.push(inst)
    }

    // Line chart (cumulative investment)
    if (lineRef.current && lineDatasets.length) {
      const inst = new Chart(lineRef.current, {
        type: 'line',
        data: { datasets: lineDatasets },
        options: {
          responsive: true,
          scales: {
            x: {
              type: 'time',
              time: { unit: 'day', displayFormats: { day: 'yyyy-MM-dd' } },
              title: { display: true, text: t(lang, 'statsAxisDate') },
              ticks: { source: 'auto', maxTicksLimit: 10 },
            },
            y: {
              title: { display: true, text: t(lang, 'statsAxisInvest') },
              ticks: { callback: v => v >= 100000000 ? `${(v / 100000000).toFixed(1)}억` : v >= 10000000 ? `${(v / 10000000).toFixed(0)}천만` : v >= 1000000 ? `${(v / 1000000).toFixed(0)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v },
            },
          },
          plugins: { legend: { position: 'bottom' } },
        },
      })
      chartsRef.current.push(inst)
    }

    // Bar chart (unrealized P/L by stock)
    if (barRef.current && stockEvals.length) {
      // barMode에 따라 evalPL 환산
      const convertedEvals = stockEvals.map(s => {
        if (barMode === 'KRW' && !s.isKRW && fxRate) {
          return { ...s, evalPL: s.evalPL * fxRate, sym: '₩', isKRW: true }
        }
        if (barMode === 'USD' && s.isKRW && fxRate) {
          return { ...s, evalPL: s.evalPL / fxRate, sym: '$', isKRW: false }
        }
        return s
      })
      const sorted = [...convertedEvals].sort((a, b) => b.evalPL - a.evalPL)
      const axisSymbol = barMode === 'KRW' ? '₩' : '$'
      const inst = new Chart(barRef.current, {
        type: 'bar',
        data: {
          labels: sorted.map(s => s.name),
          datasets: [{
            label: t(lang, 'statsBarLabel'),
            data: sorted.map(s => parseFloat(s.evalPL.toFixed(2))),
            backgroundColor: sorted.map(s => s.evalPL >= 0 ? 'rgba(74,124,89,0.75)' : 'rgba(220,38,38,0.75)'),
            borderColor: sorted.map(s => s.evalPL >= 0 ? '#4a7c59' : '#dc2626'),
            borderWidth: 1,
          }],
        },
        options: {
          responsive: true,
          scales: {
            y: {
              title: { display: true, text: `${t(lang, 'statsAxisPL')} (${axisSymbol})` },
              ticks: { callback: v => v >= 0 ? `+${v}` : `${v}` },
            },
          },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: ctx => {
                  const s = sorted[ctx.dataIndex]
                  return `${s.evalPL >= 0 ? '+' : ''}${s.sym}${s.isKRW ? fmtKRW(Math.abs(s.evalPL)) : fmtUSD(Math.abs(s.evalPL))}`
                },
              },
            },
          },
        },
      })
      chartsRef.current.push(inst)
    }

    return () => {
      chartsRef.current.forEach(c => c.destroy())
      chartsRef.current = []
    }
  }, [isOpen, computed, lang, barMode])

  // 히스토리 데이터 fetch
  useEffect(() => {
    if (!isOpen || mainTab !== 'history') return
    setHistLoading(true)
    const token = localStorage.getItem('token')
    fetch('/api/portfolio/history', { headers: { Authorization: 'Bearer ' + token } })
      .then(r => r.ok ? r.json() : [])
      .then(d => { setHistData(Array.isArray(d) ? d : []); setHistPage(0) })
      .catch(() => setHistData([]))
      .finally(() => setHistLoading(false))
  }, [isOpen, mainTab])

  // 히스토리 라인차트
  useEffect(() => {
    if (!isOpen || mainTab !== 'history' || histLoading || !histLineRef.current) return
    if (histChartRef.current) { histChartRef.current.destroy(); histChartRef.current = null }
    if (!histData.length) return

    const now = new Date()
    const cutoff = histRange === '1m'
      ? new Date(now.getFullYear(), now.getMonth() - 1, now.getDate()).toISOString().slice(0, 10)
      : histRange === '3m'
        ? new Date(now.getFullYear(), now.getMonth() - 3, now.getDate()).toISOString().slice(0, 10)
        : null
    const filtered = [...histData]
      .filter(r => r.total_krw_equiv != null && (!cutoff || r.snapshot_date >= cutoff))
      .sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date))
    if (!filtered.length) return

    histChartRef.current = new Chart(histLineRef.current, {
      type: 'line',
      data: {
        labels: filtered.map(r => r.snapshot_date),
        datasets: [{
          label: t(lang, 'statsKRWEquiv'),
          data: filtered.map(r => r.total_krw_equiv),
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37,99,235,0.08)',
          fill: true,
          tension: 0.3,
          pointRadius: filtered.length > 60 ? 0 : 3,
        }],
      },
      options: {
        responsive: true,
        scales: {
          x: { type: 'category', title: { display: true, text: t(lang, 'statsAxisDate') }, ticks: { maxTicksLimit: 10 } },
          y: {
            title: { display: true, text: '₩' },
            ticks: { callback: v => v >= 100000000 ? `${(v / 100000000).toFixed(1)}억` : v >= 10000 ? `${(v / 10000).toFixed(0)}만` : v },
          },
        },
        plugins: { legend: { display: false } },
      },
    })
    return () => { if (histChartRef.current) { histChartRef.current.destroy(); histChartRef.current = null } }
  }, [isOpen, mainTab, histData, histRange, lang])

  if (!isOpen) return null

  const { grpTotals, grandUSD, grandKRW, totalKRW, stockEvals, lineDatasets, fxRate } = computed || {}

  return (
    <div
      id="stock-stats-overlay"
      className="open"
      style={{ display: 'block', position: 'fixed', inset: 0, zIndex: 500, background: 'var(--bg)', overflowY: 'auto' }}
    >
      <div className="stats-header">
        <button className="stats-back" onClick={onClose}>{t(lang, 'statsBack')}</button>
        <span className="stats-title">{t(lang, 'statsTitle')}</span>
      </div>
      {/* 메인 탭 */}
      <div style={{ display: 'flex', gap: '0', borderBottom: '1.5px solid var(--border)', padding: '0 1.2rem' }}>
        {[['overview', 'stock.currentTab'], ['history', 'stock.historyTab']].map(([key, i18nKey]) => (
          <button key={key} onClick={() => setMainTab(key)} style={{
            padding: '0.6rem 1.2rem', fontSize: '0.88rem', fontWeight: mainTab === key ? 700 : 400,
            border: 'none', borderBottom: mainTab === key ? '2.5px solid var(--accent)' : '2.5px solid transparent',
            background: 'transparent', color: mainTab === key ? 'var(--accent)' : 'var(--ink3)',
            cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s', marginBottom: '-1.5px',
          }}>
            {t(lang, i18nKey)}
          </button>
        ))}
      </div>
      <div className="stats-body">
        {mainTab === 'overview' && (!computed ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--ink3)' }}>{t(lang, 'statsLoading')}</div>
        ) : (
          <>
            {/* Summary */}
            <div className="stats-section">
              <div className="stats-section-title">{t(lang, 'statsSummaryTitle')}</div>
              {/* 탭 버튼 */}
              <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.75rem' }}>
                {[['group', 'stock.byGroup'], ['currency', 'stock.byCurrency']].map(([key, i18nKey]) => (
                  <button
                    key={key}
                    onClick={() => setSummaryTab(key)}
                    style={{
                      padding: '0.3rem 0.85rem',
                      fontSize: '0.8rem',
                      fontWeight: summaryTab === key ? 700 : 400,
                      border: `1.5px solid ${summaryTab === key ? 'var(--accent)' : 'var(--border)'}`,
                      borderRadius: 6,
                      background: summaryTab === key ? 'var(--accent)' : 'transparent',
                      color: summaryTab === key ? '#fff' : 'var(--ink3)',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      transition: 'all 0.15s',
                    }}
                  >
                    {t(lang, i18nKey)}
                  </button>
                ))}
              </div>

              {summaryTab === 'group' ? (
                /* 그룹별 탭 */
                <div className="stats-summary-grid">
                  {(grpTotals ?? []).map((g, i) => (
                    <div className="stats-summary-card" key={i}>
                      <div className="stats-summary-label">{g.name} ({g.currency})</div>
                      <div className="stats-summary-value">
                        {g.currency === 'USD' ? `$${fmtUSD(g.total)}` : `₩${fmtKRW(g.total)}`}
                      </div>
                    </div>
                  ))}
                  <div className="stats-summary-card">
                    <div className="stats-summary-label">
                      {t(lang, 'statsKRWEquiv')}{fxRate ? ` ($1=₩${fmtKRW(fxRate)})` : ` (${t(lang, 'statsFxNone')})`}
                    </div>
                    <div className="stats-summary-value">₩{fmtKRW(totalKRW ?? 0)}</div>
                  </div>
                </div>
              ) : (
                /* 통화별 탭 */
                <div className="stats-summary-grid">
                  <div className="stats-summary-card">
                    <div className="stats-summary-label">{t(lang, 'statsUSDGroup')}</div>
                    <div className="stats-summary-value">${fmtUSD(grandUSD ?? 0)}</div>
                  </div>
                  <div className="stats-summary-card">
                    <div className="stats-summary-label">{t(lang, 'statsKRWGroup')}</div>
                    <div className="stats-summary-value">₩{fmtKRW(grandKRW ?? 0)}</div>
                  </div>
                  <div className="stats-summary-card">
                    <div className="stats-summary-label">
                      {t(lang, 'statsKRWEquiv')}{fxRate ? ` ($1=₩${fmtKRW(fxRate)})` : ` (${t(lang, 'statsFxNone')})`}
                    </div>
                    <div className="stats-summary-value">₩{fmtKRW(totalKRW ?? 0)}</div>
                  </div>
                </div>
              )}
            </div>

            {/* Pie chart */}
            <div className="stats-section">
              <div className="stats-section-title">{t(lang, 'statsPieTitle')}</div>
              <div className="stats-chart-wrap pie-wrap">
                <canvas ref={pieRef} />
              </div>
            </div>

            {/* Line chart */}
            {lineDatasets?.length > 0 && (
              <div className="stats-section">
                <div className="stats-section-title">{t(lang, 'statsLineTitle')}</div>
                <div className="stats-chart-wrap">
                  <canvas ref={lineRef} />
                </div>
              </div>
            )}

            {/* Bar chart */}
            {stockEvals?.length > 0 && (
              <div className="stats-section">
                <div className="stats-section-title">{t(lang, 'statsBarTitle')}</div>
                <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.75rem' }}>
                  {['KRW', 'USD'].map(mode => (
                    <button
                      key={mode}
                      onClick={() => setBarMode(mode)}
                      style={{
                        padding: '0.3rem 0.85rem',
                        fontSize: '0.8rem',
                        fontWeight: barMode === mode ? 700 : 400,
                        border: `1.5px solid ${barMode === mode ? 'var(--accent)' : 'var(--border)'}`,
                        borderRadius: 6,
                        background: barMode === mode ? 'var(--accent)' : 'transparent',
                        color: barMode === mode ? '#fff' : 'var(--ink3)',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        transition: 'all 0.15s',
                      }}
                    >
                      {t(lang, mode === 'KRW' ? 'stock.displayKRW' : 'stock.displayUSD')}
                    </button>
                  ))}
                </div>
                <div className="stats-chart-wrap">
                  <canvas ref={barRef} />
                </div>
              </div>
            )}
          </>
        ))}

        {mainTab === 'history' && (() => {
          if (histLoading) return (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--ink3)' }}>{t(lang, 'statsLoading')}</div>
          )
          if (!histData.length) return (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--ink3)' }}>{t(lang, 'stock.noHistory')}</div>
          )

          // 범위 필터링
          const now = new Date()
          const cutoff = histRange === '1m'
            ? new Date(now.getFullYear(), now.getMonth() - 1, now.getDate()).toISOString().slice(0, 10)
            : histRange === '3m'
              ? new Date(now.getFullYear(), now.getMonth() - 3, now.getDate()).toISOString().slice(0, 10)
              : null
          const filtered = [...histData]
            .filter(r => r.total_krw_equiv != null && (!cutoff || r.snapshot_date >= cutoff))
            .sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date))

          // 요약 카드 계산
          const equivVals = filtered.map(r => r.total_krw_equiv)
          const maxVal = equivVals.length ? Math.max(...equivVals) : 0
          const minVal = equivVals.length ? Math.min(...equivVals) : 0
          const maxRow = filtered.find(r => r.total_krw_equiv === maxVal)
          const minRow = filtered.find(r => r.total_krw_equiv === minVal)
          const first = filtered[0]?.total_krw_equiv ?? 0
          const last = filtered[filtered.length - 1]?.total_krw_equiv ?? 0
          const periodReturn = first > 0 ? ((last - first) / first * 100) : null

          // 테이블용: 최신순, 페이지네이션
          const tableRows = [...histData].sort((a, b) => b.snapshot_date.localeCompare(a.snapshot_date))
          const totalPages = Math.ceil(tableRows.length / HIST_PAGE_SIZE)
          const pageRows = tableRows.slice(histPage * HIST_PAGE_SIZE, (histPage + 1) * HIST_PAGE_SIZE)

          const tabBtnStyle = (active) => ({
            padding: '0.28rem 0.75rem', fontSize: '0.78rem', fontWeight: active ? 700 : 400,
            border: `1.5px solid ${active ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 6,
            background: active ? 'var(--accent)' : 'transparent',
            color: active ? '#fff' : 'var(--ink3)', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
          })

          return (
            <>
              {/* 요약 카드 */}
              <div className="stats-section">
                <div className="stats-summary-grid">
                  <div className="stats-summary-card">
                    <div className="stats-summary-label">{t(lang, 'stock.highestAsset')}</div>
                    <div className="stats-summary-value" style={{ fontSize: '0.95rem' }}>₩{fmtKRW(maxVal)}</div>
                    {maxRow && <div style={{ fontSize: '0.72rem', color: 'var(--ink3)', marginTop: '0.15rem' }}>{maxRow.snapshot_date}</div>}
                  </div>
                  <div className="stats-summary-card">
                    <div className="stats-summary-label">{t(lang, 'stock.lowestAsset')}</div>
                    <div className="stats-summary-value" style={{ fontSize: '0.95rem' }}>₩{fmtKRW(minVal)}</div>
                    {minRow && <div style={{ fontSize: '0.72rem', color: 'var(--ink3)', marginTop: '0.15rem' }}>{minRow.snapshot_date}</div>}
                  </div>
                  <div className="stats-summary-card">
                    <div className="stats-summary-label">{t(lang, 'stock.periodReturn')}</div>
                    <div className="stats-summary-value" style={{ color: periodReturn == null ? 'inherit' : periodReturn >= 0 ? 'var(--up)' : 'var(--down)', fontSize: '0.95rem' }}>
                      {periodReturn == null ? '—' : `${periodReturn >= 0 ? '+' : ''}${periodReturn.toFixed(2)}%`}
                    </div>
                  </div>
                </div>
              </div>

              {/* 날짜 범위 버튼 + 라인차트 */}
              <div className="stats-section">
                <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.75rem' }}>
                  {[['1m', '1개월'], ['3m', '3개월'], ['all', '전체']].map(([key, label]) => (
                    <button key={key} onClick={() => setHistRange(key)} style={tabBtnStyle(histRange === key)}>{label}</button>
                  ))}
                </div>
                <div className="stats-chart-wrap">
                  <canvas ref={histLineRef} />
                </div>
              </div>

              {/* 일별 결산 테이블 */}
              <div className="stats-section">
                <div className="stats-section-title" style={{ marginBottom: '0.6rem' }}>일별 결산</div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1.5px solid var(--border)', color: 'var(--ink3)', textAlign: 'right' }}>
                        <th style={{ textAlign: 'left', padding: '0.4rem 0.5rem', fontWeight: 600 }}>날짜</th>
                        <th style={{ padding: '0.4rem 0.5rem', fontWeight: 600 }}>USD합계</th>
                        <th style={{ padding: '0.4rem 0.5rem', fontWeight: 600 }}>KRW합계</th>
                        <th style={{ padding: '0.4rem 0.5rem', fontWeight: 600 }}>원화환산전체</th>
                        <th style={{ padding: '0.4rem 0.5rem', fontWeight: 600 }}>실현손익</th>
                        <th style={{ padding: '0.4rem 0.5rem', fontWeight: 600 }}>{t(lang, 'stock.savedBy')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.map(r => (
                        <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '0.4rem 0.5rem', color: 'var(--ink)', fontWeight: 500 }}>{r.snapshot_date}</td>
                          <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', color: 'var(--ink)' }}>${fmtUSD(r.total_usd ?? 0)}</td>
                          <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', color: 'var(--ink)' }}>₩{fmtKRW(r.total_krw ?? 0)}</td>
                          <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', color: 'var(--ink)', fontWeight: 600 }}>₩{fmtKRW(r.total_krw_equiv ?? 0)}</td>
                          <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', color: (r.realized_pl ?? 0) >= 0 ? 'var(--up)' : 'var(--down)' }}>
                            {r.realized_pl != null ? `${r.realized_pl >= 0 ? '+' : ''}₩${fmtKRW(r.realized_pl)}` : '—'}
                          </td>
                          <td style={{ padding: '0.4rem 0.5rem', textAlign: 'center' }}>
                            <span style={{
                              display: 'inline-block', padding: '0.15rem 0.45rem', borderRadius: 4, fontSize: '0.7rem', fontWeight: 600,
                              background: r.saved_by === 'backfill' ? 'rgba(37,99,235,0.12)' : 'rgba(22,163,74,0.12)',
                              color: r.saved_by === 'backfill' ? '#2563eb' : '#16a34a',
                            }}>
                              {r.saved_by ?? 'frontend'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* 페이지네이션 */}
                {totalPages > 1 && (
                  <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center', marginTop: '0.75rem' }}>
                    <button onClick={() => setHistPage(p => Math.max(0, p - 1))} disabled={histPage === 0}
                      style={{ ...tabBtnStyle(false), opacity: histPage === 0 ? 0.4 : 1 }}>←</button>
                    <span style={{ fontSize: '0.8rem', color: 'var(--ink3)', alignSelf: 'center' }}>{histPage + 1} / {totalPages}</span>
                    <button onClick={() => setHistPage(p => Math.min(totalPages - 1, p + 1))} disabled={histPage === totalPages - 1}
                      style={{ ...tabBtnStyle(false), opacity: histPage === totalPages - 1 ? 0.4 : 1 }}>→</button>
                  </div>
                )}
              </div>
            </>
          )
        })()}
      </div>
    </div>
  )
}
