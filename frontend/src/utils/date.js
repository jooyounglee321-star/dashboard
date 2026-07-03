export const pad2 = n => String(n).padStart(2, '0')

// toISOString()은 UTC 기준 → 특정 타임존에서 날짜가 하루 어긋나는 버그
// 로컬 날짜 메서드를 직접 사용해 어느 타임존에서도 정확한 오늘 날짜 반환
export const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

// 월 이름 — 여러 컴포넌트에서 공통 사용 (BudgetPage, MemoCard, HeroSection, DietStatsPage)
export const MONTHS_KO = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월']
export const MONTHS_EN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
export const MONTHS_EN_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December']
// { ko, en } 형태로 접근 가능한 ML 객체 (BudgetPage, MemoCard 호환)
export const ML = { ko: MONTHS_KO, en: MONTHS_EN }
