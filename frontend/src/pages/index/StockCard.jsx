const GRP_COLORS = [
  { bg: '#c8deff', tx: '#1a3d7c' }, { bg: '#c0edd8', tx: '#0d4a2a' },
  { bg: '#ffd5c0', tx: '#7a2a00' }, { bg: '#ddd0f5', tx: '#3a1870' },
  { bg: '#ffefc0', tx: '#6a4a00' }, { bg: '#c0e8f5', tx: '#0a3a50' },
  { bg: '#f5c0e0', tx: '#500a30' }, { bg: '#d0f0c0', tx: '#1a4a0a' },
  { bg: '#f0d0c0', tx: '#5a2a0a' }, { bg: '#c0c8f5', tx: '#1a1a6a' },
]

const TOTAL_MODE_KEY = 'stock_total_mode'

function fmtKRW(v) { return Math.round(v).toLocaleString('ko-KR') }
function fmtUSD(v) { return Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }

function calcStock(s, priceMap) {
  const pp = s.purchases || []; const sl = s.sells || []
  const totalBuyQty = pp.reduce((a, p) => a + (p.qty || 0), 0)
  const totalSellQty = sl.reduce((a, p) => a + (p.qty || 0), 0)
  const holdQty = Math.max(0, totalBuyQty - totalSellQty)
  const validPP = pp.filter(p => (p.price || 0) > 0 && (p.qty || 0) > 0)
  const ws = validPP.reduce((a, p) => a + p.price * p.qty, 0)
  const vq = validPP.reduce((a, p) => a + p.qty, 0)
  const avgCost = vq > 0 ? ws / vq : 0
  const realizedPL = sl.reduce((a, p) => a + ((p.price || 0) - avgCost) * (p.qty || 0), 0)
  const priceObj = priceMap[s.ticker]
  const isLive = priceObj?.current_price != null
  const cur = isLive ? priceObj.current_price : (avgCost || 0)
  const chP = priceObj?.change_percent ?? 0
  const val = cur * holdQty
  const evalPL = avgCost > 0 ? (cur - avgCost) * holdQty : null
  const evalPct = avgCost > 0 ? ((cur - avgCost) / avgCost * 100) : null
  return { holdQty, avgCost, cur, chP, val, evalPL, evalPct, realizedPL, totalSellQty, isLive }
}

