import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { t } from './i18n'
import { INCOME_CATEGORIES, getSubcategories } from '../../data/incomeCategories'
import { useToast } from '../../components/Toast'
import Toast from '../../components/Toast'

/* ── 통화 목록 ──────────────────────────────────────────────────────────── */
const CURRENCIES = [
  { code: 'USD', symbol: '$',   label: '$ USD'   },
  { code: 'KRW', symbol: '₩',   label: '₩ KRW'   },
  { code: 'EUR', symbol: '€',   label: '€ EUR'   },
  { code: 'JPY', symbol: '¥',   label: '¥ JPY'   },
  { code: 'GBP', symbol: '£',   label: '£ GBP'   },
  { code: 'CAD', symbol: 'C$',  label: 'C$ CAD'  },
  { code: 'AUD', symbol: 'A$',  label: 'A$ AUD'  },
  { code: 'CNY', symbol: '¥',   label: '¥ CNY'   },
  { code: 'HKD', symbol: 'HK$', label: 'HK$ HKD' },
  { code: 'SGD', symbol: 'S$',  label: 'S$ SGD'  },
]

// toISOString()은 UTC 기준 → PDT(UTC-7) 오후 5시 이후엔 내일 날짜를 반환하는 버그
// 로컬 날짜 메서드로 교체하여 어느 타임존에서도 정확한 오늘 날짜 반환
const todayStr = () => {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm   = String(d.getMonth() + 1).padStart(2, '0')
  const dd   = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function fmtAmt(amount, currency) {
  const sym = CURRENCIES.find(c => c.code === currency)?.symbol ?? currency
  return `${sym}${Number(amount).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
}

const INIT_FORM = () => ({
  date:             todayStr(),
  category_id:      '',
  subcategory_id:   '',
  income_main_code: '',   // income 전용 대분류 code
  income_sub_code:  '',   // income 전용 소분류 code
  amount:           '',
  currency:         'USD',
  description:      '',
  type:             'expense',   // 'expense' | 'income'
})


/* ═══════════════════════════════════════════════════════════════════════════
   서브컴포넌트 — ExpenseCard 함수 바깥에 선언해야 재렌더 시 재마운트되지 않음
═══════════════════════════════════════════════════════════════════════════ */

function ExpForm({ compact, form, setForm, categories, subs, lang, submitting, addExpense }) {
  const isIncome = form.type === 'income'

  /* 수입/지출 토글 클릭 → type 변경 + 카테고리 초기화
     income 전환 시 대분류를 첫 번째 항목으로 선설정 → 소분류 즉시 활성화 */
  const switchType = (type) =>
    setForm(f => ({
      ...f, type,
      category_id: '', subcategory_id: '',
      income_main_code: type === 'income' ? (INCOME_CATEGORIES[0]?.code ?? '') : '',
      income_sub_code:  '',
    }))

  /* income: 선택한 대분류의 소분류 목록 */
  const incomeSubs = getSubcategories(form.income_main_code)

  return (
    <div className="exp-new-form">
      {/* 지출 / 수입 세그먼트 토글 */}
      <div className="exp-type-toggle">
        <button
          type="button"
          className={`exp-type-btn${!isIncome ? ' active expense' : ''}`}
          onClick={() => switchType('expense')}
        >
          💸 {t(lang, 'budget.expense')}
        </button>
        <button
          type="button"
          className={`exp-type-btn${isIncome ? ' active income' : ''}`}
          onClick={() => switchType('income')}
        >
          💰 {t(lang, 'budget.income')}
        </button>
      </div>

      {/* 대분류 / 소분류 */}
      <div className={compact ? 'exp-sel-pair-col' : 'exp-sel-pair'}>
        {isIncome ? (
          /* ── 수입: DB 기반 대분류 ── */
          <select
            value={form.income_main_code}
            onChange={e => setForm(f => ({ ...f, income_main_code: e.target.value, income_sub_code: '' }))}
          >
            <option value="">{t(lang, 'expenseCatPh')}</option>
            {INCOME_CATEGORIES.map(c => (
              <option key={c.code} value={c.code}>
                {c.icon} {lang === 'ko' ? c.name_ko : c.name_en}
              </option>
            ))}
          </select>
        ) : (
          /* ── 지출: 기존 expense 카테고리 ── */
          <select
            value={form.category_id}
            onChange={e => setForm(f => ({ ...f, category_id: e.target.value, subcategory_id: '' }))}
          >
            <option value="">{t(lang, 'expenseCatPh')}</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
            ))}
          </select>
        )}

        {isIncome ? (
          /* ── 수입: 소분류 ── */
          <select
            value={form.income_sub_code}
            onChange={e => setForm(f => ({ ...f, income_sub_code: e.target.value }))}
            disabled={!form.income_main_code}
          >
            <option value="">{t(lang, 'expenseSubcatPh')}</option>
            {incomeSubs.map(s => (
              <option key={s.code} value={s.code}>
                {s.icon} {lang === 'ko' ? s.name_ko : s.name_en}
              </option>
            ))}
          </select>
        ) : (
          /* ── 지출: 소분류 ── */
          <select
            value={form.subcategory_id}
            onChange={e => setForm(f => ({ ...f, subcategory_id: e.target.value }))}
            disabled={!subs.length}
          >
            <option value="">{t(lang, 'expenseSubcatPh')}</option>
            {subs.map(s => (
              <option key={s.id} value={s.id}>{s.icon} {s.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* 메모 — 수입/지출 모두 별도 행 */}
      <input
        className="exp-desc-inp"
        type="text"
        placeholder={t(lang, 'expenseDescPh')}
        value={form.description}
        onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
        onKeyDown={e => e.key === 'Enter' && addExpense()}
      />

      {/* 통화 / 금액 / 추가 버튼 — 한 줄 */}
      <div className="exp-cur-row">
        <select
          className="exp-cur-sel"
          value={form.currency}
          onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}
          style={{ width: '9rem', flexShrink: 0 }}
        >
          {CURRENCIES.map(c => (
            <option key={c.code} value={c.code}>{c.symbol} {t(lang, 'currency.' + c.code.toLowerCase())}</option>
          ))}
        </select>
        <input
          className="exp-amt-inp"
          type="number"
          min="0"
          step="any"
          placeholder={t(lang, 'expenseAmountPlaceholder')}
          value={form.amount}
          onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
          onKeyDown={e => e.key === 'Enter' && addExpense()}
          style={{ flex: 1 }}
        />
        <button
          className="btn-sm"
          onClick={addExpense}
          disabled={submitting || !form.amount || Number(form.amount) <= 0}
          style={{ width: '5rem', flexShrink: 0 }}
        >
          {t(lang, 'expenseAdd')}
        </button>
      </div>
    </div>
  )
}

function ExpItem({ e, editId, editForm, setEditForm, categories, lang, saveEdit, setEditId, startEdit, delExpense }) {
  const isEditing = editId === e.id
  if (isEditing) {
    const ec  = categories.find(c => c.id === Number(editForm.category_id))
    const ess = ec?.subs ?? []
    return (
      <li className="exp-item exp-item--editing">
        <div className="exp-edit-row">
          <div className="exp-edit-grid">
            {/* 대분류 */}
            <select
              value={editForm.category_id}
              onChange={ev => setEditForm(f => ({ ...f, category_id: ev.target.value, subcategory_id: '' }))}
            >
              <option value="">{t(lang, 'expenseCatPh')}</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
            </select>
            {/* 소분류 */}
            <select
              value={editForm.subcategory_id}
              onChange={ev => setEditForm(f => ({ ...f, subcategory_id: ev.target.value }))}
              disabled={!ess.length}
            >
              <option value="">{t(lang, 'expenseSubcatPh')}</option>
              {ess.map(s => <option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}
            </select>
            {/* 통화 */}
            <select
              value={editForm.currency}
              onChange={ev => setEditForm(f => ({ ...f, currency: ev.target.value }))}
            >
              {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.symbol} {t(lang, 'currency.' + c.code.toLowerCase())}</option>)}
            </select>
            {/* 금액 */}
            <input
              type="number"
              min="0"
              step="any"
              value={editForm.amount}
              onChange={ev => setEditForm(f => ({ ...f, amount: ev.target.value }))}
            />
          </div>
          {/* 메모 */}
          <input
            type="text"
            value={editForm.description}
            onChange={ev => setEditForm(f => ({ ...f, description: ev.target.value }))}
            placeholder={t(lang, 'expenseDescPh')}
            style={{ width: '100%', boxSizing: 'border-box' }}
          />
          {/* 날짜 + 버튼 */}
          <div className="exp-edit-btns">
            <input
              type="date"
              value={editForm.date}
              max={todayStr()}
              onChange={ev => setEditForm(f => ({ ...f, date: ev.target.value }))}
              style={{ flex: 1 }}
            />
            <button className="btn-sm" onClick={saveEdit}>{t(lang, 'common.save')}</button>
            <button className="btn-sm btn-sm--ghost" onClick={() => setEditId(null)}>{t(lang, 'common.cancel')}</button>
          </div>
        </div>
      </li>
    )
  }

  return (
    <li className="exp-item">
      {/* 왼쪽: 카테고리 경로 + 메모 (한 줄) */}
      <div className="exp-item-info">
        <span className="exp-item-path" title={
          `${e.category_icon ? e.category_icon + ' ' : ''}${e.category_name ?? ''}` +
          (e.subcategory_name ? ` › ${e.subcategory_icon ? e.subcategory_icon + ' ' : ''}${e.subcategory_name}` : '') +
          (e.description ? ` - ${e.description}` : '')
        }>
          {e.category_icon ? `${e.category_icon} ` : ''}
          {e.category_name ?? ''}
          {e.subcategory_name ? ` › ${e.subcategory_icon ? e.subcategory_icon + ' ' : ''}${e.subcategory_name}` : ''}
          {e.description ? ` - ${e.description}` : ''}
        </span>
      </div>

      {/* 오른쪽: 금액 + 환산 + 버튼 */}
      <div className="exp-item-right">
        <div className="exp-item-amounts">
          <span style={{ fontWeight: 500 }}>{fmtAmt(e.amount, e.currency ?? 'USD')}</span>
          {e.currency !== 'USD' && e.converted_amount != null && (
            <span className="exp-converted">≈${Number(e.converted_amount).toFixed(2)}</span>
          )}
        </div>
        <div className="exp-item-btns">
          <button className="btn-edit" title={t(lang, 'common.edit')} onClick={() => startEdit(e)}>✎</button>
          <button type="button" className="btn-del" title={t(lang, 'common.delete')} onClick={(ev) => delExpense(ev, e.id)}>✕</button>
        </div>
      </div>
    </li>
  )
}

function TodayHeader({ compact, todayUSD, budgetPct, overBudget, lang }) {
  return (
    <div className={compact ? 'm-exp-header' : 'exp-today'}>
      <div>
        <span className={compact ? 'm-exp-lbl' : 'exp-label'}>{t(lang, 'expenseTodayTotal')}</span>
        <div
          className={compact ? 'm-exp-total' : 'exp-amount'}
          style={{ color: todayUSD >= 0 ? undefined : '#e8a060' }}
        >
          {todayUSD < 0 ? '-' : ''}${Math.abs(todayUSD).toLocaleString(undefined, { maximumFractionDigits: 0 })}
        </div>
      </div>
      {budgetPct !== null && (
        <div className="exp-budget-block">
          <div className={`exp-budget-pct${overBudget ? ' over' : ''}`}>
            {t(lang, 'expenseThisMonth')} {budgetPct}%
            {overBudget && <span> · {t(lang, 'expenseOverBudget')}</span>}
          </div>
          <div className="exp-budget-bar">
            <div
              className={`exp-budget-fill${overBudget ? ' over' : ''}`}
              style={{ width: `${Math.min(budgetPct, 100)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function EmptyMsg({ loading, lang, mobile }) {
  return (
    <li style={{
      fontSize: mobile ? '0.88rem' : '0.82rem',
      color: 'var(--ink3)',
      fontStyle: 'italic',
      padding: '0.4rem 0',
    }}>
      {loading ? t(lang, 'common.loading') : t(lang, 'expenseEmpty')}
    </li>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════ */

export default function ExpenseCard({ isMobile = false, lang = 'ko' }) {
  const [expenses,      setExpenses]      = useState([])
  const [categories,    setCategories]    = useState([])
  const [monthlyTotal,  setMonthlyTotal]  = useState(0)
  const [monthlyBudget, setMonthlyBudget] = useState(null)
  const [loading,       setLoading]       = useState(false)
  const [submitting,    setSubmitting]    = useState(false)
  const [curDate,       setCurDate]       = useState(todayStr())
  const { toast, showToast } = useToast()

  const [form,    setForm]    = useState(INIT_FORM)
  const [editId,  setEditId]  = useState(null)
  const [editForm,setEditForm]= useState({})

  /* 파생값 */
  const selCat = categories.find(c => c.id === Number(form.category_id))
  const subs   = selCat?.subs ?? []

  const getToken = () => { try { return localStorage.getItem('token') || '' } catch { return '' } }
  const authH = () => ({ Authorization: 'Bearer ' + getToken() })

  /* ── 데이터 로드 ──────────────────────────────────────────────────── */

  const loadCategories = useCallback(async () => {
    const data = await fetch(`/api/expense/categories?lang=${lang}`, { headers: authH() })
      .then(r => r.ok ? r.json() : []).catch(() => [])
    setCategories(data)
  }, [lang]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadExpenses = useCallback(async (date = curDate) => {
    setLoading(true)
    const data = await fetch(`/api/expense?date=${date}&lang=${lang}`, { headers: authH() })
      .then(r => r.ok ? r.json() : []).catch(() => [])
    setExpenses(data)
    setLoading(false)
  }, [lang, curDate]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadMonthly = useCallback(async () => {
    const now   = new Date()
    const year  = now.getFullYear()
    const month = now.getMonth() + 1
    const [summary, budgets] = await Promise.all([
      fetch(`/api/expense/summary/monthly?year=${year}&month=${month}&lang=${lang}`, { headers: authH() })
        .then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`/api/expense/budget?year=${year}&month=${month}`, { headers: authH() })
        .then(r => r.ok ? r.json() : []).catch(() => []),
    ])
    setMonthlyTotal(summary?.total_usd ?? 0)
    const totalBudget = (budgets ?? []).reduce((s, b) => s + (b.budget_usd ?? 0), 0)
    setMonthlyBudget(totalBudget > 0 ? totalBudget : null)
  }, [lang]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadCategories()
    loadExpenses(curDate)
    loadMonthly()
  }, [loadCategories, loadExpenses, loadMonthly])

  /* form.date 변경 시 해당 날짜 지출 목록 즉시 재조회 */
  useEffect(() => {
    if (form.date) loadExpenses(form.date)
  }, [form.date, loadExpenses])

  /* 자정 자동 리셋 — 매 1분 날짜 변경 감지 */
  useEffect(() => {
    const id = setInterval(() => {
      const d = todayStr()
      if (d !== curDate) {
        setCurDate(d)
        setForm(f => ({ ...f, date: d }))
        loadExpenses(d)
        loadMonthly()
      }
    }, 60_000)
    return () => clearInterval(id)
  }, [curDate, loadExpenses, loadMonthly])

  /* ── CRUD ─────────────────────────────────────────────────────────── */

  async function addExpense() {
    if (!form.amount || Number(form.amount) <= 0) return
    setSubmitting(true)
    const isIncome = form.type === 'income'
    try {
      let res
      if (isIncome) {
        /* ── 수입: /api/income (code 기반) ── */
        res = await fetch('/api/income', {
          method: 'POST',
          headers: { ...authH(), 'Content-Type': 'application/json' },
          body: JSON.stringify({
            category_code:    form.income_main_code || null,
            subcategory_code: form.income_sub_code  || null,
            description:      form.description.trim() || null,
            currency:         form.currency,
            amount:           Number(form.amount),
            date:             form.date,
          }),
        })
      } else {
        /* ── 지출: /api/expense (id 기반) ── */
        res = await fetch('/api/expense', {
          method: 'POST',
          headers: { ...authH(), 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date:           form.date,
            amount:         Number(form.amount),
            currency:       form.currency,
            category_id:    form.category_id    ? Number(form.category_id)    : null,
            subcategory_id: form.subcategory_id ? Number(form.subcategory_id) : null,
            description:    form.description.trim() || null,
            type:           'expense',
            lang,
          }),
        })
      }
      if (!res.ok) throw new Error('HTTP ' + res.status)
      setForm(f => ({
        ...f,
        amount: '', description: '',
        category_id: '', subcategory_id: '',
        income_main_code: '', income_sub_code: '',
      }))
      await loadExpenses(form.date)
      await loadMonthly()
    } catch (err) {
      console.error('[ExpenseCard] 저장 실패:', err)
      showToast(t(lang, 'common.error'), 'err')
    } finally {
      setSubmitting(false)
    }
  }

  async function delExpense(e, id) {
    if (e && e.preventDefault) e.preventDefault()
    // 즉시 클라이언트 상태에서 제거 (optimistic update)
    setExpenses(prev => prev.filter(item => item.id !== id))
    try {
      await fetch('/api/expense/' + id, { method: 'DELETE', headers: authH() })
      showToast(t(lang, 'common.deleteSuccess'), 'ok')
      await loadMonthly()
    } catch {
      // 실패 시 원상 복구
      await loadExpenses(form.date)
    }
  }

  function startEdit(e) {
    setEditId(e.id)
    setEditForm({
      date:           e.date,
      amount:         String(e.amount),
      currency:       e.currency ?? 'USD',
      category_id:    e.category_id    ? String(e.category_id)    : '',
      subcategory_id: e.subcategory_id ? String(e.subcategory_id) : '',
      description:    e.description ?? '',
    })
  }

  async function saveEdit() {
    try {
      const res = await fetch('/api/expense/' + editId, {
        method: 'PUT',
        headers: { ...authH(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date:           editForm.date,
          amount:         Number(editForm.amount),
          currency:       editForm.currency,
          category_id:    editForm.category_id    ? Number(editForm.category_id)    : null,
          subcategory_id: editForm.subcategory_id ? Number(editForm.subcategory_id) : null,
          description:    editForm.description.trim() || null,
          lang,
        }),
      })
      if (!res.ok) throw new Error('HTTP ' + res.status)
      setEditId(null)
      await loadExpenses(form.date)
      await loadMonthly()
    } catch (err) {
      console.error('[ExpenseCard] 수정 실패:', err)
      showToast(t(lang, 'common.error'), 'err')
    }
  }

  /* ── 집계 ─────────────────────────────────────────────────────────── */
  // Today's Total = 수입 합계 - 지출 합계 (순 현금흐름)
  const todayUSD = expenses.reduce((s, e) => {
    const amt = parseFloat(e.converted_amount ?? e.amount) || 0
    return (e.type || 'expense') === 'income' ? s + amt : s - amt
  }, 0)
  const budgetPct  = monthlyBudget ? Math.round(monthlyTotal / monthlyBudget * 100) : null
  const overBudget = budgetPct !== null && budgetPct > 100

  /* ════════════════════════════════════════════════════════════════════
     모바일 레이아웃
  ════════════════════════════════════════════════════════════════════ */
  if (isMobile) {
    return (
      <div className="m-card">
        <Toast toast={toast} />
        <div className="m-card-header">
          <span className="card-icon">💳</span>
          <span className="m-card-title">{t(lang, 'budget.cashflow_title')}</span>
          <Link to="/budget" style={{ fontSize: '0.6rem', color: 'var(--ink3)', marginLeft: '0.25rem', textDecoration: 'none' }}>↗</Link>
        </div>
        <div className="m-card-body">
          {/* ── 날짜 선택 (식단 카드와 동일 패턴) ── */}
          <div className="diet-date-row">
            <input
              type="date"
              className="diet-date-inp"
              value={form.date}
              max={todayStr()}
              onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
            />
          </div>
          <TodayHeader
            compact
            todayUSD={todayUSD}
            budgetPct={budgetPct}
            overBudget={overBudget}
            lang={lang}
          />
          <ExpForm
            compact
            form={form}
            setForm={setForm}
            categories={categories}
            subs={subs}
            lang={lang}
            submitting={submitting}
            addExpense={addExpense}
          />
          <ul className="m-exp-list" style={{ marginTop: '0.6rem' }}>
            {!expenses.length
              ? <EmptyMsg mobile loading={loading} lang={lang} />
              : expenses.map(e => (
                  <ExpItem
                    key={e.id}
                    e={e}
                    editId={editId}
                    editForm={editForm}
                    setEditForm={setEditForm}
                    categories={categories}
                    lang={lang}
                    saveEdit={saveEdit}
                    setEditId={setEditId}
                    startEdit={startEdit}
                    delExpense={delExpense}
                  />
                ))
            }
          </ul>
        </div>
      </div>
    )
  }

  /* ════════════════════════════════════════════════════════════════════
     데스크톱 레이아웃
  ════════════════════════════════════════════════════════════════════ */
  return (
    <div className="card card-expense">
      <Toast toast={toast} />
      <div className="card-header">
        <span className="card-icon">💳</span>
        <span className="card-title">{t(lang, 'budget.cashflow_title')}</span>
        <Link to="/budget" style={{ fontSize: '0.65rem', color: 'var(--ink3)', marginLeft: '0.3rem', textDecoration: 'none' }}>
          {t(lang, 'expense.budgetLink')}
        </Link>
      </div>
      <div className="card-body">
        {/* ── 날짜 선택 (식단 카드와 동일 패턴) ── */}
        <div className="diet-date-row">
          <input
            type="date"
            className="diet-date-inp"
            value={form.date}
            max={todayStr()}
            onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
          />
        </div>
        <TodayHeader
          todayUSD={todayUSD}
          budgetPct={budgetPct}
          overBudget={overBudget}
          lang={lang}
        />
        <ExpForm
          form={form}
          setForm={setForm}
          categories={categories}
          subs={subs}
          lang={lang}
          submitting={submitting}
          addExpense={addExpense}
        />
        <ul className="exp-list">
          {!expenses.length
            ? <EmptyMsg loading={loading} lang={lang} />
            : expenses.map(e => (
                <ExpItem
                  key={e.id}
                  e={e}
                  editId={editId}
                  editForm={editForm}
                  setEditForm={setEditForm}
                  categories={categories}
                  lang={lang}
                  saveEdit={saveEdit}
                  setEditId={setEditId}
                  startEdit={startEdit}
                  delExpense={delExpense}
                />
              ))
          }
        </ul>
      </div>
    </div>
  )
}
