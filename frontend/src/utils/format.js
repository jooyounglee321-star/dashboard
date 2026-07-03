export const fmtKRW = (v) => Math.round(v).toLocaleString('ko-KR')
export const fmtUSD = (v) => Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

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
