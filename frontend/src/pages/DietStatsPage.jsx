import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { t } from '../i18n'

const MORD = ['아침', '점심', '저녁', '간식']
const MEAL_EMOJI = { '아침': '🌅', '점심': '☀️', '저녁': '🌙', '간식': '🍎' }
const MEAL_LABEL_KO = { '아침': '아침', '점심': '점심', '저녁': '저녁', '간식': '간식' }
const MEAL_LABEL_EN = { '아침': 'Breakfast', '점심': 'Lunch', '저녁': 'Dinner', '간식': 'Snack' }
const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토']
const WEEKDAY_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function getLang() {
  try { return localStorage.getItem('dashboard_lang') || 'ko' } catch { return 'ko' }
}
function authHeader() {
  return { Authorization: 'Bearer ' + localStorage.getItem('token') }
}
function formatDateHeader(dateStr, lang) {
  const d = new Date(dateStr + 'T00:00:00')
  if (lang === 'en') {
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', weekday: 'long' })
  }
  const month = d.getMonth() + 1
  const day   = d.getDate()
  return `${month}월 ${day}일 ${WEEKDAY_KO[d.getDay()]}요일`
}
function monthLabel(year, month, lang) {
  const MONTH_EN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return lang === 'ko' ? `${year}년 ${month}월` : `${MONTH_EN[month - 1]} ${year}`
}

