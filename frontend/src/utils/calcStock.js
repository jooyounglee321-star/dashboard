/** FIFO(선입선출) 원가 계산 — 매도 시 가장 먼저 매수한 주식부터 처분된 것으로 간주.
 * 증권사(Vanguard 등)의 기본 cost-basis 방식과 동일한 계산.
 * @returns { holdQty, avgCost, realizedPL } — avgCost는 현재 남은 보유분(lot)의 가중평균원가
 */
export function fifoCalc(purchases, sells) {
  const events = [
    ...(purchases || []).map(p => ({ ...p, kind: 'buy' })),
    ...(sells || []).map(s => ({ ...s, kind: 'sell' })),
  ].sort((a, b) => {
    const da = a.date || '', db = b.date || ''
    if (!da && !db) return 0
    if (!da) return -1
    if (!db) return 1
    if (da !== db) return da.localeCompare(db)
    return a.kind === 'buy' && b.kind === 'sell' ? -1 : (a.kind === 'sell' && b.kind === 'buy' ? 1 : 0)
  })

  const lots = [] // FIFO 큐: { qty, price }
  let realizedPL = 0

  for (const ev of events) {
    const qty = ev.qty || 0
    if (qty <= 0) continue
    if (ev.kind === 'buy') {
      lots.push({ qty, price: ev.price || 0 })
      continue
    }
    // sell: 큐 앞(가장 오래된 매수)부터 소진
    let remaining = qty
    const sellPrice = ev.price || 0
    while (remaining > 1e-9 && lots.length) {
      const lot = lots[0]
      const consume = Math.min(lot.qty, remaining)
      if (lot.price > 0) realizedPL += (sellPrice - lot.price) * consume
      lot.qty -= consume
      remaining -= consume
      if (lot.qty <= 1e-9) lots.shift()
    }
  }

  const holdQty = parseFloat(lots.reduce((a, l) => a + l.qty, 0).toFixed(8))
  const pricedLots = lots.filter(l => l.price > 0)
  const pricedQty = pricedLots.reduce((a, l) => a + l.qty, 0)
  const avgCost = pricedQty > 0 ? pricedLots.reduce((a, l) => a + l.qty * l.price, 0) / pricedQty : 0

  return { holdQty, avgCost, realizedPL }
}

export function calcStock(s, priceMap) {
  const today = new Date().toISOString().split('T')[0]
  const pp = s.purchases || []; const sl = s.sells || []
  const activePP = pp.filter(p => !p.date || p.date <= today)
  const activeSL = sl.filter(p => !p.date || p.date <= today)
  const totalSellQty = activeSL.reduce((a, p) => a + (p.qty || 0), 0)
  const { holdQty, avgCost, realizedPL } = fifoCalc(activePP, activeSL)
  const priceObj = priceMap[s.ticker]
  const hasPrice    = priceObj?.current_price != null
  const marketState = priceObj?.market_state || null  // 'REGULAR'|'PRE'|'POST'|'CLOSED'|null
  const isLive      = hasPrice && marketState === 'REGULAR'
  const cur      = hasPrice ? priceObj.current_price : (avgCost || 0)
  const chP      = priceObj?.change_percent ?? 0
  const val      = cur * holdQty
  const evalPL   = avgCost > 0 ? (cur - avgCost) * holdQty : null
  const evalPct  = avgCost > 0 ? ((cur - avgCost) / avgCost * 100) : null
  return { holdQty, avgCost, cur, chP, val, evalPL, evalPct, realizedPL, totalSellQty, isLive, hasPrice, marketState }
}
