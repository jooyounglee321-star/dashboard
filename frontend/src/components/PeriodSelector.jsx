export const PERIOD_OPTIONS = [
  ['1m', '1M'], ['3m', '3M'], ['6m', '6M'],
  ['ytd', 'YTD'], ['1y', '1Y'], ['3y', '3Y'], ['all', '전체'], ['custom', '직접'],
]

const inpStyle = {
  padding: '0.22rem 0.4rem',
  fontSize: '0.76rem',
  border: '1.5px solid var(--accent)',
  borderRadius: 6,
  background: 'var(--bg)',
  color: 'var(--ink)',
  fontFamily: 'inherit',
  cursor: 'pointer',
}

/**
 * 기간 선택 버튼 컴포넌트
 * @param {string}   value          - 현재 선택된 기간 키 ('1m'|'3m'|...|'custom')
 * @param {function} onChange       - (key: string) => void
 * @param {string}   [customFrom]   - 직접 설정 시작일 (YYYY-MM-DD)
 * @param {string}   [customTo]     - 직접 설정 종료일 (YYYY-MM-DD)
 * @param {function} [onCustomChange] - (from: string, to: string) => void
 * @param {object}   [style]        - 컨테이너 추가 스타일
 */
export default function PeriodSelector({ value, onChange, customFrom = '', customTo = '', onCustomChange, style }) {
  const today = new Date().toISOString().slice(0, 10)

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
      {value === 'custom' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 4 }}>
          <input
            type="date"
            value={customFrom}
            max={customTo || today}
            onChange={e => onCustomChange?.(e.target.value, customTo)}
            style={inpStyle}
          />
          <span style={{ fontSize: '0.78rem', color: 'var(--ink3)' }}>~</span>
          <input
            type="date"
            value={customTo}
            min={customFrom}
            max={today}
            onChange={e => onCustomChange?.(customFrom, e.target.value)}
            style={inpStyle}
          />
        </div>
      )}
    </div>
  )
}
