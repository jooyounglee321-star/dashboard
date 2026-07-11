export function calcStock(s, priceMap) {
  const today = new Date().toISOString().split('T')[0]
  const pp = s.purchases || []; const sl = s.sells || []
  const activePP = pp.filter(p => !p.date || p.date <= today)
  const activeSL = sl.filter(p => !p.date || p.date <= today)
  const totalBuyQty  = activePP.reduce((a, p) => a + (p.qty || 0), 0)
  const totalSellQty = activeSL.reduce((a, p) => a + (p.qty || 0), 0)
  const holdQty  = Math.max(0, parseFloat((totalBuyQty - totalSellQty).toFixed(8)))
  const validPP  = activePP.filter(p => (p.price || 0) > 0 && (p.qty || 0) > 0)
  const ws       = validPP.reduce((a, p) => a + p.price * p.qty, 0)
  const vq       = validPP.reduce((a, p) => a + p.qty, 0)
  const avgCost  = vq > 0 ? ws / vq : 0
  const realizedPL = activeSL.reduce((a, p) => a + ((p.price || 0) - avgCost) * (p.qty || 0), 0)
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
