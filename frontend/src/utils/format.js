export const fmtKRW = (v) => Math.round(v).toLocaleString('ko-KR')
export const fmtUSD = (v) => Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// 차트 축·툴팁용 축약 포맷 (만/억, $M)
export const fmtKRWShort = (val) => {
  const abs = Math.abs(val); const sign = val < 0 ? '-' : ''
  if (abs >= 100000000) { const uk = Math.round(abs / 10000); return sign + Math.floor(uk / 10000).toLocaleString('ko-KR') + '억 ' + (uk % 10000).toLocaleString('ko-KR') + '만' }
  if (abs >= 10000) return sign + Math.round(abs / 10000).toLocaleString('ko-KR') + '만'
  return sign + Math.round(abs).toLocaleString('ko-KR')
}
export const fmtUSDShort = (val) => {
  const abs = Math.abs(val); const sign = val < 0 ? '-' : ''
  if (abs >= 1000000) return sign + '$' + (abs / 1000000).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + 'M'
  if (abs >= 1000) return sign + '$' + Math.round(abs).toLocaleString('en-US')
  return sign + '$' + abs.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
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
