import { t } from '../i18n'

const PERIOD_BASE = [
  ['1m', '1M'], ['3m', '3M'], ['6m', '6M'],
  ['ytd', 'YTD'], ['1y', '1Y'], ['3y', '3Y'],
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

export default function PeriodSelector({ value, onChange, customFrom = '', customTo = '', onCustomChange, style, lang = 'ko' }) {
  const today = new Date().toISOString().slice(0, 10)

  const options = [
    ...PERIOD_BASE,
    ['all', t(lang, 'common.periodAll')],
    ['custom', t(lang, 'common.periodCustom')],
  ]

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
      {options.map(([key, label]) => (
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
