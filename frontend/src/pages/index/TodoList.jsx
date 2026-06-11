import { useState, useEffect, useCallback } from 'react'
import { t } from './i18n'
import { authH, authHJ } from '../../utils/api'

export default function TodoList({ date, lang = 'ko', isMobile = false }) {
  const [todos, setTodos]       = useState([])
  const [loading, setLoading]   = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newStart, setNewStart] = useState('')
  const [newDue,   setNewDue]   = useState('')
  const [dateErr,  setDateErr]  = useState(false)
  const [saving,   setSaving]   = useState(false)

  const load = useCallback(async () => {
    if (!date) return
    setLoading(true)
    try {
      const res = await fetch(`/api/todos?date=${date}`, { headers: authH() })
      setTodos(res.ok ? await res.json() : [])
    } catch { setTodos([]) }
    finally { setLoading(false) }
  }, [date])

  useEffect(() => { load() }, [load])

  function handleStartChange(val) {
    setNewStart(val)
    setDateErr(val && newDue && val > newDue)
  }
  function handleDueChange(val) {
    setNewDue(val)
    setDateErr(newStart && val && newStart > val)
  }

  async function addTodo() {
    if (!newTitle.trim() || dateErr) return
    setSaving(true)
    try {
      const res = await fetch('/api/todos', {
        method: 'POST',
        headers: authHJ(),
        body: JSON.stringify({
          title: newTitle.trim(),
          start_date: newStart || null,
          due_date:   newDue   || null,
        }),
      })
      if (res.ok) {
        setNewTitle(''); setNewStart(''); setNewDue(''); setDateErr(false)
        setShowForm(false)
        await load()
      }
    } finally { setSaving(false) }
  }

  async function toggleCheck(todo) {
    const isDone = todo.is_done_dates.includes(date)
    await fetch(`/api/todos/${todo.id}/check`, {
      method: 'PUT',
      headers: authHJ(),
      body: JSON.stringify({ date, checked: !isDone }),
    })
    setTodos(prev => prev.map(td =>
      td.id !== todo.id ? td : {
        ...td,
        is_done_dates: isDone
          ? td.is_done_dates.filter(d => d !== date)
          : [...td.is_done_dates, date],
      }
    ))
  }

  async function deleteTodo(id) {
    await fetch(`/api/todos/${id}`, { method: 'DELETE', headers: authH() })
    setTodos(prev => prev.filter(td => td.id !== id))
  }

  // 날짜 표시 타입 판별
  function dateDisplay(todo) {
    const s = todo.start_date   // "YYYY-MM-DD" | null
    const d = todo.due_date     // "YYYY-MM-DD" | null
    if (!d) return null         // 영구 — 표시 없음
    const [, dm, dd] = d.split('-')
    const dLabel = `${parseInt(dm)}/${parseInt(dd)}`
    if (s && s === d) {
      // 특정 하루
      return { label: dLabel + ' ' + t(lang, 'todoOneDayLabel'), oneDay: true }
    }
    // 기간 또는 마감일만
    return { label: t(lang, 'todoDueLabel') + ' ' + dLabel, oneDay: false }
  }

  function isToday(dueStr) { return dueStr && date && dueStr === date }
  function isOverdue(dueStr) { return dueStr && date && dueStr < date }

  const fs = isMobile ? { title: '0.82rem', sub: '0.74rem' } : { title: '0.85rem', sub: '0.75rem' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* 섹션 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
        <span style={{ fontSize: fs.title, fontWeight: 600, color: 'var(--ink)' }}>
          ✅ {t(lang, 'todoTitle')}
        </span>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            style={{ fontSize: '0.75rem', color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: '0.1rem 0.3rem' }}
          >
            {t(lang, 'todoAddBtn')}
          </button>
        )}
      </div>

      {/* 인라인 추가 폼 */}
      {showForm && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '0.6rem', padding: '0.6rem', background: 'var(--card2)', borderRadius: 8 }}>
          <input
            autoFocus
            type="text"
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') addTodo()
              if (e.key === 'Escape') { setShowForm(false); setNewTitle(''); setNewStart(''); setNewDue(''); setDateErr(false) }
            }}
            placeholder={t(lang, 'todoPlaceholder')}
            style={{ fontSize: fs.title, padding: '0.35rem 0.5rem', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg)', color: 'var(--ink)', fontFamily: 'inherit' }}
          />

          {/* 날짜 두 필드 나란히 */}
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--ink3)' }}>{t(lang, 'todoStartPlaceholder')}</span>
              <input
                type="date"
                value={newStart}
                onChange={e => handleStartChange(e.target.value)}
                style={{ width: '100%', fontSize: fs.sub, padding: '0.3rem 0.45rem', border: `1px solid ${dateErr ? '#e53935' : 'var(--border)'}`, borderRadius: 6, background: 'var(--bg)', color: 'var(--ink)', fontFamily: 'inherit' }}
              />
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--ink3)' }}>{t(lang, 'todoDuePlaceholder')}</span>
              <input
                type="date"
                value={newDue}
                onChange={e => handleDueChange(e.target.value)}
                style={{ width: '100%', fontSize: fs.sub, padding: '0.3rem 0.45rem', border: `1px solid ${dateErr ? '#e53935' : 'var(--border)'}`, borderRadius: 6, background: 'var(--bg)', color: 'var(--ink)', fontFamily: 'inherit' }}
              />
            </div>
          </div>

          {dateErr && (
            <span style={{ fontSize: '0.72rem', color: '#e53935' }}>{t(lang, 'todoDateError')}</span>
          )}

          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <button
              onClick={addTodo}
              disabled={saving || !newTitle.trim() || dateErr}
              style={{ fontSize: fs.sub, padding: '0.3rem 0.7rem', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit', opacity: (!newTitle.trim() || saving || dateErr) ? 0.5 : 1 }}
            >{t(lang, 'todoSaveBtn')}</button>
            <button
              onClick={() => { setShowForm(false); setNewTitle(''); setNewStart(''); setNewDue(''); setDateErr(false) }}
              style={{ fontSize: fs.sub, padding: '0.3rem 0.5rem', background: 'var(--card2)', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit', color: 'var(--ink3)' }}
            >{t(lang, 'todoCancelBtn')}</button>
          </div>
        </div>
      )}

      {/* 목록 */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
        {loading && <p style={{ fontSize: fs.sub, color: 'var(--ink3)', margin: 0 }}>{t(lang, 'todoLoading')}</p>}
        {!loading && todos.length === 0 && (
          <p style={{ fontSize: fs.sub, color: 'var(--ink3)', margin: 0 }}>{t(lang, 'todoEmpty')}</p>
        )}
        {todos.map(todo => {
          const done = todo.is_done_dates.includes(date)
          const disp = dateDisplay(todo)
          const overdue  = isOverdue(todo.due_date)
          const todayDue = isToday(todo.due_date)
          return (
            <div
              key={todo.id}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0.55rem', background: 'var(--card2)', borderRadius: 8, opacity: done ? 0.55 : 1 }}
            >
              <input
                type="checkbox"
                checked={done}
                onChange={() => toggleCheck(todo)}
                style={{ width: 15, height: 15, cursor: 'pointer', accentColor: 'var(--accent)', flexShrink: 0 }}
              />
              <span style={{ flex: 1, fontSize: fs.title, color: 'var(--ink2)', textDecoration: done ? 'line-through' : 'none', wordBreak: 'break-word', lineHeight: 1.4 }}>
                {todo.title}
              </span>
              {disp && (
                disp.oneDay ? (
                  <span style={{ fontSize: '0.7rem', whiteSpace: 'nowrap', fontWeight: 600, color: '#fff', background: '#f57c00', padding: '0.1em 0.45em', borderRadius: 4, flexShrink: 0 }}>
                    {disp.label}
                  </span>
                ) : (
                  <span style={{ fontSize: '0.72rem', whiteSpace: 'nowrap', fontWeight: (overdue || todayDue) ? 600 : 400, color: (overdue || todayDue) ? '#e53935' : 'var(--ink3)', flexShrink: 0 }}>
                    {disp.label}
                  </span>
                )
              )}
              <button
                onClick={() => deleteTodo(todo.id)}
                title="삭제"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', fontSize: '0.8rem', padding: '0.1rem 0.2rem', lineHeight: 1, flexShrink: 0 }}
              >🗑️</button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
