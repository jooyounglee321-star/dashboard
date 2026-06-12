export const fmtKRW = (v) => Math.round(v).toLocaleString('ko-KR')
export const fmtUSD = (v) => Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
