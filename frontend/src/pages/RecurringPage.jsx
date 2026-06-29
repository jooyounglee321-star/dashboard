import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { t } from '../i18n'
import { CURRENCY_LIST } from '../data/currencies'
import { useToast } from '../components/Toast'
import Toast from '../components/Toast'
import './BudgetPage.css'

function getToken() {
  const raw = localStorage.getItem('token')
  if (!raw || raw === 'null' || raw === 'undefined' || raw.trim() === '') {
    window.location.href = '/login'
    return ''
  }
  return raw.trim()
}

function apiGet(url) {
  const token = getToken()
  return fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    .then(r => {
      if (r.status === 401) { window.location.href = '/login'; throw new Error('401') }
      if (!r.ok) throw new Error(r.status)
      return r.json()
    })
}

function apiReq(method, url, body) {
  const token = getToken()
  return fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  }).then(r => {
    if (r.status === 401) { window.location.href = '/login'; throw new Error('401') }
    if (!r.ok) throw new Error(r.status)
    return r.json().catch(() => null)
  })
}

const EMPTY_FORM = {
  day_of_month: 1,
  category_id: '',
  subcategory_id: '',
  amount: '',
  currency: 'KRW',
  memo: '',
}

export default function RecurringPage() {
  const [lang, setLang] = useState(() => {
    try { return localStorage.getItem('dashboard_lang') || 'ko' } catch { return 'ko' }
  })
  const [items, setItems]       = useState([])
  const [cats, setCats]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId]     = useState(null)
  const [form, setForm]         = useState(EMPTY_FORM)
  const [saving, setSaving]     = useState(false)
  const { toasts, showToast } = useToast()

  useEffect(() => {
    const onChange = () => setLang(localStorage.getItem('dashboard_lang') || 'ko')
    window.addEventListener('languageChanged', onChange)
    return () => window.removeEventListener('languageChanged', onChange)
  }, [])

  useEffect(() => {
    Promise.all([
      apiGet(`/api/expense/recurring?lang=${lang}`),
      apiGet(`/api/expense/categories?lang=${lang}`),
    ]).then(([recList, catList]) => {
      setItems(recList)
      setCats(catList)
    }).catch(() => {
      showToast(t(lang, 'recurring.loadError'), 'error')
    }).finally(() => setLoading(false))
  }, [lang])

  const subcats = cats.find(c => c.id === Number(form.category_id))?.subs || []

  function openAdd() {
    setEditId(null)
    setForm(EMPTY_FORM)
    setShowForm(true)
  }

  function openEdit(item) {
    setEditId(item.id)
    setForm({
      day_of_month:   item.day_of_month,
      category_id:    item.category_id ?? '',
      subcategory_id: item.subcategory_id ?? '',
      amount:         item.amount,
      currency:       item.currency,
      memo:           item.memo ?? '',
    })
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditId(null)
    setForm(EMPTY_FORM)
  }

  async function handleSave() {
    const amt = parseFloat(form.amount)
    if (!amt || amt <= 0) { showToast(t(lang, 'recurring.amountRequired'), 'error'); return }
    const day = parseInt(form.day_of_month, 10)
    if (!day || day < 1 || day > 28) { showToast(t(lang, 'recurring.dayRange'), 'error'); return }

    setSaving(true)
    const body = {
      day_of_month:   day,
      category_id:    form.category_id ? Number(form.category_id) : null,
      subcategory_id: form.subcategory_id ? Number(form.subcategory_id) : null,
      amount:         amt,
      currency:       form.currency,
      memo:           form.memo || null,
    }
    try {
      let saved
      if (editId) {
        saved = await apiReq('PUT', `/api/expense/recurring/${editId}?lang=${lang}`, body)
        setItems(prev => prev.map(x => x.id === editId ? saved : x))
      } else {
        saved = await apiReq('POST', `/api/expense/recurring?lang=${lang}`, body)
        setItems(prev => [...prev, saved])
      }
      showToast(t(lang, 'recurring.saveSuccess'), 'success')
      closeForm()
    } catch {
      showToast(t(lang, 'recurring.saveError'), 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    if (!window.confirm(t(lang, 'recurring.confirmDelete'))) return
    try {
      await apiReq('DELETE', `/api/expense/recurring/${id}`)
      setItems(prev => prev.filter(x => x.id !== id))
      showToast(t(lang, 'common.deleteSuccess'), 'success')
    } catch {
      showToast(t(lang, 'recurring.deleteError'), 'error')
    }
  }

  return (
    <div className="bp-wrap">
      <header className="bp-header">
        <Link to="/budget" className="bp-back">← {t(lang, 'budgetBack')}</Link>
        <h1 className="bp-title">{t(lang, 'recurring.title')}</h1>
        <div className="bp-header-r">
          <button className="rp-add-btn" onClick={openAdd}>
            + {t(lang, 'recurring.add')}
          </button>
        </div>
      </header>

      <div className="rp-body">
        {loading ? (
          <p className="rp-empty">{t(lang, 'common.loading')}</p>
        ) : items.length === 0 ? (
          <p className="rp-empty">{t(lang, 'recurring.empty')}</p>
        ) : (
          <div className="rp-list">
            {items.map(item => (
              <div key={item.id} className={`rp-card${!item.is_active ? ' inactive' : ''}`}>
                <div className="rp-card-day">
                  {lang === 'ko' ? `매월 ${item.day_of_month}일` : `Every ${item.day_of_month}th`}
                </div>
                <div className="rp-card-info">
                  <span className="rp-cat">
                    {item.category_icon && <span>{item.category_icon}</span>}
                    {item.category_name || t(lang, 'recurring.noCategory')}
                    {item.subcategory_name && <span className="rp-subcat"> · {item.subcategory_name}</span>}
                  </span>
                  <span className="rp-amount">
                    {item.currency} {Number(item.amount).toLocaleString()}
                  </span>
                  {item.memo && <span className="rp-memo">{item.memo}</span>}
                </div>
                <div className="rp-card-actions">
                  <button className="rp-btn edit" onClick={() => openEdit(item)}>
                    {t(lang, 'common.edit')}
                  </button>
                  <button className="rp-btn del" onClick={() => handleDelete(item.id)}>
                    {t(lang, 'common.delete')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showForm && (
        <div className="rp-overlay" onClick={closeForm}>
          <div className="rp-modal" onClick={e => e.stopPropagation()}>
            <h2 className="rp-modal-title">
              {editId ? t(lang, 'recurring.editTitle') : t(lang, 'recurring.addTitle')}
            </h2>

            <label className="rp-label">{t(lang, 'recurring.dayLabel')}</label>
            <div className="rp-row">
              <input
                type="number" min="1" max="28"
                className="rp-input"
                value={form.day_of_month}
                onChange={e => setForm(f => ({ ...f, day_of_month: e.target.value }))}
              />
              <span className="rp-unit">{t(lang, 'recurring.dayUnit')}</span>
            </div>

            <label className="rp-label">{t(lang, 'recurring.categoryLabel')}</label>
            <select
              className="rp-select"
              value={form.category_id}
              onChange={e => setForm(f => ({ ...f, category_id: e.target.value, subcategory_id: '' }))}
            >
              <option value="">{t(lang, 'recurring.selectCategory')}</option>
              {cats.map(c => (
                <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
              ))}
            </select>

            {subcats.length > 0 && (
              <>
                <label className="rp-label">{t(lang, 'recurring.subcategoryLabel')}</label>
                <select
                  className="rp-select"
                  value={form.subcategory_id}
                  onChange={e => setForm(f => ({ ...f, subcategory_id: e.target.value }))}
                >
                  <option value="">{t(lang, 'recurring.selectSubcategory')}</option>
                  {subcats.map(s => (
                    <option key={s.id} value={s.id}>{s.icon} {s.name}</option>
                  ))}
                </select>
              </>
            )}

            <label className="rp-label">{t(lang, 'recurring.amountLabel')}</label>
            <div className="rp-row">
              <select
                className="rp-select-sm"
                value={form.currency}
                onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}
              >
                {CURRENCY_LIST.map(c => (
                  <option key={c.code} value={c.code}>{c.label}</option>
                ))}
              </select>
              <input
                type="number" min="0" step="any"
                className="rp-input"
                placeholder="0"
                value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
              />
            </div>

            <label className="rp-label">{t(lang, 'recurring.memoLabel')}</label>
            <input
              type="text"
              className="rp-input"
              placeholder={t(lang, 'recurring.memoPlaceholder')}
              value={form.memo}
              onChange={e => setForm(f => ({ ...f, memo: e.target.value }))}
            />

            <div className="rp-modal-actions">
              <button className="rp-btn cancel" onClick={closeForm} disabled={saving}>
                {t(lang, 'common.cancel')}
              </button>
              <button className="rp-btn save" onClick={handleSave} disabled={saving}>
                {saving ? t(lang, 'common.processing') : t(lang, 'common.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast toasts={toasts} />
    </div>
  )
}
