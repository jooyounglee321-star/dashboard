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

      // 바차트(pse): 기간 내 매입 평균단가 기준 평가손익 (psv와 동일하게 periodHQ>0 필수)
      const evalPL = avg > 0 && periodHQ > 0 ? (cur - avg) * periodHQ : null
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
