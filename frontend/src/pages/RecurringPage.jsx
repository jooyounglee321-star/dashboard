import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { t } from '../i18n'
import { CURRENCY_LIST } from '../data/currencies'
import { useToast } from '../components/Toast'
import Toast from '../components/Toast'
import ConfirmModal from '../components/ConfirmModal'
import './BudgetPage.css'

function apiGet(url) {
  return fetch(url, { credentials: 'include' })
    .then(r => {
      if (r.status === 401) { window.location.href = '/login'; throw new Error('401') }
      if (!r.ok) throw new Error(r.status)
      return r.json()
    })
}

function apiReq(method, url, body) {
  return fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: body ? JSON.stringify(body) : undefined,
  }).then(r => {
    if (r.status === 401) { window.location.href = '/login'; throw new Error('401') }
    if (!r.ok) throw new Error(r.status)
    return r.json().catch(() => null)
  })
}

const EMPTY_FORM = {
  day_of_month: 1,
  type: 'expense',
  category_id: '',
  subcategory_id: '',
  amount: '',
  currency: 'KRW',
  memo: '',
  frequency: 'monthly',
  day_of_week: '',
  day_of_month_2: 0,
}

const DOW_KO = ['월', '화', '수', '목', '금', '토', '일']
const DOW_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function dayLabel(day, day2, freq, lang) {
  const f = freq || 'monthly'
  if (f === 'weekly') {
    const dow = lang === 'ko' ? DOW_KO : DOW_EN
    return lang === 'ko' ? `매주 ${dow[day] ?? ''}요일` : `Every ${dow[day] ?? ''}`
  }
  if (f === 'biweekly') {
    const dow = lang === 'ko' ? DOW_KO : DOW_EN
    return lang === 'ko' ? `격주 ${dow[day] ?? ''}요일` : `Every other ${dow[day] ?? ''}`
  }
  if (f === 'semi-monthly') {
    const d1 = day === 0 ? (lang === 'ko' ? '말일' : 'last') : (lang === 'ko' ? `${day}일` : `${day}th`)
    const d2 = day2 === 0 ? (lang === 'ko' ? '말일' : 'last') : (lang === 'ko' ? `${day2}일` : `${day2}th`)
    return lang === 'ko' ? `매월 ${d1} + ${d2}` : `Every ${d1} & ${d2}`
  }
  if (day === 0) return lang === 'ko' ? '매월 말일' : 'Every last day'
  return lang === 'ko' ? `매월 ${day}일` : `Every ${day}th`
}

