import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { t } from '../i18n'

const MORD = ['아침', '점심', '저녁', '간식']
const MEAL_EMOJI = { '아침': '🌅', '점심': '☀️', '저녁': '🌙', '간식': '🍎' }
const MEAL_LABEL_KO = { '아침': '아침', '점심': '점심', '저녁': '저녁', '간식': '간식' }
const MEAL_LABEL_EN = { '아침': 'Breakfast', '점심': 'Lunch', '저녁': 'Dinner', '간식': 'Snack' }

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
  const weekdays = ['일', '월', '화', '수', '목', '금', '토']
  return `${month}월 ${day}일 ${weekdays[d.getDay()]}요일`
}

export default function DietStatsPage() {
  const lang     = getLang()
  const navigate = useNavigate()
  const now      = new Date()

  const [year,     setYear]     = useState(now.getFullYear())
  const [month,    setMonth]    = useState(now.getMonth() + 1)
  const [diets,    setDiets]    = useState([])      // 해당 월 식단 전체
  const [analyses, setAnalyses] = useState([])      // 해당 월 분석 이력
  const [loading,  setLoading]  = useState(false)
  const [openDates, setOpenDates] = useState({})    // 날짜별 분석 펼침 상태

  useEffect(() => { fetchMonthData() }, [year, month]) // eslint-disable-line

  async function fetchMonthData() {
    setLoading(true)
    try {
      const pad = n => String(n).padStart(2, '0')
      // 해당 월 1일 ~ 말일 식단 조회 (date 파라미터 없이 전체 조회 후 필터)
      const [dietsRes, analysisRes] = await Promise.all([
        fetch(`/api/diets`, { headers: authHeader() }),
        fetch(`/api/diets/analysis/history?year=${year}&month=${month}`, { headers: authHeader() }),
      ])
      const allDiets = dietsRes.ok ? await dietsRes.json() : []
      const allAnalyses = analysisRes.ok ? await analysisRes.json() : []

      // 해당 월 식단만 필터
      const filtered = allDiets.filter(d => {
        const [y, m] = (d.date || '').split('-').map(Number)
        return y === year && m === month
      })
      setDiets(filtered)
      setAnalyses(allAnalyses)
    } catch { /* silent */ }
    setLoading(false)
  }

  // 날짜별 그룹화
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
    <div style={{ minHeight: '100vh', background: 'var(--bg, #f8fafc)', fontFamily: "'Inter','Noto Sans KR',sans-serif" }}>

      {/* ── 헤더 ────────────────────────────────────────────────────── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'var(--card-bg, #fff)',
        borderBottom: '1px solid var(--border, #e5e7eb)',
        padding: '0.85rem 1.2rem',
        display: 'flex', alignItems: 'center', gap: '0.75rem',
      }}>
        <button
          type="button"
          onClick={() => navigate('/')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.9rem', color: 'var(--ink2, #6b7280)', padding: 0 }}
        >
          ← {lang === 'en' ? 'Back' : '뒤로'}
        </button>
        <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--ink, #111)' }}>
          🥗 {t(lang, 'diet.statsTitle')}
        </span>
      </div>

      {/* ── 년/월 선택기 ─────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem',
        padding: '1rem',
      }}>
        <button type="button" onClick={prevMonth} style={navBtnStyle}>←</button>
        <span style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--ink, #111)', minWidth: 110, textAlign: 'center' }}>
          {year}{lang === 'ko' ? '년 ' : ' '}{month}{lang === 'ko' ? '월' : (month === 1 ? 'Jan' : month === 2 ? 'Feb' : month === 3 ? 'Mar' : month === 4 ? 'Apr' : month === 5 ? 'May' : month === 6 ? 'Jun' : month === 7 ? 'Jul' : month === 8 ? 'Aug' : month === 9 ? 'Sep' : month === 10 ? 'Oct' : month === 11 ? 'Nov' : 'Dec')}
        </span>
        <button type="button" onClick={nextMonth} style={navBtnStyle}>→</button>
      </div>

      {/* ── 본문 ─────────────────────────────────────────────────────── */}
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '0 1rem 2rem' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--ink2, #6b7280)', fontSize: '0.9rem' }}>
            {t(lang, 'common.loading')}
          </div>
        ) : sortedDates.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--ink2, #6b7280)', fontSize: '0.9rem' }}>
            {t(lang, 'dietEmpty')}
          </div>
        ) : (
          sortedDates.map(date => {
            const items    = dateMap[date] || []
            const analysis = analysisMap[date] || null
            const isOpen   = openDates[date]

            // 끼니별 그룹화
            const grouped = {}
            items.forEach(d => {
              if (!grouped[d.meal_type]) grouped[d.meal_type] = []
              grouped[d.meal_type].push(d)
            })

            // 분석 결과 파싱
            let parsedRecs = []
            if (analysis?.recommendations) {
              try { parsedRecs = JSON.parse(analysis.recommendations) }
              catch { parsedRecs = [analysis.recommendations] }
            }

            return (
              <div key={date} style={{
                background: 'var(--card-bg, #fff)',
                border: '1px solid var(--border, #e5e7eb)',
                borderRadius: 14,
                marginBottom: '1rem',
                overflow: 'hidden',
              }}>

                {/* 날짜 헤더 */}
                <div style={{
                  padding: '0.75rem 1rem',
                  borderBottom: '1px solid var(--border, #e5e7eb)',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                  <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--ink, #111)' }}>
                    {formatDateHeader(date, lang)}
                  </span>
                  {!analysis ? (
                    <span style={{
                      fontSize: '0.7rem', fontWeight: 600,
                      color: '#9ca3af', background: '#f3f4f6',
                      border: '1px solid #e5e7eb',
                      borderRadius: 20, padding: '0.15rem 0.55rem',
                    }}>
                      {t(lang, 'diet.noAnalysis')}
                    </span>
                  ) : (
                    <span style={{
                      fontSize: '0.7rem', fontWeight: 600,
                      color: '#5b21b6', background: 'rgba(124,58,237,0.08)',
                      border: '1px solid rgba(124,58,237,0.2)',
                      borderRadius: 20, padding: '0.15rem 0.55rem',
                    }}>
                      📊 {t(lang, 'diet.analysisOfDay')}
                    </span>
                  )}
                </div>

                {/* 식단 목록 */}
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

                {/* 분석 결과 토글 */}
                {analysis && (
                  <>
                    <button
                      type="button"
                      onClick={() => toggleDate(date)}
                      style={{
                        width: '100%', padding: '0.55rem 1rem',
                        background: 'rgba(124,58,237,0.04)',
                        border: 'none', borderTop: '1px solid rgba(124,58,237,0.12)',
                        cursor: 'pointer', fontFamily: 'inherit',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        fontSize: '0.78rem', fontWeight: 600, color: '#5b21b6',
                      }}
                    >
                      <span>📋 {t(lang, 'diet.analysisOfDay')}</span>
                      <span style={{ transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>▾</span>
                    </button>
                    {isOpen && (
                      <div style={{ padding: '0.75rem 1rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>

                        {/* 영양 균형 */}
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

                        {/* 추천 메뉴 */}
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

                        {/* 주의사항 */}
                        {analysis.warnings && (
                          <div style={{
                            padding: '0.5rem 0.7rem',
                            background: 'rgba(234,179,8,0.07)',
                            border: '1px solid rgba(234,179,8,0.3)',
                            borderRadius: 8,
                          }}>
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
                  </>
                )}

              </div>
            )
          })
        )}
      </div>
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
