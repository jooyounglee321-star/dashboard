import { useState, useEffect } from 'react'

const todayKey = () => new Date().toISOString().slice(0, 10)

export default function MemoCard({ isMobile = false }) {
  const [memoData, setMemoData] = useState(null)
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')

  async function loadMemo() {
    const list = await fetch('/api/memos?date=' + todayKey())
      .then(r => r.ok ? r.json() : [])
      .catch(() => [])
    setMemoData(list.length ? list[0] : null)
  }

  useEffect(() => { loadMemo() }, [])

  async function startEdit() {
    await loadMemo()
    setText(memoData?.content || '')
    setEditing(true)
  }

  // Refresh text from latest memo before editing
  async function startEditFresh() {
    const list = await fetch('/api/memos?date=' + todayKey())
      .then(r => r.ok ? r.json() : [])
      .catch(() => [])
    const latest = list.length ? list[0] : null
    setMemoData(latest)
    setText(latest?.content || '')
    setEditing(true)
  }

  async function saveMemo() {
    if (memoData?.id) {
      await fetch('/api/memos/' + memoData.id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text }),
      })
    } else {
      const res = await fetch('/api/memos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: todayKey(), content: text }),
      })
      const created = await res.json()
      setMemoData(created)
    }
    setEditing(false)
    await loadMemo()
  }

  const savedTime = memoData?.updated_at
    ? (() => {
        const u = new Date(memoData.updated_at)
        return `저장: ${u.getHours()}시 ${u.getMinutes()}분`
      })()
    : ''

  const hdr = isMobile ? 'm-card-header' : 'card-header'
  const titleCls = isMobile ? 'm-card-title' : 'card-title'
  const body = isMobile ? 'm-card-body' : 'card-body'
  const wrapper = isMobile ? 'm-card' : 'card card-memo'

  return (
    <div className={wrapper}>
      <div className={hdr}>
        <span className="card-icon">📝</span>
        <span className={titleCls}>하루 마무리 메모</span>
      </div>
      <div className={body}>
        {!editing ? (
          <div className={isMobile ? 'm-memo-display' : 'memo-display'}>
            {memoData?.content
              ? memoData.content
              : <span style={{ color: '#a89880', fontStyle: 'italic', fontSize: isMobile ? undefined : '0.82rem' }}>오늘 하루를 기록해보세요...</span>
            }
          </div>
        ) : (
          <textarea
            className={isMobile ? 'm-memo-ta' : 'memo-ta'}
            style={{ display: 'block' }}
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="감사한 일, 배운 것, 내일의 다짐을 써보세요."
          />
        )}

        <div
          className={!isMobile ? 'memo-btns' : ''}
          style={isMobile ? { display: 'flex', gap: '0.5rem', marginTop: '0.65rem' } : {}}
        >
          {!editing ? (
            <button
              className={isMobile ? 'm-btn' : 'btn-sm'}
              onClick={startEditFresh}
            >
              수정하기
            </button>
          ) : (
            <button
              className={isMobile ? 'm-btn-outline' : 'btn-outline'}
              onClick={saveMemo}
            >
              저장
            </button>
          )}
        </div>

        {savedTime && (
          <div className={!isMobile ? 'memo-date' : ''} style={{ fontSize: '0.7rem', color: 'var(--ink3)', marginTop: '0.35rem' }}>
            {savedTime}
          </div>
        )}
      </div>
    </div>
  )
}
