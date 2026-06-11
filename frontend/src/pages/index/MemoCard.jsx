import { useState, useEffect, useCallback, useRef } from 'react'
import { t } from './i18n'

const MOODS = [
  { icon: '😀', key: 'good' },
  { icon: '🙂', key: 'ok' },
  { icon: '😔', key: 'sad' },
  { icon: '🔋', key: 'tired' },
  { icon: '🔥', key: 'fire' },
  { icon: '😤', key: 'stress' },
]

const EMOJI_CATS = [
  {
    key: 'emotions',
    emojis: ['😀','😂','🥰','😍','🤩','😎','🙂','😔','😢','😭','😤','😠','🤔','😴','🥱','😰','🤯','🥳','😇','🫠'],
  },
  {
    key: 'food',
    emojis: ['☕','🍎','🍕','🍜','🍣','🍰','🥗','🍳','🥤','🧃','🍺','🍷','🥐','🍇','🍓'],
  },
  {
    key: 'activity',
    emojis: ['💪','🏃','📚','💻','🎵','🎮','🛌','✈️','🚗','🏋️','🧘','🎨','📝','🛁','🧹'],
  },
  {
    key: 'nature',
    emojis: ['☀️','🌧️','❄️','🌸','🌙','⭐','🌈','🌊','🍃','🔥'],
  },
  {
    key: 'etc',
    emojis: ['❤️','💛','💙','👍','✅','⚡','🎉','💡','📌','🙏','💰','🏆','⏰','💊','🔑'],
  },
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

  // 이모지 피커
  const [emojiOpen, setEmojiOpen]     = useState(false)
  const [emojiCatIdx, setEmojiCatIdx] = useState(0)
  const [emojiPos, setEmojiPos]       = useState({ top: 0, left: 0 })

  // 달력
  const _now = new Date()
  const [calOpen, setCalOpen]     = useState(false)
  const [allMemos, setAllMemos]   = useState([])
  const [calYear, setCalYear]     = useState(_now.getFullYear())
  const [calMonth, setCalMonth]   = useState(_now.getMonth() + 1)
  const [dayDetail, setDayDetail] = useState(null)

  const taRef       = useRef(null)
  const pickerRef   = useRef(null)
  const emojiBtnRef = useRef(null)

  const authHdr = () => ({ Authorization: 'Bearer ' + localStorage.getItem('token') })

  const loadToday = useCallback(async () => {
    const list = await fetch('/api/memos?date=' + todayKey(), { headers: authHdr() })
      .then(r => r.ok ? r.json() : []).catch(() => [])
    const m = list.length ? list[0] : null
    setMemoData(m)
    if (m) {
      const p = parseMemo(m.content)
      setMood(p.mood); setText(p.text)
    } else {
      setMood(''); setText('')
    }
  }, [])

  useEffect(() => { loadToday() }, [loadToday])

  // textarea auto-resize
  useEffect(() => {
    const ta = taRef.current
    if (!ta || !editing) return
    ta.style.height = 'auto'
    ta.style.height = ta.scrollHeight + 'px'
  }, [text, editing])

  // 이모지 피커 외부 클릭 닫기
  useEffect(() => {
    if (!emojiOpen) return
    function onDown(e) {
      if (
        pickerRef.current && !pickerRef.current.contains(e.target) &&
        emojiBtnRef.current && !emojiBtnRef.current.contains(e.target)
      ) {
        setEmojiOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [emojiOpen])

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
    setEditing(false); setEmojiOpen(false)
    await loadToday()
  }

  async function deleteMemo() {
    if (!memoData?.id) return
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

  // 이모지 피커 열기 — 버튼 위치 기반으로 fixed 좌표 계산
  function openEmojiPicker() {
    if (emojiOpen) { setEmojiOpen(false); return }
    const btn = emojiBtnRef.current
    if (btn) {
      const r = btn.getBoundingClientRect()
      // 오른쪽 공간 확인 후 left/right 결정
      const pickerW = 300
      const spaceRight = window.innerWidth - r.left
      const left = spaceRight >= pickerW ? r.left : Math.max(4, r.right - pickerW)
      // 아래 공간 확인
      const pickerH = 240
      const spaceBelow = window.innerHeight - r.bottom
      const top = spaceBelow >= pickerH ? r.bottom + 6 : r.top - pickerH - 6
      setEmojiPos({ top, left })
    }
    setEmojiOpen(true)
  }

  function insertEmoji(emoji) {
    const ta = taRef.current
    setEmojiOpen(false)
    if (!ta) { setText(prev => prev + emoji); return }
    const start = ta.selectionStart ?? text.length
    const end   = ta.selectionEnd   ?? text.length
    const next  = text.slice(0, start) + emoji + text.slice(end)
    setText(next)
    requestAnimationFrame(() => {
      ta.focus()
      const pos = start + emoji.length
      ta.setSelectionRange(pos, pos)
    })
  }

  async function openCalendar() {
    const list = await fetch('/api/memos', { headers: authHdr() })
      .then(r => r.ok ? r.json() : []).catch(() => [])
    setAllMemos(list); setCalOpen(true); setDayDetail(null)
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
  const parsed   = parseMemo(memoData?.content)

  const hdr      = isMobile ? 'm-card-header' : 'card-header'
  const titleCls = isMobile ? 'm-card-title'  : 'card-title'
  const body     = isMobile ? 'm-card-body'   : 'card-body'
  const wrapper  = isMobile ? 'm-card'        : 'card card-memo'

  const emojiCatLabels = lang === 'ko'
    ? ['표정', '음식', '활동', '날씨', '기타']
    : ['Mood', 'Food', 'Activity', 'Nature', 'Etc']

  return (
    <div className={wrapper}>

      {/* ── 헤더 ── */}
      <div className={hdr} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span className="card-icon">📝</span>
        <span className={titleCls}>{t(lang, 'memoTitle')}</span>
        <button
          className={isMobile ? 'm-btn' : 'btn-sm'}
          style={{ marginLeft: 'auto', fontSize: '0.75rem', whiteSpace: 'nowrap' }}
          onClick={openCalendar}
        >
          📅 {t(lang, 'memoCalBtn')}
        </button>
      </div>

      {/* ── 카드 바디 — 명시적 블록 스택 레이아웃 ── */}
      <div className={body}>

        {/* 1. 기분 선택 — 편집 모드, textarea 위에 독립 블록 */}
        {editing && (
          <div style={{
            display: 'flex', gap: '0.3rem', flexWrap: 'wrap',
            marginBottom: '0.5rem',
          }}>
            {MOODS.map(m => (
              <button
                key={m.key}
                onClick={() => setMood(mood === m.icon ? '' : m.icon)}
                style={{
                  border: mood === m.icon ? '2px solid var(--accent)' : '1px solid var(--border)',
                  borderRadius: '8px',
                  background: mood === m.icon ? 'rgba(100,150,255,0.15)' : 'var(--bg)',
                  padding: '0.28rem 0.45rem', cursor: 'pointer',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px',
                  transition: 'border-color 0.12s, background 0.12s',
                  flexShrink: 0,
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

        {/* 2. 보기 영역 (비편집 모드) */}
        {!editing && (
          <div className={isMobile ? 'm-memo-display' : 'memo-display'}>
            {memoData ? (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.4rem' }}>
                {parsed.mood && (
                  <span style={{ fontSize: '1.35rem', flexShrink: 0, marginTop: '0.05rem' }}>{parsed.mood}</span>
                )}
                <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{parsed.text}</span>
              </div>
            ) : (
              <span style={{ color: '#a89880', fontStyle: 'italic', fontSize: isMobile ? undefined : '0.82rem' }}>
                {t(lang, 'memoPlaceholder')}
              </span>
            )}
          </div>
        )}

        {/* 3. 텍스트 입력 (편집 모드) — 기분 버튼과 완전히 분리된 별도 블록 */}
        {editing && (
          <div style={{ display: 'block' }}>
            <textarea
              ref={taRef}
              className={isMobile ? 'm-memo-ta' : 'memo-ta'}
              style={{
                display: 'block',
                width: '100%',
                boxSizing: 'border-box',
                minHeight: '96px',
                resize: 'none',
                overflow: 'hidden',
              }}
              rows={4}
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder={t(lang, 'memoTaPlaceholder')}
              autoFocus
            />

            {/* 4. 이모지 피커 버튼 — textarea 바로 아래 */}
            <div style={{ marginTop: '0.35rem' }}>
              <button
                ref={emojiBtnRef}
                type="button"
                onClick={openEmojiPicker}
                style={{
                  background: 'var(--bg)', border: '1px solid var(--border)',
                  borderRadius: '6px', cursor: 'pointer', fontSize: '1rem',
                  padding: '0.18rem 0.5rem', lineHeight: 1,
                }}
                title={t(lang, 'memoEmojiBtn')}
              >😀</button>
            </div>
          </div>
        )}

        {/* 5. 액션 버튼 영역 */}
        <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.55rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {!editing ? (
            <>
              {!memoData && (
                <button className={isMobile ? 'm-btn' : 'btn-sm'} onClick={startEdit}>
                  {t(lang, 'memoNewBtn')}
                </button>
              )}
              {memoData && (
                <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.35rem' }}>
                  <button className={isMobile ? 'm-btn' : 'btn-sm'} onClick={startEdit}>
                    {t(lang, 'memoEditBtn')}
                  </button>
                  <button
                    className={isMobile ? 'm-btn' : 'btn-sm'}
                    style={{ color: '#f87171' }}
                    onClick={deleteMemo}
                  >
                    {t(lang, 'memoDelBtn')}
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              <button className={isMobile ? 'm-btn-outline' : 'btn-outline'} onClick={saveMemo}>
                {t(lang, 'memoSaveBtn')}
              </button>
              <button
                className={isMobile ? 'm-btn' : 'btn-sm'}
                onClick={() => { setEditing(false); setEmojiOpen(false) }}
              >
                {t(lang, 'memoCancelBtn')}
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── 이모지 피커 — position: fixed로 overflow:hidden 탈출 ── */}
      {emojiOpen && (
        <div
          ref={pickerRef}
          style={{
            position: 'fixed',
            top: emojiPos.top,
            left: emojiPos.left,
            zIndex: 2000,
            background: '#1a2336',
            border: '1px solid rgba(255,255,255,0.18)',
            borderRadius: '0.85rem',
            width: '300px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
            overflow: 'hidden',
          }}
        >
          {/* 카테고리 탭 */}
          <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.1)', overflowX: 'auto' }}>
            {emojiCatLabels.map((label, ci) => (
              <button
                key={ci}
                onClick={() => setEmojiCatIdx(ci)}
                style={{
                  flex: '0 0 auto', background: 'none', border: 'none',
                  cursor: 'pointer', padding: '0.45rem 0.6rem',
                  fontSize: '0.68rem',
                  fontWeight: emojiCatIdx === ci ? 700 : 400,
                  color: emojiCatIdx === ci ? '#60a5fa' : '#9aacbf',
                  borderBottom: emojiCatIdx === ci ? '2px solid #60a5fa' : '2px solid transparent',
                  whiteSpace: 'nowrap', lineHeight: 1,
                  transition: 'color 0.12s',
                }}
              >{label}</button>
            ))}
          </div>

          {/* 이모지 그리드 */}
          <div style={{ padding: '0.6rem', display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
            {EMOJI_CATS[emojiCatIdx].emojis.map(e => (
              <button
                key={e}
                type="button"
                onClick={() => insertEmoji(e)}
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '5px', cursor: 'pointer',
                  fontSize: '1.25rem', padding: '0.22rem 0.3rem', lineHeight: 1,
                  transition: 'background 0.1s',
                }}
                onMouseEnter={ev => ev.currentTarget.style.background = 'rgba(255,255,255,0.18)'}
                onMouseLeave={ev => ev.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
              >{e}</button>
            ))}
          </div>
        </div>
      )}

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
                {(lang === 'ko'
                  ? ['일','월','화','수','목','금','토']
                  : ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
                ).map((d, i) => (
                  <div key={d} style={{
                    textAlign: 'center', fontSize: '0.72rem', fontWeight: 600, padding: '0.2rem 0',
                    color: i === 0 ? '#ef4444' : i === 6 ? '#60a5fa' : '#9aacbf',
                  }}>{d}</div>
                ))}

                {Array.from({ length: firstDow }).map((_, i) => (
                  <div key={`e${i}`} style={{ height: '90px' }} />
                ))}

                {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
                  const dow     = (firstDow + day - 1) % 7
                  const dateStr = `${calYear}-${pad2(calMonth)}-${pad2(day)}`
                  const memo    = dayMemoMap[day]
                  const pp      = memo ? parseMemo(memo.content) : null
                  const isToday    = dateStr === todayStr
                  const isSun      = dow === 0
                  const isSat      = dow === 6
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
                        boxSizing: 'border-box', overflow: 'hidden',
                      }}
                      onMouseEnter={e => { if (memo) e.currentTarget.style.background = 'rgba(255,255,255,0.09)' }}
                      onMouseLeave={e => { if (memo) e.currentTarget.style.background = isSelected ? 'rgba(100,150,255,0.12)' : 'rgba(255,255,255,0.04)' }}
                    >
                      <span style={{
                        fontSize: '0.75rem', fontWeight: isToday ? 700 : 500, flexShrink: 0,
                        color: isSun ? '#ef4444' : isSat ? '#60a5fa' : '#c8d6e5',
                      }}>{day}</span>
                      {pp && (
                        <>
                          {pp.mood && <span style={{ fontSize: '1rem', lineHeight: 1, flexShrink: 0 }}>{pp.mood}</span>}
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
