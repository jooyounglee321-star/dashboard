import { useState, useEffect, useCallback } from 'react'
import { t } from './i18n'

export default function TodoList({ date, lang = 'ko', isMobile = false }) {
  const today = date   // 실제 오늘 날짜 (변하지 않음)

  const [viewDate, setViewDate] = useState(date)
  const [todos, setTodos]       = useState([])
  const [loading, setLoading]   = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newType,  setNewType]  = useState('repeat')   // 'repeat' | 'once'
  const [newStart, setNewStart] = useState('')
  const [newDue,   setNewDue]   = useState('')
  const [dateErr,  setDateErr]  = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [savedMsg, setSavedMsg] = useState('')

  const isViewingToday = viewDate === today

  function shiftDay(delta) {
    const d = new Date(viewDate + 'T00:00:00')
    d.setDate(d.getDate() + delta)
    setViewDate(d.toISOString().slice(0, 10))
  }

  const load = useCallback(async () => {
    if (!viewDate) return
    setLoading(true)
    try {
      const res = await fetch(`/api/todos?date=${viewDate}`, { credentials: 'include' })
      setTodos(res.ok ? await res.json() : [])
    } catch { setTodos([]) }
    finally { setLoading(false) }
  }, [viewDate])

  useEffect(() => { load() }, [load])

  function handleStartChange(val) {
    setNewStart(val)
    setDateErr(val && newDue && val > newDue)
  }
  function handleDueChange(val) {
    setNewDue(val)
    setDateErr(newStart && val && newStart > val)
  }

  function resetForm() {
    setNewTitle(''); setNewType('repeat'); setNewStart(''); setNewDue(''); setDateErr(false)
  }

  async function addTodo() {
    if (!newTitle.trim() || dateErr) return
    setSaving(true)
    try {
      const res = await fetch('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          title:      newTitle.trim(),
          todo_type:  newType,
          start_date: newStart || null,
          due_date:   newDue   || null,
        }),
      })
      if (res.ok) {
        const isFuture = newStart && newStart > viewDate
        resetForm()
        setShowForm(false)
        if (isFuture) {
          setSavedMsg(`✓ 저장됨 (${newStart}부터 표시)`)
          setTimeout(() => setSavedMsg(''), 3000)
        }
      }
    } finally {
      setSaving(false)
    }
    await load()
  }

  async function toggleCheck(todo) {
    const isDone = todo.is_done_dates.includes(viewDate)
    await fetch(`/api/todos/${todo.id}/check`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ date: viewDate, checked: !isDone }),
    })
    setTodos(prev => prev.map(td =>
      td.id !== todo.id ? td : {
        ...td,
        is_done_dates: isDone
          ? td.is_done_dates.filter(d => d !== viewDate)
          : [...td.is_done_dates, viewDate],
      }
    ))
  }

  async function deleteTodo(id) {
    await fetch(`/api/todos/${id}`, { method: 'DELETE', credentials: 'include' })
    setTodos(prev => prev.filter(td => td.id !== id))
  }

  function dateDisplay(todo) {
    const s = todo.start_date
    const d = todo.due_date
    if (!d) return null
    const [, dm, dd] = d.split('-')
    const dLabel = `${parseInt(dm)}/${parseInt(dd)}`
    if (s && s === d) {
      return { label: dLabel + ' ' + t(lang, 'todoOneDayLabel'), oneDay: true }
    }
    return { label: t(lang, 'todoDueLabel') + ' ' + dLabel, oneDay: false }
  }

  function isToday(dueStr) { return dueStr && viewDate && dueStr === viewDate }
  function isOverdue(dueStr) { return dueStr && viewDate && dueStr < viewDate }

  const fs = isMobile ? { title: '0.82rem', sub: '0.74rem' } : { title: '0.85rem', sub: '0.75rem' }

  function typeBtnStyle(active) {
    return {
      fontSize: '0.72rem', padding: '0.25rem 0.5rem', borderRadius: 6, cursor: 'pointer',
      fontFamily: 'inherit', border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
      background: active ? 'var(--accent)' : 'var(--bg)',
      color: active ? '#fff' : 'var(--ink3)', fontWeight: active ? 600 : 400,
    }
  }

  const navBtnSt = {
    fontSize: '0.75rem', padding: '0.18rem 0.45rem', borderRadius: 5, cursor: 'pointer',
    fontFamily: 'inherit', border: '1px solid var(--border)',
    background: 'var(--bg)', color: 'var(--ink3)', lineHeight: 1,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* 섹션 헤더 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '0.6rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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

        {/* 날짜 네비게이션 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <button onClick={() => shiftDay(-1)} style={navBtnSt}>←</button>
          <input
            type="date"
            value={viewDate}
            onChange={e => e.target.value && setViewDate(e.target.value)}
            style={{ flex: 1, fontSize: '0.73rem', border: '1px solid var(--border)', borderRadius: 5, padding: '0.18rem 0.35rem', background: 'var(--bg)', color: 'var(--ink)', fontFamily: 'inherit', cursor: 'pointer', textAlign: 'center' }}
          />
          <button onClick={() => shiftDay(1)} style={navBtnSt}>→</button>
          {!isViewingToday && (
            <button
              onClick={() => setViewDate(today)}
              style={{ ...navBtnSt, color: 'var(--accent)', fontSize: '0.65rem', padding: '0.18rem 0.45rem', fontWeight: 600 }}
            >
              오늘
            </button>
          )}
        </div>
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
              if (e.key === 'Escape') { setShowForm(false); resetForm() }
            }}
            placeholder={t(lang, 'todoPlaceholder')}
            style={{ fontSize: fs.title, padding: '0.35rem 0.5rem', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg)', color: 'var(--ink)', fontFamily: 'inherit' }}
          />

          {/* 타입 선택 토글 */}
          <div style={{ display: 'flex', gap: '0.35rem' }}>
            <button onClick={() => setNewType('repeat')} style={typeBtnStyle(newType === 'repeat')}>
              {t(lang, 'todoTypeRepeat')}
            </button>
            <button onClick={() => setNewType('once')} style={typeBtnStyle(newType === 'once')}>
              {t(lang, 'todoTypeOnce')}
            </button>
          </div>

          {/* 날짜 두 필드 나란히 */}
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--ink3)' }}>{t(lang, 'todoStartPlaceholder')}</span>
              <input
                type="date"
                value={newStart}
                onChange={e => handleStartChange(e.target.value)}
                style={{ width: '100%', fontSize: fs.sub, padding: '0.3rem 0.45rem', border: `1px solid ${dateErr ? 'var(--red)' : 'var(--border)'}`, borderRadius: 6, background: 'var(--bg)', color: 'var(--ink)', fontFamily: 'inherit' }}
              />
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--ink3)' }}>{t(lang, 'todoDuePlaceholder')}</span>
              <input
                type="date"
                value={newDue}
                onChange={e => handleDueChange(e.target.value)}
                style={{ width: '100%', fontSize: fs.sub, padding: '0.3rem 0.45rem', border: `1px solid ${dateErr ? 'var(--red)' : 'var(--border)'}`, borderRadius: 6, background: 'var(--bg)', color: 'var(--ink)', fontFamily: 'inherit' }}
              />
            </div>
          </div>

          {dateErr && (
            <span style={{ fontSize: '0.72rem', color: 'var(--red)' }}>{t(lang, 'todoDateError')}</span>
          )}

          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <button
              onClick={addTodo}
              disabled={saving || !newTitle.trim() || dateErr}
              style={{ fontSize: fs.sub, padding: '0.3rem 0.7rem', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit', opacity: (!newTitle.trim() || saving || dateErr) ? 0.5 : 1 }}
            >{t(lang, 'todoSaveBtn')}</button>
            <button
              onClick={() => { setShowForm(false); resetForm() }}
              style={{ fontSize: fs.sub, padding: '0.3rem 0.5rem', background: 'var(--card2)', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit', color: 'var(--ink3)' }}
            >{t(lang, 'todoCancelBtn')}</button>
          </div>
        </div>
      )}

      {/* 저장 확인 메시지 */}
      {savedMsg && (
        <div style={{ fontSize: '0.75rem', color: 'var(--green)', padding: '0.3rem 0.5rem', background: 'rgba(5,150,105,0.06)', borderRadius: 6, marginBottom: '0.4rem', border: '1px solid rgba(5,150,105,0.2)' }}>
          {savedMsg}
        </div>
      )}

      {/* 목록 */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
        {loading && <p style={{ fontSize: fs.sub, color: 'var(--ink3)', margin: 0 }}>{t(lang, 'todoLoading')}</p>}
        {!loading && todos.length === 0 && (
          <p style={{ fontSize: fs.sub, color: 'var(--ink3)', margin: 0 }}>{t(lang, 'todoEmpty')}</p>
        )}
        {todos.map(todo => {
          const todoType = todo.todo_type || 'repeat'
          const done     = todo.is_done_dates.includes(viewDate)
          const disp     = dateDisplay(todo)
          const overdue  = isOverdue(todo.due_date)
          const todayDue = isToday(todo.due_date)
          const typeIcon = todoType === 'once' ? '✅' : '🔁'
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
              <span style={{ fontSize: '0.7rem', flexShrink: 0, lineHeight: 1 }} title={todoType === 'once' ? t(lang, 'todoTypeOnce') : t(lang, 'todoTypeRepeat')}>
                {typeIcon}
              </span>
              <span style={{ flex: 1, fontSize: fs.title, color: 'var(--ink2)', textDecoration: done ? 'line-through' : 'none', wordBreak: 'break-word', lineHeight: 1.4 }}>
                {todo.title}
              </span>
              {disp && (
                disp.oneDay ? (
                  <span style={{ fontSize: '0.7rem', whiteSpace: 'nowrap', fontWeight: 600, color: '#fff', background: 'var(--warning)', padding: '0.1em 0.45em', borderRadius: 4, flexShrink: 0 }}>
                    {disp.label}
                  </span>
                ) : (
                  <span style={{ fontSize: '0.72rem', whiteSpace: 'nowrap', fontWeight: (overdue || todayDue) ? 600 : 400, color: (overdue || todayDue) ? 'var(--red)' : 'var(--ink3)', flexShrink: 0 }}>
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
