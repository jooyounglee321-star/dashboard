import { useState, useEffect } from 'react'
import { t, T } from './i18n'

const todayKey = () => new Date().toISOString().slice(0, 10)
const CATS = ['식비', '교통', '쇼핑', '생활', '기타']

export default function ExpenseCard({ isMobile = false, lang = 'ko' }) {
  const [expenses, setExpenses] = useState([])
  const [item, setItem] = useState('')
  const [amount, setAmount] = useState('')
  const [cat, setCat] = useState('식비')

  const authHeader = () => ({ Authorization: 'Bearer ' + localStorage.getItem('token') })
  const catLabel = key => (T[lang]?.expenseCats ?? T.ko.expenseCats)[key] ?? key

  async function loadExp() {
    const list = await fetch('/api/expenses?date=' + todayKey(), { headers: authHeader() })
      .then(r => r.ok ? r.json() : [])
      .catch(() => [])
    setExpenses(list)
  }

  useEffect(() => { loadExp() }, [])

  async function addExp() {
    if (!item.trim() || !amount) return
    await fetch('/api/expenses', {
      method: 'POST',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: todayKey(), amount: Number(amount), category: cat, description: item.trim() }),
    })
    setItem(''); setAmount('')
    await loadExp()
  }

  async function delExp(id) {
    await fetch('/api/expenses/' + id, { method: 'DELETE', headers: authHeader() })
    await loadExp()
  }

  const total = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0)

  const hdr = isMobile ? 'm-card-header' : 'card-header'
  const titleCls = isMobile ? 'm-card-title' : 'card-title'
  const body = isMobile ? 'm-card-body' : 'card-body'
  const wrapper = isMobile ? 'm-card' : 'card card-expense'

  return (
    <div className={wrapper}>
      <div className={hdr}>
        <span className="card-icon">💳</span>
        <span className={titleCls}>{t(lang, 'expenseTitle')}</span>
        {!isMobile && <span className="exp-db-badge" style={{ marginLeft: 'auto' }}>{t(lang, 'expenseDbBadge')}</span>}
      </div>
      <div className={body}>
        {isMobile ? (
          <>
            <span className="m-exp-lbl">{t(lang, 'expenseTodayTotal')}</span>
            <div className="m-exp-total">₩{total.toLocaleString()}</div>
            <div className="m-row">
              <input
                className="m-input"
                type="text"
                value={item}
                onChange={e => setItem(e.target.value)}
                placeholder={t(lang, 'expenseItemNamePlaceholder')}
                style={{ flex: 1 }}
              />
              <input
                className="m-input"
                type="number"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder={t(lang, 'expenseAmountPlaceholder')}
                style={{ flex: '0 0 100px' }}
              />
            </div>
            <div className="m-row">
              <select className="m-select" value={cat} onChange={e => setCat(e.target.value)}>
                {CATS.map(c => <option key={c} value={c}>{catLabel(c)}</option>)}
              </select>
              <button className="m-btn" onClick={addExp} style={{ flex: 1 }}>{t(lang, 'expenseAddShort')}</button>
            </div>
            <ul className="m-exp-list">
              {!expenses.length ? (
                <li style={{ fontSize: '0.85rem', color: 'var(--ink3)', fontStyle: 'italic', padding: '0.3rem 0' }}>
                  {t(lang, 'expenseEmpty')}
                </li>
              ) : (
                expenses.map(e => (
                  <li key={e.id} className="m-exp-item">
                    <div>
                      <span className={`exp-cat cat-${e.category || ''}`}>{catLabel(e.category) || ''}</span>
                      {e.description || ''}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span style={{ fontWeight: 500 }}>₩{Number(e.amount).toLocaleString()}</span>
                      <button className="btn-del" onClick={() => delExp(e.id)}>✕</button>
                    </div>
                  </li>
                ))
              )}
            </ul>
          </>
        ) : (
          <>
            <div className="exp-today">
              <span className="exp-label">{t(lang, 'expenseTodayTotal')}</span>
              <span className="exp-amount">₩{total.toLocaleString()}</span>
            </div>
            <div className="exp-form">
              <input type="text" placeholder={t(lang, 'expenseItemPlaceholder')} value={item} onChange={e => setItem(e.target.value)} />
              <input type="number" placeholder={t(lang, 'expenseAmountPlaceholder')} value={amount} onChange={e => setAmount(e.target.value)} />
              <select value={cat} onChange={e => setCat(e.target.value)}>
                {CATS.map(c => <option key={c} value={c}>{catLabel(c)}</option>)}
              </select>
              <button className="btn-sm" onClick={addExp}>{t(lang, 'expenseAdd')}</button>
            </div>
            <ul className="exp-list">
              {!expenses.length ? (
                <li className="empty-msg">{t(lang, 'expenseEmpty')}</li>
              ) : (
                expenses.map(e => (
                  <li key={e.id} className="exp-item">
                    <div>
                      <span className={`exp-cat cat-${e.category || ''}`}>{catLabel(e.category) || ''}</span>
                      {e.description || ''}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <span style={{ fontWeight: 500 }}>₩{Number(e.amount).toLocaleString()}</span>
                      <button className="btn-del" onClick={() => delExp(e.id)}>✕</button>
                    </div>
                  </li>
                ))
              )}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}
