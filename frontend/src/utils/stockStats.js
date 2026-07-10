/** 기간 키 → cutoff 날짜(YYYY-MM-DD) 또는 null(전체) */
export function calcCutoff(period, customFrom) {
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

/** "undefined" 문자열·null·"" 처리 — 첫 번째 유효한 값 반환 */
export const cleanStr = (...vals) =>
  vals.find(v => v && typeof v === 'string' && v !== 'undefined' && v.trim() !== '') ?? null

/**
 * 기간 필터가 적용된 파이차트/바차트/그룹합계 데이터 계산
 *
 * @param {object} stockData  { groups: [...], priceMap: {...} }
 * @param {string} period     '1m'|'3m'|'6m'|'ytd'|'1y'|'3y'|'custom'|'all'
 * @param {string|null} customFrom  period==='custom' 일 때 시작일
 * @param {string|null} customTo    period==='custom' 일 때 종료일
 * @returns {{ periodGrpTotals, periodStockValues, periodStockEvals }}
 */
export function computePeriodStats(stockData, period, customFrom = null, customTo = null) {
  if (!stockData) return { periodGrpTotals: [], periodStockValues: [], periodStockEvals: [] }

  const cutoff    = calcCutoff(period, customFrom)
  const cutoffEnd = period === 'custom' && customTo ? customTo : null
  const pm        = stockData.priceMap || {}
  const psv = [], pse = []

  const pgt = (stockData.groups ?? []).map(g => {
    const isKRW = g.currency === 'KRW'
    const sym   = isKRW ? '₩' : '$'
    let grpTotal = 0

    g.stocks.filter(s => !s.is_deleted).forEach(s => {
      // 전체 보유 수량 (기간 무관)
      const totalBQ = (s.purchases || []).reduce((a, p) => a + (p.qty || 0), 0)
      const sq      = (s.sells    || []).reduce((a, p) => a + (p.qty || 0), 0)
      const totalHQ = Math.max(0, totalBQ - sq)

      // 기간 내 매입 필터
      const pp = (s.purchases || []).filter(p =>
        (!cutoff    || !p.date || p.date >= cutoff) &&
        (!cutoffEnd || !p.date || p.date <= cutoffEnd)
      )
      const periodBQ = pp.reduce((a, p) => a + (p.qty || 0), 0)
      // 기간 매입 수량은 실제 보유 수량을 초과할 수 없음
      const periodHQ = Math.min(periodBQ, totalHQ)

      // 기간 내 매입 평균단가 (파이차트용)
      const validPP  = pp.filter(p => (p.price || 0) > 0 && (p.qty || 0) > 0)
      const ws       = validPP.reduce((a, p) => a + p.price * p.qty, 0)
      const vqt      = validPP.reduce((a, p) => a + p.qty, 0)
      const avg      = vqt > 0 ? ws / vqt : 0
      const cur      = pm[s.ticker]?.current_price ?? avg

      // 파이차트(psv): 기간 내 매입 평가금액
      const evalAmt = cur * periodHQ
      grpTotal += evalAmt
      if (periodHQ > 0) psv.push({
        ticker: s.ticker,
        name: cleanStr(s.name, s.ticker),
        evalAmt,
        groupName: cleanStr(g.name, g.id),
        currency: g.currency,
        isKRW,
      })

      // 바차트(pse): 전체 보유 기준 평가손익 — 기간 무관하게 현재 보유 종목 전체 표시
      const allValidPP = (s.purchases || []).filter(p => (p.price || 0) > 0 && (p.qty || 0) > 0)
      const allWS  = allValidPP.reduce((a, p) => a + p.price * p.qty, 0)
      const allVQT = allValidPP.reduce((a, p) => a + p.qty, 0)
      const allAvg = allVQT > 0 ? allWS / allVQT : 0
      const evalPL = allAvg > 0 && totalHQ > 0 ? (cur - allAvg) * totalHQ : null
      if (evalPL != null) pse.push({
        label: s.ticker,
        name: cleanStr(s.name, s.ticker),
        evalPL,
        sym,
        isKRW,
      })
    })

    return { id: g.id, name: cleanStr(g.name, g.id), currency: g.currency, total: grpTotal, isKRW }
  })

  return { periodGrpTotals: pgt, periodStockValues: psv, periodStockEvals: pse }
}

/**
 * 동적 단위 계산: 선택된 그룹에 따라 "그룹 단위" 또는 "종목 단위" 반환
 * @param {object} stockData  { groups: [...], priceMap: {...} }
 * @param {string} selectedGroup  '' = 전체, 그룹명 = 해당 그룹
 * @returns {{ units: Array<{name, evalAmt, isKRW, ticker?, currency}>, isStockUnit: boolean }}
 */
export function computeUnits(stockData, selectedGroup) {
  if (!stockData?.groups) return { units: [], isStockUnit: false }
  const { groups, priceMap = {} } = stockData
  const groupNames = groups.map(g => cleanStr(g.name, g.id))
  const isStockUnit = !!selectedGroup || groupNames.length === 1
  const activeGroup = selectedGroup || (groupNames.length === 1 ? groupNames[0] : '')

  if (isStockUnit) {
    const g = groups.find(gr => cleanStr(gr.name, gr.id) === activeGroup)
    if (!g) return { units: [], isStockUnit: true }
    const units = []
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
      const cur = priceMap[s.ticker]?.current_price ?? avg
      units.push({
        name: s.ticker || cleanStr(s.name, s.ticker) || '',
        ticker: s.ticker,
        evalAmt: cur * hq,
        isKRW: g.currency === 'KRW',
        currency: g.currency,
      })
    }
    return { units, isStockUnit: true }
  }

  // 그룹 단위
  const units = groups.map(g => {
    const isKRW = g.currency === 'KRW'
    let total = 0
    for (const s of g.stocks || []) {
      if (s.is_deleted) continue
      const pp = s.purchases || [], sl = s.sells || []
      const bq = pp.reduce((a, p) => a + (p.qty || 0), 0)
      const sq = sl.reduce((a, p) => a + (p.qty || 0), 0)
      const hq = Math.max(0, bq - sq)
      const valid = pp.filter(p => (p.price || 0) > 0 && (p.qty || 0) > 0)
      const ws = valid.reduce((a, p) => a + p.price * p.qty, 0)
      const vqt = valid.reduce((a, p) => a + p.qty, 0)
      const avg = vqt > 0 ? ws / vqt : 0
      const cur = priceMap[s.ticker]?.current_price ?? avg
      total += cur * hq
    }
    return {
      name: cleanStr(g.name, g.id) || '',
      evalAmt: total,
      isKRW,
      currency: g.currency,
    }
  }).filter(u => u.evalAmt > 0)
  return { units, isStockUnit: false }
}

