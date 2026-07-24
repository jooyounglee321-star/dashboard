import { useEffect, useRef, useMemo, useState } from 'react'
import { Chart, registerables } from 'chart.js'
import 'chartjs-adapter-date-fns'
import { t } from './i18n'
import { fmtKRW, fmtUSD, fmtKRWShort, fmtUSDShort, fmtShort } from '../../utils/format'
import { apiFetch } from '../../api'
import PeriodSelector from '../../components/PeriodSelector'
import {
  calcCutoff, cleanStr, computePeriodStats,
  computeUnits, computeReturnRates, computeConcentration,
} from '../../utils/stockStats'
Chart.register(...registerables)

const CHART_COLORS = ['#2563eb','#16a34a','#f59e0b','#9333ea','#ef4444','#0891b2','#65a30d','#ec4899','#14b8a6','#f97316','#6366f1','#84cc16','#06b6d4','#a855f7','#e11d48']
function colorForKey(key) {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  return CHART_COLORS[h % CHART_COLORS.length]
}

function computeStockStats(stockData) {
  if (!stockData) return null
  const { groups, priceMap, fxRate } = stockData
  if (!groups || groups.length === 0) return null

  const grpTotals = groups.map(g => {
    const isKRW = g.currency === 'KRW'
    const tot = g.stocks.filter(s => !s.is_deleted).reduce((a, s) => {
      const pp = s.purchases || []; const sl = s.sells || []
      const bq = pp.reduce((x, p) => x + (p.qty || 0), 0)
      const sq = sl.reduce((x, p) => x + (p.qty || 0), 0)
      const hq = Math.max(0, bq - sq)
      const livePrice = priceMap[s.ticker]?.current_price
      const validPP = pp.filter(p => (p.price || 0) > 0 && (p.qty || 0) > 0)
      const ws = validPP.reduce((x, p) => x + p.price * p.qty, 0)
      const vqt = validPP.reduce((x, p) => x + p.qty, 0)
      const avg = vqt > 0 ? ws / vqt : 0
      return a + (livePrice ?? avg) * hq
    }, 0)
    return { id: g.id, name: cleanStr(g.name, g.id), currency: g.currency, total: tot, isKRW }
  })

  let grandUSD = 0, grandKRW = 0
  grpTotals.forEach(g => { if (g.isKRW) grandKRW += g.total; else grandUSD += g.total })
  const totalKRW = grandKRW + (fxRate ? grandUSD * fxRate : 0)

  const stockValues = []
  const stockEvals = []
  groups.forEach((g) => {
    const isKRW = g.currency === 'KRW'
    const sym = isKRW ? '₩' : '$'
    g.stocks.filter(s => !s.is_deleted).forEach(s => {
      const pp = s.purchases || []; const sl = s.sells || []
      const bq = pp.reduce((a, p) => a + (p.qty || 0), 0)
      const sq = sl.reduce((a, p) => a + (p.qty || 0), 0)
      const hq = Math.max(0, bq - sq)
      const validPP = pp.filter(p => (p.price || 0) > 0 && (p.qty || 0) > 0)
      const ws = validPP.reduce((a, p) => a + p.price * p.qty, 0)
      const vqt = validPP.reduce((a, p) => a + p.qty, 0)
      const avg = vqt > 0 ? ws / vqt : 0
      const cur = priceMap[s.ticker]?.current_price ?? avg
      const evalAmt = cur * hq
      if (hq > 0) stockValues.push({ ticker: s.ticker, name: cleanStr(s.name, s.ticker), evalAmt, groupName: cleanStr(g.name, g.id), currency: g.currency, isKRW })
      const evalPL = avg > 0 ? (cur - avg) * hq : null
      if (evalPL != null) stockEvals.push({ label: s.ticker, name: cleanStr(s.name, s.ticker), evalPL, sym, isKRW })
    })
  })

  const today = new Date().toISOString().slice(0, 10)
  const generateDateRange = (start, end) => {
    const dates = []
    const cur = new Date(start)
    const endDate = new Date(end)
    while (cur <= endDate) { dates.push(cur.toISOString().slice(0, 10)); cur.setDate(cur.getDate() + 1) }
    return dates
  }

  const allPurchaseDates = []
  groups.forEach(g => { g.stocks.forEach(s => { ;(s.purchases || []).forEach(p => { if (p.date) allPurchaseDates.push(p.date) }) }) })
  const minPurchaseDate = allPurchaseDates.length ? allPurchaseDates.sort()[0] : null
  const startDate = minPurchaseDate ?? today
  const globalDates = generateDateRange(startDate, today)

  const lineDatasets = []
  groups.forEach((g, gi) => {
    const dailyMap = {}
    g.stocks.forEach(s => {
      ;(s.purchases || []).forEach(p => {
        const rawAmt = (p.qty || 0) * (p.price || 0)
        const dateKey = p.date || startDate
        if (!dateKey) return
        dailyMap[dateKey] = (dailyMap[dateKey] ?? 0) + rawAmt
      })
    })
    if (!Object.keys(dailyMap).length) return
    let cum = 0, started = false
    const pts = []
    globalDates.forEach(date => {
      if (dailyMap[date]) { cum += dailyMap[date]; started = true }
      if (started) pts.push({ x: date, y: Math.round(cum) })
    })
    if (!pts.length) return
    lineDatasets.push({
      label: cleanStr(g.name, g.id),
      data: pts,
      borderColor: CHART_COLORS[gi % CHART_COLORS.length],
      backgroundColor: 'transparent',
      stepped: true,
      pointRadius: 3,
      currency: g.currency,
    })
  })

  const groupTickers = {}
  groups.forEach(g => { groupTickers[cleanStr(g.name, g.id)] = g.stocks.map(s => s.ticker) })

  return { grpTotals, grandUSD, grandKRW, totalKRW, stockValues, stockEvals, lineDatasets, fxRate, groupTickers }
}

