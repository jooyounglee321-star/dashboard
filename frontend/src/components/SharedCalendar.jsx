const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토']
const WEEKDAY_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_KO   = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월']
const MONTH_EN   = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function pad2(n) { return String(n).padStart(2, '0') }

export function monthLabel(year, month, lang) {
  return lang === 'ko'
    ? `${year}년 ${MONTH_KO[month - 1]}`
    : `${MONTH_EN[month - 1]} ${year}`
}

const NAV_BTN_STYLE = {
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: '6px',
  cursor: 'pointer',
  fontSize: '1.1rem',
  padding: '0.2rem 0.6rem',
  color: 'var(--ink)',
  fontWeight: 700,
  lineHeight: 1,
  transition: 'background 0.1s',
}

export default function SharedCalendar({
  year,
  month,
  lang,
  onPrevMonth,
  onNextMonth,
  onDayClick,
  isCellClickable,
  renderCell,
  rightSlot,
  cellHeight = 90,
  minWidth = '420px',
  showToolbar = true,
}) {
  const now      = new Date()
  const todayStr = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`
  const weekdays = lang === 'ko' ? WEEKDAY_KO : WEEKDAY_EN

  const firstDow    = new Date(year, month - 1, 1).getDay()
  const daysInMonth = new Date(year, month, 0).getDate()

  function cellDate(d) {
    return `${year}-${pad2(month)}-${pad2(d)}`
  }

  return (
    <div>
      {showToolbar && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button style={NAV_BTN_STYLE} onClick={onPrevMonth}>&#8249;</button>
            <span style={{
              fontWeight: 700, fontSize: '1rem', minWidth: '8rem',
              textAlign: 'center', color: 'var(--ink)',
            }}>
              {monthLabel(year, month, lang)}
            </span>
            <button style={NAV_BTN_STYLE} onClick={onNextMonth}>&#8250;</button>
          </div>
          {rightSlot && <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>{rightSlot}</div>}
        </div>
      )}

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
        borderBottom: '1.5px solid var(--border)',
      }}>
        {weekdays.map((wd, i) => (
          <div key={i} style={{
            textAlign: 'center', padding: '0.4rem 0',
            fontSize: '0.72rem', fontWeight: 700,
            color: i === 0 ? 'var(--red)' : i === 6 ? 'var(--blue)' : 'var(--ink2)',
          }}>
            {wd}
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', minWidth }}>
        {Array.from({ length: firstDow }).map((_, i) => (
          <div key={`e${i}`} style={{
            height: cellHeight,
            borderRight: '0.5px solid var(--border)',
            borderBottom: '0.5px solid var(--border)',
            ...(i === 0 ? { borderLeft: '0.5px solid var(--border)' } : {}),
            background: 'var(--bg)',
            opacity: 0.5,
          }} />
        ))}

        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
          const colIdx    = (firstDow + day - 1) % 7
          const isFirst   = colIdx === 0
          const dow       = colIdx
          const dateStr   = cellDate(day)
          const isToday   = dateStr === todayStr
          const isSun     = dow === 0
          const isSat     = dow === 6
          const clickable = isCellClickable ? isCellClickable(dateStr) : true

          return (
            <div
              key={day}
              onClick={() => clickable && onDayClick && onDayClick(dateStr)}
              style={{
                height: cellHeight,
                borderRight: '0.5px solid var(--border)',
                borderBottom: '0.5px solid var(--border)',
                ...(isFirst ? { borderLeft: '0.5px solid var(--border)' } : {}),
                boxSizing: 'border-box',
                padding: '0.28rem 0.35rem 0.2rem',
                background: 'var(--card)',
                cursor: clickable ? 'pointer' : 'default',
                outline: isToday ? '2px solid var(--accent)' : 'none',
                outlineOffset: '-2px',
                transition: 'background 0.1s',
                overflow: 'hidden',
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
              }}
              onMouseEnter={e => { if (clickable) e.currentTarget.style.background = 'var(--accent-soft)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--card)' }}
            >
              <span style={{
                fontSize: '0.75rem',
                fontWeight: isToday ? 700 : 500,
                color: isSun ? 'var(--red)' : isSat ? 'var(--blue)' : 'var(--ink)',
                lineHeight: 1,
                marginBottom: '0.15rem',
                flexShrink: 0,
              }}>
                {day}
              </span>
              {renderCell && renderCell(dateStr, day, { isToday, isSun, isSat, dow })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
