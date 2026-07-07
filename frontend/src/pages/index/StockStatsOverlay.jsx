import { useEffect, useRef, useMemo, useState } from 'react'
import { Chart, registerables } from 'chart.js'
import 'chartjs-adapter-date-fns'
import { t } from './i18n'
import { fmtKRW, fmtUSD, formatAuto, fmtKRWShort, fmtUSDShort, fmtShort } from '../../utils/format'
import { apiFetch } from '../../api'
import PeriodSelector from '../../components/PeriodSelector'
Chart.register(...registerables)

const CHART_COLORS = ['#2563eb','#16a34a','#f59e0b','#9333ea','#ef4444','#0891b2','#65a30d','#ec4899','#14b8a6','#f97316','#6366f1','#84cc16','#06b6d4','#a855f7','#e11d48']
// 종목명 기반 고정 색 (기간 변경해도 동일 색 유지)
function colorForKey(key) {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  return CHART_COLORS[h % CHART_COLORS.length]
}

/** 기간 키 → cutoff 날짜(YYYY-MM-DD) 또는 null(전체) */
function calcCutoff(period, customFrom) {
  const d = new Date()
  if (period === '1m')  return new Date(d.getFullYear(), d.getMonth() - 1, d.getDate()).toISOString().slice(0, 10)
  if (period === '3m')  return new Date(d.getFullYear(), d.getMonth() - 3, d.getDate()).toISOString().slice(0, 10)
  if (period === '6m')  return new Date(d.getFullYear(), d.getMonth() - 6, d.getDate()).toISOString().slice(0, 10)
  if (period === 'ytd') return `${d.getFullYear()}-01-01`
  if (period === '1y')  return new Date(d.getFullYear() - 1, d.getMonth(), d.getDate()).toISOString().slice(0, 10)
  if (period === '3y')  return new Date(d.getFullYear() - 3, d.getMonth(), d.getDate()).toISOString().slice(0, 10)
  if (period === 'custom') return customFrom || null
  return null
}

// "undefined" 문자열·JS undefined·null·"" 모두 처리 — 첫 번째 유효한 값 반환
const cleanStr = (...vals) => vals.find(v => v && typeof v === 'string' && v !== 'undefined' && v.trim() !== '') ?? null