export default function StockStatsOverlay({ isOpen, onClose, stockData, lang = 'ko' }) {
  // ── refs ──
  const pieRef = useRef(null)
  const barRef = useRef(null)
  const plBarRef = useRef(null)
  const plBarChartRef = useRef(null)
  const chartsRef = useRef([])
  const histLineRef = useRef(null)
  const histChartRef = useRef(null)
  const returnBarRef = useRef(null)
  const returnBarChartRef = useRef(null)
  const benchmarkRef = useRef(null)
  const benchmarkChartRef = useRef(null)
  const pieChartRef = useRef(null)

  // ── 상태 ──
  const [overviewGroup, setOverviewGroup] = useState('')
  const [overviewCurrency, setOverviewCurrency] = useState(() => {
    const gs = stockData?.groups ?? []
    const hasKRW = gs.some(g => g.currency === 'KRW')
    const hasUSD = gs.some(g => g.currency !== 'KRW')
    return (!hasUSD && hasKRW) ? 'KRW' : 'USD'
  })
  const [overviewPeriod, setOverviewPeriod] = useState('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo,   setCustomTo]   = useState('')

  const [histData, setHistData] = useState([])
  const [histLoading, setHistLoading] = useState(false)
  const [histPage, setHistPage] = useState(0)
  const HIST_PAGE_SIZE = 20

  const [periodPlData, setPeriodPlData] = useState([])
  const [periodPlLoading, setPeriodPlLoading] = useState(false)

  const [dividendData,    setDividendData]    = useState([])
  const [dividendLoading, setDividendLoading] = useState(false)
  const divBarRef      = useRef(null)
  const divBarChartRef = useRef(null)
  const divPieRef      = useRef(null)
  const divPieChartRef = useRef(null)
  const contribBarRef     = useRef(null)
  const contribBarChartRef = useRef(null)

  const [benchmarkData, setBenchmarkData] = useState(null)
  const [benchmarkLoading, setBenchmarkLoading] = useState(false)

  const [realizedData, setRealizedData] = useState(null)
  const [realizedLoading, setRealizedLoading] = useState(false)

  // ── 자동 그룹 선택 (그룹 1개면 종목 단위로) ──
  useEffect(() => {
    if (!stockData?.groups) return
    const names = stockData.groups.map(g => cleanStr(g.name, g.id))
    if (names.length === 1) setOverviewGroup(names[0])
    else setOverviewGroup('')
  }, [stockData])

  // ── group ID → 이름 매핑 ──
  const histGroupNames = useMemo(
    () => Object.fromEntries((stockData?.groups ?? []).map(g => [g.id, cleanStr(g.name, g.id)])),
    [stockData]
  )

  // ── 핵심 계산 ──
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const computed = useMemo(() => computeStockStats(stockData), [JSON.stringify(stockData)])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const { periodGrpTotals, periodStockValues, periodStockEvals } = useMemo(
    () => computePeriodStats(stockData, overviewPeriod, customFrom, customTo),
    [computed, overviewPeriod, customFrom, customTo]
  )

  // ── KPI 계산 (총 평가금액, 미실현 손익, 오늘 등락) ──
  const kpi = useMemo(() => {
    if (!stockData?.groups) return null
    const pm = stockData.priceMap || {}
    const fx = stockData.fxRate || null
    let totalEvalUSD = 0, totalEvalKRW = 0
    let unrealizedUSD = 0, unrealizedKRW = 0
    let todayChgUSD = 0, todayChgKRW = 0

    for (const g of stockData.groups) {
      const isKRW = g.currency === 'KRW'
      for (const s of g.stocks || []) {
        if (s.is_deleted) continue
        const pp = s.purchases || [], sl = s.sells || []
        const bq = pp.reduce((a, p) => a + (p.qty || 0), 0)
        const sq = sl.reduce((a, p) => a + (p.qty || 0), 0)
        const hq = Math.max(0, bq - sq)
        if (hq <= 0) continue
        const valid = pp.filter(p => (p.price || 0) > 0 && (p.qty || 0) > 0)
        const ws = valid.reduce((a, p) => a + p.price * p.qty, 0)
        const vqt = valid.reduce((a, p) => a + p.qty, 0)
        const avg = vqt > 0 ? ws / vqt : 0
        const info = pm[s.ticker] || {}
        const cur = info.current_price ?? avg
        const evalAmt = cur * hq
        const chgAmt = (info.change_amount || 0) * hq

        if (isKRW) {
          totalEvalKRW += evalAmt
          if (avg > 0) unrealizedKRW += (cur - avg) * hq
          todayChgKRW += chgAmt
        } else {
          totalEvalUSD += evalAmt
          if (avg > 0) unrealizedUSD += (cur - avg) * hq
          todayChgUSD += chgAmt
        }
      }
    }

    // 원화 환산 기준 통합 표시
    const totalKRW = totalEvalKRW + (fx ? totalEvalUSD * fx : 0)
    const unrealizedKRWTotal = unrealizedKRW + (fx ? unrealizedUSD * fx : 0)
    const todayChgKRWTotal = todayChgKRW + (fx ? todayChgUSD * fx : 0)
    const costKRW = totalKRW - unrealizedKRWTotal
    const unrealizedPct = costKRW > 0 ? unrealizedKRWTotal / costKRW * 100 : 0

    return {
      totalEvalUSD, totalEvalKRW, totalKRW,
      unrealizedUSD, unrealizedKRW, unrealizedKRWTotal, unrealizedPct,
      todayChgUSD, todayChgKRW, todayChgKRWTotal,
    }
  }, [stockData])

  // ── 동적 단위 계산 ──
  const { units, isStockUnit } = useMemo(
    () => computeUnits(stockData, overviewGroup),
    [stockData, overviewGroup]
  )

  // ── 수익률 계산 ──
  const returnRates = useMemo(() => {
    const cutoff = calcCutoff(overviewPeriod, customFrom)
    const cutoffEnd = overviewPeriod === 'custom' && customTo ? customTo : null
    return computeReturnRates(stockData, overviewGroup, cutoff, cutoffEnd)
  }, [stockData, overviewGroup, overviewPeriod, customFrom, customTo])

  // ── 집중도 계산 ──
  const concentration = useMemo(
    () => computeConcentration(units, computed?.fxRate),
    [units, computed]
  )

  // ── effectivePieItems ──
  const effectivePieItems = useMemo(() => {
    if (!computed) return []
    const { grpTotals, stockValues } = computed
    const effGroup = overviewGroup || (grpTotals.length === 1 ? grpTotals[0].name : '')
    if (effGroup) return stockValues.filter(s => s.groupName?.toLowerCase() === effGroup.toLowerCase())
    return grpTotals.filter(g => g.total > 0)
  }, [computed, overviewGroup])

  // ── effectiveStockEvals (기간 시장손익 바차트용 필터) ──
  const effectiveStockEvals = useMemo(() => {
    if (!overviewGroup) return periodStockEvals
    const tickers = new Set(computed?.groupTickers?.[overviewGroup] ?? [])
    return periodStockEvals.filter(s => tickers.has(s.label))
  }, [periodStockEvals, overviewGroup, computed])

  // ── 종목별 평가손익 내역 ──
  const stockEvalBreakdown = useMemo(() => {
    if (!stockData?.groups) return []
    const pm = stockData.priceMap || {}
    const tSet = overviewGroup ? new Set((computed?.groupTickers ?? {})[overviewGroup] ?? []) : null
    const result = []
    for (const g of stockData.groups) {
      const isKRW = g.currency === 'KRW'
      for (const s of g.stocks || []) {
        if (s.is_deleted) continue
        if (tSet && !tSet.has(s.ticker)) continue
        const pp = s.purchases || [], sl = s.sells || []
        const hq = Math.max(0, pp.reduce((a, p) => a + (p.qty || 0), 0) - sl.reduce((a, p) => a + (p.qty || 0), 0))
        if (hq <= 0) continue
        const valid = pp.filter(p => (p.price || 0) > 0 && (p.qty || 0) > 0)
        const ws = valid.reduce((a, p) => a + p.price * p.qty, 0)
        const vqt = valid.reduce((a, p) => a + p.qty, 0)
        const avg = vqt > 0 ? ws / vqt : 0
        const cur = pm[s.ticker]?.current_price ?? avg
        if (avg <= 0) continue
        const evalPL = (cur - avg) * hq
        const pct = (cur - avg) / avg * 100
        result.push({ ticker: s.ticker, totalHQ: hq, allAvg: avg, cur, evalPL, pct, isKRW })
      }
    }
    return result.sort((a, b) => b.evalPL - a.evalPL)
  }, [stockData, overviewGroup, computed])

  // ── 파이차트 useEffect ──
  useEffect(() => {
    if (!isOpen || !computed || !pieRef.current) return
    if (pieChartRef.current) { pieChartRef.current.destroy(); pieChartRef.current = null }

    const { grpTotals, stockValues, fxRate } = computed
    const toDisplay = (val, isKRW) => {
      if (overviewCurrency === 'USD' && isKRW && fxRate) return val / fxRate
      if (overviewCurrency === 'KRW' && !isKRW && fxRate) return val * fxRate
      return val
    }
    const safeName = (n) => (!n || n === 'undefined' || String(n).trim() === '') ? '알 수 없음' : String(n)

    let pieLabels, pieData, pieColors
    if (overviewGroup) {
      const grpStocks = stockValues.filter(s => s.groupName?.toLowerCase() === overviewGroup.toLowerCase())
      const vals = grpStocks.map(s => {
        const displayName = s.isKRW ? safeName(cleanStr(s.name, s.ticker)) : (s.ticker && s.ticker !== 'undefined' ? s.ticker : safeName(cleanStr(s.name, s.ticker)))
        return { name: displayName, val: Math.max(0, toDisplay(s.evalAmt, s.isKRW)) }
      }).filter(x => x.val > 0 && x.name !== '알 수 없음')
      const total = vals.reduce((a, x) => a + x.val, 0) || 1
      pieLabels = vals.map(x => `${x.name} (${(x.val / total * 100).toFixed(1)}%)`)
      pieData = vals.map(x => parseFloat(x.val.toFixed(2)))
      pieColors = vals.map(x => colorForKey(x.name))
    } else {
      const vals = (grpTotals ?? []).map(g => ({ name: g.name, val: Math.max(0, toDisplay(g.total, g.isKRW)) })).filter(x => x.val > 0)
      const total = vals.reduce((a, x) => a + x.val, 0) || 1
      pieLabels = vals.map(x => `${x.name} (${(x.val / total * 100).toFixed(1)}%)`)
      pieData = vals.map(x => parseFloat(x.val.toFixed(2)))
      pieColors = vals.map(x => colorForKey(x.name))
    }
    if (!pieLabels?.length) return

    pieChartRef.current = new Chart(pieRef.current, {
      type: 'doughnut',
      data: { labels: pieLabels, datasets: [{ data: pieData, backgroundColor: pieColors, borderWidth: 2, borderColor: '#fffef9' }] },
      options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { font: { size: 12 }, padding: 12, generateLabels: (chart) => { const def = Chart.defaults.plugins.legend.labels.generateLabels(chart); return def.filter(l => { const n = (l.text || '').split(' (')[0]; return n && n !== '알 수 없음' && n !== '(없음)' && n !== 'undefined' }).map(l => { if (l.text.length > 20) l.text = l.text.slice(0, 20) + '...'; return l }) } } } } },
    })
    return () => { if (pieChartRef.current) { pieChartRef.current.destroy(); pieChartRef.current = null } }
  }, [isOpen, computed, overviewGroup, overviewCurrency, lang])

  // ── 수익률 바차트 useEffect ──
  useEffect(() => {
    if (returnBarChartRef.current) { returnBarChartRef.current.destroy(); returnBarChartRef.current = null }
    if (!isOpen || !returnBarRef.current || !returnRates.length) return

    const sorted = [...returnRates].sort((a, b) => b.returnPct - a.returnPct)
    returnBarChartRef.current = new Chart(returnBarRef.current, {
      type: 'bar',
      data: {
        labels: sorted.map(s => s.ticker || s.name),
        datasets: [{
          label: t(lang, 'statsReturnRate'),
          data: sorted.map(s => parseFloat(s.returnPct.toFixed(2))),
          backgroundColor: sorted.map(s => s.returnPct >= 0 ? 'rgba(74,124,89,0.75)' : 'rgba(220,38,38,0.75)'),
          borderColor: sorted.map(s => s.returnPct >= 0 ? '#4a7c59' : '#dc2626'),
          borderWidth: 1,
        }],
      },
      options: {
        responsive: true,
        scales: {
          y: {
            title: { display: true, text: t(lang, 'statsReturnAxisPct') },
            ticks: { callback: v => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%` },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => `${ctx.parsed.y >= 0 ? '+' : ''}${ctx.parsed.y.toFixed(2)}%` } },
        },
      },
    })
    return () => { if (returnBarChartRef.current) { returnBarChartRef.current.destroy(); returnBarChartRef.current = null } }
  }, [isOpen, returnRates, lang, overviewPeriod, customFrom, customTo])

  // ── 벤치마크 차트 useEffect ──
  useEffect(() => {
    if (benchmarkChartRef.current) { benchmarkChartRef.current.destroy(); benchmarkChartRef.current = null }
    if (!isOpen || !benchmarkRef.current || !benchmarkData) return

    const datasets = []
    // 포트폴리오 라인
    if (histData.length) {
      const cutoff = calcCutoff(overviewPeriod, customFrom)
      const cutoffEnd = overviewPeriod === 'custom' && customTo ? customTo : null
      const selGroup = overviewGroup ? (stockData?.groups ?? []).find(g => cleanStr(g.name, g.id) === overviewGroup) : null
      const useKRW = selGroup ? selGroup.currency === 'KRW' : overviewCurrency === 'KRW'

      const getValue = (r) => {
        try {
          const parsed = JSON.parse(r.data || '{}')
          if (parsed.groups) {
            if (overviewGroup) {
              const gid = Object.entries(parsed.group_names ?? {}).find(([, n]) => n === overviewGroup)?.[0]
              if (gid && parsed.groups[gid] != null) return parsed.groups[gid].total ?? 0
              if (parsed.groups[overviewGroup] != null) return parsed.groups[overviewGroup].total ?? 0
              return 0
            }
            if (useKRW) return Object.values(parsed.groups).filter(g => g.currency === 'KRW').reduce((a, g) => a + (g.total ?? 0), 0)
            return Object.values(parsed.groups).filter(g => g.currency !== 'KRW').reduce((a, g) => a + (g.total ?? 0), 0)
          }
        } catch {}
        return useKRW ? (r.total_krw ?? 0) : (r.total_usd ?? 0)
      }

      const filtered = [...histData]
        .filter(r => getValue(r) != null && (!cutoff || r.snapshot_date >= cutoff) && (!cutoffEnd || r.snapshot_date <= cutoffEnd))
        .sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date))

      if (filtered.length) {
        const vals = filtered.map(r => getValue(r))
        const base = vals[0] || 1
        const normalized = vals.map(v => parseFloat((v / base * 100).toFixed(2)))
        datasets.push({
          label: t(lang, 'statsBenchmarkPortfolio'),
          data: filtered.map((r, i) => ({ x: r.snapshot_date, y: normalized[i] })),
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37,99,235,0.1)',
          fill: false,
          tension: 0.2,
          pointRadius: filtered.length > 60 ? 0 : 2,
          borderWidth: 2,
        })
      }
    }

    // 벤치마크 라인들
    const bmColors = ['#f59e0b', '#9333ea', '#ef4444', '#0891b2']
    Object.entries(benchmarkData).forEach(([ticker, d], i) => {
      if (!d.dates?.length) return
      datasets.push({
        label: ticker,
        data: d.dates.map((date, j) => ({ x: date, y: d.normalized[j] })),
        borderColor: bmColors[i % bmColors.length],
        backgroundColor: 'transparent',
        fill: false,
        tension: 0.2,
        pointRadius: d.dates.length > 60 ? 0 : 2,
        borderWidth: 1.5,
        borderDash: [4, 2],
      })
    })

    if (!datasets.length) return

    benchmarkChartRef.current = new Chart(benchmarkRef.current, {
      type: 'line',
      data: { datasets },
      options: {
        responsive: true,
        scales: {
          x: { type: 'time', time: { unit: 'day', displayFormats: { day: 'yyyy-MM-dd' } }, ticks: { maxTicksLimit: 8 } },
          y: {
            title: { display: true, text: '정규화 (시작=100)' },
            ticks: { callback: v => v.toFixed(0) },
          },
        },
        plugins: {
          legend: { position: 'bottom' },
          tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(2)}` } },
        },
      },
    })
    return () => { if (benchmarkChartRef.current) { benchmarkChartRef.current.destroy(); benchmarkChartRef.current = null } }
  }, [isOpen, benchmarkData, histData, overviewPeriod, customFrom, customTo, overviewGroup, overviewCurrency, stockData, lang])

  // ── 수익률 바차트 useEffect ──
  // 기간 선택 시: periodPlData(현재 보유 전종목, 기간 시작가→현재가 %)
  // 전체 선택 시: stockEvalBreakdown(현재 보유 전종목, 평균단가→현재가 %)
  useEffect(() => {
    if (!isOpen || !computed) return
    chartsRef.current.forEach(c => c.destroy())
    chartsRef.current = []

    const { groupTickers } = computed
    const hasPeriod = !!calcCutoff(overviewPeriod, customFrom)
    const tickerSet = overviewGroup ? new Set(groupTickers[overviewGroup] ?? []) : null

    if (barRef.current) {
      let sorted = []
      let labelFn, colorFn, tooltipFn

      if (hasPeriod && periodPlData.length) {
        const filtered = (tickerSet ? periodPlData.filter(d => tickerSet.has(d.ticker)) : periodPlData)
          .filter(d => d.pl_pct != null)
        sorted = [...filtered].sort((a, b) => b.pl_pct - a.pl_pct)
        labelFn   = d => d.ticker
        colorFn   = d => d.pl_pct >= 0 ? 'rgba(74,124,89,0.75)' : 'rgba(220,38,38,0.75)'
        tooltipFn = (ctx) => `${sorted[ctx.dataIndex].pl_pct >= 0 ? '+' : ''}${sorted[ctx.dataIndex].pl_pct.toFixed(2)}%`
      } else {
        const base = tickerSet ? stockEvalBreakdown.filter(s => tickerSet.has(s.ticker)) : stockEvalBreakdown
        sorted = [...base].filter(s => s.pct != null).sort((a, b) => b.pct - a.pct)
        labelFn   = d => d.ticker
        colorFn   = d => d.pct >= 0 ? 'rgba(74,124,89,0.75)' : 'rgba(220,38,38,0.75)'
        tooltipFn = (ctx) => `${sorted[ctx.dataIndex].pct >= 0 ? '+' : ''}${sorted[ctx.dataIndex].pct.toFixed(2)}%`
      }

      if (sorted.length) {
        const pctKey = hasPeriod ? 'pl_pct' : 'pct'
        const inst = new Chart(barRef.current, {
          type: 'bar',
          data: {
            labels: sorted.map(labelFn),
            datasets: [{ label: '수익률', data: sorted.map(d => parseFloat((d[pctKey] ?? 0).toFixed(2))), backgroundColor: sorted.map(colorFn), borderColor: sorted.map(d => (d[pctKey] ?? 0) >= 0 ? '#4a7c59' : '#dc2626'), borderWidth: 1 }],
          },
          options: {
            responsive: true,
            scales: { y: { title: { display: true, text: '수익률 (%)' }, ticks: { callback: v => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%` } } },
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: tooltipFn } } },
          },
        })
        chartsRef.current.push(inst)
      }
    }

    return () => { chartsRef.current.forEach(c => c.destroy()); chartsRef.current = [] }
  }, [isOpen, computed, lang, overviewGroup, overviewPeriod, customFrom, customTo, periodPlData, stockEvalBreakdown])

  // ── 기간 시장손익 바차트 useEffect ──
  useEffect(() => {
    if (plBarChartRef.current) { plBarChartRef.current.destroy(); plBarChartRef.current = null }
    if (!isOpen || !plBarRef.current || !periodPlData.length) return
    const tickerSet = overviewGroup ? new Set(computed?.groupTickers?.[overviewGroup] ?? []) : null
    const filtered = tickerSet ? periodPlData.filter(d => tickerSet.has(d.ticker)) : periodPlData
    if (!filtered.length) return
    const fxR = computed?.fxRate
    const converted = filtered.map(d => {
      let pl = d.pl
      if (overviewCurrency === 'KRW' && d.currency !== 'KRW' && fxR) { pl = pl * fxR }
      if (overviewCurrency === 'USD' && d.currency === 'KRW' && fxR) { pl = pl / fxR }
      return { ...d, pl, sym: overviewCurrency === 'KRW' ? '₩' : '$' }
    })
    const sorted = [...converted].sort((a, b) => b.pl - a.pl)
    const axisSymbol = overviewCurrency === 'KRW' ? '₩' : '$'
    plBarChartRef.current = new Chart(plBarRef.current, {
      type: 'bar',
      data: {
        labels: sorted.map(d => d.ticker),
        datasets: [{
          label: t(lang, 'statsPeriodPlLabel'),
          data: sorted.map(d => parseFloat(d.pl.toFixed(2))),
          backgroundColor: sorted.map(d => d.pl >= 0 ? 'rgba(37,99,235,0.75)' : 'rgba(220,38,38,0.75)'),
          borderColor: sorted.map(d => d.pl >= 0 ? '#2563eb' : '#dc2626'),
          borderWidth: 1,
        }],
      },
      options: {
        responsive: true,
        scales: {
          y: {
            title: { display: true, text: `${t(lang, 'statsAxisPL')} (${axisSymbol})` },
            ticks: { callback: v => { const fmt = fmtShort(Math.abs(v), overviewCurrency); return v >= 0 ? `+${fmt}` : `-${fmt}` } },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => { const d = sorted[ctx.dataIndex]; const fmt = fmtShort(Math.abs(d.pl), overviewCurrency); const pct = d.pl_pct != null ? ` (${d.pl_pct >= 0 ? '+' : ''}${d.pl_pct.toFixed(1)}%)` : ''; return `${d.pl >= 0 ? '+' : '-'}${fmt}${pct}` } } },
        },
      },
    })
    return () => { if (plBarChartRef.current) { plBarChartRef.current.destroy(); plBarChartRef.current = null } }
  }, [isOpen, periodPlData, overviewGroup, overviewCurrency, lang, computed])

  // ── 히스토리 라인차트 useEffect ──
  useEffect(() => {
    if (!isOpen || histLoading || !histLineRef.current) return
    if (histChartRef.current) { histChartRef.current.destroy(); histChartRef.current = null }
    if (!histData.length) return

    const selGroup = overviewGroup ? (stockData?.groups ?? []).find(g => cleanStr(g.name, g.id) === overviewGroup) : null
    const useKRW = selGroup ? selGroup.currency === 'KRW' : overviewCurrency === 'KRW'
    const yLabel = useKRW ? '₩' : '$'

    const getValue = (r) => {
      try {
        const parsed = JSON.parse(r.data || '{}')
        if (parsed.groups) {
          if (overviewGroup) {
            const gid = Object.entries(parsed.group_names ?? {}).find(([, n]) => n === overviewGroup)?.[0]
            if (gid && parsed.groups[gid] != null) return parsed.groups[gid].total ?? 0
            if (parsed.groups[overviewGroup] != null) return parsed.groups[overviewGroup].total ?? 0
            return 0
          }
          if (useKRW) return Object.values(parsed.groups).filter(g => g.currency === 'KRW').reduce((a, g) => a + (g.total ?? 0), 0)
          return Object.values(parsed.groups).filter(g => g.currency !== 'KRW').reduce((a, g) => a + (g.total ?? 0), 0)
        }
      } catch {}
      return useKRW ? (r.total_krw ?? 0) : (r.total_usd ?? 0)
    }

    const cutoff = calcCutoff(overviewPeriod, customFrom)
    const cutoffEnd = overviewPeriod === 'custom' && customTo ? customTo : null
    const filtered = [...histData]
      .filter(r => getValue(r) != null && (!cutoff || r.snapshot_date >= cutoff) && (!cutoffEnd || r.snapshot_date <= cutoffEnd))
      .sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date))
    if (!filtered.length) return

    histChartRef.current = new Chart(histLineRef.current, {
      type: 'line',
      data: {
        labels: filtered.map(r => r.snapshot_date),
        datasets: [{
          label: yLabel,
          data: filtered.map(r => getValue(r)),
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
          x: { type: 'category', ticks: { maxTicksLimit: 10 } },
          y: { title: { display: true, text: yLabel }, ticks: { callback: v => useKRW ? '₩' + fmtKRWShort(v) : fmtUSDShort(v) } },
        },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => { const v = ctx.parsed.y; return useKRW ? '₩' + fmtKRWShort(v) : fmtUSDShort(v) } } },
        },
      },
    })
    return () => { if (histChartRef.current) { histChartRef.current.destroy(); histChartRef.current = null } }
  }, [isOpen, histData, overviewPeriod, customFrom, customTo, histGroupNames, lang, overviewGroup, stockData, histLoading, overviewCurrency])

  // ── body scroll lock ──
  useEffect(() => {
    if (!isOpen) return
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  // ── 데이터 fetch: 히스토리 ──
  useEffect(() => {
    if (!isOpen) return
    setHistLoading(true)
    apiFetch('/api/portfolio/history?days=3650')
      .then(d => { setHistData(Array.isArray(d) ? d : []); setHistPage(0) })
      .catch(() => setHistData([]))
      .finally(() => setHistLoading(false))
  }, [isOpen])

  // ── 데이터 fetch: 배당금 ──
  useEffect(() => {
    if (!isOpen) return
    setDividendLoading(true)
    apiFetch('/api/portfolio/dividends')
      .then(d => setDividendData(Array.isArray(d) ? d : []))
      .catch(() => setDividendData([]))
      .finally(() => setDividendLoading(false))
  }, [isOpen])

  // ── 배당 월별 바차트 useEffect ──
  useEffect(() => {
    if (divBarChartRef.current) { divBarChartRef.current.destroy(); divBarChartRef.current = null }
    if (!isOpen || !divBarRef.current || !dividendData.length) return

    const cutoff    = calcCutoff(overviewPeriod, customFrom)
    const cutoffEnd = overviewPeriod === 'custom' && customTo ? customTo : null
    const filtered  = dividendData.filter(d =>
      (!cutoff || d.date >= cutoff) && (!cutoffEnd || d.date <= cutoffEnd)
    )
    if (!filtered.length) return

    // 월별 집계
    const monthMap = {}
    const tickerSet = new Set()
    filtered.forEach(d => {
      const ym = d.date.slice(0, 7)
      if (!monthMap[ym]) monthMap[ym] = {}
      monthMap[ym][d.ticker] = (monthMap[ym][d.ticker] || 0) + d.amount
      tickerSet.add(d.ticker)
    })
    const months  = Object.keys(monthMap).sort()
    const tickers = [...tickerSet]
    const COLORS  = ['#4a7c59','#2563eb','#f59e0b','#dc2626','#7c3aed','#0891b2','#d97706','#059669','#9333ea','#e11d48','#0284c7','#16a34a']
    const datasets = tickers.map((tk, i) => ({
      label: tk,
      data: months.map(m => monthMap[m][tk] || 0),
      backgroundColor: COLORS[i % COLORS.length] + 'cc',
      borderColor: COLORS[i % COLORS.length],
      borderWidth: 1,
    }))

    divBarChartRef.current = new Chart(divBarRef.current, {
      type: 'bar',
      data: { labels: months, datasets },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'bottom', labels: { font: { size: 11 }, padding: 8 } },
          tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: $${ctx.parsed.y.toFixed(2)}` } },
        },
        scales: {
          x: { stacked: true, ticks: { font: { size: 10 } } },
          y: { stacked: true, ticks: { callback: v => '$' + v.toFixed(0) } },
        },
      },
    })
    return () => { if (divBarChartRef.current) { divBarChartRef.current.destroy(); divBarChartRef.current = null } }
  }, [isOpen, dividendData, overviewPeriod, customFrom, customTo])

  // ── 배당 종목별 파이차트 useEffect ──
  useEffect(() => {
    if (divPieChartRef.current) { divPieChartRef.current.destroy(); divPieChartRef.current = null }
    if (!isOpen || !divPieRef.current || !dividendData.length) return

    const cutoff    = calcCutoff(overviewPeriod, customFrom)
    const cutoffEnd = overviewPeriod === 'custom' && customTo ? customTo : null
    const filtered  = dividendData.filter(d =>
      (!cutoff || d.date >= cutoff) && (!cutoffEnd || d.date <= cutoffEnd)
    )
    if (!filtered.length) return

    const byTicker = {}
    filtered.forEach(d => { byTicker[d.ticker] = (byTicker[d.ticker] || 0) + d.amount })
    const sorted  = Object.entries(byTicker).sort((a, b) => b[1] - a[1])
    const COLORS  = ['#4a7c59','#2563eb','#f59e0b','#dc2626','#7c3aed','#0891b2','#d97706','#059669','#9333ea','#e11d48','#0284c7','#16a34a']

    divPieChartRef.current = new Chart(divPieRef.current, {
      type: 'doughnut',
      data: {
        labels: sorted.map(([tk]) => tk),
        datasets: [{ data: sorted.map(([, v]) => v), backgroundColor: COLORS.slice(0, sorted.length), borderWidth: 1 }],
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'bottom', labels: { font: { size: 11 }, padding: 8 } },
          tooltip: { callbacks: { label: ctx => `${ctx.label}: $${ctx.parsed.toFixed(2)} (${(ctx.parsed / sorted.reduce((a,[,v])=>a+v,0)*100).toFixed(1)}%)` } },
        },
      },
    })
    return () => { if (divPieChartRef.current) { divPieChartRef.current.destroy(); divPieChartRef.current = null } }
  }, [isOpen, dividendData, overviewPeriod, customFrom, customTo])

  // ── 납입금 바차트 useEffect ──
  useEffect(() => {
    if (contribBarChartRef.current) { contribBarChartRef.current.destroy(); contribBarChartRef.current = null }
    if (!isOpen || !contribBarRef.current || !stockData?.groups) return

    const cutoff    = calcCutoff(overviewPeriod, customFrom)
    const cutoffEnd = overviewPeriod === 'custom' && customTo ? customTo : null

    // 그룹별로 contributions 수집, 기간 필터 적용
    const groupColors = ['#2563eb','#16a34a','#f59e0b','#9333ea','#ef4444','#0891b2']
    const monthSet = new Set()
    const groupContribs = []

    ;(stockData.groups || []).forEach((g, gi) => {
      const contribs = (g.contributions || []).filter(c =>
        c.date && c.amount > 0 &&
        (!cutoff    || c.date >= cutoff) &&
        (!cutoffEnd || c.date <= cutoffEnd)
      )
      if (!contribs.length) return
      const byMonth = {}
      contribs.forEach(c => {
        const ym = c.date.slice(0, 7)
        byMonth[ym] = (byMonth[ym] ?? 0) + c.amount
        monthSet.add(ym)
      })
      groupContribs.push({ name: g.name || g.id || `그룹${gi+1}`, byMonth, color: groupColors[gi % groupColors.length] })
    })

    if (!monthSet.size) return  // 납입금 데이터 없음

    const months = [...monthSet].sort()
    const datasets = groupContribs.map(gc => ({
      label: gc.name,
      data: months.map(m => gc.byMonth[m] ?? 0),
      backgroundColor: gc.color,
      borderRadius: 4,
    }))

    contribBarChartRef.current = new Chart(contribBarRef.current, {
      type: 'bar',
      data: { labels: months, datasets },
      options: {
        responsive: true,
        scales: {
          x: { stacked: true, ticks: { maxRotation: 45 } },
          y: { stacked: true, ticks: { callback: v => '$' + (v >= 1000 ? (v/1000).toFixed(0)+'k' : v) } },
        },
        plugins: {
          legend: { position: 'bottom', display: groupContribs.length > 1 },
          tooltip: {
            callbacks: {
              label: ctx => {
                const sym = (stockData.groups[ctx.datasetIndex]?.currency === 'KRW') ? '₩' : '$'
                return `${ctx.dataset.label}: ${sym}${ctx.parsed.y.toLocaleString()}`
              },
              footer: items => {
                const total = items.reduce((a, i) => a + i.parsed.y, 0)
                return `합계: $${total.toLocaleString()}`
              },
            },
          },
        },
      },
    })
    return () => { if (contribBarChartRef.current) { contribBarChartRef.current.destroy(); contribBarChartRef.current = null } }
  }, [isOpen, stockData, overviewPeriod, customFrom, customTo])

  // ── 데이터 fetch: 기간 시장손익 ──
  useEffect(() => {
    if (!isOpen) return
    const fromDate = calcCutoff(overviewPeriod, customFrom)
    if (!fromDate) { setPeriodPlData([]); return }
    setPeriodPlLoading(true)
    apiFetch(`/api/portfolio/period-pl?from=${fromDate}`)
      .then(d => setPeriodPlData(Array.isArray(d) ? d : []))
      .catch(() => setPeriodPlData([]))
      .finally(() => setPeriodPlLoading(false))
  }, [isOpen, overviewPeriod, customFrom])

  // ── 데이터 fetch: 벤치마크 ──
  useEffect(() => {
    if (!isOpen) return
    const fromDate = calcCutoff(overviewPeriod, customFrom)
    const params = fromDate ? `?from=${fromDate}` : ''
    setBenchmarkLoading(true)
    apiFetch(`/api/portfolio/benchmark${params}`)
      .then(d => setBenchmarkData(d && typeof d === 'object' ? d : null))
      .catch(() => setBenchmarkData(null))
      .finally(() => setBenchmarkLoading(false))
  }, [isOpen, overviewPeriod, customFrom])

  // ── 데이터 fetch: 실현 손익 ──
  useEffect(() => {
    if (!isOpen) return
    setRealizedLoading(true)
    apiFetch('/api/portfolio/realized-pl')
      .then(d => setRealizedData(d || null))
      .catch(() => setRealizedData(null))
      .finally(() => setRealizedLoading(false))
  }, [isOpen])

  // ── 조건부 return (모든 hook 이후) ──
  if (!isOpen) return null
  if (!stockData?.groups?.length) return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: 'var(--card)', borderRadius: 16, padding: '2.5rem 3rem', textAlign: 'center', boxShadow: '0 8px 40px rgba(0,0,0,.3)' }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: '2.5rem', marginBottom: '0.8rem' }}>📊</div>
        <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--ink)', marginBottom: '0.4rem' }}>보유 종목이 없습니다</div>
        <div style={{ fontSize: '0.85rem', color: 'var(--ink3)', marginBottom: '1.5rem' }}>종목을 추가하면 통계를 확인할 수 있습니다</div>
        <button onClick={onClose} style={{ padding: '0.5rem 1.5rem', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: '0.85rem', fontFamily: 'inherit' }}>닫기</button>
      </div>
    </div>
  )

  const { grpTotals, fxRate, groupTickers, stockValues } = computed || {}
  const groupNames = (stockData?.groups ?? []).map(g => cleanStr(g.name, g.id))
  const periodCutoff = calcCutoff(overviewPeriod, customFrom)
  const periodCutoffEnd = overviewPeriod === 'custom' && customTo ? customTo : null

  const selStyle = {
    fontSize: '0.78rem', padding: '0.25rem 0.5rem', borderRadius: 6,
    border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--ink)',
    fontFamily: 'inherit', cursor: 'pointer',
  }
  const periodBtn = (active) => ({
    padding: '0.28rem 0.75rem', fontSize: '0.78rem', fontWeight: active ? 700 : 400,
    border: `1.5px solid ${active ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 6,
    background: active ? 'var(--accent)' : 'transparent',
    color: active ? '#fff' : 'var(--ink3)', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
  })

  // ── KPI 카드 렌더 ──
  const renderKPICards = () => {
    if (!kpi) return null
    const hasMultiCurrency = stockData?.groups?.some(g => g.currency === 'KRW') && stockData?.groups?.some(g => g.currency !== 'KRW')

    const cards = [
      {
        label: t(lang, 'statsKpiEval'),
        value: hasMultiCurrency
          ? `₩${fmtKRW(kpi.totalKRW)}`
          : kpi.totalEvalKRW > 0 ? `₩${fmtKRW(kpi.totalEvalKRW)}` : `$${fmtUSD(kpi.totalEvalUSD)}`,
        sub: hasMultiCurrency && fxRate ? `$${fmtUSD(kpi.totalEvalUSD)} + ₩${fmtKRW(kpi.totalEvalKRW)}` : null,
        color: 'var(--ink)',
      },
      {
        label: t(lang, 'statsKpiToday'),
        value: hasMultiCurrency
          ? `${kpi.todayChgKRWTotal >= 0 ? '+' : ''}₩${fmtKRW(kpi.todayChgKRWTotal)}`
          : kpi.todayChgKRW !== 0 ? `${kpi.todayChgKRW >= 0 ? '+' : ''}₩${fmtKRW(kpi.todayChgKRW)}`
          : `${kpi.todayChgUSD >= 0 ? '+' : ''}$${fmtUSD(kpi.todayChgUSD)}`,
        sub: null,
        color: kpi.todayChgKRWTotal >= 0 ? '#16a34a' : '#dc2626',
      },
    ]

    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem', padding: '1rem 1.2rem', borderBottom: '1px solid var(--border)' }}>
        {cards.map((c, i) => (
          <div key={i} style={{ background: 'var(--card)', borderRadius: 10, padding: '0.85rem 1rem', border: '1px solid var(--border)', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--ink3)', marginBottom: '0.35rem', fontWeight: 500 }}>{c.label}</div>
            <div style={{ fontSize: '1.15rem', fontWeight: 700, color: c.color, lineHeight: 1.2 }}>{c.value}</div>
            {c.sub && <div style={{ fontSize: '0.72rem', color: c.color === 'var(--ink)' ? 'var(--ink3)' : c.color, marginTop: '0.2rem', opacity: 0.85 }}>{c.sub}</div>}
          </div>
        ))}
      </div>
    )
  }

  // ── 집중도 섹션 ──
  const renderConcentration = () => {
    if (!concentration.length) return null
    return (
      <div className="stats-section">
        <div className="stats-section-title">{t(lang, 'statsConcentrationTitle')}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {concentration.map((c, i) => {
            const isWarn = c.pct >= 30 && c.pct < 50
            const isAlert = c.pct >= 50
            const barColor = isAlert ? '#dc2626' : isWarn ? '#f59e0b' : '#2563eb'
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ width: 90, fontSize: '0.78rem', color: 'var(--ink)', fontWeight: 500, flexShrink: 0, textAlign: 'right' }}>{c.name}</div>
                <div style={{ flex: 1, background: 'var(--border)', borderRadius: 4, height: 16, overflow: 'hidden' }}>
                  <div style={{ width: `${Math.min(100, c.pct)}%`, height: '100%', background: barColor, borderRadius: 4, transition: 'width 0.4s ease' }} />
                </div>
                <div style={{ width: 55, fontSize: '0.78rem', fontWeight: 600, color: barColor, flexShrink: 0 }}>
                  {c.pct.toFixed(1)}%
                  {isAlert && <span style={{ marginLeft: 4, fontSize: '0.65rem' }}>⚠</span>}
                  {isWarn && !isAlert && <span style={{ marginLeft: 4, fontSize: '0.65rem' }}>△</span>}
                </div>
              </div>
            )
          })}
        </div>
        <div style={{ fontSize: '0.68rem', color: 'var(--ink3)', marginTop: '0.5rem', lineHeight: 1.5 }}>
          △ {t(lang, 'statsConcentrationWarn')} &nbsp;|&nbsp; ⚠ {t(lang, 'statsConcentrationAlert')}
        </div>
      </div>
    )
  }

  // ── 실현 손익 테이블 ──
  const renderRealizedPL = () => (
    <div className="stats-section">
      <div className="stats-section-title">{t(lang, 'statsRealizedTitle')}</div>
      {realizedLoading ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--ink3)' }}>{t(lang, 'statsRealizedLoading')}</div>
      ) : !realizedData?.items?.length ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--ink3)' }}>{t(lang, 'statsRealizedNone')}</div>
      ) : (
        <>
          <div style={{ marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: 700, color: realizedData.total >= 0 ? '#16a34a' : '#dc2626' }}>
            합계: {realizedData.total >= 0 ? '+' : ''}{fmtShort(Math.abs(realizedData.total), 'USD')}
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: '0.75rem', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ color: 'var(--ink3)', borderBottom: '1.5px solid var(--border)' }}>
                  <th style={{ textAlign: 'left', padding: '0.3rem 0.4rem', fontWeight: 500 }}>종목</th>
                  <th style={{ textAlign: 'left', padding: '0.3rem 0.4rem', fontWeight: 500 }}>그룹</th>
                  <th style={{ textAlign: 'right', padding: '0.3rem 0.4rem', fontWeight: 500 }}>{t(lang, 'statsRealizedSellDate')}</th>
                  <th style={{ textAlign: 'right', padding: '0.3rem 0.4rem', fontWeight: 500 }}>{t(lang, 'statsRealizedQty')}</th>
                  <th style={{ textAlign: 'right', padding: '0.3rem 0.4rem', fontWeight: 500 }}>{t(lang, 'statsRealizedSellPrice')}</th>
                  <th style={{ textAlign: 'right', padding: '0.3rem 0.4rem', fontWeight: 500 }}>{t(lang, 'statsRealizedAvgCost')}</th>
                  <th style={{ textAlign: 'right', padding: '0.3rem 0.4rem', fontWeight: 500 }}>{t(lang, 'statsRealizedPL')}</th>
                  <th style={{ textAlign: 'right', padding: '0.3rem 0.4rem', fontWeight: 500 }}>{t(lang, 'statsRealizedPLPct')}</th>
                </tr>
              </thead>
              <tbody>
                {realizedData.items.map((item, i) => {
                  const isKRW = item.currency === 'KRW'
                  const fmt = v => isKRW ? '₩' + fmtKRW(v) : '$' + fmtUSD(v)
                  const pos = item.pl >= 0
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '0.3rem 0.4rem', color: 'var(--ink)', fontWeight: 600 }}>{item.ticker}</td>
                      <td style={{ padding: '0.3rem 0.4rem', color: 'var(--ink3)' }}>{item.group}</td>
                      <td style={{ padding: '0.3rem 0.4rem', textAlign: 'right', color: 'var(--ink3)' }}>{item.date}</td>
                      <td style={{ padding: '0.3rem 0.4rem', textAlign: 'right', color: 'var(--ink3)' }}>{item.qty % 1 === 0 ? item.qty : item.qty.toFixed(3)}</td>
                      <td style={{ padding: '0.3rem 0.4rem', textAlign: 'right', color: 'var(--ink)' }}>{fmt(item.sell_price)}</td>
                      <td style={{ padding: '0.3rem 0.4rem', textAlign: 'right', color: 'var(--ink3)' }}>{fmt(item.avg_cost)}</td>
                      <td style={{ padding: '0.3rem 0.4rem', textAlign: 'right', color: pos ? '#16a34a' : '#dc2626', fontWeight: 600 }}>{pos ? '+' : ''}{fmt(Math.abs(item.pl))}</td>
                      <td style={{ padding: '0.3rem 0.4rem', textAlign: 'right', color: pos ? '#16a34a' : '#dc2626' }}>{pos ? '+' : ''}{item.pl_pct.toFixed(1)}%</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )

  const allGroups = stockData?.groups ?? []
  const currencies = [...new Set(allGroups.map(g => g.currency ?? 'USD'))]

  const getValByCurrency = (r, currency) => {
    try {
      const parsed = JSON.parse(r.data || '{}')
      if (parsed.groups) {
        if (overviewGroup) {
          const gid = Object.entries(parsed.group_names ?? {}).find(([, n]) => n === overviewGroup)?.[0]
                ?? Object.keys(parsed.groups).find(k => k === overviewGroup)
          const grp = gid ? parsed.groups[gid] : parsed.groups[overviewGroup]
          if (grp && grp.currency === currency) return grp.total ?? 0
          return null
        }
        return Object.values(parsed.groups).filter(g => (g.currency ?? 'USD') === currency).reduce((a, g) => a + (g.total ?? 0), 0)
      }
    } catch {}
    if (!overviewGroup) {
      if (currency === 'USD') return r.total_usd ?? 0
      if (currency === 'KRW') return r.total_krw ?? 0
    }
    return null
  }

  const fmtByCurrency = (val, currency) => {
    if (val == null) return '—'
    return currency === 'KRW' ? `₩${fmtKRW(val)}` : `$${fmtUSD(val)}`
  }

  const tableRows = [...histData]
    .sort((a, b) => b.snapshot_date.localeCompare(a.snapshot_date))
    .filter(r => !periodCutoff || r.snapshot_date >= periodCutoff)
  const totalPages = Math.ceil(tableRows.length / HIST_PAGE_SIZE)
  const pageRows = tableRows.slice(histPage * HIST_PAGE_SIZE, (histPage + 1) * HIST_PAGE_SIZE)

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

      {/* ① KPI 카드 4개 */}
      {renderKPICards()}

      <div className="stats-body">
        {!computed ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--ink3)' }}>{t(lang, 'statsLoading')}</div>
        ) : (
          <>
            {/* ② 그룹/종목 탭 + 통화 필터 */}
            {(() => {
              const hasMultiGroup = groupNames.length > 1
              const hasKRWGroup = (grpTotals ?? []).some(g => g.isKRW)
              const hasUSDGroup = (grpTotals ?? []).some(g => !g.isKRW)
              const hasMultiCurrency = hasKRWGroup && hasUSDGroup
              return (
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', padding: '0.7rem 1.2rem', borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
                  {hasMultiGroup && (
                    <>
                      <span style={{ fontSize: '0.78rem', color: 'var(--ink3)' }}>{t(lang, 'stock.filterByGroup')}:</span>
                      <select value={overviewGroup} onChange={e => setOverviewGroup(e.target.value)} style={selStyle}>
                        <option value="">{t(lang, 'stock.allGroups')}</option>
                        {groupNames.map((name, i) => <option key={i} value={name}>{name}</option>)}
                      </select>
                    </>
                  )}
                  {hasMultiCurrency && (
                    <>
                      <span style={{ fontSize: '0.78rem', color: 'var(--ink3)', marginLeft: hasMultiGroup ? '0.4rem' : 0 }}>{t(lang, 'stock.filterByCurrency')}:</span>
                      <select value={overviewCurrency} onChange={e => setOverviewCurrency(e.target.value)} style={selStyle}>
                        <option value="KRW">KRW (원화)</option>
                        <option value="USD">USD (달러)</option>
                      </select>
                    </>
                  )}
                </div>
              )
            })()}

            {/* ③ 전체 합계 요약 카드 */}
            {(() => {
              const filteredGroups = (grpTotals ?? []).filter(g => !overviewGroup || g.name?.toLowerCase() === overviewGroup.toLowerCase())
              const filteredKRW = filteredGroups.reduce((a, g) => a + (g.isKRW ? g.total : (fxRate ? g.total * fxRate : 0)), 0)
              return (
                <div className="stats-section">
                  <div className="stats-section-title">{t(lang, 'statsSummaryTitle')}</div>
                  <div className="stats-summary-grid">
                    {filteredGroups.map((g, i) => (
                      <div className="stats-summary-card" key={i}>
                        <div className="stats-summary-label">{g.name} ({g.currency})</div>
                        <div className="stats-summary-value">{g.currency === 'USD' ? ('$' + fmtUSD(g.total)) : ('₩' + fmtKRW(g.total))}</div>
                      </div>
                    ))}
                    {!overviewGroup && (grpTotals ?? []).some(g => !g.isKRW) && (grpTotals ?? []).some(g => g.isKRW) && (
                      <div className="stats-summary-card">
                        <div className="stats-summary-label">{t(lang, 'statsKRWEquiv')}{fxRate ? ` ($1=₩${fmtKRW(fxRate)})` : ` (${t(lang, 'statsFxNone')})`}</div>
                        <div className="stats-summary-value">₩{fmtKRW(filteredKRW)}</div>
                      </div>
                    )}
                  </div>
                  {/* CASH 잔고 섹션 */}
                  {(() => {
                    const cashGroups = (stockData?.groups ?? []).filter(g => {
                      if (overviewGroup) return cleanStr(g.name, g.id) === overviewGroup
                      return true
                    }).filter(g => (g.contributions || []).length > 0)
                    if (!cashGroups.length) return null
                    return (
                      <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--ink2)', letterSpacing: '0.08em' }}>CASH</div>
                        {cashGroups.map(g => {
                          const contributed = (g.contributions || []).reduce((a, c) => a + (c.amount || 0), 0)
                          const sym = g.currency === 'USD' ? '$' : '₩'
                          const fmt = v => g.currency === 'USD' ? fmtUSD(v) : fmtKRW(v)
                          return (
                            <div key={g.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.3rem', fontSize: '0.72rem', background: 'var(--card2)', borderRadius: 8, padding: '0.45rem 0.7rem' }}>
                              <div style={{ color: 'var(--ink3)' }}>{cleanStr(g.name, g.id)}<br /><span style={{ fontSize: '0.65rem' }}>{g.currency}</span></div>
                              <div style={{ color: 'var(--ink3)' }}>납입금<br /><span style={{ color: 'var(--ink)', fontWeight: 600 }}>{sym}{fmt(contributed)}</span></div>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })()}
                </div>
              )
            })()}

            {/* ③-b 납입금 바차트 */}
            {(() => {
              const hasContribs = (stockData?.groups ?? []).some(g => (g.contributions || []).some(c => c.amount > 0))
              if (!hasContribs) return null
              return (
                <div className="stats-section">
                  <div className="stats-section-title">기간별 납입금</div>
                  <div className="stats-chart-wrap"><canvas ref={contribBarRef} /></div>
                </div>
              )
            })()}

            {/* ④ 비중 파이차트 */}
            <div className="stats-section">
              <div className="stats-section-title">{t(lang, 'statsPieTitle')} {isStockUnit ? `— ${overviewGroup || groupNames[0]} 종목별` : '— 그룹별'}</div>
              {effectivePieItems.length > 0
                ? <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    <div style={{ flex: '0 0 calc(50% - 0.75rem)', minWidth: 0, display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', flex: '0 0 auto' }}>
                        {effectivePieItems.map((item, i) => {
                          const name = !item.isKRW && item.ticker && item.ticker !== 'undefined' ? item.ticker : (item.name ?? item.ticker ?? '')
                          return (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                              <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 3, background: colorForKey(name), flexShrink: 0 }} />
                              <span style={{ fontSize: '0.78rem', color: 'var(--ink)' }}>{name}</span>
                            </div>
                          )
                        })}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem' }}>
                        <div style={{ width: 180, height: 180, flexShrink: 0 }}><canvas ref={pieRef} /></div>
                      </div>
                    </div>
                    <div style={{ flex: '1 1 0', minWidth: 0 }}>
                      {(() => {
                        const total = effectivePieItems.reduce((a, b) => a + b.evalAmt, 0)
                        const fmt = v => effectivePieItems[0]?.isKRW ? '₩' + fmtKRW(v) : '$' + fmtUSD(v)
                        return (
                          <table style={{ width: '100%', fontSize: '0.75rem', borderCollapse: 'collapse' }}>
                            <thead>
                              <tr style={{ color: 'var(--ink3)', borderBottom: '1px solid var(--border)' }}>
                                <th style={{ textAlign: 'left', padding: '0.3rem 0.4rem', fontWeight: 500 }}>항목</th>
                                <th style={{ textAlign: 'right', padding: '0.3rem 0.4rem', fontWeight: 500 }}>평가금액</th>
                                <th style={{ textAlign: 'right', padding: '0.3rem 0.4rem', fontWeight: 500 }}>비중</th>
                              </tr>
                            </thead>
                            <tbody>
                              {effectivePieItems.map((item, i) => {
                                const name = !item.isKRW && item.ticker && item.ticker !== 'undefined' ? item.ticker : (item.name ?? item.ticker ?? '')
                                const pct = total > 0 ? (item.evalAmt / total * 100).toFixed(1) : '0.0'
                                return (
                                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                                    <td style={{ padding: '0.3rem 0.4rem', color: 'var(--ink)', fontWeight: 500 }}>{name}</td>
                                    <td style={{ padding: '0.3rem 0.4rem', textAlign: 'right', color: 'var(--ink)' }}>{fmt(item.evalAmt)}</td>
                                    <td style={{ padding: '0.3rem 0.4rem', textAlign: 'right', color: 'var(--ink3)' }}>{pct}%</td>
                                  </tr>
                                )
                              })}
                              <tr style={{ borderTop: '1.5px solid var(--border)', fontWeight: 700 }}>
                                <td style={{ padding: '0.3rem 0.4rem', color: 'var(--ink)' }}>합계</td>
                                <td style={{ padding: '0.3rem 0.4rem', textAlign: 'right', color: 'var(--ink)' }}>{fmt(total)}</td>
                                <td style={{ padding: '0.3rem 0.4rem', textAlign: 'right', color: 'var(--ink3)' }}>100%</td>
                              </tr>
                            </tbody>
                          </table>
                        )
                      })()}
                    </div>
                  </div>
                : <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--ink3)', fontSize: '0.85rem' }}>{t(lang, 'stock.noData')}</div>
              }
            </div>

            {/* ⑦ 집중도 섹션 */}
            {renderConcentration()}

            {/* 기간 선택 (전체 공유) */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0.7rem 1.2rem', borderBottom: '1px solid var(--border)' }}>
              <PeriodSelector
                value={overviewPeriod}
                onChange={setOverviewPeriod}
                customFrom={customFrom}
                customTo={customTo}
                onCustomChange={(f, t2) => { setCustomFrom(f); setCustomTo(t2) }}
              />
            </div>

            {/* 수익률 (%) 바차트 — 기간 연동: 현재 보유 전종목 표시 */}
            {stockEvalBreakdown.length > 0 && (() => {
              const hasPeriod = !!calcCutoff(overviewPeriod, customFrom)
              const tickerSet = overviewGroup ? new Set(computed?.groupTickers?.[overviewGroup] ?? []) : null
              const periodRows = hasPeriod
                ? (tickerSet ? periodPlData.filter(d => tickerSet.has(d.ticker)) : periodPlData)
                : []
              const overallRows = tickerSet ? stockEvalBreakdown.filter(s => tickerSet.has(s.ticker)) : stockEvalBreakdown
              return (
              <div className="stats-section">
                <div className="stats-section-title">
                  {t(lang, 'statsBarTitle')}
                  <span style={{ fontSize: '0.72rem', color: 'var(--ink3)', fontWeight: 400, marginLeft: '0.5rem' }}>
                    {hasPeriod ? `(기간 시작가 대비)` : `(평균단가 대비)`}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <div style={{ flex: '0 0 calc(50% - 0.75rem)', minWidth: 0 }}><div className="stats-chart-wrap"><canvas ref={barRef} /></div></div>
                  <div style={{ flex: '1 1 0', minWidth: 0 }}>
                    {hasPeriod ? (
                      <table style={{ width: '100%', fontSize: '0.75rem', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ color: 'var(--ink3)', borderBottom: '1px solid var(--border)' }}>
                            <th style={{ textAlign: 'left', padding: '0.3rem 0.4rem', fontWeight: 500 }}>종목</th>
                            <th style={{ textAlign: 'right', padding: '0.3rem 0.4rem', fontWeight: 500 }}>수량</th>
                            <th style={{ textAlign: 'right', padding: '0.3rem 0.4rem', fontWeight: 500 }}>시작가</th>
                            <th style={{ textAlign: 'right', padding: '0.3rem 0.4rem', fontWeight: 500 }}>현재가</th>
                            <th style={{ textAlign: 'right', padding: '0.3rem 0.4rem', fontWeight: 500 }}>기간손익</th>
                            <th style={{ textAlign: 'right', padding: '0.3rem 0.4rem', fontWeight: 500 }}>수익률</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...periodRows].sort((a, b) => b.pl_pct - a.pl_pct).map((d, i) => {
                            const fmt = v => d.currency === 'KRW' ? '₩' + fmtKRW(v) : '$' + fmtUSD(v)
                            const pos = d.pl_pct >= 0
                            return (
                              <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                                <td style={{ padding: '0.3rem 0.4rem', color: 'var(--ink)', fontWeight: 600 }}>{d.ticker}</td>
                                <td style={{ padding: '0.3rem 0.4rem', textAlign: 'right', color: 'var(--ink3)' }}>{d.qty % 1 === 0 ? d.qty : d.qty.toFixed(3)}</td>
                                <td style={{ padding: '0.3rem 0.4rem', textAlign: 'right', color: 'var(--ink3)' }}>{fmt(d.price_start)}</td>
                                <td style={{ padding: '0.3rem 0.4rem', textAlign: 'right', color: 'var(--ink)' }}>{fmt(d.price_now)}</td>
                                <td style={{ padding: '0.3rem 0.4rem', textAlign: 'right', color: pos ? '#16a34a' : '#dc2626', fontWeight: 600 }}>{pos ? '+' : ''}{fmt(d.pl)}</td>
                                <td style={{ padding: '0.3rem 0.4rem', textAlign: 'right', color: pos ? '#16a34a' : '#dc2626', fontWeight: 700 }}>{pos ? '+' : ''}{d.pl_pct.toFixed(1)}%</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    ) : (
                      <table style={{ width: '100%', fontSize: '0.75rem', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ color: 'var(--ink3)', borderBottom: '1px solid var(--border)' }}>
                            <th style={{ textAlign: 'left', padding: '0.3rem 0.4rem', fontWeight: 500 }}>종목</th>
                            <th style={{ textAlign: 'right', padding: '0.3rem 0.4rem', fontWeight: 500 }}>수량</th>
                            <th style={{ textAlign: 'right', padding: '0.3rem 0.4rem', fontWeight: 500 }}>평균단가</th>
                            <th style={{ textAlign: 'right', padding: '0.3rem 0.4rem', fontWeight: 500 }}>현재가</th>
                            <th style={{ textAlign: 'right', padding: '0.3rem 0.4rem', fontWeight: 500 }}>평가손익</th>
                            <th style={{ textAlign: 'right', padding: '0.3rem 0.4rem', fontWeight: 500 }}>손익률</th>
                          </tr>
                        </thead>
                        <tbody>
                          {overallRows.map((s, i) => {
                            const fmt = v => s.isKRW ? '₩' + fmtKRW(v) : '$' + fmtUSD(v)
                            const pos = s.evalPL >= 0
                            return (
                              <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                                <td style={{ padding: '0.3rem 0.4rem', color: 'var(--ink)', fontWeight: 600 }}>{s.ticker}</td>
                                <td style={{ padding: '0.3rem 0.4rem', textAlign: 'right', color: 'var(--ink3)' }}>{s.totalHQ % 1 === 0 ? s.totalHQ : s.totalHQ.toFixed(3)}</td>
                                <td style={{ padding: '0.3rem 0.4rem', textAlign: 'right', color: 'var(--ink3)' }}>{fmt(s.allAvg)}</td>
                                <td style={{ padding: '0.3rem 0.4rem', textAlign: 'right', color: 'var(--ink)' }}>{fmt(s.cur)}</td>
                                <td style={{ padding: '0.3rem 0.4rem', textAlign: 'right', color: pos ? '#16a34a' : '#dc2626', fontWeight: 600 }}>{pos ? '+' : ''}{fmt(s.evalPL)}</td>
                                <td style={{ padding: '0.3rem 0.4rem', textAlign: 'right', color: pos ? '#16a34a' : '#dc2626' }}>{pos ? '+' : ''}{s.pct.toFixed(1)}%</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              </div>
              )
            })()}

            {/* ⑤ 수익률% 바차트 */}
            <div className="stats-section">
              <div className="stats-section-title">{t(lang, 'statsReturnTitle')}</div>
              {returnRates.length > 0
                ? <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    <div style={{ flex: '0 0 calc(50% - 0.75rem)', minWidth: 0 }}><div className="stats-chart-wrap"><canvas ref={returnBarRef} /></div></div>
                    <div style={{ flex: '1 1 0', minWidth: 0 }}>
                      <table style={{ width: '100%', fontSize: '0.75rem', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ color: 'var(--ink3)', borderBottom: '1px solid var(--border)' }}>
                            <th style={{ textAlign: 'left', padding: '0.3rem 0.4rem', fontWeight: 500 }}>종목</th>
                            <th style={{ textAlign: 'right', padding: '0.3rem 0.4rem', fontWeight: 500 }}>{t(lang, 'statsReturnHoldQty')}</th>
                            <th style={{ textAlign: 'right', padding: '0.3rem 0.4rem', fontWeight: 500 }}>{t(lang, 'statsReturnAvgCost')}</th>
                            <th style={{ textAlign: 'right', padding: '0.3rem 0.4rem', fontWeight: 500 }}>{t(lang, 'statsReturnCurPrice')}</th>
                            <th style={{ textAlign: 'right', padding: '0.3rem 0.4rem', fontWeight: 500 }}>{t(lang, 'statsReturnRate')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {returnRates.map((s, i) => {
                            const fmt = v => s.isKRW ? '₩' + fmtKRW(v) : '$' + fmtUSD(v)
                            const pos = s.returnPct >= 0
                            return (
                              <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                                <td style={{ padding: '0.3rem 0.4rem', color: 'var(--ink)', fontWeight: 600 }}>{s.ticker || s.name}</td>
                                <td style={{ padding: '0.3rem 0.4rem', textAlign: 'right', color: 'var(--ink3)' }}>{s.holdQty % 1 === 0 ? s.holdQty : s.holdQty.toFixed(3)}</td>
                                <td style={{ padding: '0.3rem 0.4rem', textAlign: 'right', color: 'var(--ink3)' }}>{fmt(s.avgCost)}</td>
                                <td style={{ padding: '0.3rem 0.4rem', textAlign: 'right', color: 'var(--ink)' }}>{fmt(s.curPrice)}</td>
                                <td style={{ padding: '0.3rem 0.4rem', textAlign: 'right', color: pos ? '#16a34a' : '#dc2626', fontWeight: 700 }}>
                                  {pos ? '+' : ''}{s.returnPct.toFixed(2)}%
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                : <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--ink3)', fontSize: '0.85rem' }}>{t(lang, 'stock.noData')}</div>
              }
            </div>

            {/* 종목별 기간 시장손익 */}
            {calcCutoff(overviewPeriod, customFrom) && (
              <div className="stats-section">
                <div className="stats-section-title">{t(lang, 'statsPeriodPlTitle')}</div>
                {periodPlLoading
                  ? <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--ink3)', fontSize: '0.85rem' }}>{t(lang, 'statsPeriodPlLoading')}</div>
                  : periodPlData.length > 0
                    ? <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                        <div style={{ flex: '0 0 calc(50% - 0.75rem)', minWidth: 0 }}><div className="stats-chart-wrap"><canvas ref={plBarRef} /></div></div>
                        <div style={{ flex: '1 1 0', minWidth: 0 }}>
                          <table style={{ width: '100%', fontSize: '0.75rem', borderCollapse: 'collapse' }}>
                            <thead>
                              <tr style={{ color: 'var(--ink3)', borderBottom: '1px solid var(--border)' }}>
                                <th style={{ textAlign: 'left', padding: '0.3rem 0.4rem', fontWeight: 500 }}>종목</th>
                                <th style={{ textAlign: 'right', padding: '0.3rem 0.4rem', fontWeight: 500 }}>수량</th>
                                <th style={{ textAlign: 'right', padding: '0.3rem 0.4rem', fontWeight: 500 }}>시작가</th>
                                <th style={{ textAlign: 'right', padding: '0.3rem 0.4rem', fontWeight: 500 }}>현재가</th>
                                <th style={{ textAlign: 'right', padding: '0.3rem 0.4rem', fontWeight: 500 }}>기간손익</th>
                                <th style={{ textAlign: 'right', padding: '0.3rem 0.4rem', fontWeight: 500 }}>손익률</th>
                              </tr>
                            </thead>
                            <tbody>
                              {periodPlData.map((d, i) => {
                                const fmt = v => d.currency === 'KRW' ? '₩' + fmtKRW(v) : '$' + fmtUSD(v)
                                const pos = d.pl >= 0
                                return (
                                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                                    <td style={{ padding: '0.3rem 0.4rem', color: 'var(--ink)', fontWeight: 600 }}>{d.ticker}</td>
                                    <td style={{ padding: '0.3rem 0.4rem', textAlign: 'right', color: 'var(--ink3)' }}>{d.qty % 1 === 0 ? d.qty : d.qty.toFixed(3)}</td>
                                    <td style={{ padding: '0.3rem 0.4rem', textAlign: 'right', color: 'var(--ink3)' }}>{fmt(d.price_start)}</td>
                                    <td style={{ padding: '0.3rem 0.4rem', textAlign: 'right', color: 'var(--ink)' }}>{fmt(d.price_now)}</td>
                                    <td style={{ padding: '0.3rem 0.4rem', textAlign: 'right', color: pos ? '#16a34a' : '#dc2626', fontWeight: 600 }}>{pos ? '+' : ''}{fmt(d.pl)}</td>
                                    <td style={{ padding: '0.3rem 0.4rem', textAlign: 'right', color: pos ? '#16a34a' : '#dc2626' }}>{pos ? '+' : ''}{d.pl_pct.toFixed(1)}%</td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                          <div style={{ fontSize: '0.68rem', color: 'var(--ink3)', marginTop: '0.5rem', lineHeight: 1.5 }}>
                            (현재가 − 기간 시작일 종가) × 보유수량 &nbsp;|&nbsp; 시작일: {calcCutoff(overviewPeriod, customFrom)}
                          </div>
                        </div>
                      </div>
                    : <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--ink3)', fontSize: '0.85rem' }}>{t(lang, 'stock.noData')}</div>
                }
              </div>
            )}

            {/* ⑥ 포트폴리오 vs 벤치마크 */}
            <div className="stats-section">
              <div className="stats-section-title">{t(lang, 'statsBenchmarkTitle')}</div>
              {benchmarkLoading ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--ink3)' }}>{t(lang, 'statsBenchmarkLoading')}</div>
              ) : (benchmarkData && Object.keys(benchmarkData).length > 0) || histData.length > 0 ? (
                <>
                  <div className="stats-chart-wrap"><canvas ref={benchmarkRef} /></div>
                  {/* 기간 수익률 요약 테이블 */}
                  {(() => {
                    const cutoff = calcCutoff(overviewPeriod, customFrom)
                    const cutoffEnd = overviewPeriod === 'custom' && customTo ? customTo : null
                    const selGroup = overviewGroup ? (stockData?.groups ?? []).find(g => cleanStr(g.name, g.id) === overviewGroup) : null
                    const useKRW = selGroup ? selGroup.currency === 'KRW' : overviewCurrency === 'KRW'
                    const getValue = (r) => {
                      try {
                        const parsed = JSON.parse(r.data || '{}')
                        if (parsed.groups) {
                          if (overviewGroup) {
                            const gid = Object.entries(parsed.group_names ?? {}).find(([, n]) => n === overviewGroup)?.[0]
                            if (gid && parsed.groups[gid] != null) return parsed.groups[gid].total ?? 0
                            if (parsed.groups[overviewGroup] != null) return parsed.groups[overviewGroup].total ?? 0
                            return 0
                          }
                          if (useKRW) return Object.values(parsed.groups).filter(g => g.currency === 'KRW').reduce((a, g) => a + (g.total ?? 0), 0)
                          return Object.values(parsed.groups).filter(g => g.currency !== 'KRW').reduce((a, g) => a + (g.total ?? 0), 0)
                        }
                      } catch {}
                      return useKRW ? (r.total_krw ?? 0) : (r.total_usd ?? 0)
                    }
                    const filteredHist = [...histData]
                      .filter(r => (!cutoff || r.snapshot_date >= cutoff) && (!cutoffEnd || r.snapshot_date <= cutoffEnd))
                      .sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date))

                    // 전체 기간: 납입금(CASH contributions) 대비 현재 평가액
                    //   contributions 없으면 매수총액으로 폴백
                    // 특정 기간: 기간 시작 스냅샷 vs 기간 종료 스냅샷 비교
                    let portRet = null
                    if (!cutoff) {
                      const targetGroups = (stockData?.groups ?? []).filter(g => {
                        if (overviewGroup) return cleanStr(g.name, g.id) === overviewGroup
                        return useKRW ? g.currency === 'KRW' : g.currency !== 'KRW'
                      })
                      let totalContributed = 0, totalEval = 0, totalBuyCost = 0
                      for (const g of targetGroups) {
                        totalContributed += (g.contributions || []).reduce((a, c) => a + (c.amount || 0), 0)
                        for (const s of g.stocks || []) {
                          if (s.is_deleted) continue
                          const buys = (s.purchases || []).filter(p => (p.price || 0) > 0 && (p.qty || 0) > 0)
                          const sells = s.sells || []
                          const buyQty = buys.reduce((a, p) => a + p.qty, 0)
                          const sellQty = sells.reduce((a, p) => a + (p.qty || 0), 0)
                          const holdQty = Math.max(0, buyQty - sellQty)
                          if (holdQty <= 0) { totalBuyCost += buys.reduce((a, p) => a + p.price * p.qty, 0); continue }
                          // 현재가 없으면 평균단가로 폴백 (가격 누락 시 수익률 왜곡 방지)
                          const avgCost = buyQty > 0 ? buys.reduce((a, p) => a + p.price * p.qty, 0) / buyQty : 0
                          const cur = stockData?.priceMap?.[s.ticker]?.current_price ?? avgCost
                          if (cur > 0) totalEval += holdQty * cur
                          totalBuyCost += buys.reduce((a, p) => a + p.price * p.qty, 0)
                        }
                      }
                      const base = totalContributed > 0 ? totalContributed : totalBuyCost
                      if (base > 0 && totalEval > 0) portRet = (totalEval - base) / base * 100
                    } else {
                      const portStart = filteredHist.length ? getValue(filteredHist[0]) : null
                      const portEnd = filteredHist.length ? getValue(filteredHist[filteredHist.length - 1]) : null
                      if (portStart && portEnd && portStart > 0) {
                        // 기간 중 추가된 납입금을 차감해야 진짜 수익률이 나옴
                        const targetGroups = (stockData?.groups ?? []).filter(g => {
                          if (overviewGroup) return cleanStr(g.name, g.id) === overviewGroup
                          return useKRW ? g.currency === 'KRW' : g.currency !== 'KRW'
                        })
                        const periodContribs = targetGroups.reduce((sum, g) =>
                          sum + (g.contributions || [])
                            .filter(c => c.date && c.date >= cutoff)
                            .reduce((a, c) => a + (c.amount || 0), 0)
                        , 0)
                        const netGain = portEnd - portStart - periodContribs
                        portRet = netGain / (portStart + periodContribs) * 100
                      }
                    }

                    const rows = [{ name: t(lang, 'statsBenchmarkPortfolio'), ret: portRet }]
                    if (benchmarkData) {
                      Object.entries(benchmarkData).forEach(([ticker, d]) => {
                        if (d.normalized?.length >= 2) {
                          const ret = d.normalized[d.normalized.length - 1] - 100
                          rows.push({ name: ticker, ret })
                        }
                      })
                    }

                    return (
                      <table style={{ width: '100%', fontSize: '0.75rem', borderCollapse: 'collapse', marginTop: '0.75rem' }}>
                        <thead>
                          <tr style={{ color: 'var(--ink3)', borderBottom: '1px solid var(--border)' }}>
                            <th style={{ textAlign: 'left', padding: '0.3rem 0.4rem', fontWeight: 500 }}>종목</th>
                            <th style={{ textAlign: 'right', padding: '0.3rem 0.4rem', fontWeight: 500 }}>
                              {t(lang, 'statsBenchmarkReturn')}
                              <span style={{ fontSize: '0.65rem', color: 'var(--ink3)', marginLeft: '0.3rem', fontWeight: 400 }}>
                                {!cutoff ? '(원금대비)' : '(기간대비)'}
                              </span>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((r, i) => (
                            <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                              <td style={{ padding: '0.3rem 0.4rem', color: 'var(--ink)', fontWeight: i === 0 ? 700 : 500 }}>{r.name}</td>
                              <td style={{ padding: '0.3rem 0.4rem', textAlign: 'right', color: r.ret == null ? 'var(--ink3)' : r.ret >= 0 ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
                                {r.ret == null ? '—' : `${r.ret >= 0 ? '+' : ''}${r.ret.toFixed(2)}%`}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )
                  })()}
                </>
              ) : (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--ink3)' }}>{t(lang, 'statsBenchmarkNoData')}</div>
              )}
            </div>

            {/* 기간 필터 적용 차트들 */}
            {histData.length > 0 && (
              <div className="stats-section">
                {/* ⑧ 일별 자산 추이 */}
                {histData.length > 0 && (
                  <div>
                    <div className="stats-section-title">일별 자산 추이</div>
                    <div className="stats-chart-wrap"><canvas ref={histLineRef} /></div>
                  </div>
                )}
              </div>
            )}

            {/* ⑨ 실현 손익 내역 */}
            {renderRealizedPL()}

          </>
        )}

        {/* 배당금 내역 섹션 */}
        {dividendLoading ? (
          <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--ink3)', fontSize: '0.82rem' }}>배당 내역 로딩 중…</div>
        ) : dividendData.length > 0 && (() => {
          const cutoff    = calcCutoff(overviewPeriod, customFrom)
          const cutoffEnd = overviewPeriod === 'custom' && customTo ? customTo : null
          const filtered  = dividendData.filter(d =>
            (!cutoff || d.date >= cutoff) && (!cutoffEnd || d.date <= cutoffEnd)
          )
          if (!filtered.length) return null
          const byTicker  = {}
          filtered.forEach(d => { byTicker[d.ticker] = (byTicker[d.ticker] || 0) + d.amount })
          const total = filtered.reduce((a, d) => a + d.amount, 0)
          const sorted = Object.entries(byTicker).sort((a, b) => b[1] - a[1])
          return (
            <div className="stats-section">
              <div className="stats-section-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>배당금 내역</span>
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#16a34a' }}>합계 ${total.toFixed(2)}</span>
              </div>
              {/* 월별 누적 바차트 */}
              <div style={{ fontSize: '0.72rem', color: 'var(--ink3)', marginBottom: '0.3rem' }}>월별 배당금 (종목별)</div>
              <div className="stats-chart-wrap"><canvas ref={divBarRef} /></div>
              {/* 종목별 도넛 + 리스트 */}
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap', marginTop: '0.75rem' }}>
                <div style={{ flex: '0 0 180px' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--ink3)', marginBottom: '0.3rem' }}>종목별 비중</div>
                  <canvas ref={divPieRef} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--ink3)', marginBottom: '0.3rem' }}>종목별 합계</div>
                  <table style={{ width: '100%', fontSize: '0.75rem', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ color: 'var(--ink3)', borderBottom: '1px solid var(--border)' }}>
                        <th style={{ textAlign: 'left', padding: '0.25rem 0.4rem', fontWeight: 500 }}>종목</th>
                        <th style={{ textAlign: 'right', padding: '0.25rem 0.4rem', fontWeight: 500 }}>배당금</th>
                        <th style={{ textAlign: 'right', padding: '0.25rem 0.4rem', fontWeight: 500 }}>비중</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map(([tk, amt]) => (
                        <tr key={tk} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '0.25rem 0.4rem', fontWeight: 600 }}>{tk}</td>
                          <td style={{ padding: '0.25rem 0.4rem', textAlign: 'right', color: '#16a34a', fontWeight: 600 }}>${amt.toFixed(2)}</td>
                          <td style={{ padding: '0.25rem 0.4rem', textAlign: 'right', color: 'var(--ink3)' }}>{(amt / total * 100).toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )
        })()}

        {/* 일별 결산 테이블 */}
        {histLoading ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--ink3)' }}>{t(lang, 'statsLoading')}</div>
        ) : histData.length > 0 && (
          <div className="stats-section">
            <div className="stats-section-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
              <span>일별 결산</span>
              <button
                onClick={async () => {
                  if (!window.confirm('기존 히스토리를 모두 삭제하고 최초 매입일부터 재계산합니다.\n※ 최대 10년(3,650일)까지 계산 가능합니다.\n계속하시겠습니까?')) return
                  try {
                    const res = await apiFetch('/api/portfolio/backfill-full', { method: 'POST' })
                    alert(`재계산 완료: ${res.backfilled}일 생성\n최초 매입일: ${res.earliest_purchase_date || '없음'}`)
                    setHistData([])
                    setHistPage(0)
                    const d = await apiFetch('/api/portfolio/history?days=3650')
                    setHistData(Array.isArray(d) ? d : [])
                  } catch { alert('재계산 실패') }
                }}
                style={{ ...periodBtn(false), background: 'var(--accent)', color: '#fff', fontSize: '0.72rem' }}
              >전체 재계산</button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1.5px solid var(--border)', color: 'var(--ink3)', textAlign: 'right' }}>
                    <th style={{ textAlign: 'left', padding: '0.4rem 0.5rem', fontWeight: 600 }}>날짜</th>
                    {currencies.map(cur => <th key={cur} style={{ padding: '0.4rem 0.5rem', fontWeight: 600 }}>{cur}</th>)}
                    <th style={{ padding: '0.4rem 0.5rem', fontWeight: 600 }}>{t(lang, 'stock.savedBy')}</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map(r => (
                    <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '0.4rem 0.5rem', color: 'var(--ink)', fontWeight: 500 }}>{r.snapshot_date}</td>
                      {currencies.map(cur => (
                        <td key={cur} style={{ padding: '0.4rem 0.5rem', textAlign: 'right', color: 'var(--ink)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                          {fmtByCurrency(getValByCurrency(r, cur), cur)}
                        </td>
                      ))}
                      <td style={{ padding: '0.4rem 0.5rem', textAlign: 'center' }}>
                        <span style={{ display: 'inline-block', padding: '0.15rem 0.45rem', borderRadius: 4, fontSize: '0.7rem', fontWeight: 600, background: r.saved_by === 'backfill' ? 'rgba(37,99,235,0.12)' : 'rgba(22,163,74,0.12)', color: r.saved_by === 'backfill' ? '#2563eb' : '#16a34a' }}>
                          {r.saved_by ?? 'frontend'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center', marginTop: '0.75rem' }}>
                <button onClick={() => setHistPage(p => Math.max(0, p - 1))} disabled={histPage === 0} style={{ ...periodBtn(false), opacity: histPage === 0 ? 0.4 : 1 }}>←</button>
                <span style={{ fontSize: '0.8rem', color: 'var(--ink3)', alignSelf: 'center' }}>{histPage + 1} / {totalPages}</span>
                <button onClick={() => setHistPage(p => Math.min(totalPages - 1, p + 1))} disabled={histPage === totalPages - 1} style={{ ...periodBtn(false), opacity: histPage === totalPages - 1 ? 0.4 : 1 }}>→</button>
              </div>
            )}
          </div>
        )}
      </div>

    </div>
  )
}
