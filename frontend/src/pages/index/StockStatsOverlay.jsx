import { useEffect, useRef, useMemo } from 'react'
import { Chart, registerables } from 'chart.js'
import { t } from './i18n'
Chart.register(...registerables)

const CHART_COLORS = ['#2563eb', '#16a34a', '#d97706', '#9333ea', '#dc2626', '#0891b2', '#65a30d', '#c026d3']

function fmtKRW(v) { return Math.round(v).toLocaleString('ko-KR') }
function fmtUSD(v) { return Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }

function computeStockStats(stockData) {
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

  const lineDatasets = []
  groups.forEach((g, gi) => {
    const purchases = []
    g.stocks.forEach(s => {
      ;(s.purchases || []).filter(p => p.date).forEach(p =>
        purchases.push({ date: p.date, amt: (p.qty || 0) * (p.price || 0) })
      )
    })
    if (!purchases.length) return
    purchases.sort((a, b) => a.date.localeCompare(b.date))
    let cum = 0
    const pts = purchases.map(p => { cum += p.amt; return { x: p.date, y: cum } })
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

  const computed = useMemo(() => computeStockStats(stockData), [stockData])

  useEffect(() => {
    if (!isOpen || !computed) return

    // Destroy previous chart instances
    chartsRef.current.forEach(c => c.destroy())
    chartsRef.current = []

    const { grpTotals, stockEvals, lineDatasets } = computed

    // Pie / doughnut chart
    if (pieRef.current) {
      const pieTotal = grpTotals.reduce((a, g) => a + g.total, 0) || 1
      const inst = new Chart(pieRef.current, {
        type: 'doughnut',
        data: {
          labels: grpTotals.map(g => `${g.name} (${(g.total / pieTotal * 100).toFixed(1)}%)`),
          datasets: [{
            data: grpTotals.map(g => parseFloat(g.total.toFixed(2))),
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
            x: { type: 'category', title: { display: true, text: t(lang, 'statsAxisDate') } },
            y: {
              title: { display: true, text: t(lang, 'statsAxisInvest') },
              ticks: { callback: v => v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v },
            },
          },
          plugins: { legend: { position: 'bottom' } },
        },
      })
      chartsRef.current.push(inst)
    }

    // Bar chart (unrealized P/L by stock)
    if (barRef.current && stockEvals.length) {
      const sorted = [...stockEvals].sort((a, b) => b.evalPL - a.evalPL)
      const inst = new Chart(barRef.current, {
        type: 'bar',
        data: {
          labels: sorted.map(s => s.label),
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
              title: { display: true, text: t(lang, 'statsAxisPL') },
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
  }, [isOpen, computed, lang])

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
      <div className="stats-body">
        {!computed ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--ink3)' }}>{t(lang, 'statsLoading')}</div>
        ) : (
          <>
            {/* Summary */}
            <div className="stats-section">
              <div className="stats-section-title">{t(lang, 'statsSummaryTitle')}</div>
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
                <div className="stats-chart-wrap">
                  <canvas ref={barRef} />
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
