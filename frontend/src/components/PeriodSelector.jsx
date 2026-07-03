export const PERIOD_OPTIONS = [
  ['1m', '1M'], ['3m', '3M'], ['6m', '6M'],
  ['ytd', 'YTD'], ['1y', '1Y'], ['3y', '3Y'], ['all', '전체'],
]

/**
 * 기간 선택 버튼 컴포넌트
 * @param {string} value - 현재 선택된 기간 키
 * @param {function} onChange - 기간 변경 핸들러 (key: string) => void
 * @param {object} [style] - 컨테이너 추가 스타일
 */
export default function PeriodSelector({ value, onChange, style }) {
  const btn = (active) => ({
    padding: '0.26rem 0.65rem',
    fontSize: '0.78rem',
    fontWeight: active ? 700 : 400,
    border: `1.5px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
    borderRadius: 6,
    background: active ? 'var(--accent)' : 'transparent',
    color: active ? '#fff' : 'var(--ink3)',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 0.15s',
    whiteSpace: 'nowrap',
  })
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center', ...style }}>
      {PERIOD_OPTIONS.map(([key, label]) => (
        <button key={key} onClick={() => onChange(key)} style={btn(value === key)}>
          {label}
        </button>
      ))}
    </div>
  )
}
