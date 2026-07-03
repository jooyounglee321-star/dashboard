export const fmtKRW = (v) => Math.round(v).toLocaleString('ko-KR')
export const fmtUSD = (v) => Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// 차트 축·툴팁용 축약 포맷
// KRW: 천원 단위 (1억 미만 → X,XXX천 / 1억 이상 → X억)
export const fmtKRWShort = (val) => {
  const abs = Math.abs(val); const sign = val < 0 ? '-' : ''
  if (abs >= 100000000) return sign + Math.round(abs / 100000000).toLocaleString('ko-KR') + '억'
  return sign + Math.round(abs / 1000).toLocaleString('ko-KR') + '천'
}
// USD: 센트 제거, K/M 축약 ($1.2K / $1.2M)
export const fmtUSDShort = (val) => {
  const abs = Math.abs(val); const sign = val < 0 ? '-' : ''
  if (abs >= 1000000) return sign + '$' + (abs / 1000000).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + 'M'
  if (abs >= 1000) return sign + '$' + (abs / 1000).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + 'K'
  return sign + '$' + Math.round(abs).toLocaleString('en-US')
}
export const fmtShort = (val, currency) => currency === 'USD' ? fmtUSDShort(val) : fmtKRWShort(val)

// 통화 자동 선택 포맷
export const formatAuto = (val, currency) => currency === 'USD' ? fmtUSD(val) : fmtKRW(val)

// 다중 통화 금액 포맷 (BudgetPage, ExpenseCard 호환)
export const fmtAmt = (amt, cur = 'KRW') => {
  if (cur === 'USD') return '$' + fmtUSD(amt)
  if (cur === 'KRW') return '₩' + fmtKRW(amt)
  return `${cur} ` + fmtUSD(amt)
}

// 부호 포함 포맷 (+/-)
export const fmtSigned = (val, currency = 'KRW') =>
  (val >= 0 ? '+' : '') + formatAuto(Math.abs(val), currency)
