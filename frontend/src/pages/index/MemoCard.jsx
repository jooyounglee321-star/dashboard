import { ML } from '../../utils/date'
import { useState, useEffect, useCallback, useRef } from 'react'
import { t } from './i18n'
import { apiFetch } from '../../api'
import SharedCalendar from '../../components/SharedCalendar'

const MAX_MEMOS = 4
const MAX_CHARS = 500
const WARN_CHARS = 450

const MOODS = [
  { icon: '😀', key: 'good' },
  { icon: '🙂', key: 'ok' },
  { icon: '😔', key: 'sad' },
  { icon: '🔋', key: 'tired' },
  { icon: '🔥', key: 'fire' },
  { icon: '😤', key: 'stress' },
]

const EMOJI_CATS = [
  { key: 'emotions', emojis: ['😀','😂','🥰','😍','🤩','😎','🙂','😔','😢','😭','😤','😠','🤔','😴','🥱','😰','🤯','🥳','😇','🫠'] },
  { key: 'food',     emojis: ['☕','🍎','🍕','🍜','🍣','🍰','🥗','🍳','🥤','🧃','🍺','🍷','🥐','🍇','🍓'] },
  { key: 'activity', emojis: ['💪','🏃','📚','💻','🎵','🎮','🛌','✈️','🚗','🏋️','🧘','🎨','📝','🛁','🧹'] },
  { key: 'nature',   emojis: ['☀️','🌧️','❄️','🌸','🌙','⭐','🌈','🌊','🍃','🔥'] },
  { key: 'etc',      emojis: ['❤️','💛','💙','👍','✅','⚡','🎉','💡','📌','🙏','💰','🏆','⏰','💊','🔑'] },
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


// ── 메모 입력 폼 컴포넌트 ──────────────────────────────────────
function MemoForm({ lang, initMood = '', initText = '', onSave, onCancel, isMobile }) {
  const [mood, setMood] = useState(initMood)
  const [text, setText] = useState(initText)
  const [emojiOpen, setEmojiOpen]     = useState(false)
  const [emojiCatIdx, setEmojiCatIdx] = useState(0)
  const [emojiPos, setEmojiPos]       = useState({ top: 0, left: 0 })

  const taRef       = useRef(null)
  const pickerRef   = useRef(null)
  const emojiBtnRef = useRef(null)

  // auto-resize
  useEffect(() => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = ta.scrollHeight + 'px'
  }, [text])

  // 외부 클릭 닫기
  useEffect(() => {
    if (!emojiOpen) return
    function onDown(e) {
      if (
        pickerRef.current && !pickerRef.current.contains(e.target) &&
        emojiBtnRef.current && !emojiBtnRef.current.contains(e.target)
      ) setEmojiOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [emojiOpen])

  function openEmojiPicker() {
    if (emojiOpen) { setEmojiOpen(false); return }
    const btn = emojiBtnRef.current
    if (btn) {
      const r = btn.getBoundingClientRect()
      const pickerW = 300, pickerH = 240
      const left = (window.innerWidth - r.left) >= pickerW ? r.left : Math.max(4, r.right - pickerW)
      const top  = (window.innerHeight - r.bottom) >= pickerH ? r.bottom + 6 : r.top - pickerH - 6
      setEmojiPos({ top, left })
    }
    setEmojiOpen(true)
  }

  function insertEmoji(emoji) {
    const ta = taRef.current
    setEmojiOpen(false)
    if (!ta) { setText(prev => (prev + emoji).slice(0, MAX_CHARS)); return }
    const start = ta.selectionStart ?? text.length
    const end   = ta.selectionEnd   ?? text.length
    const next  = (text.slice(0, start) + emoji + text.slice(end)).slice(0, MAX_CHARS)
    setText(next)
    requestAnimationFrame(() => {
      ta.focus()
      const pos = Math.min(start + emoji.length, MAX_CHARS)
      ta.setSelectionRange(pos, pos)
    })
  }

  const charColor = text.length >= MAX_CHARS ? '#ef4444' : text.length >= WARN_CHARS ? '#f97316' : 'var(--ink3)'

  const emojiCatLabels = lang === 'ko'
    ? ['표정', '음식', '활동', '날씨', '기타']
    : ['Mood', 'Food', 'Activity', 'Nature', 'Etc']

  return (
    <div>
      {/* 기분 선택 */}
      <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
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
              transition: 'border-color 0.12s, background 0.12s', flexShrink: 0,
            }}
          >
            <span style={{ fontSize: '1.1rem' }}>{m.icon}</span>
            <span style={{ fontSize: '0.58rem', color: 'var(--ink3)', whiteSpace: 'nowrap' }}>
              {t(lang, 'memoMood_' + m.key)}
            </span>
          </button>
        ))}
      </div>

      {/* textarea */}
      <div style={{ display: 'block' }}>
        <textarea
          ref={taRef}
          className={isMobile ? 'm-memo-ta' : 'memo-ta'}
          style={{ display: 'block', width: '100%', boxSizing: 'border-box', minHeight: '96px', resize: 'none', overflow: 'hidden' }}
          rows={4}
          maxLength={MAX_CHARS}
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder={t(lang, 'memoTaPlaceholder')}
          autoFocus
        />

        {/* 글자수 카운터 + 이모지 버튼 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.3rem' }}>
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
          <span style={{ fontSize: '0.72rem', color: charColor, fontVariantNumeric: 'tabular-nums' }}>
            {text.length} / {MAX_CHARS}
          </span>
        </div>
      </div>

      {/* 저장/취소 버튼 */}
      <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.5rem' }}>
        <button className={isMobile ? 'm-btn-outline' : 'btn-outline'} onClick={() => onSave(mood, text)}>
          {t(lang, 'memoSaveBtn')}
        </button>
        <button className={isMobile ? 'm-btn' : 'btn-sm'} onClick={onCancel}>
          {t(lang, 'memoCancelBtn')}
        </button>
      </div>

      {/* 이모지 피커 — position:fixed로 overflow:hidden 탈출 */}
      {emojiOpen && (
        <div
          ref={pickerRef}
          style={{
            position: 'fixed', top: emojiPos.top, left: emojiPos.left, zIndex: 2000,
            background: 'var(--card)', border: '1px solid rgba(255,255,255,0.18)',
            borderRadius: '0.85rem', width: '300px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.6)', overflow: 'hidden',
          }}
        >
          <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.1)', overflowX: 'auto' }}>
            {emojiCatLabels.map((label, ci) => (
              <button
                key={ci}
                onClick={() => setEmojiCatIdx(ci)}
                style={{
                  flex: '0 0 auto', background: 'none', border: 'none', cursor: 'pointer',
                  padding: '0.45rem 0.6rem', fontSize: '0.68rem',
                  fontWeight: emojiCatIdx === ci ? 700 : 400,
                  color: emojiCatIdx === ci ? '#60a5fa' : '#9aacbf',
                  borderBottom: emojiCatIdx === ci ? '2px solid #60a5fa' : '2px solid transparent',
                  whiteSpace: 'nowrap', lineHeight: 1, transition: 'color 0.12s',
                }}
              >{label}</button>
            ))}
          </div>
          <div style={{ padding: '0.6rem', display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
            {EMOJI_CATS[emojiCatIdx].emojis.map(e => (
              <button
                key={e}
                type="button"
                onClick={() => insertEmoji(e)}
                style={{
                  background: 'var(--card)', border: '1px solid var(--border)',
                  borderRadius: '5px', cursor: 'pointer', fontSize: '1.25rem',
                  padding: '0.22rem 0.3rem', lineHeight: 1, transition: 'background 0.1s',
                }}
                onMouseEnter={ev => ev.currentTarget.style.background = 'rgba(255,255,255,0.18)'}
                onMouseLeave={ev => ev.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
              >{e}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── 저장된 메모 단일 카드 ──────────────────────────────────────
function MemoItem({ memo, lang, isMobile, onEdit, onDelete }) {
  const p = parseMemo(memo.content)
  return (
    <div style={{
      background: 'var(--card2)', borderRadius: '8px',
      border: '1px solid var(--border)', padding: '0.65rem 0.8rem',
      marginBottom: '0.5rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.4rem', marginBottom: '0.45rem' }}>
        {p.mood && (
          <span style={{ fontSize: '1.25rem', flexShrink: 0, marginTop: '0.05rem' }}>{p.mood}</span>
        )}
        <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '0.85rem', color: 'var(--ink2)', lineHeight: 1.65, flex: 1 }}>
          {p.text}
        </span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.35rem' }}>
        <button className={isMobile ? 'm-btn' : 'btn-sm'} onClick={() => onEdit(memo)}>
          {t(lang, 'memoEditBtn')}
        </button>
        <button
          className={isMobile ? 'm-btn' : 'btn-sm'}
          style={{ color: '#f87171' }}
          onClick={() => onDelete(memo.id)}
        >
          {t(lang, 'memoDelBtn')}
        </button>
      </div>
    </div>
  )
}

// ── 메인 MemoCard ──────────────────────────────────────────────
export default function MemoCard({ isMobile = false, lang = 'ko' }) {
  const [memoList, setMemoList] = useState([])   // 오늘 메모 최대 4개
  const [addingNew, setAddingNew] = useState(false)
  const [editingMemo, setEditingMemo] = useState(null) // { id, mood, text }

  // 달력
  const _now = new Date()
  const [calOpen, setCalOpen]     = useState(false)
  const [allMemos, setAllMemos]   = useState([])
  const [calYear, setCalYear]     = useState(_now.getFullYear())
  const [calMonth, setCalMonth]   = useState(_now.getMonth() + 1)
  const [dayDetail, setDayDetail] = useState(null)

  const loadToday = useCallback(async () => {
    const list = await apiFetch('/api/memos?date=' + todayKey()).catch(() => [])
    setMemoList(list.slice(0, MAX_MEMOS))
  }, [])

  useEffect(() => { loadToday() }, [loadToday])

  async function saveNew(mood, text) {
    if (!text.trim() && !mood) return
    await apiFetch('/api/memos', {
      method: 'POST',
      body: JSON.stringify({ date: todayKey(), content: JSON.stringify({ mood, text }) }),
    })
    setAddingNew(false)
    await loadToday()
  }

  async function saveEdit(mood, text) {
    if (!editingMemo) return
    await apiFetch('/api/memos/' + editingMemo.id, {
      method: 'PUT',
      body: JSON.stringify({ content: JSON.stringify({ mood, text }) }),
    })
    setEditingMemo(null)
    await loadToday()
  }

  async function deleteMemo(id) {
    await apiFetch('/api/memos/' + id, { method: 'DELETE' })
    await loadToday()
  }

  function startEdit(memo) {
    const p = parseMemo(memo.content)
    setEditingMemo({ id: memo.id, initMood: p.mood, initText: p.text })
    setAddingNew(false)
  }

  function cancelEdit() { setEditingMemo(null) }
  function cancelNew()  { setAddingNew(false) }

  async function openCalendar() {
    const list = await apiFetch('/api/memos').catch(() => [])
    setAllMemos(list); setCalOpen(true); setDayDetail(null)
  }

  function closeCalendar() { setCalOpen(false); setDayDetail(null) }

  // 달력 계산
  // 날짜별 메모 배열로 그룹핑 (복수 메모 지원)
  const dayMemoMap  = {}
  allMemos.forEach(m => {
    const d = (m.date || '').slice(0, 10)
    if (d.startsWith(`${calYear}-${pad2(calMonth)}`)) {
      const day = parseInt(d.slice(8), 10)
      if (!dayMemoMap[day]) dayMemoMap[day] = []
      dayMemoMap[day].push(m)
    }
  })

  const hdr      = isMobile ? 'm-card-header' : 'card-header'
  const titleCls = isMobile ? 'm-card-title'  : 'card-title'
  const body     = isMobile ? 'm-card-body'   : 'card-body'
  const wrapper  = isMobile ? 'm-card'        : 'card card-memo'

  const canAddMore = memoList.length < MAX_MEMOS && !addingNew

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

      <div className={body}>

        {/* ── 저장된 메모 목록 ── */}
        {memoList.length === 0 && !addingNew && (
          <div style={{ color: '#a89880', fontStyle: 'italic', fontSize: isMobile ? undefined : '0.82rem', marginBottom: '0.5rem' }}>
            {t(lang, 'memoPlaceholder')}
          </div>
        )}

        {memoList.map(memo => (
          editingMemo?.id === memo.id ? (
            // 수정 폼
            <div key={memo.id} style={{
              background: 'var(--card2)', borderRadius: '8px',
              border: '1px solid var(--accent)', padding: '0.65rem 0.8rem', marginBottom: '0.5rem',
            }}>
              <MemoForm
                key={memo.id}
                lang={lang}
                isMobile={isMobile}
                initMood={editingMemo.initMood}
                initText={editingMemo.initText}
                onSave={saveEdit}
                onCancel={cancelEdit}
              />
            </div>
          ) : (
            <MemoItem
              key={memo.id}
              memo={memo}
              lang={lang}
              isMobile={isMobile}
              onEdit={startEdit}
              onDelete={deleteMemo}
            />
          )
        ))}

        {/* ── 새 메모 입력 폼 ── */}
        {addingNew && (
          <div style={{
            background: 'var(--card2)', borderRadius: '8px',
            border: '1px solid var(--accent)', padding: '0.65rem 0.8rem', marginBottom: '0.5rem',
          }}>
            <MemoForm
              lang={lang}
              isMobile={isMobile}
              onSave={saveNew}
              onCancel={cancelNew}
            />
          </div>
        )}

        {/* ── + 메모 추가 버튼 ── */}
        {canAddMore && (
          <button
            className={isMobile ? 'm-btn' : 'btn-sm'}
            style={{ marginTop: memoList.length > 0 ? '0.1rem' : 0 }}
            onClick={() => { setAddingNew(true); setEditingMemo(null) }}
          >
            {t(lang, 'memoAddBtn')}
          </button>
        )}

        {/* 4개 꽉 찼을 때 안내 */}
        {memoList.length >= MAX_MEMOS && !addingNew && (
          <div style={{ fontSize: '0.72rem', color: 'var(--ink3)', marginTop: '0.4rem' }}>
            {t(lang, 'memoMaxReached')}
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════
          달력 모달
      ══════════════════════════════════════════════ */}
      {calOpen && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
          onClick={e => { if (e.target === e.currentTarget) closeCalendar() }}
        >
          <div style={{ background: 'var(--card)', borderRadius: '1.25rem', border: '1px solid var(--border)', width: '100%', maxWidth: '780px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 8px 40px rgba(0,0,0,0.15)' }}>
            <div style={{ padding: '0.9rem 1.25rem 0.7rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--ink)' }}>
                📅 {t(lang, 'memoCalTitle')}
              </span>
              <button onClick={closeCalendar} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.4rem', color: 'var(--ink3)', lineHeight: 1 }}>×</button>
            </div>
            <div style={{ overflowY: 'auto', flex: 1, padding: '1rem 1.25rem 1.25rem' }}>
              <SharedCalendar
                year={calYear} month={calMonth} lang={lang}
                onPrevMonth={() => { setDayDetail(null); if (calMonth === 1) { setCalYear(y => y - 1); setCalMonth(12) } else setCalMonth(m => m - 1) }}
                onNextMonth={() => { setDayDetail(null); if (calMonth === 12) { setCalYear(y => y + 1); setCalMonth(1) } else setCalMonth(m => m + 1) }}
                onDayClick={dateStr => { const day = parseInt(dateStr.slice(8), 10); const memos = dayMemoMap[day] || []; if (memos.length) setDayDetail({ dateStr, memos }) }}
                isCellClickable={dateStr => { const day = parseInt(dateStr.slice(8), 10); return !!(dayMemoMap[day]?.length) }}
                renderCell={(dateStr, day, _meta) => {
                  const memos = dayMemoMap[day] || []
                  const first = memos[0] || null
                  const pp = first ? parseMemo(first.content) : null
                  const extraCnt = memos.length - 1
                  const isSelected = dayDetail?.dateStr === dateStr
                  if (!pp) return null
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1, overflow: 'hidden', ...(isSelected ? { background: 'rgba(59,130,246,0.08)', borderRadius: 4 } : {}) }}>
                      {pp.mood && <span style={{ fontSize: '1rem', lineHeight: 1, flexShrink: 0 }}>{pp.mood}</span>}
                      {pp.text && <span style={{ fontSize: '0.62rem', color: 'var(--ink2)', lineHeight: 1.3, overflow: 'hidden', wordBreak: 'break-all', display: '-webkit-box', WebkitLineClamp: extraCnt > 0 ? 1 : 2, WebkitBoxOrient: 'vertical' }}>{pp.text.slice(0, 30)}{pp.text.length > 30 ? '...' : ''}</span>}
                      {extraCnt > 0 && <span style={{ fontSize: '0.6rem', color: 'var(--accent)', fontWeight: 600 }}>+{extraCnt}{lang === 'ko' ? '개 더' : ' more'}</span>}
                    </div>
                  )
                }}
              />
              {dayDetail && (
                <div style={{ marginTop: '1rem', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '0.9rem', padding: '1rem 1.2rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.8rem' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--ink)' }}>{dayDetail.dateStr}</span>
                    <button onClick={() => setDayDetail(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', fontSize: '1.1rem' }}>×</button>
                  </div>
                  {dayDetail.memos.map((memo, idx) => {
                    const pp = parseMemo(memo.content)
                    return (
                      <div key={memo.id}>
                        {idx > 0 && <div style={{ borderTop: '1px solid var(--border)', margin: '0.7rem 0' }} />}
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                          {pp.mood && <span style={{ fontSize: '1.5rem', flexShrink: 0 }}>{pp.mood}</span>}
                          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--ink)', lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{pp.text || ''}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