export default function RecurringPage({ onClose }) {
  const [lang, setLang] = useState(() => {
    try { return localStorage.getItem('dashboard_lang') || 'ko' } catch { return 'ko' }
  })
  const [items, setItems]           = useState([])
  const [cats, setCats]             = useState([])
  const [incomeCats, setIncomeCats] = useState([])
  const [loading, setLoading]       = useState(true)
  const [showForm, setShowForm]     = useState(false)
  const [editId, setEditId]         = useState(null)
  const [form, setForm]             = useState(EMPTY_FORM)
  const [saving, setSaving]         = useState(false)
  const { toast, showToast } = useToast()
  const [delConfirm, setDelConfirm] = useState({ open: false, id: null })

  useEffect(() => {
    const onChange = () => setLang(localStorage.getItem('dashboard_lang') || 'ko')
    window.addEventListener('languageChanged', onChange)
    return () => window.removeEventListener('languageChanged', onChange)
  }, [])

  useEffect(() => {
    Promise.all([
      apiGet(`/api/expense/recurring?lang=${lang}`),
      apiGet(`/api/expense/categories?lang=${lang}`),
      apiGet(`/api/income/categories?lang=${lang}`),
    ]).then(([recList, catList, incCatList]) => {
      recList.sort((a, b) => {
        const ca = (a.category_name || ''); const cb = (b.category_name || '')
        if (ca !== cb) return ca.localeCompare(cb)
        return (a.subcategory_name || '').localeCompare(b.subcategory_name || '')
      })
      setItems(recList)
      setCats(catList)
      setIncomeCats(incCatList)
    }).catch(() => {
      showToast(t(lang, 'recurring.loadError'), 'error')
    }).finally(() => setLoading(false))
  }, [lang])

  const formCats = form.type === 'income' ? incomeCats : cats
  const subcats  = formCats.find(c => c.id === Number(form.category_id))?.subs || []

  function openAdd() {
    setEditId(null)
    setForm(EMPTY_FORM)
    setShowForm(true)
  }

  function openEdit(item) {
    setEditId(item.id)
    setForm({
      day_of_month:   item.day_of_month,
      type:           item.type || 'expense',
      category_id:    item.category_id ?? '',
      subcategory_id: item.subcategory_id ?? '',
      amount:         item.amount,
      currency:       item.currency,
      memo:           item.memo ?? '',
      frequency:      item.frequency || 'monthly',
      day_of_week:    item.day_of_week ?? '',
      day_of_month_2: item.day_of_month_2 ?? 0,
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
    const freq = form.frequency || 'monthly'
    const isWeekly = freq === 'weekly' || freq === 'biweekly'
    const day = parseInt(form.day_of_month, 10)
    if (!isWeekly && (isNaN(day) || day < 0 || day > 31)) { showToast(t(lang, 'recurring.dayRange'), 'error'); return }

    setSaving(true)
    const body = {
      day_of_month:   isWeekly ? 1 : day,
      type:           form.type || 'expense',
      category_id:    form.category_id ? Number(form.category_id) : null,
      subcategory_id: form.subcategory_id ? Number(form.subcategory_id) : null,
      amount:         amt,
      currency:       form.currency,
      memo:           form.memo || null,
      frequency:      freq,
      day_of_week:    isWeekly ? Number(form.day_of_week) : null,
      day_of_month_2: freq === 'semi-monthly' ? Number(form.day_of_month_2) : null,
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

  function handleDelete(id) {
    setDelConfirm({ open: true, id })
  }
  async function doDelete() {
    const { id } = delConfirm
    setDelConfirm({ open: false, id: null })
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
        {onClose ? (
          <button className="rp-btn cancel" onClick={onClose}>{t(lang, 'common.cancel')}</button>
        ) : (
          <Link to="/budget" className="bp-back">← {t(lang, 'budgetBack')}</Link>
        )}
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
                  {dayLabel(item.day_of_month, item.day_of_month_2, item.frequency, lang)}
                </div>
                <div className="rp-card-info">
                  <span style={{ fontSize: '0.68rem', fontWeight: 600, borderRadius: '4px', padding: '0.1rem 0.4rem', display: 'inline-block', marginBottom: '0.2rem', ...(
                    (item.type || 'expense') === 'income'
                      ? { color: 'var(--green)', background: 'rgba(5,150,105,0.10)' }
                      : { color: 'var(--accent)', background: 'var(--accent-soft)' }
                  ) }}>
                    {(item.type || 'expense') === 'income' ? `💰 ${t(lang, 'recurring.income')}` : `💸 ${t(lang, 'recurring.expense')}`}
                  </span>
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

            {/* 지출/수입 타입 토글 */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
              <button
                type="button"
                className={`bp-type-btn${form.type === 'expense' ? ' active expense' : ''}`}
                onClick={() => setForm(f => ({ ...f, type: 'expense', category_id: '', subcategory_id: '' }))}
              >
                💸 {t(lang, 'recurring.expense')}
              </button>
              <button
                type="button"
                className={`bp-type-btn${form.type === 'income' ? ' active income' : ''}`}
                onClick={() => setForm(f => ({ ...f, type: 'income', category_id: '', subcategory_id: '' }))}
              >
                💰 {t(lang, 'recurring.income')}
              </button>
            </div>

            <label className="rp-label">{t(lang, 'recurring.frequencyLabel')}</label>
            <div className="rp-row">
              <select
                className="rp-select"
                value={form.frequency}
                onChange={e => setForm(f => ({ ...f, frequency: e.target.value, day_of_week: '', day_of_month_2: 0 }))}
              >
                <option value="monthly">{t(lang, 'recurring.monthly')}</option>
                <option value="semi-monthly">{t(lang, 'recurring.semiMonthly')}</option>
                <option value="weekly">{t(lang, 'recurring.weekly')}</option>
                <option value="biweekly">{t(lang, 'recurring.biweekly')}</option>
              </select>
            </div>

            {(form.frequency === 'monthly' || form.frequency === 'semi-monthly') && (
              <>
                <label className="rp-label">{t(lang, 'recurring.dayLabel')}</label>
                <div className="rp-row" style={{ gap: '0.5rem' }}>
                  <select
                    className="rp-select"
                    value={form.day_of_month}
                    onChange={e => setForm(f => ({ ...f, day_of_month: e.target.value }))}
                  >
                    {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                      <option key={d} value={d}>{d}{lang === 'ko' ? '일' : ''}</option>
                    ))}
                    <option value={0}>{t(lang, 'recurring.lastDay')}</option>
                  </select>
                  {form.frequency === 'semi-monthly' && (
                    <>
                      <span style={{ alignSelf: 'center', color: 'var(--ink3)' }}>+</span>
                      <select
                        className="rp-select"
                        value={form.day_of_month_2}
                        onChange={e => setForm(f => ({ ...f, day_of_month_2: Number(e.target.value) }))}
                      >
                        {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                          <option key={d} value={d}>{d}{lang === 'ko' ? '일' : ''}</option>
                        ))}
                        <option value={0}>{t(lang, 'recurring.lastDay')}</option>
                      </select>
                    </>
                  )}
                </div>
              </>
            )}

            {(form.frequency === 'weekly' || form.frequency === 'biweekly') && (
              <>
                <label className="rp-label">{t(lang, 'recurring.dayOfWeekLabel')}</label>
                <div className="rp-row">
                  <select
                    className="rp-select"
                    value={form.day_of_week}
                    onChange={e => setForm(f => ({ ...f, day_of_week: Number(e.target.value) }))}
                  >
                    {(lang === 'ko' ? DOW_KO : DOW_EN).map((name, i) => (
                      <option key={i} value={i}>{name}</option>
                    ))}
                  </select>
                </div>
              </>
            )}

            <label className="rp-label">{t(lang, 'recurring.categoryLabel')}</label>
            <select
              className="rp-select"
              value={form.category_id}
              onChange={e => setForm(f => ({ ...f, category_id: e.target.value, subcategory_id: '' }))}
            >
              <option value="">{t(lang, 'recurring.selectCategory')}</option>
              {formCats.map(c => (
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

      <Toast toast={toast} />
      <ConfirmModal
        open={delConfirm.open}
        message={t(lang, 'recurring.confirmDelete')}
        onConfirm={doDelete}
        onCancel={() => setDelConfirm({ open: false, id: null })}
        lang={lang}
      />
    </div>
  )
}
