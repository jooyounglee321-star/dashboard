export const pad2 = n => String(n).padStart(2, '0')

// toISOString()은 UTC 기준 → 특정 타임존에서 날짜가 하루 어긋나는 버그
// 로컬 날짜 메서드를 직접 사용해 어느 타임존에서도 정확한 오늘 날짜 반환
export const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}
