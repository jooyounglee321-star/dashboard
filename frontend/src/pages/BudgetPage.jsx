import { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { t } from '../i18n'
import { Chart, registerables } from 'chart.js'
import { INCOME_CATEGORIES, getSubcategories } from '../data/incomeCategories'
import './BudgetPage.css'

Chart.register(...registerables)

// ── 상수 ─────────────────────────────────────────────────────────────────────
const CURRENCIES = ['USD', 'KRW', 'EUR', 'JPY', 'GBP', 'CNY', 'CAD', 'AUD', 'CHF', 'HKD']
const SYM = { USD: '$', KRW: '₩', EUR: '€', JPY: '¥', GBP: '£', CNY: '¥', CAD: 'C$', AUD: 'A$', CHF: 'Fr', HKD: 'HK$' }
const COLORS = ['#e8a060','#60b4e8','#7ee882','#e860c8','#e8e060','#60e8d0','#e88060','#a060e8','#60e89a','#e86060']
const ML = {
  ko: ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'],
  en: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
}

// ── 유틸 ─────────────────────────────────────────────────────────────────────
const pad2 = n => String(n).padStart(2, '0')

/**
 * 브라우저 로컬 타임존 기준 오늘 날짜를 "YYYY-MM-DD"로 반환.
 * new Date().toISOString()은 UTC 기준이라 UTC+9(한국) 오전 9시 이전에
 * 하루 전 날짜를 반환하는 버그가 있어 로컬 메서드를 직접 사용.
 */
const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/**
 * <input type="date">의 e.target.value("YYYY-MM-DD")를 그대로 반환.
 * new Date(str) 변환을 절대 거치지 않음 — 변환 시 UTC 파싱으로 타임존 오프셋 발생.
 */
const toLocalDateStr = (inputValue) => {
  // "YYYY-MM-DD" 포맷 검증 (브라우저가 항상 이 형식으로 줌)
  if (/^\d{4}-\d{2}-\d{2}$/.test(inputValue)) return inputValue
  // 혹시 다른 형식이 들어올 경우 로컬 날짜로 안전하게 폴백
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function fmtAmt(amt, cur) {
  const s = SYM[cur] || '$'
  const n = amt || 0
  if (cur === 'KRW' || cur === 'JPY') return s + Math.round(n).toLocaleString()
  return s + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/**
 * localStorage에서 JWT를 읽어 유효성 검증 후 반환.
 * null / 'null' / 'undefined' / 빈 문자열이면 로그인 페이지로 강제 이동.
 */
function getToken() {
  const raw = localStorage.getItem('token')
  if (!raw || raw === 'null' || raw === 'undefined' || raw.trim() === '') {
    // 토큰 없음 → 로그인 페이지로 이동
    window.location.href = '/login'
    return ''
  }
  return raw.trim()
}

/** GET 요청 — JWT 자동 첨부, 401 시 로그인 리다이렉트 */
function apiGet(url) {
  const token = getToken()
  return fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  }).then(r => {
    if (r.status === 401) { window.location.href = '/login'; throw new Error('401') }
    if (!r.ok) throw new Error(r.status)
    return r.json()
  })
}

/** POST / PUT / DELETE 요청 — JWT 자동 첨부, 401 시 로그인 리다이렉트 */
function apiReq(method, url, body) {
  const token = getToken()
  return fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  }).then(r => {
    if (r.status === 401) { window.location.href = '/login'; throw new Error('401') }
    if (!r.ok) throw new Error(r.status)
    return r.json().catch(() => null)
  })
}

function csvDownload(rows, filename) {
  const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: filename })
  a.click()
}

