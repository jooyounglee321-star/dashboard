import { useState, useEffect, useCallback } from 'react'
import { t } from './i18n'

const MOODS = [
  { icon: '😀', key: 'good' },
  { icon: '🙂', key: 'ok' },
  { icon: '😔', key: 'sad' },
  { icon: '🔋', key: 'tired' },
  { icon: '🔥', key: 'fire' },
  { icon: '😤', key: 'stress' },
]

const pad2 = n => String(n).padStart(2, '0')

const todayKey = () => {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function parseMemo(content) {
  if (!content) return { mood: '', text: '' }
  try {
    const p = JSON.parse(content)
    if (typeof p === 'object' && p !== null) return { mood: p.mood || '', text: p.text || '' }
  } catch { /* fallback */ }
  return { mood: '', text: content }
}

const ML = {
  ko: ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'],
  en: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
}

const NAV_BTN = {
  background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: '6px', color: '#c8d6e5', cursor: 'pointer', fontSize: '1rem',
  padding: '0.25rem 0.6rem', lineHeight: 1,
}

export default function MemoCard({ isMobile = false, lang = 'ko' }) {
  const [memoData, setMemoData] = useState(null)
  const [editing, setEditing]   = useState(false)
  const [mood, setMood]         = useState('')
  const [text, setText]         = useState('')

  // 달력 상태
  const _now = new Date()
  const [calOpen, setCalOpen]   = useState(false)
  const [allMemos, setAllMemos] = useState([])
  const [calYear, setCalYear]   = useState(_now.getFullYear())
  const [calMonth, setCalMonth] = useState(_now.getMonth() + 1)
  const [dayDetail, setDayDetail] = useState(null)

  const authHdr = () => ({ Authorization: 'Bearer ' + localStorage.getItem('token') })

  const loadToday = useCallback(async () => {
    const list = await fetch('/api/memos?date=' + todayKey(), { headers: authHdr() })
      .then(r => r.ok ? r.json() : []).catch(() => [])
    const m = list.length ? list[0] : null
    setMemoData(m)
    if (m) {
      const p = parseMemo(m.content)
      setMood(p.mood)
      setText(p.text)
    } else {
      setMood(''); setText('')
    }
  }, [])

  useEffect(() => { loadToday() }, [loadToday])

  async function saveMemo() {
    const content = JSON.stringify({ mood, text })
    if (memoData?.id) {
      await fetch('/api/memos/' + memoData.id, {
        method: 'PUT',
        headers: { ...authHdr(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
    } else {
      await fetch('/api/memos', {
        method: 'POST',
        headers: { ...authHdr(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: todayKey(), content }),
      })
    }
    setEditing(false)
    await loadToday()
  }

  async function deleteMemo() {
    if (!memoData?.id) return
    if (!window.confirm(lang === 'ko' ? '메모를 삭제할까요?' : 'Delete this memo?')) return
    await fetch('/api/memos/' + memoData.id, { method: 'DELETE', headers: authHdr() })
    setMemoData(null); setMood(''); setText(''); setEditing(false)
  }

  function startEdit() {
    if (memoData) {
      const p = parseMemo(memoData.content)
      setMood(p.mood); setText(p.text)
    } else {
      setMood(''); setText('')
    }
    setEditing(true)
  }

  async function openCalendar() {
    const list = await fetch('/api/memos', { headers: authHdr() })
      .then(r => r.ok ? r.json() : []).catch(() => [])
    setAllMemos(list)
    setCalOpen(true)
    setDayDetail(null)
  }

  function closeCalendar() { setCalOpen(false); setDayDetail(null) }

  // 달력 계산
  const mLabels     = ML[lang] || ML.en
  const daysInMonth = new Date(calYear, calMonth, 0).getDate()
  const firstDow    = new Date(calYear, calMonth - 1, 1).getDay()
  const dayMemoMap  = {}
  allMemos.forEach(m => {
    const d = (m.date || '').slice(0, 10)
    if (d.startsWith(`${calYear}-${pad2(calMonth)}`)) {
      const day = parseInt(d.slice(8), 10)
      dayMemoMap[day] = m
    }
  })
  const todayStr = todayKey()

  const parsed = parseMemo(memoData?.content)

  const hdr      = isMobile ? 'm-card-header' : 'card-header'
  const titleCls = isMobile ? 'm-card-title'  : 'card-title'
  const body     = isMobile ? 'm-card-body'   : 'card-body'
  const wrapper  = isMobile ? 'm-card'        : 'card card-memo'

  return (
    <div className={wrapper}>
      <div className={hdr}>
        <span className="card-icon">📝</span>
        <span className={titleCls}>{t(lang, 'memoTitle')}</span>
      </div>
      <div className={body}>

        {/* ── 기분 선택 (편집 모드) ── */}
        {editing && (
          <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', marginBottom: '0.55rem' }}>
            {MOODS.map(m => (
              <button
                key={m.key}
                onClick={() => setMood(mood === m.icon ? '' : m.icon)}
                style={{
                  border: mood === m.icon ? '2px solid var(--accent)' : '1px solid var(--border)',
                  borderRadius: '8px',
                  background: mood === m.icon ? 'rgba(100,150,255,0.15)' : 'var(--bg)',
                  padding: '0.28rem 0.45rem',
                  cursor: 'pointer',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px',
                  transition: 'border-color 0.12s, background 0.12s',
                }}
              >
                <span style={{ fontSize: '1.1rem' }}>{m.icon}</span>
                <span style={{ fontSize: '0.58rem', color: 'var(--ink3)', whiteSpace: 'nowrap' }}>
                  {t(lang, 'memoMood_' + m.key)}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* ── 표시 / 편집 영역 ── */}
        {!editing ? (
          <div className={isMobile ? 'm-memo-display' : 'memo-display'}>
            {memoData ? (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.4rem' }}>
                {parsed.mood && <span style={{ fontSize: '1.35rem', flexShrink: 0, marginTop: '0.05rem' }}>{parsed.mood}</span>}
                <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{parsed.text}</span>
              </div>
            ) : (
              <span style={{ color: '#a89880', fontStyle: 'italic', fontSize: isMobile ? undefined : '0.82rem' }}>
                {t(lang, 'memoPlaceholder')}
              </span>
            )}
          </div>
        ) : (
          <textarea
            className={isMobile ? 'm-memo-ta' : 'memo-ta'}
            style={{ display: 'block' }}
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={t(lang, 'memoTaPlaceholder')}
            autoFocus
          />
        )}

        {/* ── 버튼 ── */}
        <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
          {!editing ? (
            <>
              <button className={isMobile ? 'm-btn' : 'btn-sm'} onClick={startEdit}>
                {t(lang, memoData ? 'memoEditBtn' : 'memoNewBtn')}
              </button>
              <button className={isMobile ? 'm-btn' : 'btn-sm'} onClick={openCalendar}>
                📅 {t(lang, 'memoCalBtn')}
              </button>
              {memoData && (
                <button
                  className={isMobile ? 'm-btn' : 'btn-sm'}
                  style={{ color: '#f87171' }}
                  onClick={deleteMemo}
                >
                  {t(lang, 'memoDelBtn')}
                </button>
              )}
            </>
          ) : (
            <>
              <button className={isMobile ? 'm-btn-outline' : 'btn-outline'} onClick={saveMemo}>
                {t(lang, 'memoSaveBtn')}
              </button>
              <button className={isMobile ? 'm-btn' : 'btn-sm'} onClick={() => setEditing(false)}>
                {t(lang, 'memoCancelBtn')}
              </button>
            </>
          )}
        </div>

        {/* 저장 시각 */}
        {memoData?.updated_at && !editing && (
          <div style={{ fontSize: '0.7rem', color: 'var(--ink3)', marginTop: '0.35rem' }}>
            {(() => {
              const u = new Date(memoData.updated_at)
              return lang === 'en'
                ? `Saved: ${u.getHours()}:${pad2(u.getMinutes())}`
                : `저장: ${u.getHours()}시 ${pad2(u.getMinutes())}분`
            })()}
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════
          달력 모달
      ══════════════════════════════════════════════ */}
      {calOpen && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '1rem',
          }}
          onClick={e => { if (e.target === e.currentTarget) closeCalendar() }}
        >
          <div style={{
            background: '#1a2336', borderRadius: '1.25rem',
            border: '1px solid rgba(255,255,255,0.12)',
            width: '100%', maxWidth: '780px', maxHeight: '90vh',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            {/* 모달 헤더 */}
            <div style={{
              padding: '0.9rem 1.25rem 0.7rem',
              borderBottom: '1px solid rgba(255,255,255,0.08)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              flexShrink: 0,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <button
                  style={NAV_BTN}
                  onClick={() => {
                    setDayDetail(null)
                    if (calMonth === 1) { setCalYear(y => y - 1); setCalMonth(12) }
                    else setCalMonth(m => m - 1)
                  }}
                >‹</button>
                <span style={{ fontWeight: 700, fontSize: '1rem', minWidth: '8rem', textAlign: 'center' }}>
                  {calYear}{lang === 'ko' ? '년 ' : ' '}{mLabels[calMonth - 1]}
                </span>
                <button
                  style={NAV_BTN}
                  onClick={() => {
                    setDayDetail(null)
                    if (calMonth === 12) { setCalYear(y => y + 1); setCalMonth(1) }
                    else setCalMonth(m => m + 1)
                  }}
                >›</button>
              </div>
              <span style={{ fontWeight: 600, fontSize: '0.95rem', color: '#c8d6e5' }}>
                {t(lang, 'memoCalTitle')}
              </span>
              <button
                onClick={closeCalendar}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.4rem', color: '#9aacbf', lineHeight: 1 }}
              >×</button>
            </div>

            {/* 달력 그리드 */}
            <div style={{ overflowY: 'auto', flex: 1, padding: '1rem 1.25rem 1.25rem' }}>
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
                gap: '4px', minWidth: '420px',
              }}>
                {/* 요일 헤더 */}
                {(lang === 'ko'
                  ? ['일','월','화','수','목','금','토']
                  : ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
                ).map((d, i) => (
                  <div key={d} style={{
                    textAlign: 'center', fontSize: '0.72rem', fontWeight: 600, padding: '0.2rem 0',
                    color: i === 0 ? '#ef4444' : i === 6 ? '#60a5fa' : '#9aacbf',
                  }}>{d}</div>
                ))}

                {/* 빈 칸 offset */}
                {Array.from({ length: firstDow }).map((_, i) => (
                  <div key={`e${i}`} style={{ height: '90px' }} />
                ))}

                {/* 날짜 칸 */}
                {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
                  const dow     = (firstDow + day - 1) % 7
                  const dateStr = `${calYear}-${pad2(calMonth)}-${pad2(day)}`
                  const memo    = dayMemoMap[day]
                  const pp      = memo ? parseMemo(memo.content) : null
                  const isToday = dateStr === todayStr
                  const isSun   = dow === 0
                  const isSat   = dow === 6
                  const isSelected = dayDetail?.dateStr === dateStr
                  return (
                    <div
                      key={day}
                      onClick={() => memo ? setDayDetail({ dateStr, memo, pp }) : null}
                      style={{
                        height: '90px', borderRadius: '8px', padding: '5px 7px',
                        background: isSelected ? 'rgba(100,150,255,0.12)' : 'rgba(255,255,255,0.04)',
                        border: isToday
                          ? '2px solid #3b82f6'
                          : isSelected
                            ? '1px solid rgba(100,150,255,0.4)'
                            : '1px solid rgba(255,255,255,0.07)',
                        cursor: memo ? 'pointer' : 'default',
                        display: 'flex', flexDirection: 'column', gap: '2px',
                        transition: 'background 0.12s',
                        boxSizing: 'border-box',
                        overflow: 'hidden',
                      }}
                      onMouseEnter={e => { if (memo) e.currentTarget.style.background = 'rgba(255,255,255,0.09)' }}
                      onMouseLeave={e => { if (memo) e.currentTarget.style.background = isSelected ? 'rgba(100,150,255,0.12)' : 'rgba(255,255,255,0.04)' }}
                    >
                      <span style={{
                        fontSize: '0.75rem', fontWeight: isToday ? 700 : 500,
                        color: isSun ? '#ef4444' : isSat ? '#60a5fa' : '#c8d6e5',
                        flexShrink: 0,
                      }}>{day}</span>
                      {pp && (
                        <>
                          {pp.mood && (
                            <span style={{ fontSize: '1rem', lineHeight: 1, flexShrink: 0 }}>{pp.mood}</span>
                          )}
                          {pp.text && (
                            <span style={{
                              fontSize: '0.65rem', color: '#9aacbf', lineHeight: 1.3,
                              overflow: 'hidden', wordBreak: 'break-all',
                              display: '-webkit-box', WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                            }}>
                              {pp.text.slice(0, 30)}{pp.text.length > 30 ? '…' : ''}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* 날짜 상세 팝업 */}
              {dayDetail && (
                <div style={{
                  marginTop: '1rem', background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.12)', borderRadius: '0.9rem',
                  padding: '1rem 1.2rem',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#c8d6e5' }}>{dayDetail.dateStr}</span>
                    <button
                      onClick={() => setDayDetail(null)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9aacbf', fontSize: '1.1rem' }}
                    >×</button>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                    {dayDetail.pp?.mood && (
                      <span style={{ fontSize: '1.6rem', flexShrink: 0 }}>{dayDetail.pp.mood}</span>
                    )}
                    <p style={{
                      margin: 0, fontSize: '0.85rem', color: '#c8d6e5',
                      lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                    }}>
                      {dayDetail.pp?.text || ''}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