/**
 * 수익률% 계산: 종목별 (현재가 - 평균단가) / 평균단가 × 100
 * @param {object} stockData
 * @param {string} selectedGroup
 * @returns {Array<{ticker, name, holdQty, avgCost, curPrice, returnPct, isKRW}>}
 */
export function computeReturnRates(stockData, selectedGroup, cutoff = null, cutoffEnd = null) {
  if (!stockData?.groups) return []
  const { groups, priceMap = {} } = stockData
  const groupNames = groups.map(g => cleanStr(g.name, g.id))
  const activeGroup = selectedGroup || (groupNames.length === 1 ? groupNames[0] : '')
  const targetGroups = activeGroup
    ? groups.filter(g => cleanStr(g.name, g.id) === activeGroup)
    : groups

  const result = []
  for (const g of targetGroups) {
    for (const s of g.stocks || []) {
      if (s.is_deleted) continue
      const allPp = s.purchases || [], sl = s.sells || []
      // 기간 필터: cutoff 설정 시 해당 기간 내 매수만 대상
      const pp = (cutoff || cutoffEnd)
        ? allPp.filter(p => (!cutoff || !p.date || p.date >= cutoff) && (!cutoffEnd || !p.date || p.date <= cutoffEnd))
        : allPp
      const bq = pp.reduce((a, p) => a + (p.qty || 0), 0)
      const sq = sl.reduce((a, p) => a + (p.qty || 0), 0)
      const hq = Math.max(0, bq - sq)
      if (hq <= 0) continue
      const valid = pp.filter(p => (p.price || 0) > 0 && (p.qty || 0) > 0)
      const ws = valid.reduce((a, p) => a + p.price * p.qty, 0)
      const vqt = valid.reduce((a, p) => a + p.qty, 0)
      const avgCost = vqt > 0 ? ws / vqt : 0
      if (avgCost <= 0) continue
      const curPrice = priceMap[s.ticker]?.current_price ?? avgCost
      const returnPct = (curPrice - avgCost) / avgCost * 100
      result.push({
        ticker: s.ticker,
        name: cleanStr(s.name, s.ticker) || s.ticker,
        holdQty: hq,
        avgCost,
        curPrice,
        returnPct,
        isKRW: g.currency === 'KRW',
        currency: g.currency,
      })
    }
  }
  return result.sort((a, b) => b.returnPct - a.returnPct)
}

/**
 * 집중도 계산: 각 단위의 비중%
 * @param {Array<{name, evalAmt, isKRW}>} units
 * @param {number|null} fxRate  KRW→USD 환산 (단위 혼재 시 USD 기준 통합)
 * @returns {Array<{name, pct, isKRW}>}
 */
export function computeConcentration(units, fxRate = null) {
  if (!units?.length) return []
  // USD 기준 통합
  const toUSD = (amt, isKRW) => (isKRW && fxRate ? amt / fxRate : amt)
  const total = units.reduce((a, u) => a + toUSD(u.evalAmt, u.isKRW), 0)
  if (!total) return []
  return units.map(u => ({
    name: u.name,
    pct: toUSD(u.evalAmt, u.isKRW) / total * 100,
    isKRW: u.isKRW,
  })).sort((a, b) => b.pct - a.pct)
}

/**
 * 실현 손익 계산 (프론트 측 폴백용)
 * @param {object} stockData
 * @returns {{ total: number, items: Array }}
 */
export function computeRealizedPL(stockData) {
  if (!stockData?.groups) return { total: 0, items: [] }
  const items = []
  let total = 0
  for (const g of stockData.groups) {
    for (const s of g.stocks || []) {
      const pp = s.purchases || [], sl = s.sells || []
      if (!sl.length) continue
      const valid = pp.filter(p => (p.price || 0) > 0 && (p.qty || 0) > 0)
      const ws = valid.reduce((a, p) => a + p.price * p.qty, 0)
      const vqt = valid.reduce((a, p) => a + p.qty, 0)
      const avgCost = vqt > 0 ? ws / vqt : 0
      if (avgCost <= 0) continue
      for (const sell of sl) {
        const qty = sell.qty || 0
        const price = sell.price || 0
        if (qty <= 0) continue
        const pl = (price - avgCost) * qty
        const plPct = (price - avgCost) / avgCost * 100
        total += pl
        items.push({
          ticker: s.ticker,
          group: cleanStr(g.name, g.id),
          date: sell.date || '',
          qty,
          sell_price: price,
          avg_cost: avgCost,
          pl,
          pl_pct: plPct,
          currency: g.currency,
        })
      }
    }
  }
  items.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  return { total, items }
}
