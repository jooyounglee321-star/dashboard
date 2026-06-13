import { useState, useEffect, useMemo, memo, useRef } from 'react'
import { t } from './i18n'
import { calcStock } from '../../utils/calcStock'
import { fmtKRW, fmtUSD } from '../../utils/format'
import { apiFetch } from '../../api'

const GRP_COLORS = [
  { bg: '#c8deff', tx: '#1a3d7c' }, { bg: '#c0edd8', tx: '#0d4a2a' },
  { bg: '#ffd5c0', tx: '#7a2a00' }, { bg: '#ddd0f5', tx: '#3a1870' },
  { bg: '#ffefc0', tx: '#6a4a00' }, { bg: '#c0e8f5', tx: '#0a3a50' },
  { bg: '#f5c0e0', tx: '#500a30' }, { bg: '#d0f0c0', tx: '#1a4a0a' },
  { bg: '#f0d0c0', tx: '#5a2a0a' }, { bg: '#c0c8f5', tx: '#1a1a6a' },
]

const TOTAL_MODE_KEY = 'stock_total_mode'


function StockNewsRow({ newsConfig, lang, onOpenSettings }) {
  // status: 'ready' | 'loading' | 'ok' | 'err'
  const [status,   setStatus]   = useState('ready')
  const [newsList, setNewsList] = useState([]) // 항상 배열
  const cacheRef = useRef({}) // { [cacheKey]: { data, ts } }

  const query  = newsConfig?.query  || ''
  const source = newsConfig?.source || 'google'
  const nLang  = newsConfig?.lang   || 'ko'

  const base = {
    background: 'var(--bg2, #f9fafb)', borderRadius: 6,
    padding: '0.28rem 0.6rem', marginTop: '0.45rem',
    fontSize: '0.7rem', display: 'block',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    border: 'none', width: '100%', textAlign: 'left',
    fontFamily: 'inherit', textDecoration: 'none',
    boxSizing: 'border-box',
  }

  // news_config 없음 → 설정 유도
  if (!newsConfig || !query) {
    return (
      <button style={{ ...base, color: '#f59e0b', cursor: 'pointer' }}
        onClick={e => { e.stopPropagation(); onOpenSettings?.() }}
        onMouseEnter={e => e.currentTarget.style.color = '#d97706'}
        onMouseLeave={e => e.currentTarget.style.color = '#f59e0b'}
      >
        📰 {t(lang, 'stockNewsSetup')}
      </button>
    )
  }

  const NEWS_TTL = 5 * 60 * 1000 // 5분

  function fetchNews() {
    const cacheKey = `${query}|${source}|${nLang}`
    const cached = cacheRef.current[cacheKey]
    if (cached && Date.now() - cached.ts < NEWS_TTL) {
      setNewsList(cached.data)
      setStatus('ok')
      return
    }
    setStatus('loading')
    apiFetch(`/api/stocks/news?query=${encodeURIComponent(query)}&source=${source}&lang=${nLang}&count=5`)
      .then(data => {
        const list = Array.isArray(data) ? data : [data]
        cacheRef.current[cacheKey] = { data: list, ts: Date.now() }
        setNewsList(list)
        setStatus('ok')
      })
      .catch(() => setStatus('err'))
  }

  // 설정 완료 — 미로드 상태
  if (status === 'ready') {
    return (
      <button style={{ ...base, color: '#3b82f6', cursor: 'pointer' }}
        onClick={e => { e.stopPropagation(); fetchNews() }}
        onMouseEnter={e => e.currentTarget.style.color = '#1d4ed8'}
        onMouseLeave={e => e.currentTarget.style.color = '#3b82f6'}
      >
        📰 {t(lang, 'stockNewsPrompt')}
      </button>
    )
  }

  if (status === 'loading') {
    return <div style={{ ...base, color: 'var(--ink3)', cursor: 'default' }}>📰 {t(lang, 'stockNewsLoading')}</div>
  }

  if (status === 'err' || !newsList.length) {
    return (
      <button style={{ ...base, color: '#ef4444', cursor: 'pointer' }}
        onClick={e => { e.stopPropagation(); setStatus('ready'); setNewsList([]) }}
        onMouseEnter={e => e.currentTarget.style.color = '#b91c1c'}
        onMouseLeave={e => e.currentTarget.style.color = '#ef4444'}
      >
        📰 {t(lang, 'stockNewsError')}
      </button>
    )
  }

  // 뉴스 목록 표시 (최대 5개)
  return (
    <div style={{ marginTop: '0.45rem' }}>
      {newsList.map((item, idx) => (
        <a key={idx} href={item.url} target="_blank" rel="noreferrer"
          style={{ ...base, marginTop: idx === 0 ? 0 : '0.18rem', color: '#3b82f6', cursor: 'pointer' }}
          title={item.title}
          onMouseEnter={e => { e.currentTarget.style.color = '#1d4ed8'; e.currentTarget.style.textDecoration = 'underline' }}
          onMouseLeave={e => { e.currentTarget.style.color = '#3b82f6'; e.currentTarget.style.textDecoration = 'none' }}
        >
          📰 {item.title}{item.published ? ` (${item.published})` : ''}
        </a>
      ))}
    </div>
  )
}