export default function StockCard({ groups, priceMap, fxRate, loading, onOpenStats, isMobile = false }) {
  const totalMode = (() => { try { return localStorage.getItem(TOTAL_MODE_KEY) || 'KRW' } catch { return 'KRW' } })()
  const fxText = fxRate ? `$1 = ₩${fmtKRW(fxRate)}` : ''
  const rowS = { display: 'flex', justifyContent: 'space-between', alignItems: 'center' }
  const divS = { height: '0.5px', background: 'rgba(255,255,255,0.18)', margin: '0.2rem 0' }

  const hdr = isMobile ? 'm-card-header stock-card-clickable' : 'card-header'
  const titleCls = isMobile ? 'm-card-title' : 'card-title'
  const body = isMobile ? 'm-card-body' : 'card-body'
  const wrapper = isMobile ? 'm-card' : 'card card-stock stock-card-clickable'

  if (loading) {
    return (
      <div className={wrapper}>
        <div className={hdr} onClick={isMobile ? onOpenStats : undefined}>
          <span className="card-icon">📈</span>
          <span className={titleCls}>보유 주식</span>
          {isMobile && <span style={{ fontSize: '0.6rem', color: 'var(--ink3)', marginLeft: '0.25rem' }}>↗</span>}
          <span style={{ marginLeft: 'auto', fontSize: '0.68rem', color: 'var(--ink3)' }}>{fxText}</span>
        </div>
        <div className={body}>
          <div className="empty-msg">⏳ 시세 불러오는 중…</div>
        </div>
      </div>
    )
  }

  if (!groups.length || !groups.some(g => g.stocks?.length)) {
    return (
      <div className={wrapper}>
        <div className={!isMobile ? 'card-header' : hdr} onClick={isMobile ? onOpenStats : undefined}>
          <span className="card-icon">📈</span>
          <span className={titleCls}>보유 주식</span>
          {!isMobile && <span style={{ fontSize: '0.65rem', color: 'var(--ink3)', marginLeft: '0.3rem' }}>↗ 통계</span>}
          {isMobile && <span style={{ fontSize: '0.6rem', color: 'var(--ink3)', marginLeft: '0.25rem' }}>↗</span>}
          <span style={{ marginLeft: 'auto', fontSize: isMobile ? '0.65rem' : '0.68rem', color: 'var(--ink3)' }}>{fxText}</span>
        </div>
        <div className={body}>
          <div className="empty-msg">관리자에서 종목을 추가하세요</div>
        </div>
      </div>
    )
  }

  // Compute totals
  let grandUSD = 0, grandKRW = 0

  const groupViews = groups.filter(g => g.stocks?.length).map((g, gi) => {
    const col = GRP_COLORS[gi % GRP_COLORS.length]
    const isKRW = g.currency === 'KRW'
    const sym = isKRW ? '₩' : '$'
    const fmt = v => isKRW ? fmtKRW(v) : fmtUSD(v)
    let grpTotal = 0

    const stockRows = g.stocks.map(s => {
      const { holdQty, avgCost, cur, chP, val, evalPL, evalPct, realizedPL, totalSellQty, isLive } = calcStock(s, priceMap)
      grpTotal += val
      const cs = chP >= 0 ? 'up' : 'down'; const sg = chP >= 0 ? '▲' : '▼'
      const eps = evalPL != null ? (evalPL >= 0 ? 'up' : 'down') : ''
      const rps = realizedPL >= 0 ? 'up' : 'down'
      const liveBadge = isLive
        ? <span style={{ fontSize: '0.52rem', background: '#4a7c59', color: '#fff', padding: '0.05rem 0.38rem', borderRadius: 8, verticalAlign: 'middle', marginLeft: '0.25rem' }}>LIVE</span>
        : <span style={{ fontSize: '0.52rem', background: '#a89880', color: '#fff', padding: '0.05rem 0.38rem', borderRadius: 8, verticalAlign: 'middle', marginLeft: '0.25rem' }}>평균가</span>

      if (!isMobile) {
        return (
          <li key={s.ticker} className="stock-item">
            <div>
              <div className="stock-name">
                {s.name || s.ticker}
                <span style={{ fontSize: '0.65rem', color: 'var(--ink3)', marginLeft: 4 }}>{s.ticker}</span>
              </div>
              <div className="stock-qty">
                {holdQty.toLocaleString()}주{avgCost > 0 ? ` · 평균 ${sym}${fmt(avgCost)}` : ''}
              </div>
            </div>
            <div className="stock-right">
              <div className="stock-price">{sym}{fmt(cur)}{liveBadge}</div>
              <div className="stock-val">{sym}{fmt(val)}</div>
              {evalPL != null && (
                <div className={eps} style={{ fontSize: '0.62rem' }}>
                  평가손익 {evalPL >= 0 ? '+' : ''}{sym}{fmt(Math.abs(evalPL))} ({evalPct >= 0 ? '+' : ''}{evalPct.toFixed(2)}%)
                </div>
              )}
              {totalSellQty > 0 && (
                <div className={rps} style={{ fontSize: '0.62rem' }}>
                  실현손익 {realizedPL >= 0 ? '+' : ''}{sym}{fmt(Math.abs(realizedPL))}
                </div>
              )}
              <div className={cs} style={{ fontSize: '0.62rem' }}>전일比 {sg}{Math.abs(chP).toFixed(2)}%</div>
            </div>
          </li>
        )
      } else {
        const liveBadgeM = isLive
          ? <span style={{ fontSize: '0.5rem', background: '#4a7c59', color: '#fff', padding: '0.04rem 0.3rem', borderRadius: 6, marginLeft: '0.2rem' }}>LIVE</span>
          : <span style={{ fontSize: '0.5rem', background: '#a89880', color: '#fff', padding: '0.04rem 0.3rem', borderRadius: 6, marginLeft: '0.2rem' }}>평균가</span>
        return (
          <li key={s.ticker} className="m-stock-item">
            <div>
              <div className="m-stock-name">
                {s.name || s.ticker}
                <span style={{ fontSize: '0.6rem', color: 'var(--ink3)' }}> {s.ticker}</span>
              </div>
              <div className="m-stock-qty">
                {holdQty.toLocaleString()}주{avgCost > 0 ? ` · 평균 ${sym}${fmt(avgCost)}` : ''}
              </div>
              {evalPL != null && (
                <div className="m-stock-qty" style={{ fontSize: '0.65rem' }}>
                  <span className={eps}>평가손익 {evalPL >= 0 ? '+' : ''}{sym}{fmt(Math.abs(evalPL))} ({evalPct >= 0 ? '+' : ''}{evalPct.toFixed(1)}%)</span>
                </div>
              )}
              {totalSellQty > 0 && (
                <div className="m-stock-qty" style={{ fontSize: '0.65rem' }}>
                  <span className={rps}>실현손익 {realizedPL >= 0 ? '+' : ''}{sym}{fmt(Math.abs(realizedPL))}</span>
                </div>
              )}
            </div>
            <div>
              <div className="m-stock-price">{sym}{fmt(cur)}{liveBadgeM}</div>
              <div className="m-stock-val">
                <span className={cs}>{sg}{Math.abs(chP).toFixed(2)}%</span>
              </div>
            </div>
          </li>
        )
      }
    })

    if (isKRW) grandKRW += grpTotal; else grandUSD += grpTotal

    return { col, isKRW, sym, fmt, grpTotal, stockRows, name: g.name, currency: g.currency }
  })

  // Total bar
  const fxNote = fxRate ? ` (환율 ₩${fmtKRW(fxRate)}/$)` : ''
  let totalBar, mTotalBar

  if (totalMode === 'KRW') {
    const tot = grandKRW + (fxRate ? grandUSD * fxRate : 0)
    totalBar = (
      <div className="stock-total-bar">
        <span className="stock-total-label">전체 합계{fxNote}</span>
        <span className="stock-total-value">₩{fmtKRW(tot)}</span>
      </div>
    )
    mTotalBar = (
      <div className="m-total-bar">
        <span style={{ fontSize: '0.72rem', color: '#a89880' }}>전체 합계{fxNote}</span>
        <span style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--accent2)' }}>₩{fmtKRW(tot)}</span>
      </div>
    )
  } else if (totalMode === 'USD') {
    const tot = grandUSD + (fxRate ? grandKRW / fxRate : 0)
    totalBar = (
      <div className="stock-total-bar">
        <span className="stock-total-label">전체 합계{fxNote}</span>
        <span className="stock-total-value">${fmtUSD(tot)}</span>
      </div>
    )
    mTotalBar = (
      <div className="m-total-bar">
        <span style={{ fontSize: '0.72rem', color: '#a89880' }}>전체 합계{fxNote}</span>
        <span style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--accent2)' }}>${fmtUSD(tot)}</span>
      </div>
    )
  } else {
    const totKRW = grandKRW + (fxRate ? grandUSD * fxRate : 0)
    totalBar = (
      <div className="stock-total-bar" style={{ flexDirection: 'column', gap: '0.28rem', alignItems: 'stretch' }}>
        <div style={rowS}><span className="stock-total-label">$ USD 합계</span><span className="stock-total-value" style={{ fontSize: '0.82rem' }}>${fmtUSD(grandUSD)}</span></div>
        <div style={rowS}><span className="stock-total-label">₩ KRW 합계</span><span className="stock-total-value" style={{ fontSize: '0.82rem' }}>₩{fmtKRW(grandKRW)}</span></div>
        <div style={divS} />
        <div style={rowS}><span className="stock-total-label">원화환산 전체{fxNote}</span><span className="stock-total-value">₩{fmtKRW(totKRW)}</span></div>
      </div>
    )
    mTotalBar = (
      <div className="m-total-bar" style={{ flexDirection: 'column', gap: '0.25rem', alignItems: 'stretch' }}>
        <div style={rowS}><span style={{ fontSize: '0.72rem', color: '#a89880' }}>$ USD</span><span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--accent2)' }}>${fmtUSD(grandUSD)}</span></div>
        <div style={rowS}><span style={{ fontSize: '0.72rem', color: '#a89880' }}>₩ KRW</span><span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--accent2)' }}>₩{fmtKRW(grandKRW)}</span></div>
        <div style={divS} />
        <div style={rowS}><span style={{ fontSize: '0.72rem', color: '#a89880' }}>원화환산{fxNote}</span><span style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--accent2)' }}>₩{fmtKRW(totKRW)}</span></div>
      </div>
    )
  }

  return (
    <div className={wrapper}>
      {/* PC header is clickable for stats */}
      <div
        className={!isMobile ? 'card-header' : hdr}
        onClick={onOpenStats}
        title={!isMobile ? '클릭하면 통계 화면으로 이동' : undefined}
        style={{ cursor: 'pointer' }}
      >
        <span className="card-icon">📈</span>
        <span className={titleCls}>보유 주식</span>
        {!isMobile && <span style={{ fontSize: '0.65rem', color: 'var(--ink3)', marginLeft: '0.3rem' }}>↗ 통계</span>}
        {isMobile && <span style={{ fontSize: '0.6rem', color: 'var(--ink3)', marginLeft: '0.25rem' }}>↗</span>}
        <span style={{ marginLeft: 'auto', fontSize: isMobile ? '0.65rem' : '0.68rem', color: 'var(--ink3)', fontWeight: 400 }}>
          {fxText}
        </span>
      </div>
      <div className={body}>
        {!isMobile ? (
          <>
            {groupViews.map((gv, i) => (
              <div key={i}>
                <div className="stock-cat">
                  <div className="stock-cat-header" style={{ background: gv.col.bg, color: gv.col.tx }}>
                    <span className="stock-cat-name">
                      {gv.name}
                      <span style={{ fontSize: '0.62rem', opacity: 0.65 }}> ({gv.currency})</span>
                    </span>
                    <span className="stock-cat-sum">{gv.sym}{gv.fmt(gv.grpTotal)}</span>
                  </div>
                  <ul className="stock-list">{gv.stockRows}</ul>
                </div>
                {i < groupViews.length - 1 && <div className="stock-divider" />}
              </div>
            ))}
            {totalBar}
          </>
        ) : (
          <>
            {groupViews.map((gv, i) => (
              <div key={i} className="m-stock-cat">
                <div className="m-stock-cat-hd" style={{ background: gv.col.bg, color: gv.col.tx }}>
                  <span className="m-stock-cat-nm">{gv.name}</span>
                  <span className="m-stock-cat-sum">{gv.sym}{gv.fmt(gv.grpTotal)}</span>
                </div>
                <ul className="m-stock-list">{gv.stockRows}</ul>
              </div>
            ))}
            {mTotalBar}
          </>
        )}
      </div>
    </div>
  )
}
