import { useEffect, useRef, useMemo, useState } from 'react'
import { Chart, registerables } from 'chart.js'
import 'chartjs-adapter-date-fns'
import { t } from './i18n'
import { fmtKRW, fmtUSD, formatAuto, fmtKRWShort, fmtUSDShort, fmtShort } from '../../utils/format'
import { apiFetch } from '../../api'
import PeriodSelector from '../../components/PeriodSelector'
Chart.register(...registerables)

const CHART_COLORS = ['#2563eb', '#16a34a', '#d97706', '#9333ea', '#dc2626', '#0891b2', '#65a30d', '#c026d3', '#ea580c', '#0d9488', '#7c3aed', '#b45309']
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
const cleanStr = (...vals) => vals.find(v => v && typeof v === 'string' && v !== 'undefined' && v.trim() !== '') ?? '알 수 없음'

// 차트 y축/tooltip용 축약 포맷터

function computeStockStats(stockData, userJoinDate) {
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
        return { ticker: s.ticker, name: s.name, bq, sq, hq }
      })
    })),
    grpTotals: grpTotals.length,
    stockValues: stockValues.map(s => ({ ticker: s.ticker, name: s.name, evalAmt: s.evalAmt }))
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
  const joinDate = userJoinDate ?? null
  const startDate = minPurchaseDate && joinDate
    ? (minPurchaseDate > joinDate ? minPurchaseDate : joinDate)
    : (joinDate ?? minPurchaseDate ?? today)

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
  const [userJoinDate, setUserJoinDate] = useState(null)
  const [histData, setHistData] = useState([])
  const [histLoading, setHistLoading] = useState(false)
  // histRange 제거 — overviewPeriod로 통합
  const [histPage, setHistPage] = useState(0)
  const [histGroupFilter, setHistGroupFilter] = useState('')
  const [histCurrencyFilter, setHistCurrencyFilter] = useState('')
  const HIST_PAGE_SIZE = 20

  // group ID → 이름 매핑 (구형 스냅샷 폴백용)
  const histGroupNames = useMemo(
    () => Object.fromEntries((stockData?.groups ?? []).map(g => [g.id, cleanStr(g.name, g.id)])),
    [stockData]
  )

  // 회원가입일 로드 (localStorage 우선 → /api/auth/me 폴백)
  useEffect(() => {
    if (!isOpen || userJoinDate) return
    try {
      const u = JSON.parse(localStorage.getItem('user') || '{}')
      if (u.created_at) { setUserJoinDate(u.created_at.slice(0, 10)); return }
    } catch {}
    apiFetch('/api/auth/me')
      .then(d => { if (d?.created_at) setUserJoinDate(d.created_at.slice(0, 10)) })
      .catch(() => {})
  }, [isOpen])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const computed = useMemo(() => computeStockStats(stockData, userJoinDate), [JSON.stringify(stockData), userJoinDate])

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
        const evalPL = avg > 0 ? (cur - avg) * hq : null
        if (evalPL != null) pse.push({ label: s.ticker, name: cleanStr(s.name, s.ticker), evalPL, sym, isKRW })
      })
      return { id: g.id, name: cleanStr(g.name, g.id), currency: g.currency, total: grpTotal, isKRW }
    })
    return { periodGrpTotals: pgt, periodStockValues: psv, periodStockEvals: pse }
  }, [computed, overviewPeriod, customFrom, customTo]) // stockData 변경은 computed 경유로 감지

  // 현황 탭 차트 렌더링
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

    // ── 파이차트 ──
    console.log('[PIE DEBUG] period:', overviewPeriod, 'group:', overviewGroup, 'stockValues count:', stockValues?.length, 'pieRef:', !!pieRef.current)
    if (pieRef.current) {
      Chart.getChart(pieRef.current)?.destroy()
      let pieLabels, pieData, pieColors = []
      const safeName = (n) => (!n || n === 'undefined' || String(n).trim() === '') ? '알 수 없음' : String(n)
      const effectiveGroup = overviewGroup || (periodGrpTotals.length === 1 ? periodGrpTotals[0].name : '')
      if (effectiveGroup) {
        // 선택 그룹(또는 단일 그룹) 내 종목별 비중
        const grpStocks = periodStockValues.filter(s => s.groupName?.toLowerCase() === effectiveGroup.toLowerCase())
        const vals = grpStocks.map(s => {
          const displayName = s.isKRW
            ? safeName(cleanStr(s.name, s.ticker))
            : (s.ticker && s.ticker !== 'undefined' ? s.ticker : safeName(cleanStr(s.name, s.ticker)))
          return { name: displayName, val: Math.max(0, toDisplay(s.evalAmt, s.isKRW)) }
        })
        const total = vals.reduce((a, x) => a + x.val, 0) || 1
        pieLabels = vals.map(x => `${x.name || 'Group'} (${(x.val / total * 100).toFixed(1)}%)`)
        pieData = vals.map(x => parseFloat(x.val.toFixed(2)))
        pieColors = vals.map(x => colorForKey(x.name))
      } else {
        // 그룹별 비중 (val=0인 그룹 제외)
        const vals = periodGrpTotals
          .map(g => ({ name: g.name, val: Math.max(0, toDisplay(g.total, g.isKRW)) }))
          .filter(x => x.val > 0)
        const total = vals.reduce((a, x) => a + x.val, 0) || 1
        pieLabels = vals.map(x => `${x.name} (${(x.val / total * 100).toFixed(1)}%)`)
        pieData = vals.map(x => parseFloat(x.val.toFixed(2)))
        pieColors = vals.map(x => colorForKey(x.name))
      }
      const inst = new Chart(pieRef.current, {
        type: 'doughnut',
        data: {
          labels: pieLabels,
          datasets: [{ data: pieData, backgroundColor: pieColors, borderWidth: 2, borderColor: '#fffef9' }],
        },
        options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: false } } },
      })
      chartsRef.current.push(inst)
    }

    // ── 라인차트 ──
    if (lineRef.current) {
      let datasets = overviewGroup
        ? lineDatasets.filter(ds => ds.label === overviewGroup)
        : lineDatasets
      if (cutoff || cutoffEnd) {
        datasets = datasets.map(ds => ({
          ...ds,
          data: ds.data.filter(pt => (!cutoff || pt.x >= cutoff) && (!cutoffEnd || pt.x <= cutoffEnd))
        })).filter(ds => ds.data.length > 0)
      }
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
                title: { display: true, text: t(lang, 'statsAxisDate') },
                ticks: { source: 'auto', maxTicksLimit: 10 },
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

    const getValue = (r) => {
      if (histGroupFilter) {
        try {
          const parsed = JSON.parse(r.data || '{}')
          if (parsed.groups) {
            // 신형: group ID 키
            const grp = parsed.groups[histGroupFilter]
            if (grp) return grp.currency === 'USD' ? grp.total * (r.usd_krw || 1) : grp.total
          }
          // 구형 폴백: 그룹명 키 dict 또는 배열
          const groupName = histGroupNames[histGroupFilter]
          if (groupName) {
            if (Array.isArray(parsed)) {
              const g = parsed.find(x => x.name?.toLowerCase() === groupName.toLowerCase())
              if (g) return g.currency === 'USD' ? (g.total ?? 0) * (r.usd_krw || 1) : (g.total ?? 0)
            } else {
              const leg = parsed[groupName] ?? parsed[groupName.toLowerCase()]
              if (leg != null) return typeof leg === 'object' ? (leg.currency === 'USD' ? leg.total * (r.usd_krw || 1) : leg.total) : leg
            }
          }
          return 0
        } catch { return 0 }
      }
      return r.total_usd ?? 0
    }

    const useUSD = true
    const yLabel = '$'

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
          x: { type: 'category', title: { display: true, text: t(lang, 'statsAxisDate') }, ticks: { maxTicksLimit: 10 } },
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
  }, [isOpen, histData, overviewPeriod, customFrom, customTo, histGroupFilter, histCurrencyFilter, histGroupNames, lang])

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
    const effGroup = overviewGroup || (periodGrpTotals.length === 1 ? periodGrpTotals[0].name : '')
    if (effGroup) return periodStockValues.filter(s => s.groupName?.toLowerCase() === effGroup.toLowerCase())
    return periodGrpTotals.filter(g => g.total > 0)
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

            {/* ── 라인차트 + 바차트 (좌우 배치) ── */}
            {(lineDatasets?.length > 0 || periodStockEvals.length > 0) && (
              <div className="stats-section">
                <div className="stats-section-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.4rem' }}>
                  <span>{t(lang, 'statsLineTitle')} / {t(lang, 'statsBarTitle')}</span>
                  <PeriodSelector
                    value={overviewPeriod}
                    onChange={setOverviewPeriod}
                    customFrom={customFrom}
                    customTo={customTo}
                    onCustomChange={(f, t2) => { setCustomFrom(f); setCustomTo(t2) }}
                  />
                </div>
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                  {lineDatasets?.length > 0 && (
                    <div style={{ flex: '1 1 300px', minWidth: 0 }}>
                      {effectiveLineDatasets.length > 0
                        ? <div className="stats-chart-wrap"><canvas ref={lineRef} /></div>
                        : <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--ink3)', fontSize: '0.85rem' }}>{t(lang, 'stock.noData')}</div>
                      }
                    </div>
                  )}
                  {periodStockEvals.length > 0 && (
                    <div style={{ flex: '1 1 300px', minWidth: 0 }}>
                      {effectiveStockEvals.length > 0
                        ? <div className="stats-chart-wrap"><canvas ref={barRef} /></div>
                        : <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--ink3)', fontSize: '0.85rem' }}>{t(lang, 'stock.noData')}</div>
                      }
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {/* ══════════════ 히스토리 ══════════════ */}
        <div style={{ borderTop: '2px solid var(--border)', margin: '1.5rem 0 0.5rem', padding: '1rem 0 0' }}>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--ink)', marginBottom: '0.5rem', paddingLeft: '0.2rem' }}>
            {t(lang, 'stock.historyTab')}
          </div>
        </div>
        {(() => {
          if (histLoading) return (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--ink3)' }}>{t(lang, 'statsLoading')}</div>
          )
          if (!histData.length) return (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--ink3)' }}>{t(lang, 'stock.noHistory')}</div>
          )

          const cutoff = calcCutoff(overviewPeriod, customFrom)
          const cutoffEnd = overviewPeriod === 'custom' && customTo ? customTo : null
          const filtered = [...histData]
            .filter(r => r.total_krw_equiv != null && (!cutoff || r.snapshot_date >= cutoff) && (!cutoffEnd || r.snapshot_date <= cutoffEnd))
            .sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date))

          const equivVals = filtered.map(r => r.total_krw_equiv)
          const maxVal = equivVals.length ? Math.max(...equivVals) : 0
          const minVal = equivVals.length ? Math.min(...equivVals) : 0
          const maxRow = filtered.find(r => r.total_krw_equiv === maxVal)
          const minRow = filtered.find(r => r.total_krw_equiv === minVal)
          const first = filtered[0]?.total_krw_equiv ?? 0
          const last = filtered[filtered.length - 1]?.total_krw_equiv ?? 0
          const periodReturn = first > 0 ? ((last - first) / first * 100) : null

          const tableRows = [...histData].sort((a, b) => b.snapshot_date.localeCompare(a.snapshot_date))
          const totalPages = Math.ceil(tableRows.length / HIST_PAGE_SIZE)
          const pageRows = tableRows.slice(histPage * HIST_PAGE_SIZE, (histPage + 1) * HIST_PAGE_SIZE)

          const histGroupOptions = (stockData?.groups ?? []).map(g => ({ id: g.id, name: cleanStr(g.name, g.id) }))

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

              {/* 날짜 범위 버튼 + 필터 + 라인차트 */}
              <div className="stats-section">
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <span style={{ fontSize: '0.78rem', color: 'var(--ink3)' }}>{t(lang, 'stock.filterByGroup')}:</span>
                  <select value={histGroupFilter} onChange={e => setHistGroupFilter(e.target.value)} style={selStyle}>
                    <option value="">{t(lang, 'stock.allGroups')}</option>
                    {histGroupOptions.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                  <span style={{ fontSize: '0.78rem', color: 'var(--ink3)', marginLeft: '0.3rem' }}>{t(lang, 'stock.filterByCurrency')}:</span>
                  <select
                    value={histCurrencyFilter}
                    onChange={e => setHistCurrencyFilter(e.target.value)}
                    disabled={!!histGroupFilter}
                    style={{ ...selStyle, opacity: histGroupFilter ? 0.45 : 1, cursor: histGroupFilter ? 'not-allowed' : 'pointer' }}
                  >
                    <option value="">{t(lang, 'stock.allCurrencies')}</option>
                    <option value="USD">USD</option>
                    <option value="KRW">KRW</option>
                  </select>
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
