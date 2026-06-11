import { useState, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react'
import { t } from './i18n'
import { authH as authHdr } from '../../utils/api'

const PASTEL = {
  yellow:   { bg: '#FFF9C4', text: '#5a4a00' },
  green:    { bg: '#DCEDC8', text: '#2a4a00' },
  sky:      { bg: '#B3E5FC', text: '#0a2a50' },
  pink:     { bg: '#FCE4EC', text: '#5a0a28' },
  lavender: { bg: '#EDE7F6', text: '#3a0a5a' },
}
const COLOR_KEYS = Object.keys(PASTEL)
const MAX_MEMOS  = 6
const INIT_FORM  = { title: '', content: '', color: 'yellow' }

const PinnedMemoCard = forwardRef(function PinnedMemoCard({ lang = 'ko' }, ref) {
  const [memos,    setMemos]    = useState([])
  const [showForm, setShowForm] = useState(false)
  const [form,     setForm]     = useState(INIT_FORM)
  const [editId,   setEditId]   = useState(null)
  const [saving,   setSaving]   = useState(false)

  const load = useCallback(async () => {
    const list = await fetch('/api/pinned-memos', { headers: authHdr() })
      .then(r => r.ok ? r.json() : []).catch(() => [])
    setMemos(list)
  }, [])

  useEffect(() => { load() }, [load])

  function openAdd() {
    setEditId(null)
    setForm(INIT_FORM)
    setShowForm(true)
  }

  useImperativeHandle(ref, () => ({ openAdd }))

  function openEdit(memo) {
    setEditId(memo.id)
    setForm({ title: memo.title || '', content: memo.content || '', color: memo.color || 'yellow' })
    setShowForm(true)
  }

  function cancelForm() {
    setShowForm(false)
    setEditId(null)
    setForm(INIT_FORM)
  }

  async function saveForm() {
    if (!form.content.trim() && !form.title.trim()) return
    setSaving(true)
    try {
      if (editId) {
        await fetch(`/api/pinned-memos/${editId}`, {
          method: 'PUT',
          headers: { ...authHdr(), 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
      } else {
        await fetch('/api/pinned-memos', {
          method: 'POST',
          headers: { ...authHdr(), 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
      }
      cancelForm()
      await load()
    } finally {
      setSaving(false)
    }
  }

  async function deleteMemo(id) {
    await fetch(`/api/pinned-memos/${id}`, { method: 'DELETE', headers: authHdr() })
    await load()
  }

  if (memos.length === 0 && !showForm) return null

  return (
    <div className="pinned-content">
      {/* ── 추가/수정 폼 ── */}
      {showForm && (
        <div className="pinned-form">
          <div className="pinned-form-colors">
            {COLOR_KEYS.map(key => (
              <button
                key={key}
                onClick={() => setForm(f => ({ ...f, color: key }))}
                title={t(lang, 'pinnedMemoColor_' + key)}
                className={`pinned-color-dot${form.color === key ? ' active' : ''}`}
                style={{ background: PASTEL[key].bg }}
              />
            ))}
          </div>
          <input
            type="text"
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            placeholder={t(lang, 'pinnedMemoTitlePh')}
            maxLength={80}
            className="pinned-form-input"
          />
          <textarea
            value={form.content}
            onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
            placeholder={t(lang, 'pinnedMemoContentPh')}
            rows={3}
            className="pinned-form-textarea"
          />
          <div className="pinned-form-actions">
            <button
              onClick={saveForm}
              disabled={saving || (!form.title.trim() && !form.content.trim())}
              className="pinned-form-save"
            >
              {saving ? t(lang, 'common.processing') : t(lang, 'pinnedMemoSave')}
            </button>
            <button onClick={cancelForm} className="pinned-form-cancel">
              {t(lang, 'pinnedMemoCancel')}
            </button>
          </div>
        </div>
      )}

      {/* ── 메모 카드 행 ── */}
      {memos.length > 0 && (
        <div className="pinned-cards-row">
          {memos.map(memo => {
            const scheme = PASTEL[memo.color] || PASTEL.yellow
            return (
              <div key={memo.id} className="pinned-card" style={{ background: scheme.bg }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: memo.content ? '0.35rem' : 0 }}>
                  <div className="pinned-card-title" style={{ color: scheme.text, fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {memo.title || ''}
                  </div>
                  <div className="pinned-card-pin" style={{ flexShrink: 0, marginLeft: '0.4rem' }}>📌</div>
                </div>
                {memo.content && (
                  <div className="pinned-card-content" style={{ color: scheme.text }}>
                    {memo.content}
                  </div>
                )}
                <div className="pinned-card-actions">
                  <button
                    onClick={() => openEdit(memo)}
                    className="pinned-card-btn"
                    title={t(lang, 'pinnedMemoEdit')}
                    style={{ color: scheme.text }}
                  >✏️</button>
                  <button
                    onClick={() => deleteMemo(memo.id)}
                    className="pinned-card-btn"
                    title={t(lang, 'pinnedMemoDelete')}
                    style={{ color: scheme.text }}
                  >🗑️</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
})

export default PinnedMemoCard
