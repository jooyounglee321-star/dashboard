import { CURRENCY_SYMBOLS as SYM } from '../data/currencies'

export { SYM }

export function fmtAmt(amt, cur) {
  const s = SYM[cur] || '$'
  const n = amt || 0
  if (cur === 'KRW' || cur === 'JPY') return s + Math.round(n).toLocaleString()
  return s + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

export const fmtKRW = (v) => Math.round(v).toLocaleString('ko-KR')
export const fmtUSD = (v) => Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