// 차트 y축/tooltip용 축약 포맷터

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

  // 종목별 평가액 (파이차트 그룹 드릴다운 + 바차트용)
  const stockValues = []
  const stockEvals = []
  groups.forEach((g, gi) => {
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

  window.__debugStockData = {
    groups: groups.map(g => ({
      name: g.name,
      total: g.stocks?.length ?? 0,
      deleted: g.stocks?.filter(s => s.is_deleted).length ?? 0,
      active: g.stocks?.filter(s => !s.is_deleted).length ?? 0,
      stocks: g.stocks?.filter(s => !s.is_deleted).map(s => {
        const pp = s.purchases || []; const sl = s.sells || []
        const bq = pp.reduce((a,p)=>a+(p.qty||0),0)
        const sq = sl.reduce((a,p)=>a+(p.qty||0),0)
        const hq = Math.max(0, bq - sq)
        const validPP = pp.filter(p => (p.price||0)>0 && (p.qty||0)>0)
        const ws = validPP.reduce((a,p)=>a+p.price*p.qty,0)
        const vqt = validPP.reduce((a,p)=>a+p.qty,0)
        const avg = vqt > 0 ? ws/vqt : 0
        const livePrice = priceMap[s.ticker]?.current_price
        return { ticker: s.ticker, name: s.name, bq, sq, hq, avg, livePrice: livePrice ?? null, hasPriceData: livePrice != null }
      })
    })),
    grpTotals: grpTotals.length,
    stockValues: stockValues.map(s => ({ ticker: s.ticker, name: s.name, evalAmt: s.evalAmt })),
    priceMapTickers: Object.keys(priceMap)
  }

  // startDate부터 오늘까지 연속 날짜 생성
  const today = new Date().toISOString().slice(0, 10)
  const generateDateRange = (start, end) => {
    const dates = []
    const cur = new Date(start)
    const endDate = new Date(end)
    while (cur <= endDate) {
      dates.push(cur.toISOString().slice(0, 10))
      cur.setDate(cur.getDate() + 1)
    }
    return dates
  }

  const allPurchaseDates = []
  groups.forEach(g => {
    g.stocks.forEach(s => {
      ;(s.purchases || []).forEach(p => { if (p.date) allPurchaseDates.push(p.date) })
    })
  })
  const minPurchaseDate = allPurchaseDates.length ? allPurchaseDates.sort()[0] : null
  const startDate = minPurchaseDate ?? today

  const globalDates = generateDateRange(startDate, today)

  const lineDatasets = []
  groups.forEach((g, gi) => {
    const dailyMap = {}
    g.stocks.forEach(s => {
      ;(s.purchases || []).filter(p => !p.date || !startDate || p.date >= startDate).forEach(p => {
        const rawAmt = (p.qty || 0) * (p.price || 0)
        const amt = rawAmt  // 그룹 통화 그대로 유지 (USD→USD, KRW→KRW)
        const dateKey = p.date || startDate
        if (!dateKey) return
        dailyMap[dateKey] = (dailyMap[dateKey] ?? 0) + amt
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
      tension: 0.3,
      pointRadius: 3,
      currency: g.currency,
    })
  })

  // 그룹명 → ticker[] 맵
  const groupTickers = {}
  groups.forEach(g => { groupTickers[cleanStr(g.name, g.id)] = g.stocks.map(s => s.ticker) })

  return { grpTotals, grandUSD, grandKRW, totalKRW, stockValues, stockEvals, lineDatasets, fxRate, groupTickers }
}

export default function StockStatsOverlay({ isOpen, onClose, stockData, lang = 'ko' }) {
  const pieRef = useRef(null)
  const lineRef = useRef(null)
  const barRef = useRef(null)
  const chartsRef = useRef([])
  const histLineRef = useRef(null)
  const histChartRef = useRef(null)

  // 현황 탭 공통 필터
  const [overviewGroup, setOverviewGroup] = useState('')
  // 그룹 1개면 자동으로 해당 그룹 선택 (파이차트 종목별 드릴다운)
  useEffect(() => {
    if (!stockData?.groups) return
    const names = stockData.groups.map(g => cleanStr(g.name, g.id))
    if (names.length === 1) setOverviewGroup(names[0])
    else setOverviewGroup('')
  }, [stockData])
  const [overviewCurrency, setOverviewCurrency] = useState(() => {
    // USD 그룹만 있으면 USD 기본, 혼합이면 KRW
    const gs = stockData?.groups ?? []
    const hasKRW = gs.some(g => g.currency === 'KRW')
    const hasUSD = gs.some(g => g.currency !== 'KRW')
    return (!hasUSD && hasKRW) ? 'KRW' : 'USD'
  })
  const [overviewPeriod, setOverviewPeriod] = useState('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo,   setCustomTo]   = useState('')

  // 히스토리 탭 필터
  const mainTab = 'overview' // 탭 병합으로 항상 overview
  const [histData, setHistData] = useState([])
  const [histLoading, setHistLoading] = useState(false)
  const [histRange, setHistRange] = useState('all')
  const [histPage, setHistPage] = useState(0)
  const HIST_PAGE_SIZE = 20

  // group ID → 이름 매핑 (구형 스냅샷 폴백용)
  const histGroupNames = useMemo(
    () => Object.fromEntries((stockData?.groups ?? []).map(g => [g.id, cleanStr(g.name, g.id)])),
    [stockData]
  )

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const computed = useMemo(() => computeStockStats(stockData), [JSON.stringify(stockData)])

  // 기간 필터 적용 데이터 — 렌더 스코프에서 계산해 useEffect와 JSX(effectivePieItems)가 공유
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const { periodGrpTotals, periodStockValues, periodStockEvals } = useMemo(() => {
    if (!computed || !stockData) return { periodGrpTotals: [], periodStockValues: [], periodStockEvals: [] }
    const cutoff = calcCutoff(overviewPeriod, customFrom)
    const cutoffEnd = overviewPeriod === 'custom' && customTo ? customTo : null
    const pm = stockData.priceMap
    const psv = [], pse = []
    const pgt = (stockData.groups ?? []).map(g => {
      const isKRW = g.currency === 'KRW'
      const sym = isKRW ? '₩' : '$'
      let grpTotal = 0
      g.stocks.filter(s => !s.is_deleted).forEach(s => {
        // 파이차트(psv)용: 기간 내 매입만 포함
        const pp = (s.purchases || []).filter(p => (!cutoff || !p.date || p.date >= cutoff) && (!cutoffEnd || !p.date || p.date <= cutoffEnd))
        const bq = pp.reduce((a, p) => a + (p.qty || 0), 0)
        const sq = (s.sells || []).reduce((a, p) => a + (p.qty || 0), 0)
        const hq = Math.max(0, bq - sq)
        const validPP = pp.filter(p => (p.price || 0) > 0 && (p.qty || 0) > 0)
        const ws = validPP.reduce((a, p) => a + p.price * p.qty, 0)
        const vqt = validPP.reduce((a, p) => a + p.qty, 0)
        const avg = vqt > 0 ? ws / vqt : 0
        const cur = pm?.[s.ticker]?.current_price ?? avg
        const evalAmt = cur * hq
        grpTotal += evalAmt
        if (hq > 0) psv.push({ ticker: s.ticker, name: cleanStr(s.name, s.ticker), evalAmt, groupName: cleanStr(g.name, g.id), currency: g.currency, isKRW })
        // 바차트(pse) 평가손익: psv와 동일하게 기간 내 매입만 기준
        const periodPP = (s.purchases || []).filter(p => (!cutoff || !p.date || p.date >= cutoff) && (!cutoffEnd || !p.date || p.date <= cutoffEnd))
        const periodBQ = periodPP.reduce((a, p) => a + (p.qty || 0), 0)
        const periodSQ = (s.sells || []).reduce((a, p) => a + (p.qty || 0), 0)
        const periodHQ = Math.max(0, periodBQ - periodSQ)
        const validPeriodPP = periodPP.filter(p => (p.price || 0) > 0 && (p.qty || 0) > 0)
        const periodWS = validPeriodPP.reduce((a, p) => a + p.price * p.qty, 0)
        const periodVQT = validPeriodPP.reduce((a, p) => a + p.qty, 0)
        const periodAvg = periodVQT > 0 ? periodWS / periodVQT : 0
        const evalPL = periodAvg > 0 ? (cur - periodAvg) * periodHQ : null
        if (evalPL != null) pse.push({ label: s.ticker, name: cleanStr(s.name, s.ticker), evalPL, sym, isKRW })
      })
      return { id: g.id, name: cleanStr(g.name, g.id), currency: g.currency, total: grpTotal, isKRW }
    })
    return { periodGrpTotals: pgt, periodStockValues: psv, periodStockEvals: pse }
  }, [computed, overviewPeriod, customFrom, customTo]) // stockData 변경은 computed 경유로 감지

  // ── 파이차트 전용 useEffect (period와 무관하게 별도 렌더링) ──
  const pieChartRef = useRef(null)
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
        const displayName = s.isKRW
          ? safeName(cleanStr(s.name, s.ticker))
          : (s.ticker && s.ticker !== 'undefined' ? s.ticker : safeName(cleanStr(s.name, s.ticker)))
        return { name: displayName, val: Math.max(0, toDisplay(s.evalAmt, s.isKRW)) }
      }).filter(x => x.val > 0 && x.name !== '알 수 없음')
      const total = vals.reduce((a, x) => a + x.val, 0) || 1
      pieLabels = vals.map(x => `${x.name} (${(x.val / total * 100).toFixed(1)}%)`)
      pieData = vals.map(x => parseFloat(x.val.toFixed(2)))
      pieColors = vals.map(x => colorForKey(x.name))
    } else {
      const vals = (grpTotals ?? [])
        .map(g => ({ name: g.name, val: Math.max(0, toDisplay(g.total, g.isKRW)) }))
        .filter(x => x.val > 0)
      const total = vals.reduce((a, x) => a + x.val, 0) || 1
      pieLabels = vals.map(x => `${x.name} (${(x.val / total * 100).toFixed(1)}%)`)
      pieData = vals.map(x => parseFloat(x.val.toFixed(2)))
      pieColors = vals.map(x => colorForKey(x.name))
    }
    if (!pieLabels?.length) return

    pieChartRef.current = new Chart(pieRef.current, {
      type: 'doughnut',
      data: {
        labels: pieLabels,
        datasets: [{ data: pieData, backgroundColor: pieColors, borderWidth: 2, borderColor: '#fffef9' }],
      },
      options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { font: { size: 12 }, padding: 12, generateLabels: (chart) => { const def = Chart.defaults.plugins.legend.labels.generateLabels(chart); return def.filter(l => { const n = (l.text || '').split(' (')[0]; return n && n !== '알 수 없음' && n !== '(없음)' && n !== 'undefined' }).map(l => { if (l.text.length > 20) l.text = l.text.slice(0, 20) + '...'; return l }) } } } } },
    })
    return () => { if (pieChartRef.current) { pieChartRef.current.destroy(); pieChartRef.current = null } }
  }, [isOpen, computed, overviewGroup, overviewCurrency, lang])

  // 현황 탭 라인/바차트 렌더링 (period 포함)
  useEffect(() => {
    if (!isOpen || !computed) return

    chartsRef.current.forEach(c => c.destroy())
    chartsRef.current = []

    const { grpTotals, stockValues, stockEvals, lineDatasets, fxRate, groupTickers } = computed
    const cutoff = calcCutoff(overviewPeriod, customFrom)
    const cutoffEnd = overviewPeriod === 'custom' && customTo ? customTo : null

    // 통화 환산 헬퍼
    const toDisplay = (val, isKRW) => {
      if (overviewCurrency === 'USD' && isKRW && fxRate) return val / fxRate
      if (overviewCurrency === 'KRW' && !isKRW && fxRate) return val * fxRate
      return val
    }

    // ── 라인차트 ──
    if (lineRef.current) {
      let datasets = overviewGroup
        ? lineDatasets.filter(ds => ds.label === overviewGroup)
        : lineDatasets
      if (datasets.length > 0) {
        const inst = new Chart(lineRef.current, {
          type: 'line',
          data: { datasets },
          options: {
            responsive: true,
            scales: {
              x: {
                type: 'time',
                time: { unit: 'day', displayFormats: { day: 'yyyy-MM-dd' } },
                title: { display: false },
                ticks: { source: 'auto', maxTicksLimit: 10 },
                ...(cutoff ? { min: cutoff } : {}),
                ...(cutoffEnd ? { max: cutoffEnd } : {}),
              },
              y: {
                title: { display: true, text: t(lang, 'statsAxisInvest') },
                ticks: { callback: v => {
                  const ds = datasets[0]
                  const cur = ds?.currency ?? (overviewCurrency === 'USD' ? 'USD' : 'KRW')
                  return cur === 'USD' ? fmtUSDShort(v) : '₩' + fmtKRWShort(v)
                } },
              },
            },
            plugins: {
              legend: { position: 'bottom', labels: { generateLabels: (chart) => { const def = Chart.defaults.plugins.legend.labels.generateLabels(chart); def.forEach(l => { if (l.text && l.text.length > 20) l.text = l.text.slice(0, 20) + '...' }); return def } } },
              tooltip: {
                callbacks: {
                  label: ctx => {
                    const v = ctx.parsed.y
                    const ds = datasets[ctx.datasetIndex]
                    const cur = ds?.currency ?? (overviewCurrency === 'USD' ? 'USD' : 'KRW')
                    return cur === 'USD' ? fmtUSDShort(v) : '₩' + fmtKRWShort(v)
                  },
                },
              },
            },
          },
        })
        chartsRef.current.push(inst)
      }
    }

    // ── 바차트 ──
    if (barRef.current && periodStockEvals.length) {
      const tickerSet = overviewGroup ? new Set(groupTickers[overviewGroup] ?? []) : null
      const filtered = tickerSet ? periodStockEvals.filter(s => tickerSet.has(s.label)) : periodStockEvals
      if (filtered.length) {
        const converted = filtered.map(s => {
          if (overviewCurrency === 'KRW' && !s.isKRW && fxRate) return { ...s, evalPL: s.evalPL * fxRate, sym: '₩', isKRW: true }
          if (overviewCurrency === 'USD' && s.isKRW && fxRate) return { ...s, evalPL: s.evalPL / fxRate, sym: '$', isKRW: false }
          return s
        })
        const sorted = [...converted].sort((a, b) => b.evalPL - a.evalPL)
        const axisSymbol = overviewCurrency === 'KRW' ? '₩' : '$'
        const inst = new Chart(barRef.current, {
          type: 'bar',
          data: {
            labels: sorted.map(s => s.isKRW ? s.name : (s.label && s.label !== 'undefined' ? s.label : s.name)),
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
                ticks: {
                  callback: v => {
                    const fmt = fmtShort(Math.abs(v), overviewCurrency)
                    return v >= 0 ? `+${fmt}` : `-${fmt}`
                  },
                },
              },
            },
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: ctx => {
                    const s = sorted[ctx.dataIndex]
                    const fmt = fmtShort(Math.abs(s.evalPL), overviewCurrency)
                    return `${s.evalPL >= 0 ? '+' : '-'}${fmt}`
                  },
                },
              },
            },
          },
        })
        chartsRef.current.push(inst)
      }
    }

    return () => {
      chartsRef.current.forEach(c => c.destroy())
      chartsRef.current = []
    }
  }, [isOpen, computed, lang, overviewCurrency, overviewGroup, overviewPeriod, customFrom, customTo])

  // 히스토리 데이터 fetch
  useEffect(() => {
    if (!isOpen) return
    setHistLoading(true)
    apiFetch('/api/portfolio/history')
      .then(d => { setHistData(Array.isArray(d) ? d : []); setHistPage(0) })
      .catch(() => setHistData([]))
      .finally(() => setHistLoading(false))
  }, [isOpen])

  // 히스토리 라인차트
  useEffect(() => {
    if (!isOpen || histLoading || !histLineRef.current) return
    if (histChartRef.current) { histChartRef.current.destroy(); histChartRef.current = null }
    if (!histData.length) return

    const selGroup = overviewGroup ? (stockData?.groups ?? []).find(g => cleanStr(g.name, g.id) === overviewGroup) : null
    const useKRW = selGroup ? selGroup.currency === 'KRW' : overviewCurrency === 'KRW'
    const yLabel = useKRW ? '₩' : '$'
    const useUSD = !useKRW

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
          if (useKRW) {
            return Object.values(parsed.groups).filter(g => g.currency === 'KRW').reduce((a, g) => a + (g.total ?? 0), 0)
          }
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
          x: { type: 'category', title: { display: false }, ticks: { maxTicksLimit: 10 } },
          y: {
            title: { display: true, text: yLabel },
            ticks: { callback: v => useUSD ? fmtUSDShort(v) : '₩' + fmtKRWShort(v) },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => {
                const v = ctx.parsed.y
                return useUSD ? fmtUSDShort(v) : '₩' + fmtKRWShort(v)
              },
            },
          },
        },
      },
    })
    return () => { if (histChartRef.current) { histChartRef.current.destroy(); histChartRef.current = null } }
  }, [isOpen, histData, overviewPeriod, customFrom, customTo, histGroupNames, lang, overviewGroup, stockData])

  useEffect(() => {
    if (!isOpen) return
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  if (!isOpen) return null
  if (!stockData?.groups?.length) return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center'
    }} onClick={onClose}>
      <div style={{
        background: 'var(--card)', borderRadius: 16, padding: '2.5rem 3rem',
        textAlign: 'center', boxShadow: '0 8px 40px rgba(0,0,0,.3)'
      }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: '2.5rem', marginBottom: '0.8rem' }}>📊</div>
        <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--ink)', marginBottom: '0.4rem' }}>
          보유 종목이 없습니다
        </div>
        <div style={{ fontSize: '0.85rem', color: 'var(--ink3)', marginBottom: '1.5rem' }}>
          종목을 추가하면 통계를 확인할 수 있습니다
        </div>
        <button onClick={onClose} style={{
          padding: '0.5rem 1.5rem', background: 'var(--accent)', color: '#fff',
          border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: '0.85rem', fontFamily: 'inherit'
        }}>닫기</button>
      </div>
    </div>
  )

  const { grpTotals, grandUSD, grandKRW, totalKRW, stockEvals, lineDatasets, fxRate, groupTickers, stockValues } = computed || {}
  const groupNames = (stockData?.groups ?? []).map(g => cleanStr(g.name, g.id))

  // ── 필터 적용 후 유효 데이터 (JSX 조건부 렌더링 + useEffect 공유) ──
  const periodCutoff = calcCutoff(overviewPeriod, customFrom)
  const periodCutoffEnd = overviewPeriod === 'custom' && customTo ? customTo : null

  const effectiveLineDatasets = (() => {
    if (!lineDatasets) return []
    let ds = overviewGroup ? lineDatasets.filter(d => d.label === overviewGroup) : lineDatasets
    if (periodCutoff || periodCutoffEnd) {
      ds = ds.map(d => ({ ...d, data: d.data.filter(pt => (!periodCutoff || pt.x >= periodCutoff) && (!periodCutoffEnd || pt.x <= periodCutoffEnd)) })).filter(d => d.data.length > 0)
    }
    return ds
  })()

  const effectiveStockEvals = (() => {
    if (!overviewGroup) return periodStockEvals
    const tickers = new Set(groupTickers?.[overviewGroup] ?? [])
    return periodStockEvals.filter(s => tickers.has(s.label))
  })()

  const effectivePieItems = (() => {
    if (!computed) return []
    const { grpTotals, stockValues } = computed
    const effGroup = overviewGroup || (grpTotals.length === 1 ? grpTotals[0].name : '')
    if (effGroup) return stockValues.filter(s => s.groupName?.toLowerCase() === effGroup.toLowerCase())
    return grpTotals.filter(g => g.total > 0)
  })()

  // 공통 스타일
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
        {/* ══════════════ 현황 탭 ══════════════ */}
        {!computed ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--ink3)' }}>{t(lang, 'statsLoading')}</div>
        ) : (
          <>
            {/* ── 공통 필터 바 ── */}
            {(() => {
              // 그룹이 여러 개인 경우에만 그룹 드롭다운 표시
              const hasMultiGroup = groupNames.length > 1
              // KRW 그룹이 존재하는 경우에만 통화 드롭다운 표시
              const hasKRWGroup = (grpTotals ?? []).some(g => g.isKRW)
              const hasUSDGroup = (grpTotals ?? []).some(g => !g.isKRW)
              const hasMultiCurrency = hasKRWGroup && hasUSDGroup
              return (
                <div style={{
                  display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center',
                  padding: '0.7rem 1.2rem', borderBottom: '1px solid var(--border)',
                  background: 'var(--bg)',
                }}>
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

            {/* ── 전체 합계 요약 카드 ── */}
            {(() => {
              const filteredGroups = (grpTotals ?? []).filter(g => !overviewGroup || g.name?.toLowerCase() === overviewGroup.toLowerCase())
              const hasUSD = filteredGroups.some(g => !g.isKRW)
              // 총 원화환산: 원화그룹 + USD그룹*환율
              const filteredKRW = filteredGroups.reduce((a, g) => a + (g.isKRW ? g.total : (fxRate ? g.total * fxRate : 0)), 0)
              return (
                <div className="stats-section">
                  <div className="stats-section-title">{t(lang, 'statsSummaryTitle')}</div>
                  <div className="stats-summary-grid">
                    {filteredGroups.map((g, i) => (
                      <div className="stats-summary-card" key={i}>
                        <div className="stats-summary-label">{g.name} ({g.currency})</div>
                        <div className="stats-summary-value">
                          {g.currency === 'USD' ? ('$' + fmtUSD(g.total)) : ('₩' + fmtKRW(g.total))}
                        </div>
                      </div>
                    ))}
                    {/* 원화환산 카드: USD 그룹이 1개 이상 있고, 전체보기(overviewGroup='')일 때만 표시 */}
                    {!overviewGroup && (grpTotals ?? []).some(g => !g.isKRW) && (grpTotals ?? []).some(g => g.isKRW) && (
                      <div className="stats-summary-card">
                        <div className="stats-summary-label">
                          {t(lang, 'statsKRWEquiv')}{fxRate ? ` ($1=₩${fmtKRW(fxRate)})` : ` (${t(lang, 'statsFxNone')})`}
                        </div>
                        <div className="stats-summary-value">₩{fmtKRW(filteredKRW)}</div>
                      </div>
                    )}
                  </div>
                </div>
              )
            })()}

            {/* ── 파이차트 ── */}
            <div className="stats-section">
              <div className="stats-section-title">
                {t(lang, 'statsPieTitle')}
              </div>
              {effectivePieItems.length > 0
                ? <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
                    {/* 좌측 범례 */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', minWidth: 140, flex: '0 0 auto' }}>
                      {effectivePieItems.map((item, i) => {
                        const name = !item.isKRW && item.ticker && item.ticker !== 'undefined'
                          ? item.ticker
                          : (item.name ?? item.ticker ?? '')
                        const color = colorForKey(name)
                        return (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                            <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 3, background: color, flexShrink: 0 }} />
                            <span style={{ fontSize: '0.8rem', color: 'var(--ink)', lineHeight: 1.3 }}>{name}</span>
                          </div>
                        )
                      })}
                    </div>
                    {/* 우측 도넛 차트 */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem' }}>
                      <div style={{ width: 220, height: 220, flexShrink: 0 }}><canvas ref={pieRef} /></div>
                      {overviewGroup && (
                        <div style={{ fontSize: '0.82rem', color: 'var(--ink3)', fontWeight: 500 }}>{overviewGroup}</div>
                      )}
                    </div>
                  </div>
                : <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--ink3)', fontSize: '0.85rem' }}>{t(lang, 'stock.noData')}</div>
              }
            </div>

            {/* ── 세 차트 공유 기간 필터 그룹 ── */}
            {(lineDatasets?.length > 0 || periodStockEvals.length > 0 || histData.length > 0) && (
              <div className="stats-section">
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
                  <PeriodSelector
                    value={overviewPeriod}
                    onChange={setOverviewPeriod}
                    customFrom={customFrom}
                    customTo={customTo}
                    onCustomChange={(f, t2) => { setCustomFrom(f); setCustomTo(t2) }}
                  />
                </div>
                {/* 그룹별 누적 투자금액 추이 */}
                {lineDatasets?.length > 0 && (
                  <div style={{ marginBottom: '1.5rem' }}>
                    <div className="stats-section-title">{t(lang, 'statsLineTitle')}</div>
                    {effectiveLineDatasets.length > 0
                      ? <div className="stats-chart-wrap"><canvas ref={lineRef} /></div>
                      : <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--ink3)', fontSize: '0.85rem' }}>{t(lang, 'stock.noData')}</div>
                    }
                  </div>
                )}
                {/* 종목별 평가손익 */}
                {periodStockEvals.length > 0 && (
                  <div style={{ marginBottom: '1.5rem' }}>
                    <div className="stats-section-title">{t(lang, 'statsBarTitle')}</div>
                    {effectiveStockEvals.length > 0
                      ? <div className="stats-chart-wrap"><canvas ref={barRef} /></div>
                      : <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--ink3)', fontSize: '0.85rem' }}>{t(lang, 'stock.noData')}</div>
                    }
                  </div>
                )}
                {/* 일별 자산 추이 */}
                {histData.length > 0 && (
                  <div>
                    <div className="stats-section-title">일별 자산 추이</div>
                    <div className="stats-chart-wrap"><canvas ref={histLineRef} /></div>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {histLoading ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--ink3)' }}>{t(lang, 'statsLoading')}</div>
        ) : histData.length > 0 && (() => {
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
                return Object.values(parsed.groups)
                  .filter(g => (g.currency ?? 'USD') === currency)
                  .reduce((a, g) => a + (g.total ?? 0), 0)
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
            <>
              {/* 일별 결산 테이블 */}
              <div className="stats-section">
                <div className="stats-section-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
                  <span>일별 결산</span>
                  <button
                    onClick={async () => {
                      if (!window.confirm('기존 히스토리를 모두 삭제하고 최초 매입일부터 재계산합니다. 계속하시겠습니까?')) return
                      try {
                        const res = await apiFetch('/api/portfolio/backfill-full', { method: 'POST' })
                        alert(`재계산 완료: ${res.backfilled}일 생성\n최초 매입일: ${res.earliest_purchase_date || '없음'}`)

                        setHistData([])
                        setHistPage(0)
                        const d = await apiFetch('/api/portfolio/history')
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
                        {currencies.map(cur => (
                          <th key={cur} style={{ padding: '0.4rem 0.5rem', fontWeight: 600 }}>{cur}</th>
                        ))}
                        <th style={{ padding: '0.4rem 0.5rem', fontWeight: 600 }}>{t(lang, 'stock.savedBy')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.map(r => (
                        <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '0.4rem 0.5rem', color: 'var(--ink)', fontWeight: 500 }}>{r.snapshot_date}</td>
                          {currencies.map(cur => (
                            <td key={cur} style={{ padding: '0.4rem 0.5rem', textAlign: 'right', color: 'var(--ink)', fontWeight: 600 }}>
                              {fmtByCurrency(getValByCurrency(r, cur), cur)}
                            </td>
                          ))}
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
                {totalPages > 1 && (
                  <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center', marginTop: '0.75rem' }}>
                    <button onClick={() => setHistPage(p => Math.max(0, p - 1))} disabled={histPage === 0}
                      style={{ ...periodBtn(false), opacity: histPage === 0 ? 0.4 : 1 }}>←</button>
                    <span style={{ fontSize: '0.8rem', color: 'var(--ink3)', alignSelf: 'center' }}>{histPage + 1} / {totalPages}</span>
                    <button onClick={() => setHistPage(p => Math.min(totalPages - 1, p + 1))} disabled={histPage === totalPages - 1}
                      style={{ ...periodBtn(false), opacity: histPage === totalPages - 1 ? 0.4 : 1 }}>→</button>
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