const btnStyle = {
  fontSize: '0.65rem', color: 'var(--ink3)', marginLeft: '0.3rem',
  background: 'none', border: 'none', cursor: 'pointer', padding: 0,
  fontFamily: 'inherit', textDecoration: 'none',
}

function StockCard({ groups, priceMap, fxRate, loading, onOpenStats, onOpenSettings, isMobile = false, currencyDisplay, lang = 'ko' }) {
  const totalMode = currencyDisplay ?? (() => { try { return localStorage.getItem(TOTAL_MODE_KEY) || 'KRW' } catch { return 'KRW' } })()

  const stockCalcMap = useMemo(() => {
    const map = new Map()
    groups.forEach(g => { g.stocks?.forEach(s => { map.set(s, calcStock(s, priceMap)) }) })
    return map
  }, [groups, priceMap])
  const fxText = fxRate ? `$1 = ₩${fmtKRW(fxRate)}` : ''
  const fxNote = fxRate ? ` (${t(lang, 'stockFxLabel')} ₩${fmtKRW(fxRate)}/$)` : ''
  const rowS = { display: 'flex', justifyContent: 'space-between', alignItems: 'center' }
  const divS = { height: '0.5px', background: 'rgba(255,255,255,0.18)', margin: '0.2rem 0' }

  const hdr = isMobile ? 'm-card-header' : 'card-header'
  const titleCls = isMobile ? 'm-card-title' : 'card-title'
  const body = isMobile ? 'm-card-body' : 'card-body'
  const wrapper = isMobile ? 'm-card' : 'card card-stock'

  if (loading) {
    return (
      <div className={wrapper}>
        <div className={isMobile ? 'm-card-header' : 'card-header'}>
          <span className="card-icon">📈</span>
          <span className={titleCls}>{t(lang, 'stockTitle')}</span>
          <button style={btnStyle} onClick={onOpenStats}>{t(lang, 'stock.statsLink')}</button>
          <button style={{ ...btnStyle, marginLeft: '0.4rem' }} onClick={onOpenSettings}>{t(lang, 'stock.settings')}</button>
          <span style={{ marginLeft: 'auto', fontSize: '0.68rem', color: 'var(--ink3)' }}>{fxText}</span>
        </div>
        <div className={body}>
          <div className="empty-msg">{t(lang, 'stockLoading')}</div>
        </div>
      </div>
    )
  }

  if (!groups.length || !groups.some(g => g.stocks?.length)) {
    return (
      <div className={wrapper}>
        <div className={isMobile ? 'm-card-header' : 'card-header'}>
          <span className="card-icon">📈</span>
          <span className={titleCls}>{t(lang, 'stockTitle')}</span>
          <button style={btnStyle} onClick={onOpenStats}>{t(lang, 'stock.statsLink')}</button>
          <button style={{ ...btnStyle, marginLeft: '0.4rem' }} onClick={onOpenSettings}>{t(lang, 'stock.settings')}</button>
          <span style={{ marginLeft: 'auto', fontSize: isMobile ? '0.65rem' : '0.68rem', color: 'var(--ink3)' }}>{fxText}</span>
        </div>
        <div className={body}>
          <div className="empty-msg">{t(lang, 'stockEmpty')}</div>
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
      const { holdQty, avgCost, cur, chP, val, evalPL, evalPct, realizedPL, totalSellQty, isLive } = stockCalcMap.get(s) ?? calcStock(s, priceMap)
      grpTotal += val
      const cs = chP >= 0 ? 'up' : 'down'; const sg = chP >= 0 ? '▲' : '▼'
      const eps = evalPL != null ? (evalPL >= 0 ? 'up' : 'down') : ''
      const rps = realizedPL >= 0 ? 'up' : 'down'
      const liveBadge = isLive
        ? <span style={{ fontSize: '0.52rem', background: '#4a7c59', color: '#fff', padding: '0.05rem 0.38rem', borderRadius: 8, verticalAlign: 'middle', marginLeft: '0.25rem' }}>LIVE</span>
        : <span style={{ fontSize: '0.52rem', background: '#a89880', color: '#fff', padding: '0.05rem 0.38rem', borderRadius: 8, verticalAlign: 'middle', marginLeft: '0.25rem' }}>{t(lang, 'stockAvgBadge')}</span>

      if (!isMobile) {
        const upColor = 'var(--up, #16a34a)'
        const downColor = 'var(--down, #dc2626)'
        const evalColor = evalPL == null ? undefined : evalPL >= 0 ? upColor : downColor
        const chColor = chP >= 0 ? upColor : downColor
        return (
          <li key={s.ticker} className="stock-item" style={{
            display: 'block', padding: '0.6rem 0.75rem',
            borderBottom: '1px solid var(--border, #e5e7eb)',
            borderRadius: 8,
            transition: 'background 0.12s',
          }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg2, #f9fafb)'}
            onMouseLeave={e => e.currentTarget.style.background = ''}
          >
            {/* 2열 */}
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
              {/* 좌측 */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontWeight: 500, fontSize: '0.85rem', color: 'var(--ink)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160,
                }} title={s.name || s.ticker}>
                  {s.name || s.ticker}
                </div>
                <div style={{ fontSize: '0.68rem', color: 'var(--ink3)', marginTop: '0.1rem' }}>
                  {s.ticker}
                </div>
                <div style={{ fontSize: '0.68rem', color: 'var(--ink3)', marginTop: '0.1rem' }}>
                  {holdQty.toLocaleString()}{t(lang, 'stockHoldSuffix')}{avgCost > 0 ? ` · ${t(lang, 'stockAvg')} ${sym}${fmt(avgCost)}` : ''}
                </div>
              </div>
              {/* 우측 */}
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{sym}{fmt(cur)}{liveBadge}</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--ink2)', marginTop: '0.1rem' }}>{sym}{fmt(val)}</div>
                {evalPL != null && (
                  <div style={{ fontSize: '0.68rem', color: evalColor, marginTop: '0.1rem' }}>
                    {evalPL >= 0 ? '+' : ''}{sym}{fmt(Math.abs(evalPL))} ({evalPct >= 0 ? '+' : ''}{evalPct.toFixed(2)}%)
                  </div>
                )}
                <div style={{ fontSize: '0.68rem', color: chColor, marginTop: '0.1rem' }}>
                  {sg}{Math.abs(chP).toFixed(2)}%
                </div>
              </div>
            </div>
            <StockNewsRow newsConfig={s.news_config} lang={lang} onOpenSettings={onOpenSettings} />
          </li>
        )
      } else {
        const liveBadgeM = isLive
          ? <span style={{ fontSize: '0.5rem', background: '#4a7c59', color: '#fff', padding: '0.04rem 0.3rem', borderRadius: 6, marginLeft: '0.2rem' }}>LIVE</span>
          : <span style={{ fontSize: '0.5rem', background: '#a89880', color: '#fff', padding: '0.04rem 0.3rem', borderRadius: 6, marginLeft: '0.2rem' }}>{t(lang, 'stockAvgBadge')}</span>
        return (
          <li key={s.ticker} className="m-stock-item">
            <div>
              <div className="m-stock-name">
                {s.name || s.ticker}
                <span style={{ fontSize: '0.6rem', color: 'var(--ink3)' }}> {s.ticker}</span>
              </div>
              <div className="m-stock-qty">
                {holdQty.toLocaleString()}{t(lang, 'stockHoldSuffix')}{avgCost > 0 ? ` · ${t(lang, 'stockAvg')} ${sym}${fmt(avgCost)}` : ''}
              </div>
              {evalPL != null && (
                <div className="m-stock-qty" style={{ fontSize: '0.65rem' }}>
                  <span className={eps}>{t(lang, 'stockEvalPL')} {evalPL >= 0 ? '+' : ''}{sym}{fmt(Math.abs(evalPL))} ({evalPct >= 0 ? '+' : ''}{evalPct.toFixed(1)}%)</span>
                </div>
              )}
              {totalSellQty > 0 && (
                <div className="m-stock-qty" style={{ fontSize: '0.65rem' }}>
                  <span className={rps}>{t(lang, 'stockRealPL')} {realizedPL >= 0 ? '+' : ''}{sym}{fmt(Math.abs(realizedPL))}</span>
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
  let totalBar, mTotalBar

  if (totalMode === 'KRW') {
    const tot = grandKRW + (fxRate ? grandUSD * fxRate : 0)
    totalBar = (
      <div className="stock-total-bar">
        <span className="stock-total-label">{t(lang, 'stockTotalLabel')}{fxNote}</span>
        <span className="stock-total-value">₩{fmtKRW(tot)}</span>
      </div>
    )
    mTotalBar = (
      <div className="m-total-bar">
        <span style={{ fontSize: '0.72rem', color: '#a89880' }}>{t(lang, 'stockTotalLabel')}{fxNote}</span>
        <span style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--accent2)' }}>₩{fmtKRW(tot)}</span>
      </div>
    )
  } else if (totalMode === 'USD') {
    const tot = grandUSD + (fxRate ? grandKRW / fxRate : 0)
    totalBar = (
      <div className="stock-total-bar">
        <span className="stock-total-label">{t(lang, 'stockTotalLabel')}{fxNote}</span>
        <span className="stock-total-value">${fmtUSD(tot)}</span>
      </div>
    )
    mTotalBar = (
      <div className="m-total-bar">
        <span style={{ fontSize: '0.72rem', color: '#a89880' }}>{t(lang, 'stockTotalLabel')}{fxNote}</span>
        <span style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--accent2)' }}>${fmtUSD(tot)}</span>
      </div>
    )
  } else {
    const totKRW = grandKRW + (fxRate ? grandUSD * fxRate : 0)
    totalBar = (
      <div className="stock-total-bar" style={{ flexDirection: 'column', gap: '0.28rem', alignItems: 'stretch' }}>
        <div style={rowS}><span className="stock-total-label">{t(lang, 'stockUSDSum')}</span><span className="stock-total-value" style={{ fontSize: '0.82rem' }}>${fmtUSD(grandUSD)}</span></div>
        <div style={rowS}><span className="stock-total-label">{t(lang, 'stockKRWSum')}</span><span className="stock-total-value" style={{ fontSize: '0.82rem' }}>₩{fmtKRW(grandKRW)}</span></div>
        <div style={divS} />
        <div style={rowS}><span className="stock-total-label">{t(lang, 'stockKRWEquiv')}{fxNote}</span><span className="stock-total-value">₩{fmtKRW(totKRW)}</span></div>
      </div>
    )
    mTotalBar = (
      <div className="m-total-bar" style={{ flexDirection: 'column', gap: '0.25rem', alignItems: 'stretch' }}>
        <div style={rowS}><span style={{ fontSize: '0.72rem', color: '#a89880' }}>{t(lang, 'stockUSDSum')}</span><span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--accent2)' }}>${fmtUSD(grandUSD)}</span></div>
        <div style={rowS}><span style={{ fontSize: '0.72rem', color: '#a89880' }}>{t(lang, 'stockKRWSum')}</span><span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--accent2)' }}>₩{fmtKRW(grandKRW)}</span></div>
        <div style={divS} />
        <div style={rowS}><span style={{ fontSize: '0.72rem', color: '#a89880' }}>{t(lang, 'stockKRWEquivShort')}{fxNote}</span><span style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--accent2)' }}>₩{fmtKRW(totKRW)}</span></div>
      </div>
    )
  }

  return (
    <div className={wrapper}>
      {/* PC header is clickable for stats */}
      <div className={isMobile ? 'm-card-header' : 'card-header'}>
        <span className="card-icon">📈</span>
        <span className={titleCls}>{t(lang, 'stockTitle')}</span>
        <button style={btnStyle} onClick={onOpenStats}>{t(lang, 'stock.statsLink')}</button>
        <button style={{ ...btnStyle, marginLeft: '0.4rem' }} onClick={onOpenSettings}>{t(lang, 'stock.settings')}</button>
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

export default memo(StockCard)