// ── BudgetPage ────────────────────────────────────────────────────────────────
export default function BudgetPage() {
  const [lang, setLang] = useState(() => {
    try { return localStorage.getItem('dashboard_lang') || 'ko' } catch { return 'ko' }
  })
  const [tab, setTab] = useState(0)
  const [currency, setCurrency] = useState('USD')
  const [rateMap, setRateMap] = useState({})

  useEffect(() => {
    const onChange = () => setLang(localStorage.getItem('dashboard_lang') || 'ko')
    window.addEventListener('languageChanged', onChange)
    apiGet('/api/exchange-rates')
      .then(list => {
        const map = {}
        if (Array.isArray(list)) list.forEach(r => { map[r.target] = r.rate })
        setRateMap(map)
      })
      .catch(() => {})
    return () => window.removeEventListener('languageChanged', onChange)
  }, [])

  const toDisplay = useCallback((usdAmt) => {
    if (!usdAmt) return 0
    if (currency === 'USD') return usdAmt
    return usdAmt * (rateMap[currency] || 1)
  }, [currency, rateMap])

  const TABS = [
    t(lang, 'budget.daily_tab'),
    t(lang, 'budget.monthly_tab'),
    t(lang, 'budget.yearly_tab'),
    t(lang, 'budget.summary'),
    t(lang, 'budget.budget_tab'),
  ]

  return (
    <div className="bp-wrap">
      <header className="bp-header">
        <Link to="/" className="bp-back">← {t(lang, 'budgetBack')}</Link>
        <h1 className="bp-title">{t(lang, 'budget.budget')}</h1>
        <div className="bp-header-r">
          <span className="bp-cur-label">{t(lang, 'budget.currency')}</span>
          <select className="bp-cur-sel" value={currency} onChange={e => setCurrency(e.target.value)}>
            {CURRENCIES.map(c => (
              <option key={c} value={c}>{SYM[c]} {t(lang, 'currency.' + c.toLowerCase())}</option>
            ))}
          </select>
        </div>
      </header>

      <nav className="bp-tabs">
        {TABS.map((name, i) => (
          <button key={i} className={`bp-tab${tab === i ? ' active' : ''}`} onClick={() => setTab(i)}>
            {name}
          </button>
        ))}
      </nav>

      <div className="bp-body">
        {tab === 0 && <DailyTab   lang={lang} currency={currency} toDisplay={toDisplay} />}
        {tab === 1 && <MonthlyTab lang={lang} currency={currency} toDisplay={toDisplay} />}
        {tab === 2 && <YearlyTab  lang={lang} currency={currency} toDisplay={toDisplay} />}
        {tab === 3 && <SummaryTab lang={lang} currency={currency} toDisplay={toDisplay} />}
        {tab === 4 && <SettingTab lang={lang} currency={currency} toDisplay={toDisplay} />}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// Tab 1 — 일별
// ══════════════════════════════════════════════════════════════════════════════
const INIT_NEW_FORM = {
  category_id: '', subcategory_id: '',
  income_main_code: '',   // income 전용 대분류 code
  income_sub_code:  '',   // income 전용 소분류 code
  amount: '', currency: 'USD', description: '', type: 'expense',
}

function DailyTab({ lang, currency, toDisplay }) {
  const [date, setDate]     = useState(todayStr)
  const [items, setItems]   = useState([])
  const [cats, setCats]     = useState([])
  const [loading, setLoading] = useState(false)
  const [editId, setEditId] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [newForm, setNewForm] = useState(INIT_NEW_FORM)
  const [submitting, setSubmitting] = useState(false)

  // 세대 카운터: 날짜가 바뀔 때마다 증가 → 이전 fetch 응답을 무시해 race condition 차단
  const loadGenRef = useRef(0)

  useEffect(() => {
    // 카테고리 로드 실패 시 1회 재시도
    apiGet(`/api/expense/categories?lang=${lang}`)
      .then(d => { if (Array.isArray(d) && d.length) setCats(d) })
      .catch(() => {
        setTimeout(() => {
          apiGet(`/api/expense/categories?lang=${lang}`)
            .then(d => setCats(d || []))
            .catch(err => console.error('[DailyTab] 카테고리 로드 실패:', err))
        }, 1500)
      })
  }, [lang])

  const load = useCallback(() => {
    const gen = ++loadGenRef.current          // 이 요청의 세대 번호를 캡처
    setLoading(true)
    apiGet(`/api/expense?date=${date}&lang=${lang}`)
      .then(d => {
        if (gen !== loadGenRef.current) return // 더 최신 요청이 생겼으면 결과 버림
        setItems(d || [])
      })
      .catch(err => {
        if (gen !== loadGenRef.current) return
        console.error('[DailyTab] 목록 로드 실패:', err)
      })
      .finally(() => {
        if (gen !== loadGenRef.current) return
        setLoading(false)
      })
  }, [date, lang])

  // date·lang 변경 시 즉시 재조회
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [date, lang])

  // 클라이언트 안전 필터: 서버 응답 date 필드가 "YYYY-MM-DD HH:MM:SS" 형태여도
  // 앞 10자리만 잘라 선택된 날짜와 100% 일치하는 항목만 표시 (타임존 왜곡 최종 방어)
  const displayItems = items.filter(it => (it.date ?? '').substring(0, 10) === date)

  // 카테고리별 합계 & 일별 총합
  const catMap = {}
  let dayTotal = 0
  displayItems.forEach(it => {
    const usd = it.converted_amount ?? it.amount ?? 0
    dayTotal += usd
    const cat = it.category_name || (lang === 'ko' ? '기타' : 'Other')
    catMap[cat] = (catMap[cat] || 0) + usd
  })

  const isNewIncome  = (newForm.type  || 'expense') === 'income'
  const isEditIncome = (editForm.type || 'expense') === 'income'

  // income: 선택한 대분류의 소분류 목록
  const newIncomeSubs  = getSubcategories(newForm.income_main_code  || '')
  const editIncomeSubs = getSubcategories(editForm.income_main_code || '')

  // 지출 소분류 목록
  const newFormSubs = (!isNewIncome && newForm.category_id)
    ? (cats.find(c => c.id === Number(newForm.category_id))?.subs ?? [])
    : []
  const editSubs = (!isEditIncome && editForm.category_id)
    ? (cats.find(c => c.id === Number(editForm.category_id))?.subs ?? [])
    : []

  async function addExpense() {
    const amt = parseFloat(newForm.amount)
    if (isNaN(amt) || amt <= 0) return
    setSubmitting(true)
    try {
      if (isNewIncome) {
        /* ── 수입: /api/income (code 기반) ── */
        await apiReq('POST', '/api/income', {
          category_code:    newForm.income_main_code || null,
          subcategory_code: newForm.income_sub_code  || null,
          description:      newForm.description.trim() || null,
          currency:         newForm.currency || 'USD',
          amount:           amt,
          date,
        })
      } else {
        /* ── 지출: /api/expense (id 기반) ── */
        const saved = await apiReq('POST', '/api/expense', {
          date,
          amount:         amt,
          currency:       newForm.currency || 'USD',
          category_id:    newForm.category_id    ? Number(newForm.category_id)    : null,
          subcategory_id: newForm.subcategory_id ? Number(newForm.subcategory_id) : null,
          description:    newForm.description.trim() || null,
          type:           'expense',
          lang,
        })
        if (saved) setItems(prev => [saved, ...prev])
      }
      setNewForm(f => ({
        ...f, amount: '', description: '',
        category_id: '', subcategory_id: '',
        income_main_code: isNewIncome ? (INCOME_CATEGORIES[0]?.code ?? '') : '',
        income_sub_code: '',
      }))
      load()
    } catch (err) {
      console.error('[addExpense] 저장 실패:', err)
      alert(t(lang, 'budget.saveError'))
    } finally {
      setSubmitting(false)
    }
  }

  function startEdit(it) {
    setEditId(it.id)
    const itemType = it.type || 'expense'
    setEditForm({
      amount:           it.amount,
      currency:         it.currency || 'USD',
      description:      it.description || '',
      category_id:      it.category_id    || '',
      subcategory_id:   it.subcategory_id || '',
      income_main_code: itemType === 'income' ? (it.category_code    || INCOME_CATEGORIES[0]?.code || '') : '',
      income_sub_code:  itemType === 'income' ? (it.subcategory_code || '') : '',
      type:             itemType,
    })
  }

  async function saveEdit() {
    const amt = parseFloat(editForm.amount)
    if (isNaN(amt) || amt <= 0) return
    try {
      await apiReq('PUT', `/api/expense/${editId}`, {
        amount:         amt,
        currency:       editForm.currency    || 'USD',
        description:    editForm.description || null,
        category_id:    !isEditIncome && editForm.category_id    ? Number(editForm.category_id)    : null,
        subcategory_id: !isEditIncome && editForm.subcategory_id ? Number(editForm.subcategory_id) : null,
        type:           editForm.type || 'expense',
        lang,
      })
    } catch (err) {
      console.error('[saveEdit] 수정 실패:', err)
    }
    setEditId(null)
    load()
  }

  async function delItem(id) {
    if (!window.confirm(t(lang, 'budgetConfirmDel'))) return
    await apiReq('DELETE', `/api/expense/${id}`).catch(() => {})
    load()
  }

  function doExport() {
    const headers = [t(lang, 'budget.date'), t(lang, 'budget.category'), t(lang, 'budget.subcategory'), t(lang, 'budget.description'), t(lang, 'budget.amount'), 'Currency', '≈ USD']
    const rows = items.map(it => [it.date, it.category_name || '', it.subcategory_name || '', it.description || '', it.amount, it.currency, it.converted_amount ?? it.amount])
    csvDownload([headers, ...rows], `expenses-${date}.csv`)
  }

  return (
    <section className="bp-sec">
      <div className="bp-toolbar">
        <input type="date" className="bp-date-inp" value={date}
          max={todayStr()}
          onChange={e => {
            // e.target.value는 항상 로컬 "YYYY-MM-DD" 문자열 — new Date() 변환 절대 금지
            // split('-')으로 연/월/일을 명시적으로 분해 후 재조합 → UTC 파싱 경로 원천 차단
            const [yyyy, mm, dd] = e.target.value.split('-')
            if (yyyy && mm && dd) {
              const picked = `${yyyy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}`
              setDate(picked)   // 상태 갱신 → useEffect[date,lang] 즉시 트리거
            }
          }} />
        <button className="bp-btn-sm" onClick={doExport}>📥 {t(lang, 'budget.exportCSV')}</button>
      </div>

      {/* 등록 폼 */}
      <div className="bp-add-form">
        {/* 지출 / 수입 토글 */}
        <div className="bp-type-toggle">
          <button type="button"
            className={`bp-type-btn${!isNewIncome ? ' active expense' : ''}`}
            onClick={() => setNewForm(f => ({ ...f, type: 'expense', category_id: '', subcategory_id: '', income_main_code: '', income_sub_code: '' }))}>
            💸 {t(lang, 'budget.expense')}
          </button>
          <button type="button"
            className={`bp-type-btn${isNewIncome ? ' active income' : ''}`}
            onClick={() => setNewForm(f => ({ ...f, type: 'income', category_id: '', subcategory_id: '', income_main_code: INCOME_CATEGORIES[0]?.code ?? '', income_sub_code: '' }))}>
            💰 {t(lang, 'budget.income')}
          </button>
        </div>
        <div className="bp-edit-row">
          {isNewIncome ? (
            /* ── 수입: DB 기반 대분류 ── */
            <>
              <select className="bp-sel" value={newForm.income_main_code}
                onChange={e => setNewForm(f => ({ ...f, income_main_code: e.target.value, income_sub_code: '' }))}>
                <option value="">{t(lang, 'expenseCatPh')}</option>
                {INCOME_CATEGORIES.map(c => (
                  <option key={c.code} value={c.code}>{c.icon} {lang === 'ko' ? c.name_ko : c.name_en}</option>
                ))}
              </select>
              <select className="bp-sel" value={newForm.income_sub_code}
                onChange={e => setNewForm(f => ({ ...f, income_sub_code: e.target.value }))}
                disabled={!newForm.income_main_code}>
                <option value="">{t(lang, 'expenseSubcatPh')}</option>
                {newIncomeSubs.map(s => (
                  <option key={s.code} value={s.code}>{s.icon} {lang === 'ko' ? s.name_ko : s.name_en}</option>
                ))}
              </select>
            </>
          ) : (
            /* ── 지출: 기존 expense 카테고리 ── */
            <>
              <select className="bp-sel" value={newForm.category_id}
                onChange={e => setNewForm(f => ({ ...f, category_id: e.target.value, subcategory_id: '' }))}>
                <option value="">{t(lang, 'expenseCatPh')}</option>
                {cats.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
              </select>
              <select className="bp-sel" value={newForm.subcategory_id}
                onChange={e => setNewForm(f => ({ ...f, subcategory_id: e.target.value }))}
                disabled={!newFormSubs.length}>
                <option value="">{t(lang, 'expenseSubcatPh')}</option>
                {newFormSubs.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </>
          )}
        </div>
        <div className="bp-edit-row">
          <input type="number" className="bp-inp" placeholder={t(lang, 'budget.amount')}
            value={newForm.amount}
            onChange={e => setNewForm(f => ({ ...f, amount: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && addExpense()} />
          <select className="bp-sel bp-sel-sm" value={newForm.currency}
            onChange={e => setNewForm(f => ({ ...f, currency: e.target.value }))}>
            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <input type="text" className="bp-inp" placeholder={t(lang, 'expenseDescPh')}
            value={newForm.description}
            onChange={e => setNewForm(f => ({ ...f, description: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && addExpense()} />
          <button className="bp-btn-primary" onClick={addExpense}
            disabled={submitting || !newForm.amount || Number(newForm.amount) <= 0}>
            {t(lang, 'common.add')}
          </button>
        </div>
      </div>

      {/* 일별 합계 + 카테고리 칩 */}
      <div className="bp-daily-top">
        <div className="bp-daily-total">
          <span className="bp-total-label">{t(lang, 'budget.totalExpense')}</span>
          <span className="bp-total-num">{fmtAmt(toDisplay(dayTotal), currency)}</span>
        </div>
        <div className="bp-chips">
          {Object.entries(catMap).map(([cat, usd]) => (
            <span key={cat} className="bp-chip">{cat} {fmtAmt(toDisplay(usd), currency)}</span>
          ))}
        </div>
      </div>

      {loading
        ? <p className="bp-info">{t(lang, 'common.loading')}</p>
        : displayItems.length === 0
          ? <p className="bp-info bp-empty">{t(lang, 'budget.noExpense')}</p>
          : (
            /* ── 반응형 그리드: 인라인 style로 직접 주입 (CSS 캐시 무관) ──
               auto-fill + minmax로 자동 열 수 계산
               ~520px → 1열 / 520~820px → 2열 / 820px+ → 3열          */
            <ul style={{
              listStyle: 'none', margin: 0, padding: 0,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: '1rem',
              width: '100%',
            }}>
              {displayItems.map(it => (
                <li key={it.id} style={editId === it.id ? {
                  /* 수정 모드 카드 — 전체 너비 차지 */
                  gridColumn: '1 / -1',
                  background: 'rgba(232,160,96,0.06)',
                  border: '1px solid rgba(232,160,96,0.25)',
                  borderRadius: '1rem',
                  padding: '1.1rem 1.25rem',
                  display: 'flex', flexDirection: 'column', gap: '0.5rem',
                } : {
                  /* 일반 카드 */
                  background: 'rgba(255,255,255,0.07)',
                  border: '1px solid rgba(255,255,255,0.13)',
                  borderRadius: '1rem',       /* rounded-2xl 상당 */
                  padding: '1.25rem',          /* p-5 상당 */
                  display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                  gap: '0.75rem',
                  boxShadow: '0 2px 12px rgba(0,0,0,0.22)',
                  transition: 'box-shadow 0.15s',
                  minHeight: '96px',
                }}>
                  {editId === it.id ? (
                    <div className="bp-edit">
                      {/* 수정 모달 — 지출/수입 토글 */}
                      <div className="bp-type-toggle" style={{ marginBottom: '0.4rem' }}>
                        <button type="button"
                          className={`bp-type-btn${!isEditIncome ? ' active expense' : ''}`}
                          onClick={() => setEditForm(f => ({
                            ...f, type: 'expense',
                            category_id: '', subcategory_id: '',
                            income_main_code: '', income_sub_code: '',
                          }))}>
                          💸 {t(lang, 'budget.expense')}
                        </button>
                        <button type="button"
                          className={`bp-type-btn${isEditIncome ? ' active income' : ''}`}
                          onClick={() => setEditForm(f => ({
                            ...f, type: 'income',
                            category_id: '', subcategory_id: '',
                            income_main_code: INCOME_CATEGORIES[0]?.code ?? '',
                            income_sub_code: '',
                          }))}>
                          💰 {t(lang, 'budget.income')}
                        </button>
                      </div>
                      <div className="bp-edit-row">
                        {isEditIncome ? (
                          /* ── 수입 모드: INCOME_CATEGORIES 기반 대분류 / 소분류 ── */
                          <>
                            <select className="bp-sel" value={editForm.income_main_code || ''}
                              onChange={e => setEditForm(f => ({ ...f, income_main_code: e.target.value, income_sub_code: '' }))}>
                              <option value="">{t(lang, 'expenseCatPh')}</option>
                              {INCOME_CATEGORIES.map(c => (
                                <option key={c.code} value={c.code}>{c.icon} {lang === 'ko' ? c.name_ko : c.name_en}</option>
                              ))}
                            </select>
                            <select className="bp-sel" value={editForm.income_sub_code || ''}
                              onChange={e => setEditForm(f => ({ ...f, income_sub_code: e.target.value }))}
                              disabled={!editForm.income_main_code}>
                              <option value="">{t(lang, 'expenseSubcatPh')}</option>
                              {editIncomeSubs.map(s => (
                                <option key={s.code} value={s.code}>{s.icon} {lang === 'ko' ? s.name_ko : s.name_en}</option>
                              ))}
                            </select>
                          </>
                        ) : (
                          /* ── 지출 모드: expense 카테고리만 (income 완전 격리) ── */
                          <>
                            <select className="bp-sel" value={editForm.category_id}
                              onChange={e => setEditForm(f => ({ ...f, category_id: e.target.value, subcategory_id: '' }))}>
                              <option value="">{t(lang, 'expenseCatPh')}</option>
                              {cats.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                            </select>
                            <select className="bp-sel" value={editForm.subcategory_id}
                              onChange={e => setEditForm(f => ({ ...f, subcategory_id: e.target.value }))}
                              disabled={!editSubs.length}>
                              <option value="">{t(lang, 'expenseSubcatPh')}</option>
                              {editSubs.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                          </>
                        )}
                      </div>
                      <div className="bp-edit-row">
                        <input type="number" className="bp-inp" value={editForm.amount}
                          onChange={e => setEditForm(f => ({ ...f, amount: e.target.value }))} />
                        <select className="bp-sel bp-sel-sm" value={editForm.currency}
                          onChange={e => setEditForm(f => ({ ...f, currency: e.target.value }))}>
                          {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <input type="text" className="bp-inp" value={editForm.description}
                          onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                          placeholder={t(lang, 'expenseDescPh')} />
                      </div>
                      <div className="bp-edit-btns">
                        <button className="bp-btn-primary" onClick={saveEdit}>{t(lang, 'common.save')}</button>
                        <button className="bp-btn-ghost" onClick={() => setEditId(null)}>{t(lang, 'common.cancel')}</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* 카드 상단: 수입/지출 배지 + 카테고리 경로 + 메모 */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', flex: 1, minWidth: 0 }}>
                        {/* 수입 배지 */}
                        {(it.type || 'expense') === 'income' && (
                          <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#60c080',
                            background: 'rgba(96,192,128,0.12)', borderRadius: '4px',
                            padding: '0.1rem 0.4rem', display: 'inline-block', width: 'fit-content' }}>
                            💰 {t(lang, 'budget.income')}
                          </span>
                        )}
                        <span style={{ fontSize: '0.9rem', fontWeight: 500, color: '#e0e6ef', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {it.category_icon && <span style={{ marginRight: '0.25rem' }}>{it.category_icon}</span>}
                          {it.category_name || '–'}
                          {it.subcategory_name && <span style={{ color: '#9aacbf', fontWeight: 400 }}> › {it.subcategory_name}</span>}
                        </span>
                        {it.description && (
                          <span style={{ fontSize: '0.8rem', color: '#8fa0b4' }}>{it.description}</span>
                        )}
                      </div>
                      {/* 카드 하단: 금액(왼쪽) + 액션 버튼(오른쪽) */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '0.6rem', borderTop: '1px solid rgba(255,255,255,0.09)', gap: '0.5rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.06rem' }}>
                          {/* 수입: 초록 + 기호 / 지출: 주황 */}
                          <span style={{
                            fontSize: '1.05rem', fontWeight: 700, letterSpacing: '-0.01em',
                            color: (it.type || 'expense') === 'income' ? '#60c080' : '#e8a060',
                          }}>
                            {(it.type || 'expense') === 'income' ? '+' : ''}{fmtAmt(it.amount, it.currency)}
                          </span>
                          {it.currency !== currency && (
                            <span style={{ fontSize: '0.76rem', color: '#7a8fa6' }}>
                              ≈ {(it.type || 'expense') === 'income' ? '+' : ''}{fmtAmt(toDisplay(it.converted_amount ?? it.amount), currency)}
                            </span>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0 }}>
                          <button className="bp-icon-btn" onClick={() => startEdit(it)} title={t(lang, 'common.edit')}>✏️</button>
                          <button className="bp-icon-btn del" onClick={() => delItem(it.id)} title={t(lang, 'common.delete')}>🗑️</button>
                        </div>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )
      }
    </section>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// Tab 2 — 월별
// ══════════════════════════════════════════════════════════════════════════════
function MonthlyTab({ lang, currency, toDisplay }) {
  const now = new Date()
  const [year, setYear]   = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [monthly, setMonthly] = useState(null)
  const [stats, setStats]     = useState(null)
  const [loading, setLoading] = useState(false)

  const pieRef  = useRef(null)
  const lineRef = useRef(null)
  const barRef  = useRef(null)
  const chartsRef = useRef([])

  function destroyCharts() {
    chartsRef.current.forEach(c => c.destroy())
    chartsRef.current = []
  }

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      apiGet(`/api/expense/summary/monthly?year=${year}&month=${month}&lang=${lang}`),
      apiGet(`/api/expense/stats?year=${year}&month=${month}&lang=${lang}`),
    ]).then(([m, s]) => { setMonthly(m); setStats(s) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [year, month, lang])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    destroyCharts()
    if (!monthly || !stats) return

    // 파이차트 — 카테고리별 비중
    if (pieRef.current && stats.by_category?.length) {
      chartsRef.current.push(new Chart(pieRef.current, {
        type: 'doughnut',
        data: {
          labels: stats.by_category.map(c => c.category_name),
          datasets: [{
            data: stats.by_category.map(c => toDisplay(c.total_usd)),
            backgroundColor: COLORS.slice(0, stats.by_category.length),
            borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
          }],
        },
        options: {
          responsive: true,
          plugins: {
            legend: { position: 'right', labels: { color: '#ccc', font: { size: 11 }, padding: 8 } },
            tooltip: {
              callbacks: {
                label: ctx => {
                  const c = stats.by_category[ctx.dataIndex]
                  return ` ${ctx.label}: ${fmtAmt(ctx.raw, currency)} (${c?.pct?.toFixed(1) ?? 0}%)`
                },
              },
            },
          },
        },
      }))
    }

    // 라인차트 — 일별 추이
    if (lineRef.current && stats.daily_trend?.length) {
      chartsRef.current.push(new Chart(lineRef.current, {
        type: 'line',
        data: {
          labels: stats.daily_trend.map(d => pad2(d.day)),
          datasets: [{
            label: t(lang, 'budget.actual'),
            data: stats.daily_trend.map(d => toDisplay(d.total_usd)),
            borderColor: '#e8a060', backgroundColor: 'rgba(232,160,96,0.12)',
            fill: true, tension: 0.3, pointRadius: 4,
          }],
        },
        options: {
          responsive: true,
          plugins: { legend: { labels: { color: '#ccc' } } },
          scales: {
            x: { ticks: { color: '#999' }, grid: { color: 'rgba(255,255,255,0.05)' } },
            y: { ticks: { color: '#999' }, grid: { color: 'rgba(255,255,255,0.05)' } },
          },
        },
      }))
    }

    // 바차트 — 예산 vs 실지출
    const budgeted = monthly.by_category?.filter(c => c.budget_usd != null) ?? []
    if (barRef.current && budgeted.length) {
      chartsRef.current.push(new Chart(barRef.current, {
        type: 'bar',
        data: {
          labels: budgeted.map(c => c.category_name),
          datasets: [
            { label: t(lang, 'budget.budget'), data: budgeted.map(c => toDisplay(c.budget_usd || 0)), backgroundColor: 'rgba(96,180,232,0.7)' },
            { label: t(lang, 'budget.actual'), data: budgeted.map(c => toDisplay(c.total_usd  || 0)), backgroundColor: 'rgba(232,160,96,0.7)' },
          ],
        },
        options: {
          responsive: true,
          plugins: { legend: { labels: { color: '#ccc' } } },
          scales: {
            x: { ticks: { color: '#999' }, grid: { color: 'rgba(255,255,255,0.05)' } },
            y: { ticks: { color: '#999' }, grid: { color: 'rgba(255,255,255,0.05)' } },
          },
        },
      }))
    }

    return () => destroyCharts()
  }, [monthly, stats, toDisplay])

  function doExport() {
    if (!monthly?.by_category) return
    const headers = [t(lang, 'budget.category'), t(lang, 'budget.budget'), t(lang, 'budget.actual'), t(lang, 'budget.remaining'), '%']
    const rows = monthly.by_category.map(c => {
      const pct = stats?.by_category?.find(s => s.category_id === c.category_id)?.pct
      return [
        c.category_name,
        c.budget_usd != null ? fmtAmt(toDisplay(c.budget_usd), currency) : '–',
        fmtAmt(toDisplay(c.total_usd || 0), currency),
        c.remaining_usd != null ? fmtAmt(toDisplay(c.remaining_usd), currency) : '–',
        pct != null ? pct.toFixed(1) + '%' : '–',
      ]
    })
    csvDownload([headers, ...rows, [t(lang, 'budget.totalExpense'), '', fmtAmt(toDisplay(monthly.total_usd || 0), currency), '', '']], `monthly-${year}-${pad2(month)}.csv`)
  }

  const mLabels = ML[lang] || ML.en

  return (
    <section className="bp-sec">
      <div className="bp-toolbar">
        <input type="number" className="bp-year-inp" value={year} min="2020" max="2035"
          onChange={e => setYear(Number(e.target.value))} />
        <select className="bp-month-sel" value={month} onChange={e => setMonth(Number(e.target.value))}>
          {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
            <option key={m} value={m}>{mLabels[m - 1]}</option>
          ))}
        </select>
        <button className="bp-btn-sm" onClick={doExport}>📥 {t(lang, 'budget.exportCSV')}</button>
      </div>

      {loading ? <p className="bp-info">{t(lang, 'common.loading')}</p> : monthly && (
        <>
          <div className="bp-stat-box">
            <span className="bp-total-label">{t(lang, 'budget.totalExpense')}</span>
            <span className="bp-total-num">{fmtAmt(toDisplay(monthly.total_usd || 0), currency)}</span>
          </div>

          {monthly.by_category?.length > 0 && (
            <div className="bp-table-wrap">
              <table className="bp-table">
                <thead>
                  <tr>
                    <th>{t(lang, 'budget.category')}</th>
                    <th>{t(lang, 'budget.budget')}</th>
                    <th>{t(lang, 'budget.actual')}</th>
                    <th>{t(lang, 'budget.remaining')}</th>
                    <th>%</th>
                  </tr>
                </thead>
                <tbody>
                  {monthly.by_category.map((c, i) => {
                    const pct    = stats?.by_category?.find(s => s.category_id === c.category_id)?.pct
                    const isOver = c.budget_usd != null && c.total_usd > c.budget_usd
                    return (
                      <tr key={i} className={isOver ? 'over' : ''}>
                        <td><span className="bp-cat-icon">{c.category_icon}</span>{c.category_name}</td>
                        <td>{c.budget_usd != null ? fmtAmt(toDisplay(c.budget_usd), currency) : '–'}</td>
                        <td className={isOver ? 'txt-red' : ''}>{fmtAmt(toDisplay(c.total_usd || 0), currency)}</td>
                        <td className={c.remaining_usd != null ? (c.remaining_usd < 0 ? 'txt-red' : 'txt-green') : ''}>
                          {c.remaining_usd != null ? fmtAmt(toDisplay(c.remaining_usd), currency) : '–'}
                        </td>
                        <td>{pct != null ? pct.toFixed(1) + '%' : '–'}</td>
                      </tr>
                    )
                  })}
                  <tr className="bp-total-row">
                    <td><strong>{t(lang, 'budget.totalExpense')}</strong></td>
                    <td>–</td>
                    <td><strong>{fmtAmt(toDisplay(monthly.total_usd || 0), currency)}</strong></td>
                    <td>–</td>
                    <td>100%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          <div className="bp-charts">
            {stats?.by_category?.length > 0 && (
              <div className="bp-chart-box">
                <h3 className="bp-chart-title">{t(lang, 'chart.pieTitle')}</h3>
                <canvas ref={pieRef} />
              </div>
            )}
            {stats?.daily_trend?.length > 0 && (
              <div className="bp-chart-box">
                <h3 className="bp-chart-title">{t(lang, 'chart.lineTitle')}</h3>
                <canvas ref={lineRef} />
              </div>
            )}
            {monthly.by_category?.some(c => c.budget_usd != null) && (
              <div className="bp-chart-box">
                <h3 className="bp-chart-title">{t(lang, 'chart.barTitle')}</h3>
                <canvas ref={barRef} />
              </div>
            )}
          </div>
        </>
      )}
    </section>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// Tab 3 — 연별
// ══════════════════════════════════════════════════════════════════════════════
function YearlyTab({ lang, currency, toDisplay }) {
  const [year, setYear]   = useState(new Date().getFullYear())
  const [data, setData]   = useState(null)
  const [loading, setLoading] = useState(false)

  const barRef    = useRef(null)
  const chartsRef = useRef([])

  function destroyCharts() {
    chartsRef.current.forEach(c => c.destroy())
    chartsRef.current = []
  }

  const load = useCallback(() => {
    setLoading(true)
    apiGet(`/api/expense/summary/yearly?year=${year}&lang=${lang}`)
      .then(d => setData(d)).catch(() => {})
      .finally(() => setLoading(false))
  }, [year, lang])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    destroyCharts()
    if (!data?.monthly) return
    if (barRef.current) {
      const mLabels = ML[lang] || ML.en
      chartsRef.current.push(new Chart(barRef.current, {
        type: 'bar',
        data: {
          labels: mLabels,
          datasets: [
            {
              label: String(year),
              data: data.monthly.map(m => toDisplay(m.total_usd || 0)),
              backgroundColor: 'rgba(232,160,96,0.75)',
            },
            {
              label: String(year - 1),
              data: (data.prev_monthly || []).map(m => toDisplay(m.total_usd || 0)),
              backgroundColor: 'rgba(96,180,232,0.45)',
            },
          ],
        },
        options: {
          responsive: true,
          plugins: { legend: { labels: { color: '#ccc' } } },
          scales: {
            x: { ticks: { color: '#999' }, grid: { color: 'rgba(255,255,255,0.05)' } },
            y: { ticks: { color: '#999' }, grid: { color: 'rgba(255,255,255,0.05)' } },
          },
        },
      }))
    }
    return () => destroyCharts()
  }, [data, toDisplay])

  function doExport() {
    if (!data) return
    const mLabels = ML[lang] || ML.en
    const headers = [t(lang, 'budgetMonth'), String(year), String(year - 1), t(lang, 'budget.vsLastYear')]
    const rows = (data.monthly || []).map((m, i) => {
      const prev = (data.prev_monthly || [])[i]?.total_usd || 0
      const diff = (m.total_usd || 0) - prev
      return [mLabels[i], fmtAmt(toDisplay(m.total_usd || 0), currency), fmtAmt(toDisplay(prev), currency),
        (diff > 0 ? '▲ ' : diff < 0 ? '▼ ' : '') + fmtAmt(Math.abs(toDisplay(diff)), currency)]
    })
    csvDownload([headers, ...rows], `yearly-${year}.csv`)
  }

  const mLabels = ML[lang] || ML.en

  return (
    <section className="bp-sec">
      <div className="bp-toolbar">
        <input type="number" className="bp-year-inp" value={year} min="2020" max="2035"
          onChange={e => setYear(Number(e.target.value))} />
        <button className="bp-btn-sm" onClick={doExport}>📥 {t(lang, 'budget.exportCSV')}</button>
      </div>

      {loading ? <p className="bp-info">{t(lang, 'common.loading')}</p> : data && (
        <>
          <div className="bp-stat-box">
            <span className="bp-total-label">{year} {t(lang, 'budget.totalExpense')}</span>
            <span className="bp-total-num">{fmtAmt(toDisplay(data.total_usd || 0), currency)}</span>
            {data.yoy_change_pct != null && (
              <span className={`bp-yoy${data.yoy_change_pct > 0 ? ' up' : ' dn'}`}>
                {data.yoy_change_pct > 0 ? '▲' : '▼'} {Math.abs(data.yoy_change_pct)}% YoY
              </span>
            )}
          </div>

          {/* 월별 바차트 */}
          <div className="bp-chart-box bp-chart-full">
            <h3 className="bp-chart-title">{t(lang, 'chart.monthlyTitle')}</h3>
            <canvas ref={barRef} />
          </div>

          {/* 월별 테이블 */}
          <div className="bp-table-wrap" style={{ marginTop: '1.5rem' }}>
            <table className="bp-table">
              <thead>
                <tr>
                  <th>{t(lang, 'budgetMonth')}</th>
                  <th>{year}</th>
                  <th>{year - 1}</th>
                  <th>{t(lang, 'budget.vsLastYear')}</th>
                </tr>
              </thead>
              <tbody>
                {(data.monthly || []).map((m, i) => {
                  const prev = (data.prev_monthly || [])[i]?.total_usd || 0
                  const diff = (m.total_usd || 0) - prev
                  return (
                    <tr key={i}>
                      <td>{mLabels[i]}</td>
                      <td>{fmtAmt(toDisplay(m.total_usd || 0), currency)}</td>
                      <td>{fmtAmt(toDisplay(prev), currency)}</td>
                      <td className={diff > 0 ? 'txt-red' : diff < 0 ? 'txt-green' : ''}>
                        {diff !== 0 && (diff > 0 ? '▲ ' : '▼ ')}
                        {diff !== 0 ? fmtAmt(toDisplay(Math.abs(diff)), currency) : '–'}
                      </td>
                    </tr>
                  )
                })}
                <tr className="bp-total-row">
                  <td><strong>{t(lang, 'budget.totalExpense')}</strong></td>
                  <td><strong>{fmtAmt(toDisplay(data.total_usd || 0), currency)}</strong></td>
                  <td><strong>{fmtAmt(toDisplay(data.prev_year_total_usd || 0), currency)}</strong></td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* 카테고리별 연간 */}
          {data.by_category?.length > 0 && (
            <div className="bp-table-wrap" style={{ marginTop: '1.5rem' }}>
              <h3 className="bp-section-h3" style={{ padding: '0.75rem 0.9rem 0' }}>{t(lang, 'budgetCatAnnual')}</h3>
              <table className="bp-table">
                <thead>
                  <tr>
                    <th>{t(lang, 'budget.category')}</th>
                    <th>{t(lang, 'budget.actual')}</th>
                    <th>{t(lang, 'budgetCount')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.by_category.map((c, i) => (
                    <tr key={i}>
                      <td><span className="bp-cat-icon">{c.category_icon}</span>{c.category_name}</td>
                      <td>{fmtAmt(toDisplay(c.total_usd || 0), currency)}</td>
                      <td>{c.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// Tab 4 — 요약
// ══════════════════════════════════════════════════════════════════════════════
function SummaryTab({ lang, currency, toDisplay }) {
  const now = new Date()
  const [year, setYear]   = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [stats, setStats]     = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    // 최근 12개월 계산
    const months = []
    for (let i = 0; i < 12; i++) {
      let m = month - i, y = year
      while (m <= 0) { m += 12; y-- }
      months.push({ y, m })
    }
    Promise.all([
      apiGet(`/api/expense/stats?year=${year}&month=${month}&lang=${lang}`),
      ...months.map(({ y, m }) =>
        apiGet(`/api/expense/summary/monthly?year=${y}&month=${m}&lang=${lang}`)
          .catch(() => ({ total_income: 0, total_expense: 0, net: 0 }))
      ),
    ]).then(([s, ...hist]) => {
      setStats(s)
      setHistory(months.map((ym, i) => ({
        ...ym,
        total_income:  hist[i]?.total_income  ?? 0,
        total_expense: hist[i]?.total_expense ?? 0,
        net:           hist[i]?.net           ?? 0,
      })))
    }).catch(() => {}).finally(() => setLoading(false))
  }, [year, month, lang])

  useEffect(() => { load() }, [load])

  const top5     = (stats?.by_category || []).slice(0, 5)
  const overList = stats?.over_budget || []
  const mLabels  = ML[lang] || ML.en

  const totalIncome  = stats?.total_income  ?? 0
  const totalExpense = stats?.total_expense ?? 0
  const net          = stats?.net           ?? 0

  return (
    <section className="bp-sec">
      <div className="bp-toolbar">
        <input type="number" className="bp-year-inp" value={year} min="2020" max="2035"
          onChange={e => setYear(Number(e.target.value))} />
        <select className="bp-month-sel" value={month} onChange={e => setMonth(Number(e.target.value))}>
          {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
            <option key={m} value={m}>{mLabels[m - 1]}</option>
          ))}
        </select>
      </div>

      {loading ? <p className="bp-info">{t(lang, 'common.loading')}</p> : (
        <>
          {/* ── 수입 / 지출 / 순수지 요약 3카드 ── */}
          <div className="bp-summary-cards">
            <div className="bp-summary-card bp-summary-income">
              <span className="bp-summary-label">{t(lang, 'budget.totalIncome')}</span>
              <span className="bp-summary-value">{fmtAmt(toDisplay(totalIncome), currency)}</span>
            </div>
            <div className="bp-summary-card bp-summary-expense">
              <span className="bp-summary-label">{t(lang, 'budget.totalExpense')}</span>
              <span className="bp-summary-value">{fmtAmt(toDisplay(totalExpense), currency)}</span>
            </div>
            <div className={`bp-summary-card ${net >= 0 ? 'bp-summary-net-pos' : 'bp-summary-net-neg'}`}>
              <span className="bp-summary-label">{t(lang, 'budget.net')}</span>
              <span className="bp-summary-value">{fmtAmt(toDisplay(net), currency)}</span>
            </div>
          </div>

          <div className="bp-sum-grid">
            {/* TOP 5 지출 카테고리 */}
            <div className="bp-sum-card">
              <h3 className="bp-sum-card-title">{t(lang, 'budget.top5')}</h3>
              {top5.length === 0
                ? <p className="bp-empty">{t(lang, 'budget.noExpense')}</p>
                : (
                  <ol className="bp-top5">
                    {top5.map((c, i) => (
                      <li key={i} className="bp-top5-item">
                        <span className="bp-top5-rank">{i + 1}</span>
                        <span className="bp-cat-icon">{c.category_icon}</span>
                        <span className="bp-top5-name">{c.category_name}</span>
                        <span className="bp-top5-pct">{c.pct?.toFixed(1)}%</span>
                        <span className="bp-top5-amt">{fmtAmt(toDisplay(c.total_usd), currency)}</span>
                      </li>
                    ))}
                  </ol>
                )
              }
            </div>

            {/* 예산 초과 (지출만) */}
            <div className="bp-sum-card">
              <h3 className="bp-sum-card-title">{t(lang, 'budget.over')}</h3>
              {overList.length === 0
                ? <p className="bp-all-good">✅ {t(lang, 'budgetAllGood')}</p>
                : (
                  <ul className="bp-over-list">
                    {overList.map((o, i) => (
                      <li key={i} className="bp-over-item">
                        <span className="bp-over-cat">
                          <span className="bp-cat-icon">{o.category_icon}</span>{o.category_name}
                        </span>
                        <div className="bp-over-nums">
                          <span className="txt-red">+{fmtAmt(toDisplay(o.over_by_usd), currency)}</span>
                          <span className="bp-over-detail">
                            {fmtAmt(toDisplay(o.total_usd), currency)} / {fmtAmt(toDisplay(o.budget_usd), currency)}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )
              }
            </div>
          </div>

          {/* ── 최근 12개월 — 수입 / 지출 / 순수지 ── */}
          <div className="bp-table-wrap" style={{ marginTop: '1.5rem' }}>
            <h3 className="bp-section-h3" style={{ padding: '0.75rem 0.9rem 0' }}>{t(lang, 'budgetRecent12')}</h3>
            <table className="bp-table">
              <thead>
                <tr>
                  <th>{t(lang, 'budgetMonth')}</th>
                  <th style={{ color: '#4ade80' }}>{t(lang, 'budget.totalIncome')}</th>
                  <th style={{ color: '#f87171' }}>{t(lang, 'budget.totalExpense')}</th>
                  <th>{t(lang, 'budget.net')}</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h, i) => (
                  <tr key={i}>
                    <td>{h.y}-{pad2(h.m)}</td>
                    <td style={{ color: '#4ade80' }}>{fmtAmt(toDisplay(h.total_income), currency)}</td>
                    <td style={{ color: '#f87171' }}>{fmtAmt(toDisplay(h.total_expense), currency)}</td>
                    <td style={{ color: h.net >= 0 ? '#60a5fa' : '#f87171' }}>
                      {fmtAmt(toDisplay(h.net), currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// Tab 5 — 예산 설정 + 카테고리 관리
// ══════════════════════════════════════════════════════════════════════════════
function SettingTab({ lang, currency, toDisplay }) {
  const now = new Date()
  const [year, setYear]   = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [budgets, setBudgets]   = useState([])
  const [cats, setCats]         = useState([])
  const [loadingB, setLoadingB] = useState(false)
  const [editId, setEditId]     = useState(null)
  const [editForm, setEditForm] = useState({})
  const [newB, setNewB] = useState({ category_id: '', amount: '', currency: 'USD' })
  // 카테고리 관리
  const [catMode, setCatMode]   = useState('default')
  const [newParent, setNewParent] = useState({ name_ko: '', name_en: '', icon: '' })
  const [newSub, setNewSub]     = useState({ parent_id: '', name_ko: '', name_en: '' })

  const loadBudgets = useCallback(() => {
    setLoadingB(true)
    apiGet(`/api/expense/budget?year=${year}&month=${month}&lang=${lang}`)
      .then(d => setBudgets(d || [])).catch(() => setBudgets([]))
      .finally(() => setLoadingB(false))
  }, [year, month, lang])

  const loadCats = useCallback(() => {
    apiGet(`/api/expense/categories?lang=${lang}`).then(d => setCats(d || [])).catch(() => {})
  }, [lang])

  useEffect(() => { loadBudgets() }, [loadBudgets])
  useEffect(() => { loadCats() }, [loadCats])

  async function addBudget() {
    if (!newB.amount) return
    await apiReq('POST', '/api/expense/budget', {
      category_id: newB.category_id ? Number(newB.category_id) : null,
      year, month,
      amount: Number(newB.amount),
      currency: newB.currency,
    }).catch(() => {})
    setNewB(f => ({ ...f, category_id: '', amount: '' }))
    loadBudgets()
  }

  async function saveBudget() {
    await apiReq('PUT', `/api/expense/budget/${editId}`, {
      amount: Number(editForm.amount), currency: editForm.currency,
    }).catch(() => {})
    setEditId(null)
    loadBudgets()
  }

  async function delBudget(id) {
    if (!window.confirm(t(lang, 'budgetConfirmDel'))) return
    await apiReq('DELETE', `/api/expense/budget/${id}`).catch(() => {})
    loadBudgets()
  }

  async function addParentCat() {
    const ko = newParent.name_ko.trim(), en = newParent.name_en.trim()
    if (!ko && !en) return
    await apiReq('POST', '/api/expense/categories', {
      name_ko: ko || en, name_en: en || ko, icon: newParent.icon || null, parent_id: null,
    }).catch(() => {})
    setNewParent({ name_ko: '', name_en: '', icon: '' })
    loadCats()
  }

  async function addSubCat() {
    if (!newSub.parent_id) return
    const ko = newSub.name_ko.trim(), en = newSub.name_en.trim()
    if (!ko && !en) return
    await apiReq('POST', '/api/expense/categories', {
      name_ko: ko || en, name_en: en || ko, icon: null, parent_id: Number(newSub.parent_id),
    }).catch(() => {})
    setNewSub(f => ({ ...f, name_ko: '', name_en: '' }))
    loadCats()
  }

  async function delCat(id) {
    if (!window.confirm(t(lang, 'budgetConfirmDel'))) return
    await apiReq('DELETE', `/api/expense/categories/${id}`).catch(() => {})
    loadCats()
  }

  const defaultCats = cats.filter(c => c.is_default)
  const customCats  = cats.filter(c => !c.is_default)
  const mLabels = ML[lang] || ML.en

  return (
    <section className="bp-sec">
      {/* ── 예산 설정 ──────────────────────────────────────────── */}
      <h2 className="bp-section-h2">{t(lang, 'budget.setBudget')}</h2>

      <div className="bp-toolbar">
        <input type="number" className="bp-year-inp" value={year} min="2020" max="2035"
          onChange={e => setYear(Number(e.target.value))} />
        <select className="bp-month-sel" value={month} onChange={e => setMonth(Number(e.target.value))}>
          {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
            <option key={m} value={m}>{mLabels[m - 1]}</option>
          ))}
        </select>
      </div>

      {/* 예산 추가 폼 */}
      <div className="bp-form-row">
        <select className="bp-sel" value={newB.category_id}
          onChange={e => setNewB(f => ({ ...f, category_id: e.target.value }))}>
          <option value="">{t(lang, 'budgetTotalBudget')}</option>
          {cats.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
        </select>
        <input type="number" className="bp-inp" placeholder={t(lang, 'budget.amount')}
          value={newB.amount} onChange={e => setNewB(f => ({ ...f, amount: e.target.value }))} />
        <select className="bp-sel bp-sel-sm" value={newB.currency}
          onChange={e => setNewB(f => ({ ...f, currency: e.target.value }))}>
          {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <button className="bp-btn-primary" onClick={addBudget}>{t(lang, 'common.add')}</button>
      </div>

      {/* 예산 목록 */}
      {loadingB
        ? <p className="bp-info">{t(lang, 'common.loading')}</p>
        : budgets.length === 0
          ? <p className="bp-info bp-empty">{t(lang, 'budgetNoBudget')}</p>
          : (
            <div className="bp-table-wrap">
              <table className="bp-table">
                <thead>
                  <tr>
                    <th>{t(lang, 'budget.category')}</th>
                    <th>{t(lang, 'budget.budget')}</th>
                    <th>{t(lang, 'budget.actual')}</th>
                    <th>{t(lang, 'budget.remaining')}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {budgets.map(b => (
                    <tr key={b.id}>
                      {editId === b.id ? (
                        <>
                          <td>{b.category_icon} {b.category_name || t(lang, 'budgetTotalBudget')}</td>
                          <td>
                            <div style={{ display: 'flex', gap: '0.25rem' }}>
                              <input type="number" className="bp-inp-sm" value={editForm.amount}
                                onChange={e => setEditForm(f => ({ ...f, amount: e.target.value }))} />
                              <select className="bp-sel-xs" value={editForm.currency}
                                onChange={e => setEditForm(f => ({ ...f, currency: e.target.value }))}>
                                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                              </select>
                            </div>
                          </td>
                          <td>{fmtAmt(toDisplay(b.spent_usd || 0), currency)}</td>
                          <td>–</td>
                          <td>
                            <button className="bp-btn-primary" onClick={saveBudget}>{t(lang, 'budget.saveBudget')}</button>
                            <button className="bp-btn-ghost" style={{ marginLeft: '0.25rem' }} onClick={() => setEditId(null)}>{t(lang, 'common.cancel')}</button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td>{b.category_icon} {b.category_name || t(lang, 'budgetTotalBudget')}</td>
                          <td>{fmtAmt(toDisplay(b.budget_usd ?? b.amount), currency)}</td>
                          <td>{fmtAmt(toDisplay(b.spent_usd || 0), currency)}</td>
                          <td className={(b.remaining_usd ?? 0) < 0 ? 'txt-red' : 'txt-green'}>
                            {fmtAmt(toDisplay(b.remaining_usd ?? 0), currency)}
                          </td>
                          <td>
                            <button className="bp-icon-btn" onClick={() => { setEditId(b.id); setEditForm({ amount: b.amount, currency: b.currency }) }}>✏️</button>
                            <button className="bp-icon-btn del" onClick={() => delBudget(b.id)}>🗑️</button>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
      }

      {/* ── 카테고리 관리 ──────────────────────────────────────── */}
      <h2 className="bp-section-h2" style={{ marginTop: '2.5rem' }}>{t(lang, 'budgetCatMgmt')}</h2>

      <div className="bp-sub-tabs">
        <button className={`bp-sub-tab${catMode === 'default' ? ' active' : ''}`} onClick={() => setCatMode('default')}>
          {t(lang, 'budgetDefaultCats')}
        </button>
        <button className={`bp-sub-tab${catMode === 'custom' ? ' active' : ''}`} onClick={() => setCatMode('custom')}>
          {t(lang, 'budgetCustomCats')}
        </button>
      </div>

      {catMode === 'default' && (
        <div className="bp-cat-grid">
          {defaultCats.map(cat => (
            <div key={cat.id} className="bp-cat-card">
              <div className="bp-cat-head">{cat.icon} <strong>{cat.name}</strong></div>
              <div className="bp-cat-subs">
                {cat.subs?.map(s => <span key={s.id} className="bp-sub-chip">{s.name}</span>)}
              </div>
            </div>
          ))}
        </div>
      )}

      {catMode === 'custom' && (
        <>
          {/* 대분류 추가 */}
          <p className="bp-form-label">{t(lang, 'budgetAddCat')}</p>
          <div className="bp-form-row">
            <input type="text" className="bp-inp" placeholder={t(lang, 'budget.catNameKo')} value={newParent.name_ko}
              onChange={e => setNewParent(f => ({ ...f, name_ko: e.target.value }))} />
            <input type="text" className="bp-inp" placeholder={t(lang, 'budget.catNameEn')} value={newParent.name_en}
              onChange={e => setNewParent(f => ({ ...f, name_en: e.target.value }))} />
            <input type="text" className="bp-inp-icon" placeholder="🏷️" value={newParent.icon}
              onChange={e => setNewParent(f => ({ ...f, icon: e.target.value }))} />
            <button className="bp-btn-primary" onClick={addParentCat}>{t(lang, 'common.add')}</button>
          </div>

          {/* 소분류 추가 */}
          <p className="bp-form-label">{t(lang, 'budgetAddSub')}</p>
          <div className="bp-form-row">
            <select className="bp-sel" value={newSub.parent_id}
              onChange={e => setNewSub(f => ({ ...f, parent_id: e.target.value }))}>
              <option value="">{t(lang, 'expenseCatPh')}</option>
              {cats.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
            </select>
            <input type="text" className="bp-inp" placeholder={t(lang, 'budget.catNameKo')} value={newSub.name_ko}
              onChange={e => setNewSub(f => ({ ...f, name_ko: e.target.value }))} />
            <input type="text" className="bp-inp" placeholder={t(lang, 'budget.catNameEn')} value={newSub.name_en}
              onChange={e => setNewSub(f => ({ ...f, name_en: e.target.value }))} />
            <button className="bp-btn-primary" onClick={addSubCat}>{t(lang, 'common.add')}</button>
          </div>

          {/* 사용자 카테고리 목록 */}
          {customCats.length === 0
            ? <p className="bp-info bp-empty">{t(lang, 'budgetNoCustomCats')}</p>
            : (
              <div className="bp-cat-grid">
                {customCats.map(cat => (
                  <div key={cat.id} className="bp-cat-card">
                    <div className="bp-cat-head">
                      {cat.icon} <strong>{cat.name}</strong>
                      <button className="bp-icon-btn del" style={{ marginLeft: 'auto' }} onClick={() => delCat(cat.id)}>🗑️</button>
                    </div>
                    <div className="bp-cat-subs">
                      {cat.subs?.map(s => (
                        <span key={s.id} className="bp-sub-chip editable">
                          {s.name}
                          <button className="bp-sub-del" onClick={() => delCat(s.id)}>×</button>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )
          }
        </>
      )}
    </section>
  )
}
