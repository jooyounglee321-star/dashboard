import { useState, useEffect, useCallback } from 'react'
import { t } from './i18n'

const COLORS = [
  { key: 'yellow',   bg: '#fffde7', border: '#f9d835', text: '#5a4a00' },
  { key: 'green',    bg: '#f1f8e9', border: '#9ccc65', text: '#2a4a00' },
  { key: 'sky',      bg: '#e3f2fd', border: '#64b5f6', text: '#0a2a50' },
  { key: 'pink',     bg: '#fce4ec', border: '#f48fb1', text: '#5a0a28' },
  { key: 'lavender', bg: '#f3e5f5', border: '#ce93d8', text: '#3a0a5a' },
]
const COLOR_MAP = Object.fromEntries(COLORS.map(c => [c.key, c]))
const MAX_MEMOS = 6

const authHdr = () => ({ Authorization: 'Bearer ' + localStorage.getItem('token') })

const INIT_FORM = { title: '', content: '', color: 'yellow' }

export default function PinnedMemoCard({ isMobile = false, lang = 'ko' }) {
  const [memos, setMemos]       = useState([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm]         = useState(INIT_FORM)
  const [editId, setEditId]     = useState(null)
  const [saving, setSaving]     = useState(false)

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
    if (!window.confirm(lang === 'ko' ? '이 메모를 삭제할까요?' : 'Delete this memo?')) return
    await fetch(`/api/pinned-memos/${id}`, { method: 'DELETE', headers: authHdr() })
    await load()
  }

  const wrapper  = isMobile ? 'm-card' : 'card'
  const hdr      = isMobile ? 'm-card-header' : 'card-header'
  const titleCls = isMobile ? 'm-card-title'  : 'card-title'
  const body     = isMobile ? 'm-card-body'   : 'card-body'

  return (
    <div className={wrapper}>
      {/* 카드 헤더 */}
      <div className={hdr}>
        <span className="card-icon">📌</span>
        <span className={titleCls}>{t(lang, 'pinnedMemoTitle')}</span>
        {memos.length < MAX_MEMOS && !showForm && (
          <button
            onClick={openAdd}
            style={{
              marginLeft: 'auto', background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.18)', borderRadius: '8px',
              color: '#c8d6e5', cursor: 'pointer', fontSize: '0.78rem',
              padding: '0.22rem 0.65rem', fontFamily: 'inherit', fontWeight: 500,
            }}
          >
            + {t(lang, 'pinnedMemoAdd')}
          </button>
        )}
      </div>

      <div className={body}>
        {/* ── 추가/수정 폼 ── */}
        {showForm && (
          <div style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '10px', padding: '0.85rem 1rem',
            marginBottom: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.5rem',
          }}>
            {/* 색상 선택 */}
            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
              <span style={{ fontSize: '0.75rem', color: '#9aacbf' }}>{t(lang, 'pinnedMemoColor')}</span>
              {COLORS.map(c => (
                <button
                  key={c.key}
                  onClick={() => setForm(f => ({ ...f, color: c.key }))}
                  title={t(lang, 'pinnedMemoColor_' + c.key)}
                  style={{
                    width: 22, height: 22, borderRadius: '50%',
                    background: c.bg, border: form.color === c.key
                      ? `2px solid ${c.border}`
                      : '2px solid rgba(255,255,255,0.18)',
                    cursor: 'pointer', padding: 0, flexShrink: 0,
                    boxShadow: form.color === c.key ? `0 0 0 2px ${c.border}55` : 'none',
                    transition: 'box-shadow 0.15s',
                  }}
                />
              ))}
            </div>
            {/* 제목 */}
            <input
              type="text"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder={t(lang, 'pinnedMemoTitlePh')}
              maxLength={80}
              style={{
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)',
                borderRadius: '7px', padding: '0.4rem 0.6rem',
                color: '#e0e6ef', fontSize: '0.85rem', fontFamily: 'inherit', outline: 'none',
              }}
            />
            {/* 내용 */}
            <textarea
              value={form.content}
              onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
              placeholder={t(lang, 'pinnedMemoContentPh')}
              rows={3}
              style={{
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)',
                borderRadius: '7px', padding: '0.4rem 0.6rem',
                color: '#e0e6ef', fontSize: '0.83rem', fontFamily: 'inherit', resize: 'vertical',
                outline: 'none', lineHeight: 1.6,
              }}
            />
            {/* 버튼 */}
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <button
                onClick={saveForm}
                disabled={saving || (!form.title.trim() && !form.content.trim())}
                style={{
                  background: 'var(--accent)', border: 'none', borderRadius: '7px',
                  color: '#fff', cursor: 'pointer', fontSize: '0.82rem',
                  padding: '0.35rem 0.9rem', fontFamily: 'inherit', fontWeight: 600,
                  opacity: saving ? 0.6 : 1,
                }}
              >
                {saving ? t(lang, 'common.processing') : t(lang, 'pinnedMemoSave')}
              </button>
              <button
                onClick={cancelForm}
                style={{
                  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)',
                  borderRadius: '7px', color: '#9aacbf', cursor: 'pointer',
                  fontSize: '0.82rem', padding: '0.35rem 0.9rem', fontFamily: 'inherit',
                }}
              >
                {t(lang, 'pinnedMemoCancel')}
              </button>
            </div>
          </div>
        )}

        {/* ── 메모 그리드 ── */}
        {memos.length === 0 && !showForm ? (
          <p style={{ fontSize: '0.82rem', color: '#7a8fa6', fontStyle: 'italic', margin: '0.5rem 0' }}>
            {t(lang, 'pinnedMemoEmpty')}
          </p>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile
              ? 'repeat(auto-fill, minmax(140px, 1fr))'
              : 'repeat(auto-fill, minmax(160px, 1fr))',
            gap: '0.6rem',
          }}>
            {memos.map(memo => {
              const scheme = COLOR_MAP[memo.color] || COLOR_MAP.yellow
              return (
                <div
                  key={memo.id}
                  style={{
                    background: scheme.bg,
                    border: `1px solid ${scheme.border}`,
                    borderRadius: '10px',
                    padding: '0.7rem 0.8rem',
                    display: 'flex', flexDirection: 'column', gap: '0.3rem',
                    minHeight: '90px', position: 'relative',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
                  }}
                >
                  {/* 상단: 핀 + 제목 */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.3rem' }}>
                    <span style={{ fontSize: '0.85rem', flexShrink: 0, marginTop: '1px' }}>📌</span>
                    {memo.title && (
                      <span style={{
                        fontSize: '0.8rem', fontWeight: 700, color: scheme.text,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
                      }}>
                        {memo.title}
                      </span>
                    )}
                  </div>
                  {/* 본문 (최대 3줄) */}
                  {memo.content && (
                    <p style={{
                      margin: 0, fontSize: '0.76rem', color: scheme.text,
                      lineHeight: 1.55, flex: 1,
                      overflow: 'hidden',
                      display: '-webkit-box', WebkitLineClamp: 3,
                      WebkitBoxOrient: 'vertical',
                      wordBreak: 'break-word',
                    }}>
                      {memo.content}
                    </p>
                  )}
                  {/* 수정/삭제 버튼 */}
                  <div style={{ display: 'flex', gap: '0.25rem', marginTop: 'auto', paddingTop: '0.3rem' }}>
                    <button
                      onClick={() => openEdit(memo)}
                      title={t(lang, 'pinnedMemoEdit')}
                      style={{
                        background: 'rgba(0,0,0,0.06)', border: 'none',
                        borderRadius: '5px', cursor: 'pointer', fontSize: '0.72rem',
                        padding: '0.18rem 0.4rem', color: scheme.text, fontFamily: 'inherit',
                      }}
                    >✏️</button>
                    <button
                      onClick={() => deleteMemo(memo.id)}
                      title={t(lang, 'pinnedMemoDelete')}
                      style={{
                        background: 'rgba(0,0,0,0.06)', border: 'none',
                        borderRadius: '5px', cursor: 'pointer', fontSize: '0.72rem',
                        padding: '0.18rem 0.4rem', color: scheme.text, fontFamily: 'inherit',
                      }}
                    >🗑️</button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