// ── 날짜별 상세 모달 ─────────────────────────────────────────────────────────
function DayDetailModal({ date, dateMap, analysisMap, lang, onClose }) {
  const mealLabel = key => (lang === 'en' ? MEAL_LABEL_EN : MEAL_LABEL_KO)[key] ?? key
  const items    = dateMap[date] || []
  const analysis = analysisMap[date] || null
  const grouped  = {}
  items.forEach(d => {
    if (!grouped[d.meal_type]) grouped[d.meal_type] = []
    grouped[d.meal_type].push(d)
  })
  let parsedRecs = []
  if (analysis?.recommendations) {
    try { parsedRecs = JSON.parse(analysis.recommendations) }
    catch { parsedRecs = [analysis.recommendations] }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 800, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
      onClick={onClose}
    >
      <div
        style={{ background: 'var(--card-bg, #fff)', borderRadius: 16, width: '100%', maxWidth: 480, maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 8px 40px rgba(0,0,0,0.22)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* 모달 헤더 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.2rem', borderBottom: '1px solid var(--border, #e5e7eb)', position: 'sticky', top: 0, background: 'var(--card-bg, #fff)', zIndex: 1 }}>
          <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--ink, #111)' }}>
            {formatDateHeader(date, lang)}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {analysis && (
              <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#5b21b6', background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.2)', borderRadius: 20, padding: '0.15rem 0.55rem' }}>
                📊 {t(lang, 'diet.analysisOfDay')}
              </span>
            )}
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem', color: 'var(--ink3)', lineHeight: 1 }}>✕</button>
          </div>
        </div>

        <div style={{ padding: '1rem 1.2rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* 식단 목록 */}
          <div>
            <div style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--ink2, #6b7280)', marginBottom: '0.5rem' }}>
              🍽 {t(lang, 'diet.mealsOfDay')}
            </div>
            {MORD.filter(m => grouped[m]?.length).map(m => (
              <div key={m} style={{ marginBottom: '0.4rem' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--ink, #374151)', marginRight: '0.4rem' }}>
                  {MEAL_EMOJI[m]} {mealLabel(m)}
                </span>
                {grouped[m].map((item, i) => (
                  <span key={item.id} style={{ fontSize: '0.78rem', color: 'var(--ink2, #6b7280)' }}>
                    {item.content}{item.calories != null ? ` (${item.calories}kcal)` : ''}{i < grouped[m].length - 1 ? ', ' : ''}
                  </span>
                ))}
              </div>
            ))}
            {!MORD.some(m => grouped[m]?.length) && (
              <p style={{ fontSize: '0.78rem', color: 'var(--ink3)', margin: 0 }}>
                {lang === 'ko' ? '기록된 식단이 없습니다.' : 'No meals recorded.'}
              </p>
            )}
          </div>

          {/* 분석 결과 */}
          {analysis && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              {analysis.nutrition_analysis && (
                <div>
                  <div style={{ fontSize: '0.74rem', fontWeight: 600, color: '#5b21b6', marginBottom: '0.25rem' }}>
                    📊 {t(lang, 'diet.nutritionAnalysis')}
                  </div>
                  <p style={{ fontSize: '0.78rem', color: 'var(--ink2, #6b7280)', margin: 0, lineHeight: 1.6 }}>
                    {analysis.nutrition_analysis}
                  </p>
                </div>
              )}
              {parsedRecs.length > 0 && (
                <div>
                  <div style={{ fontSize: '0.74rem', fontWeight: 600, color: '#5b21b6', marginBottom: '0.25rem' }}>
                    🍽️ {t(lang, 'diet.menuRecommendation')}
                  </div>
                  <ul style={{ margin: 0, paddingLeft: '1rem', display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                    {parsedRecs.map((rec, i) => (
                      <li key={i} style={{ fontSize: '0.78rem', color: 'var(--ink2, #6b7280)', lineHeight: 1.5 }}>{rec}</li>
                    ))}
                  </ul>
                </div>
              )}
              {analysis.warnings && (
                <div style={{ padding: '0.5rem 0.7rem', background: 'rgba(234,179,8,0.07)', border: '1px solid rgba(234,179,8,0.3)', borderRadius: 8 }}>
                  <div style={{ fontSize: '0.74rem', fontWeight: 600, color: '#92400e', marginBottom: '0.2rem' }}>
                    ⚠️ {t(lang, 'diet.warning')}
                  </div>
                  <p style={{ fontSize: '0.78rem', color: '#78350f', margin: 0, lineHeight: 1.5 }}>
                    {analysis.warnings}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── 달력 뷰 ─────────────────────────────────────────────────────────────────
function CalendarView({ year, month, dateMap, analysisMap, lang, onDayClick }) {
  const mealLabel = key => (lang === 'en' ? MEAL_LABEL_EN : MEAL_LABEL_KO)[key] ?? key
  // KST 기준 오늘 날짜 (UTC+9 보정)
  const _now = new Date()
  const koreaToday = new Date(_now.getTime() + 9 * 60 * 60 * 1000)
  const today = koreaToday.toISOString().slice(0, 10)
  const weekdays = lang === 'ko' ? WEEKDAY_KO : WEEKDAY_EN

  const firstDay  = new Date(year, month - 1, 1).getDay()   // 0=일
  const daysInMonth = new Date(year, month, 0).getDate()

  // 달력 셀 배열: null(빈칸) 또는 날짜 숫자
  const cells = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  // 마지막 행 채우기
  while (cells.length % 7 !== 0) cells.push(null)

  function cellDate(d) {
    return `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }

  // 날짜 칸의 식단 미리보기: 아침/점심/저녁 최대 3줄, 초과 시 "+N개 더"
  function getPreview(d) {
    const dateStr = cellDate(d)
    const items = dateMap[dateStr]
    if (!items?.length) return { lines: [], extra: 0 }
    const lines = []
    let extra = 0
    for (const meal of MORD) {
      const group = items.filter(i => i.meal_type === meal)
      if (!group.length) continue
      const content = group.map(i => i.content).join(', ')
      const trimmed = content.length > 11 ? content.slice(0, 11) + '…' : content
      if (lines.length < 3) {
        lines.push(`${MEAL_EMOJI[meal]} ${trimmed}`)
      } else {
        extra++
      }
    }
    return { lines, extra }
  }

  return (
    <div>
      {/* 요일 헤더 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '2px solid var(--border, #e5e7eb)', marginBottom: 0 }}>
        {weekdays.map((wd, i) => (
          <div key={i} style={{
            textAlign: 'center', padding: '0.4rem 0', fontSize: '0.72rem', fontWeight: 700,
            color: i === 0 ? '#ef4444' : i === 6 ? '#3b82f6' : 'var(--ink2, #6b7280)',
          }}>
            {wd}
          </div>
        ))}
      </div>

      {/* 날짜 그리드 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
        {cells.map((d, idx) => {
          if (d === null) {
            return (
              <div key={`empty-${idx}`} style={{
                height: 110,
                borderRight: '0.5px solid var(--color-border-tertiary, #e5e7eb)',
                borderBottom: '0.5px solid var(--color-border-tertiary, #e5e7eb)',
                background: 'var(--color-background-primary, #fff)',
                opacity: 0.4,
                ...(idx % 7 === 0 ? { borderLeft: '0.5px solid var(--color-border-tertiary, #e5e7eb)' } : {}),
              }} />
            )
          }

          const dateStr  = cellDate(d)
          const hasData  = !!dateMap[dateStr]?.length
          const hasAnal  = !!analysisMap[dateStr]
          const isToday  = dateStr === today
          const dow      = (firstDay + d - 1) % 7  // 0=일,6=토
          const isSun    = dow === 0
          const isSat    = dow === 6
          const { lines: preview, extra } = getPreview(d)

          return (
            <div
              key={d}
              onClick={() => hasData && onDayClick(dateStr)}
              style={{
                height: 110,
                borderRight: '0.5px solid var(--color-border-tertiary, #e5e7eb)',
                borderBottom: '0.5px solid var(--color-border-tertiary, #e5e7eb)',
                ...(idx % 7 === 0 ? { borderLeft: '0.5px solid var(--color-border-tertiary, #e5e7eb)' } : {}),
                boxSizing: 'border-box',
                padding: '0.28rem 0.3rem 0.2rem',
                background: 'var(--color-background-primary, #fff)',
                cursor: hasData ? 'pointer' : 'default',
                outline: isToday ? '2px solid #3b82f6' : 'none',
                outlineOffset: '-2px',
                borderRadius: isToday ? 4 : 0,
                transition: 'background 0.1s',
                position: 'relative',
                overflow: 'hidden',
              }}
              onMouseEnter={e => { if (hasData) e.currentTarget.style.background = 'var(--bg2, #f0f4ff)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-background-primary, #fff)' }}
            >
              {/* 날짜 숫자 + 분석 뱃지 */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.18rem' }}>
                <span style={{
                  fontSize: '0.72rem', fontWeight: isToday ? 700 : 500,
                  color: isSun ? '#ef4444' : isSat ? '#3b82f6' : 'var(--ink, #374151)',
                  lineHeight: 1,
                }}>
                  {d}
                </span>
                {hasAnal && (
                  <span style={{ fontSize: '0.52rem', background: 'rgba(124,58,237,0.12)', color: '#5b21b6', borderRadius: 4, padding: '0.06rem 0.28rem', fontWeight: 700, lineHeight: 1.4 }}>
                    📊
                  </span>
                )}
              </div>

              {/* 식단 미리보기 (최대 3줄) */}
              {preview.map((line, i) => (
                <div key={i} style={{
                  fontSize: '0.6rem', color: 'var(--ink2, #6b7280)',
                  lineHeight: 1.3, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                  marginBottom: '0.05rem',
                }}>
                  {line}
                </div>
              ))}
              {extra > 0 && (
                <div style={{ fontSize: '0.58rem', color: 'var(--ink3, #9ca3af)', lineHeight: 1.3 }}>
                  +{extra}개 더
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── 메인 페이지 ──────────────────────────────────────────────────────────────
export default function DietStatsPage() {
  const lang     = getLang()
  const navigate = useNavigate()
  const now      = new Date()

  const [year,      setYear]      = useState(now.getFullYear())
  const [month,     setMonth]     = useState(now.getMonth() + 1)
  const [diets,     setDiets]     = useState([])
  const [analyses,  setAnalyses]  = useState([])
  const [loading,   setLoading]   = useState(false)
  const [openDates, setOpenDates] = useState({})
  const [viewMode,  setViewMode]  = useState('calendar')   // 'calendar' | 'list'
  const [selectedDate, setSelectedDate] = useState(null)   // 달력 클릭 모달

  useEffect(() => { fetchMonthData() }, [year, month]) // eslint-disable-line

  async function fetchMonthData() {
    setLoading(true)
    try {
      const [dietsRes, analysisRes] = await Promise.all([
        fetch(`/api/diets`, { headers: authHeader() }),
        fetch(`/api/diets/analysis/history?year=${year}&month=${month}`, { headers: authHeader() }),
      ])
      const allDiets    = dietsRes.ok    ? await dietsRes.json()    : []
      const allAnalyses = analysisRes.ok ? await analysisRes.json() : []
      const filtered = allDiets.filter(d => {
        const [y, m] = (d.date || '').split('-').map(Number)
        return y === year && m === month
      })
      setDiets(filtered)
      setAnalyses(allAnalyses)
    } catch { /* silent */ }
    setLoading(false)
  }

  // 날짜별 맵
  const dateMap = {}
  diets.forEach(d => {
    if (!dateMap[d.date]) dateMap[d.date] = []
    dateMap[d.date].push(d)
  })
  const analysisMap = {}
  analyses.forEach(a => { analysisMap[a.date] = a })

  const sortedDates = Object.keys(dateMap).sort()

  function toggleDate(date) {
    setOpenDates(prev => ({ ...prev, [date]: !prev[date] }))
  }
  function prevMonth() {
    if (month === 1) { setYear(y => y - 1); setMonth(12) }
    else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (month === 12) { setYear(y => y + 1); setMonth(1) }
    else setMonth(m => m + 1)
  }

  const mealLabel = key => (lang === 'en' ? MEAL_LABEL_EN : MEAL_LABEL_KO)[key] ?? key

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-background-tertiary, #f1f5f9)', fontFamily: "'Inter','Noto Sans KR',sans-serif" }}>

      {/* ── 헤더 ── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'var(--card-bg, #fff)',
        borderBottom: '1px solid var(--border, #e5e7eb)',
        padding: '0.85rem 1.2rem',
        display: 'flex', alignItems: 'center', gap: '0.75rem',
      }}>
        <button type="button" onClick={() => navigate('/')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.9rem', color: 'var(--ink2, #6b7280)', padding: 0 }}>
          ← {lang === 'en' ? 'Back' : '뒤로'}
        </button>
        <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--ink, #111)' }}>
          🥗 {t(lang, 'diet.statsTitle')}
        </span>
        {/* 뷰 토글 */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.3rem' }}>
          {[['calendar', '📅'], ['list', '📋']].map(([mode, icon]) => (
            <button key={mode} type="button" onClick={() => setViewMode(mode)}
              style={{
                padding: '0.28rem 0.65rem', fontSize: '0.78rem', cursor: 'pointer',
                border: `1.5px solid ${viewMode === mode ? 'var(--accent, #2563eb)' : 'var(--border, #e5e7eb)'}`,
                borderRadius: 7, background: viewMode === mode ? 'var(--accent, #2563eb)' : 'transparent',
                color: viewMode === mode ? '#fff' : 'var(--ink3)', fontFamily: 'inherit',
              }}>
              {icon}
            </button>
          ))}
        </div>
      </div>

      {/* ── 년/월 선택기 ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', padding: '0.85rem 1rem' }}>
        <button type="button" onClick={prevMonth} style={navBtnStyle}>←</button>
        <span style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--ink, #111)', minWidth: 110, textAlign: 'center' }}>
          {monthLabel(year, month, lang)}
        </span>
        <button type="button" onClick={nextMonth} style={navBtnStyle}>→</button>
      </div>

      {/* ── 본문 ── */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--ink2, #6b7280)', fontSize: '0.9rem' }}>
          {t(lang, 'common.loading')}
        </div>
      ) : viewMode === 'calendar' ? (
        /* ── 달력 뷰 ── */
        <div style={{ maxWidth: 780, margin: '0 auto', padding: '0 0.5rem 2rem', background: 'var(--color-background-primary, #fff)', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--color-border-tertiary, #e5e7eb)' }}>
          <CalendarView
            year={year} month={month}
            dateMap={dateMap} analysisMap={analysisMap}
            lang={lang}
            onDayClick={date => setSelectedDate(date)}
          />
        </div>
      ) : (
        /* ── 리스트 뷰 ── */
        <div style={{ maxWidth: 680, margin: '0 auto', padding: '0 1rem 2rem' }}>
          {sortedDates.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--ink2, #6b7280)', fontSize: '0.9rem' }}>
              {t(lang, 'dietEmpty')}
            </div>
          ) : (
            sortedDates.map(date => {
              const items    = dateMap[date] || []
              const analysis = analysisMap[date] || null
              const isOpen   = openDates[date]
              const grouped  = {}
              items.forEach(d => {
                if (!grouped[d.meal_type]) grouped[d.meal_type] = []
                grouped[d.meal_type].push(d)
              })
              let parsedRecs = []
              if (analysis?.recommendations) {
                try { parsedRecs = JSON.parse(analysis.recommendations) }
                catch { parsedRecs = [analysis.recommendations] }
              }
              return (
                <div key={date} style={{ background: 'var(--card-bg, #fff)', border: '1px solid var(--border, #e5e7eb)', borderRadius: 14, marginBottom: '1rem', overflow: 'hidden' }}>
                  <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border, #e5e7eb)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--ink, #111)' }}>
                      {formatDateHeader(date, lang)}
                    </span>
                    {!analysis ? (
                      <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#9ca3af', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 20, padding: '0.15rem 0.55rem' }}>
                        {t(lang, 'diet.noAnalysis')}
                      </span>
                    ) : (
                      <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#5b21b6', background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.2)', borderRadius: 20, padding: '0.15rem 0.55rem' }}>
                        📊 {t(lang, 'diet.analysisOfDay')}
                      </span>
                    )}
                  </div>
                  <div style={{ padding: '0.75rem 1rem' }}>
                    <div style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--ink2, #6b7280)', marginBottom: '0.5rem' }}>
                      🍽 {t(lang, 'diet.mealsOfDay')}
                    </div>
                    {MORD.filter(m => grouped[m]?.length).map(m => (
                      <div key={m} style={{ marginBottom: '0.4rem' }}>
                        <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--ink, #374151)', marginRight: '0.4rem' }}>
                          {MEAL_EMOJI[m]} {mealLabel(m)}
                        </span>
                        {grouped[m].map((item, i) => (
                          <span key={item.id} style={{ fontSize: '0.78rem', color: 'var(--ink2, #6b7280)' }}>
                            {item.content}{item.calories != null ? ` (${item.calories}kcal)` : ''}{i < grouped[m].length - 1 ? ', ' : ''}
                          </span>
                        ))}
                      </div>
                    ))}
                  </div>
                  {analysis && (
                    <>
                      <button type="button" onClick={() => toggleDate(date)}
                        style={{ width: '100%', padding: '0.55rem 1rem', background: 'rgba(124,58,237,0.04)', border: 'none', borderTop: '1px solid rgba(124,58,237,0.12)', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.78rem', fontWeight: 600, color: '#5b21b6' }}>
                        <span>📋 {t(lang, 'diet.analysisOfDay')}</span>
                        <span style={{ transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>▾</span>
                      </button>
                      {isOpen && (
                        <div style={{ padding: '0.75rem 1rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                          {analysis.nutrition_analysis && (
                            <div>
                              <div style={{ fontSize: '0.74rem', fontWeight: 600, color: '#5b21b6', marginBottom: '0.25rem' }}>📊 {t(lang, 'diet.nutritionAnalysis')}</div>
                              <p style={{ fontSize: '0.78rem', color: 'var(--ink2, #6b7280)', margin: 0, lineHeight: 1.6 }}>{analysis.nutrition_analysis}</p>
                            </div>
                          )}
                          {parsedRecs.length > 0 && (
                            <div>
                              <div style={{ fontSize: '0.74rem', fontWeight: 600, color: '#5b21b6', marginBottom: '0.25rem' }}>🍽️ {t(lang, 'diet.menuRecommendation')}</div>
                              <ul style={{ margin: 0, paddingLeft: '1rem', display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                                {parsedRecs.map((rec, i) => <li key={i} style={{ fontSize: '0.78rem', color: 'var(--ink2, #6b7280)', lineHeight: 1.5 }}>{rec}</li>)}
                              </ul>
                            </div>
                          )}
                          {analysis.warnings && (
                            <div style={{ padding: '0.5rem 0.7rem', background: 'rgba(234,179,8,0.07)', border: '1px solid rgba(234,179,8,0.3)', borderRadius: 8 }}>
                              <div style={{ fontSize: '0.74rem', fontWeight: 600, color: '#92400e', marginBottom: '0.2rem' }}>⚠️ {t(lang, 'diet.warning')}</div>
                              <p style={{ fontSize: '0.78rem', color: '#78350f', margin: 0, lineHeight: 1.5 }}>{analysis.warnings}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}

      {/* ── 날짜 상세 모달 ── */}
      {selectedDate && (
        <DayDetailModal
          date={selectedDate}
          dateMap={dateMap}
          analysisMap={analysisMap}
          lang={lang}
          onClose={() => setSelectedDate(null)}
        />
      )}
    </div>
  )
}

const navBtnStyle = {
  background: 'none',
  border: '1px solid var(--border, #e5e7eb)',
  borderRadius: 8,
  padding: '0.3rem 0.75rem',
  cursor: 'pointer',
  fontFamily: "'Inter','Noto Sans KR',sans-serif",
  fontSize: '0.85rem',
  color: 'var(--ink, #374151)',
}
