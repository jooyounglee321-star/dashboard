import { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { t } from '../i18n'
import RecurringPage from './RecurringPage'
import { Chart, registerables } from 'chart.js'
import { INCOME_CATEGORIES, getSubcategories } from '../data/incomeCategories'
import { CURRENCY_CODES as CURRENCIES, CURRENCY_SYMBOLS as SYM } from '../data/currencies'
import { useToast } from '../components/Toast'
import Toast from '../components/Toast'
import { pad2, todayStr } from '../utils/date'
import SharedCalendar from '../components/SharedCalendar'
import './BudgetPage.css'

Chart.register(...registerables)
const COLORS = ['#e8a060','#60b4e8','#7ee882','#e860c8','#e8e060','#60e8d0','#e88060','#a060e8','#60e89a','#e86060']
const ML = {
  ko: ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'],
  en: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
}

// ── 이모지 피커 데이터 ────────────────────────────────────────────────────────
const EMOJI_TABS = [
  { label: '😊', name: '얼굴/감정', emojis: ['😊','😂','🥰','😍','🤩','😎','😄','😁','😆','😜','🥳','😏','🤗','😇','🥹','😭','😱','🤔','🙄','😴','🤯','😤','🙃','😋','🤪','🥺','😬','🤭','😶','😐'] },
  { label: '🍔', name: '음식/음료', emojis: ['🍕','🍔','🌮','🍜','🍣','🍱','🥗','🍰','☕','🧋','🍺','🥤','🍎','🍓','🥑','🍗','🍖','🍝','🥘','🍲','🍛','🍞','🥐','🧁','🍦','🥞','🍷','🥂','🍹','🧃'] },
  { label: '🚗', name: '교통/여행', emojis: ['🚗','🚕','🚙','🚌','🏎️','🚑','🚒','🚓','🛻','🚐','🚚','🚛','🚜','🏍️','🛵','🚲','🛴','🚁','✈️','🚀','🛸','🚢','🛥️','🚤','🚂','🚆','🚇','🚉','🛫','🛬'] },
  { label: '🏠', name: '집/생활',  emojis: ['🏠','🏡','🏢','🏥','🏦','🏨','🏪','🏫','🏬','🏗️','🛖','🏘️','🏯','🏰','⛩️','⛪','🛏️','🛁','🚿','🪑','🛋️','🪞','🚪','🪟','🔑','🗝️','🔒','🔓','🪣','🧹'] },
  { label: '💰', name: '돈/쇼핑',  emojis: ['💰','💵','💴','💶','💷','💸','💳','💹','📈','📉','💎','👛','👜','🛍️','🎁','🏷️','🛒','🪙','💼','🤑','💻','📱','⌚','👓','🕶️','💄','👔','👗','👠','👟'] },
  { label: '🎮', name: '취미/엔터', emojis: ['🎮','🎯','🎲','🎳','🎰','🃏','🎭','🎨','🖼️','🎪','🎤','🎧','🎵','🎶','🎸','🎹','🎺','🎻','🥁','🎬','📺','📻','📸','📷','🎙️','🕹️','🎠','🎡','🎢','🎑'] },
  { label: '💪', name: '건강/운동', emojis: ['💪','🏃','🚴','🏊','⚽','🏀','🏈','⚾','🎾','🏐','🥏','🎱','🏓','🏸','🥊','🥋','🤸','🏋️','🧘','🧗','🏄','🏌️','🤽','🏆','🥇','🥈','🥉','🏅','🎖️','🩺'] },
  { label: '📚', name: '교육/업무', emojis: ['📚','📖','📝','📓','📔','📒','📃','📄','📊','📋','📁','📂','🗂️','📌','📍','🖊️','✏️','📏','📐','📦','🗃️','💻','🖥️','🖨️','⌨️','🖱️','📡','🔬','🔭','🧪'] },
  { label: '🌟', name: '기타',      emojis: ['🌟','⭐','🌙','☀️','🌈','🌸','🌺','🌻','🌹','🍀','🌿','🌱','🌲','🌳','🍁','🍂','💫','✨','🔥','💧','🌊','❄️','⛄','⚡','🌍','🎃','🎄','🎆','🎇','🎐'] },
]

// ── 유틸 ─────────────────────────────────────────────────────────────────────

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
  const [showRecurring, setShowRecurring] = useState(false)

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

      <div className="bp-recurring-wrap">
        <button className="bp-recurring-btn" onClick={() => setShowRecurring(true)}>🔄 {t(lang, 'recurring.manage')}</button>
      </div>

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

      {showRecurring && (
        <div className="rp-overlay" onClick={() => setShowRecurring(false)}>
          <div className="rp-modal-full" onClick={e => e.stopPropagation()}>
            <RecurringPage onClose={() => setShowRecurring(false)} />
          </div>
        </div>
      )}
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
  const _now = new Date()
  const [date, setDate]     = useState(todayStr)
  const [items, setItems]   = useState([])
  const [cats, setCats]     = useState([])
  const [loading, setLoading] = useState(false)
  const [editId, setEditId] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [newForm, setNewForm] = useState(INIT_NEW_FORM)
  const [submitting, setSubmitting] = useState(false)
  const { toast, showToast } = useToast()

  // 달력 뷰 상태
  const [calYear, setCalYear]     = useState(_now.getFullYear())
  const [calMonth, setCalMonth]   = useState(_now.getMonth() + 1)
  const [monthData, setMonthData] = useState([])
  const [dayModalOpen, setDayModalOpen] = useState(false)

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
        const raw = d || []
        raw.sort((a, b) => {
          const ca = (a.category_name || ''); const cb = (b.category_name || '')
          if (ca !== cb) return ca.localeCompare(cb)
          return (a.subcategory_name || '').localeCompare(b.subcategory_name || '')
        })
        setItems(raw)
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

  // 월별 달력 데이터 로드
  useEffect(() => {
    apiGet(`/api/expense/daily-compare?year=${calYear}&month=${calMonth}`)
      .then(d => setMonthData(Array.isArray(d) ? d : []))
      .catch(() => setMonthData([]))
  }, [calYear, calMonth])

  // date·lang 변경 시 즉시 재조회
  useEffect(() => { load() }, [load])

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
      setEditId(null)
      load()
    } catch (err) {
      console.error('[saveEdit] 수정 실패:', err)
      showToast(t(lang, 'common.error'), 'err')
    }
  }

  async function delItem(e, id) {
    if (e && e.preventDefault) e.preventDefault()
    if (!window.confirm(t(lang, 'budgetConfirmDel'))) return
    // 즉시 클라이언트 상태에서 제거 (optimistic update)
    setItems(prev => prev.filter(it => it.id !== id))
    await apiReq('DELETE', `/api/expense/${id}`).catch(() => { load() })
    showToast(t(lang, 'common.deleteSuccess'), 'ok')
  }

  async function registerRecurring(item) {
    const day = parseInt(date.split('-')[2], 10)
    if (day < 1 || day > 31) {
      showToast(t(lang, 'recurring.dayRange'), 'err')
      return
    }
    try {
      await apiReq('POST', '/api/expense/recurring', {
        day_of_month:   day,
        type:           item.type || 'expense',
        category_id:    item.category_id ?? null,
        subcategory_id: item.subcategory_id ?? null,
        amount:         item.amount,
        currency:       item.currency ?? 'USD',
        memo:           item.description ?? null,
      })
      showToast(t(lang, 'recurring.addedFromExpense'), 'ok')
    } catch {
      showToast(t(lang, 'common.error'), 'err')
    }
  }

  function doExport() {
    const headers = [t(lang, 'budget.date'), t(lang, 'budget.category'), t(lang, 'budget.subcategory'), t(lang, 'budget.description'), t(lang, 'budget.amount'), 'Currency', '≈ USD']
    const rows = items.map(it => [it.date, it.category_name || '', it.subcategory_name || '', it.description || '', it.amount, it.currency, it.converted_amount ?? it.amount])
    csvDownload([headers, ...rows], `expenses-${calYear}-${pad2(calMonth)}.csv`)
  }

  // 달력 계산
  const daysInMonth = new Date(calYear, calMonth, 0).getDate()
  const firstDow    = new Date(calYear, calMonth - 1, 1).getDay()
  const dayMap      = {}
  monthData.forEach(d => {
    const day = parseInt(d.date.slice(8), 10)
    dayMap[day] = d
  })
  const totalMonthExpense = monthData.reduce((s, d) => s + (d.expense || 0), 0)
  const monthAvgExpense   = daysInMonth > 0 ? totalMonthExpense / daysInMonth : 0

  function openDayModal(dayStr) {
    setDate(dayStr)
    setEditId(null)
    setDayModalOpen(true)
  }

  function prevMonth() {
    if (calMonth === 1) { setCalYear(y => y - 1); setCalMonth(12) }
    else setCalMonth(m => m - 1)
  }

  function nextMonth() {
    if (calMonth === 12) { setCalYear(y => y + 1); setCalMonth(1) }
    else setCalMonth(m => m + 1)
  }

  const todayDateStr = todayStr()

  return (
    <section className="bp-sec">
      <Toast toast={toast} />

      {/* ── 달력 (SharedCalendar) ── */}
      <div style={{ maxWidth: 800, margin: '0 auto 1.5rem', padding: '0.75rem 0.75rem 1rem', background: 'var(--card)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'auto' }}>
        <SharedCalendar
          year={calYear} month={calMonth} lang={lang}
          onPrevMonth={prevMonth} onNextMonth={nextMonth}
          onDayClick={openDayModal}
          minWidth="560px"
          rightSlot={
            <button className="bp-btn-sm" onClick={doExport}>📥 {t(lang, 'budget.exportCSV')}</button>
          }
          renderCell={(dateStr, _day, _meta) => {
            const day  = parseInt(dateStr.slice(8), 10)
            const data = dayMap[day]
            if (!data) return null
            const isOver = data.expense > monthAvgExpense && monthAvgExpense > 0
            const lines = []
            if (data.expense > 0) lines.push(
              <span key="exp" style={{ fontSize: '0.7rem', fontWeight: 600, lineHeight: 1.2, color: isOver ? '#ef4444' : '#f97316', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {fmtAmt(toDisplay(data.expense), currency)}
              </span>
            )
            if (data.income > 0) lines.push(
              <span key="inc" style={{ fontSize: '0.7rem', fontWeight: 500, lineHeight: 1.2, color: '#16a34a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                +{fmtAmt(toDisplay(data.income), currency)}
              </span>
            )
            ;(data.descriptions || []).forEach((desc, di) => {
              lines.push(
                <span key={`d${di}`} style={{ fontSize: '0.62rem', color: 'var(--ink3)', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>
                  {(() => { const d = desc.replace(/\[R#\d+\]\s*/g, '').trim(); return d.length > 12 ? d.slice(0, 12) + '...' : d })()}
                </span>
              )
            })
            return (
              <>
                {lines.slice(0, 3)}
                {data.count > 0 && (
                  <span style={{ fontSize: '0.65rem', color: 'var(--ink3)', marginTop: 'auto' }}>
                    {data.count}{lang === 'ko' ? '건' : ' items'}
                  </span>
                )}
              </>
            )
          }}
        />
      </div>

      {/* ── 날짜 상세 모달 ── */}
      {dayModalOpen && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '1rem',
        }}
          onClick={e => { if (e.target === e.currentTarget) setDayModalOpen(false) }}
        >
          <div style={{
            background: 'var(--card, #fffef9)', borderRadius: '1.25rem',
            border: '1px solid var(--border)',
            width: '100%', maxWidth: '720px', maxHeight: '88vh',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            {/* 모달 헤더 */}
            <div style={{
              padding: '1rem 1.25rem 0.75rem', borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem',
              flexShrink: 0,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ fontWeight: 700, fontSize: '1.05rem' }}>{date}</span>
                {dayMap[parseInt(date.slice(8), 10)] && (
                  <span style={{ fontSize: '0.8rem', color: 'var(--ink3)' }}>
                    {dayMap[parseInt(date.slice(8), 10)].count}{lang === 'ko' ? '건' : ' items'}
                  </span>
                )}
              </div>
              <button
                onClick={() => setDayModalOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.4rem', color: 'var(--ink3)', lineHeight: 1 }}
              >×</button>
            </div>

            {/* 등록 폼 */}
            <div style={{ padding: '0.75rem 1.25rem', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
              <div className="bp-add-form" style={{ margin: 0 }}>
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
            </div>

            {/* 모달 아이템 목록 */}
            <div style={{ overflowY: 'auto', flex: 1, padding: '0.75rem 1.25rem 1.25rem' }}>
              {loading ? (
                <p className="bp-info">{t(lang, 'common.loading')}</p>
              ) : displayItems.length === 0 ? (
                <p className="bp-info bp-empty">{t(lang, 'budget.noExpense')}</p>
              ) : (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  {displayItems.map(it => (
                    <li key={it.id} style={editId === it.id ? {
                      background: 'rgba(232,160,96,0.06)',
                      border: '1px solid rgba(232,160,96,0.25)',
                      borderRadius: '0.75rem',
                      padding: '0.9rem 1rem',
                      display: 'flex', flexDirection: 'column', gap: '0.5rem',
                    } : {
                      background: 'var(--card2)',
                      border: '1px solid var(--border)',
                      borderRadius: '0.75rem',
                      padding: '0.9rem 1rem',
                      display: 'flex', flexDirection: 'column', gap: '0.5rem',
                    }}>
                      {editId === it.id ? (
                        <div className="bp-edit">
                          <div className="bp-type-toggle" style={{ marginBottom: '0.4rem' }}>
                            <button type="button"
                              className={`bp-type-btn${!isEditIncome ? ' active expense' : ''}`}
                              onClick={() => setEditForm(f => ({ ...f, type: 'expense', category_id: '', subcategory_id: '', income_main_code: '', income_sub_code: '' }))}>
                              💸 {t(lang, 'budget.expense')}
                            </button>
                            <button type="button"
                              className={`bp-type-btn${isEditIncome ? ' active income' : ''}`}
                              onClick={() => setEditForm(f => ({ ...f, type: 'income', category_id: '', subcategory_id: '', income_main_code: INCOME_CATEGORIES[0]?.code ?? '', income_sub_code: '' }))}>
                              💰 {t(lang, 'budget.income')}
                            </button>
                          </div>
                          <div className="bp-edit-row">
                            {isEditIncome ? (
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
                            <button className="bp-btn-primary" onClick={() => { saveEdit(); apiGet(`/api/expense/daily-compare?year=${calYear}&month=${calMonth}`).then(d => setMonthData(Array.isArray(d) ? d : [])).catch(() => {}) }}>{t(lang, 'common.save')}</button>
                            <button className="bp-btn-ghost" onClick={() => setEditId(null)}>{t(lang, 'common.cancel')}</button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            {(it.type || 'expense') === 'income' && (
                              <span style={{ fontSize: '0.68rem', fontWeight: 600, color: '#60c080', background: 'rgba(96,192,128,0.12)', borderRadius: '4px', padding: '0.1rem 0.4rem', display: 'inline-block', marginBottom: '0.2rem' }}>
                                💰 {t(lang, 'budget.income')}
                              </span>
                            )}
                            <div style={{ fontSize: '0.88rem', fontWeight: 500, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {it.category_icon && <span style={{ marginRight: '0.2rem' }}>{it.category_icon}</span>}
                              {it.category_name || '–'}
                              {it.subcategory_name && <span style={{ color: 'var(--ink3)', fontWeight: 400 }}> › {it.subcategory_name}</span>}
                            </div>
                            {it.description && <div style={{ fontSize: '0.78rem', color: 'var(--ink3)' }}>{it.description.replace(/\[R#\d+\]\s*/g, '').trim()}</div>}
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <div style={{ fontSize: '1rem', fontWeight: 700, color: (it.type || 'expense') === 'income' ? '#60c080' : '#e8a060' }}>
                              {(it.type || 'expense') === 'income' ? '+' : ''}{fmtAmt(it.amount, it.currency)}
                            </div>
                            {it.currency !== currency && (
                              <div style={{ fontSize: '0.72rem', color: 'var(--ink3)' }}>≈ {fmtAmt(toDisplay(it.converted_amount ?? it.amount), currency)}</div>
                            )}
                          </div>
                          <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0 }}>
                            <button className="bp-icon-btn" onClick={() => registerRecurring(it)} title={t(lang, 'recurring.addFromExpense')}>🔁</button>
                            <button className="bp-icon-btn" onClick={() => startEdit(it)} title={t(lang, 'common.edit')}>✏️</button>
                            <button type="button" className="bp-icon-btn del" onClick={ev => { delItem(ev, it.id); apiGet(`/api/expense/daily-compare?year=${calYear}&month=${calMonth}`).then(d => setMonthData(Array.isArray(d) ? d : [])).catch(() => {}) }} title={t(lang, 'common.delete')}>🗑️</button>
                          </div>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

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
  const [monthly, setMonthly]         = useState(null)
  const [stats, setStats]             = useState(null)
  const [dailyCompare, setDailyCompare] = useState(null)
  const [loading, setLoading] = useState(false)

  const [drillModal, setDrillModal]   = useState(null)  // { category_id, category_name, category_icon }
  const [drillData, setDrillData]     = useState(null)
  const [drillLoading, setDrillLoading] = useState(false)

  const pieRef      = useRef(null)
  const lineRef     = useRef(null)
  const barRef      = useRef(null)
  const groupBarRef = useRef(null)
  const chartsRef   = useRef([])

  function destroyCharts() {
    chartsRef.current.forEach(c => c.destroy())
    chartsRef.current = []
  }

  const load = useCallback(() => {
    setLoading(true)
    // 기존 차트 데이터와 daily-compare를 독립적으로 호출.
    // daily-compare 실패 시에도 기존 차트는 정상 렌더링되도록 분리.
    Promise.all([
      apiGet(`/api/expense/summary/monthly?year=${year}&month=${month}&lang=${lang}`),
      apiGet(`/api/expense/stats?year=${year}&month=${month}&lang=${lang}`),
    ]).then(([m, s]) => { setMonthly(m); setStats(s) })
      .catch(() => {})
      .finally(() => setLoading(false))

    apiGet(`/api/expense/daily-compare?year=${year}&month=${month}`)
      .then(dc => setDailyCompare(dc))
      .catch(() => setDailyCompare([]))
  }, [year, month, lang])

  useEffect(() => { load() }, [load])

  function openDrillModal(cat) {
    setDrillModal({ category_id: cat.category_id, category_name: cat.category_name, category_icon: cat.category_icon })
    setDrillData(null)
    setDrillLoading(true)
    apiGet(`/api/expense/category-detail?year=${year}&month=${month}&category_id=${cat.category_id}&lang=${lang}`)
      .then(d => setDrillData(d))
      .catch(() => setDrillData(null))
      .finally(() => setDrillLoading(false))
  }

  function closeDrillModal() {
    setDrillModal(null)
    setDrillData(null)
  }

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

    // 라인차트 — 일별 추이 (지출만)
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

    // 그룹 바차트 — 일별 수입/지출 비교
    if (groupBarRef.current && dailyCompare?.length) {
      chartsRef.current.push(new Chart(groupBarRef.current, {
        type: 'bar',
        data: {
          labels: dailyCompare.map(d => d.date.slice(8)),  // "DD" 부분만
          datasets: [
            {
              label: t(lang, 'budget.income'),
              data: dailyCompare.map(d => toDisplay(d.income)),
              backgroundColor: 'rgba(74,197,110,0.75)',
              borderColor:     'rgba(74,197,110,1)',
              borderWidth: 1,
              borderRadius: 4,
            },
            {
              label: t(lang, 'budget.expense'),
              data: dailyCompare.map(d => toDisplay(d.expense)),
              backgroundColor: 'rgba(232,160,96,0.75)',
              borderColor:     'rgba(232,160,96,1)',
              borderWidth: 1,
              borderRadius: 4,
            },
          ],
        },
        options: {
          responsive: true,
          plugins: {
            legend: {
              labels: { color: '#ccc', font: { size: 12 }, padding: 16 },
            },
            tooltip: {
              callbacks: {
                title: ctx => `${year}.${pad2(month)}.${ctx[0].label}`,
                label: ctx => ` ${ctx.dataset.label}: ${fmtAmt(ctx.raw, currency)}`,
              },
            },
          },
          scales: {
            x: {
              ticks: { color: '#999' },
              grid:  { color: 'rgba(255,255,255,0.05)' },
            },
            y: {
              beginAtZero: true,
              ticks: {
                color: '#999',
                callback: v => fmtAmt(v, currency),
              },
              grid: { color: 'rgba(255,255,255,0.05)' },
            },
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
            { label: t(lang, 'budget.budget'), data: budgeted.map(c => toDisplay(c.budget_usd || 0)), backgroundColor: 'rgba(96,180,232,0.7)', borderRadius: 4 },
            { label: t(lang, 'budget.actual'), data: budgeted.map(c => toDisplay(c.total_usd  || 0)), backgroundColor: 'rgba(232,160,96,0.7)', borderRadius: 4 },
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
  }, [monthly, stats, dailyCompare, toDisplay])

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
          {/* 수입/지출/순수지 요약 카드 */}
          <div className="bp-cashflow-row">
            <div className="bp-cashflow-card income">
              <span className="bp-cf-label">{t(lang, 'budget.totalIncome')}</span>
              <span className="bp-cf-num">{fmtAmt(toDisplay(monthly.total_income || 0), currency)}</span>
            </div>
            <div className="bp-cashflow-card expense">
              <span className="bp-cf-label">{t(lang, 'budget.totalExpense')}</span>
              <span className="bp-cf-num">{fmtAmt(toDisplay(monthly.total_usd || 0), currency)}</span>
            </div>
            <div className={`bp-cashflow-card net ${(monthly.net || 0) >= 0 ? 'positive' : 'negative'}`}>
              <span className="bp-cf-label">{t(lang, 'budget.net')}</span>
              <span className="bp-cf-num">{fmtAmt(toDisplay(monthly.net || 0), currency)}</span>
            </div>
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
                      <tr key={i}
                        className={`${isOver ? 'over' : ''} bp-row-drillable`}
                        onClick={() => openDrillModal(c)}
                        title={t(lang, 'budget.clickForDetail')}
                        style={{ cursor: 'pointer' }}
                      >
                        <td>
                          <span className="bp-cat-icon">{c.category_icon}</span>
                          {c.category_name}
                          <span style={{ marginLeft: '0.35rem', fontSize: '0.7rem', color: 'var(--ink3)', verticalAlign: 'middle' }}>▶</span>
                        </td>
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
{monthly.by_category?.some(c => c.budget_usd != null) && (
              <div className="bp-chart-box">
                <h3 className="bp-chart-title">{t(lang, 'chart.barTitle')}</h3>
                <canvas ref={barRef} />
              </div>
            )}
          </div>
        </>
      )}

      {/* ── 소분류 드릴다운 모달 ── */}
      {drillModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1100,
          background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
        }}
          onClick={e => { if (e.target === e.currentTarget) closeDrillModal() }}
        >
          <div style={{
            background: 'var(--card, #fffef9)', borderRadius: '1.25rem',
            border: '1px solid var(--border)',
            width: '100%', maxWidth: '680px', maxHeight: '88vh',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            {/* 헤더 */}
            <div style={{
              padding: '1rem 1.25rem 0.75rem',
              borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
            }}>
              <span style={{ fontWeight: 700, fontSize: '1.05rem' }}>
                {drillModal.category_icon && <span style={{ marginRight: '0.4rem' }}>{drillModal.category_icon}</span>}
                {drillModal.category_name} — {t(lang, 'budget.drilldownTitle')}
              </span>
              <button onClick={closeDrillModal}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.4rem', color: 'var(--ink3)', lineHeight: 1 }}>×</button>
            </div>

            {/* 바디 */}
            <div style={{ overflowY: 'auto', padding: '1rem 1.25rem', flex: 1 }}>
              {drillLoading ? (
                <p style={{ color: 'var(--ink3)', textAlign: 'center', padding: '2rem 0' }}>Loading…</p>
              ) : drillData ? (
                <>
                  {/* 소분류별 집계 */}
                  {drillData.by_subcategory?.length > 0 && (
                    <div style={{ marginBottom: '1.25rem' }}>
                      <h4 style={{ color: 'var(--blue)', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {t(lang, 'budget.drilldownTitle')}
                      </h4>
                      <div className="bp-table-wrap" style={{ margin: 0 }}>
                        <table className="bp-table">
                          <thead>
                            <tr>
                              <th>{t(lang, 'budget.subcategory')}</th>
                              <th style={{ textAlign: 'right' }}>{t(lang, 'budget.actual')}</th>
                              <th style={{ textAlign: 'right' }}>%</th>
                              <th style={{ textAlign: 'right' }}>{lang === 'ko' ? '건수' : 'Count'}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {drillData.by_subcategory.map((s, i) => {
                              const pct = drillData.total_usd > 0 ? (s.total_usd / drillData.total_usd * 100).toFixed(1) : '0.0'
                              return (
                                <tr key={i}>
                                  <td>
                                    {s.subcategory_icon && <span className="bp-cat-icon">{s.subcategory_icon}</span>}
                                    {s.subcategory_name || t(lang, 'budget.noSubcategory')}
                                  </td>
                                  <td style={{ textAlign: 'right' }}>{fmtAmt(toDisplay(s.total_usd), currency)}</td>
                                  <td style={{ textAlign: 'right', color: 'var(--ink3)' }}>{pct}%</td>
                                  <td style={{ textAlign: 'right', color: 'var(--ink3)' }}>{s.count}{lang === 'ko' ? t(lang, 'budget.drilldownCount') : ''}</td>
                                </tr>
                              )
                            })}
                            <tr className="bp-total-row">
                              <td><strong>{t(lang, 'budget.totalExpense')}</strong></td>
                              <td style={{ textAlign: 'right' }}><strong>{fmtAmt(toDisplay(drillData.total_usd), currency)}</strong></td>
                              <td style={{ textAlign: 'right' }}>100%</td>
                              <td style={{ textAlign: 'right' }}>{drillData.items?.length ?? 0}{lang === 'ko' ? t(lang, 'budget.drilldownCount') : ''}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* 개별 내역 */}
                  {drillData.items?.length > 0 && (
                    <div>
                      <h4 style={{ color: 'var(--blue)', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {t(lang, 'budget.drilldownItems')}
                      </h4>
                      <div className="bp-table-wrap" style={{ margin: 0 }}>
                        <table className="bp-table">
                          <thead>
                            <tr>
                              <th>{t(lang, 'budget.date')}</th>
                              <th style={{ whiteSpace: 'nowrap', width: '110px' }}>{t(lang, 'budget.subcategory')}</th>
                              <th style={{ width: '55%' }}>{t(lang, 'budget.description')}</th>
                              <th style={{ textAlign: 'right' }}>{t(lang, 'budget.actual')}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {drillData.items.map((it, i) => (
                              <tr key={i}>
                                <td style={{ whiteSpace: 'nowrap', color: 'var(--ink3)' }}>{it.date}</td>
                                <td style={{ whiteSpace: 'nowrap' }}>
                                  {it.subcategory_icon && <span className="bp-cat-icon">{it.subcategory_icon}</span>}
                                  {it.subcategory_name || <span style={{ color: 'var(--ink3)' }}>–</span>}
                                </td>
                                <td style={{ color: 'var(--ink2)' }}>{(it.description || '').replace(/\[R#\d+\]\s*/g, '').trim() || <span style={{ color: 'var(--ink3)' }}>–</span>}</td>
                                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtAmt(toDisplay(it.total_usd), currency)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {!drillData.by_subcategory?.length && !drillData.items?.length && (
                    <p style={{ color: 'var(--ink3)', textAlign: 'center', padding: '2rem 0' }}>{t(lang, 'budget.noExpense')}</p>
                  )}
                </>
              ) : (
                <p style={{ color: 'var(--ink3)', textAlign: 'center', padding: '2rem 0' }}>{t(lang, 'budget.noExpense')}</p>
              )}
            </div>
          </div>
        </div>
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

  const [yearlyDrillModal, setYearlyDrillModal]   = useState(null)
  const [yearlyDrillData, setYearlyDrillData]     = useState(null)
  const [yearlyDrillLoading, setYearlyDrillLoading] = useState(false)

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

  function openYearlyDrillModal(cat) {
    setYearlyDrillModal({ category_id: cat.category_id, category_name: cat.category_name, category_icon: cat.category_icon })
    setYearlyDrillData(null)
    setYearlyDrillLoading(true)
    apiGet(`/api/expense/category-yearly-detail?year=${year}&category_id=${cat.category_id}&lang=${lang}`)
      .then(d => setYearlyDrillData(d))
      .catch(() => setYearlyDrillData(null))
      .finally(() => setYearlyDrillLoading(false))
  }

  function closeYearlyDrillModal() {
    setYearlyDrillModal(null)
    setYearlyDrillData(null)
  }

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
              label: t(lang, 'budget.income'),
              data: data.monthly.map(m => toDisplay(m.total_income || 0)),
              backgroundColor: 'rgba(74,197,110,0.75)',
              borderColor:     'rgba(74,197,110,1)',
              borderWidth: 1,
              borderRadius: 4,
            },
            {
              label: t(lang, 'budget.expense'),
              data: data.monthly.map(m => toDisplay(m.total_expense || 0)),
              backgroundColor: 'rgba(232,160,96,0.75)',
              borderColor:     'rgba(232,160,96,1)',
              borderWidth: 1,
              borderRadius: 4,
            },
          ],
        },
        options: {
          responsive: true,
          plugins: {
            legend: {
              labels: { color: '#ccc', font: { size: 12 }, padding: 16 },
            },
            tooltip: {
              callbacks: {
                label: ctx => ` ${ctx.dataset.label}: ${fmtAmt(ctx.raw, currency)}`,
              },
            },
          },
          scales: {
            x: { ticks: { color: '#999' }, grid: { color: 'rgba(255,255,255,0.05)' } },
            y: {
              beginAtZero: true,
              ticks: { color: '#999', callback: v => fmtAmt(v, currency) },
              grid: { color: 'rgba(255,255,255,0.05)' },
            },
          },
        },
      }))
    }
    return () => destroyCharts()
  }, [data, toDisplay])

  function doExport() {
    if (!data) return
    const mLabels = ML[lang] || ML.en
    const headers = [t(lang, 'budgetMonth'), t(lang, 'budget.totalIncome'), t(lang, 'budget.totalExpense'), t(lang, 'budget.net')]
    const rows = (data.monthly || []).map((m, i) => {
      const net = m.net ?? (m.total_income || 0) - (m.total_expense || 0)
      return [
        mLabels[i],
        fmtAmt(toDisplay(m.total_income  || 0), currency),
        fmtAmt(toDisplay(m.total_expense || 0), currency),
        (net > 0 ? '+' : '') + fmtAmt(toDisplay(net), currency),
      ]
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
          {/* 수입/지출/순수지 연간 요약 카드 */}
          <div className="bp-cashflow-row">
            <div className="bp-cashflow-card income">
              <span className="bp-cf-label">{year} {t(lang, 'budget.totalIncome')}</span>
              <span className="bp-cf-num">{fmtAmt(toDisplay(data.total_income || 0), currency)}</span>
            </div>
            <div className="bp-cashflow-card expense">
              <span className="bp-cf-label">{year} {t(lang, 'budget.totalExpense')}</span>
              <span className="bp-cf-num">{fmtAmt(toDisplay(data.total_expense || 0), currency)}</span>
              {data.yoy_change_pct != null && (
                <span className={`bp-yoy${data.yoy_change_pct > 0 ? ' up' : ' dn'}`}>
                  {data.yoy_change_pct > 0 ? '▲' : '▼'} {Math.abs(data.yoy_change_pct)}% YoY
                </span>
              )}
            </div>
            <div className={`bp-cashflow-card net ${(data.net || 0) >= 0 ? 'positive' : 'negative'}`}>
              <span className="bp-cf-label">{year} {t(lang, 'budget.net')}</span>
              <span className="bp-cf-num">{fmtAmt(toDisplay(data.net || 0), currency)}</span>
            </div>
          </div>

          {/* 월별 수입/지출 비교 바차트 */}
          <div className="bp-chart-box bp-chart-full">
            <h3 className="bp-chart-title">{t(lang, 'chart.monthlyCompareTitle')}</h3>
            <canvas ref={barRef} />
          </div>

          {/* 월별 테이블 — 수입/지출/순수지 */}
          <div className="bp-table-wrap" style={{ marginTop: '1.5rem' }}>
            <table className="bp-table">
              <thead>
                <tr>
                  <th>{t(lang, 'budgetMonth')}</th>
                  <th style={{ color: '#4ac56e' }}>{t(lang, 'budget.totalIncome')}</th>
                  <th style={{ color: '#e8a060' }}>{t(lang, 'budget.totalExpense')}</th>
                  <th>{t(lang, 'budget.net')}</th>
                </tr>
              </thead>
              <tbody>
                {(data.monthly || []).map((m, i) => {
                  const net = m.net ?? (m.total_income || 0) - (m.total_expense || 0)
                  return (
                    <tr key={i}>
                      <td>{mLabels[i]}</td>
                      <td className="txt-green">{fmtAmt(toDisplay(m.total_income || 0), currency)}</td>
                      <td>{fmtAmt(toDisplay(m.total_expense || 0), currency)}</td>
                      <td className={net > 0 ? 'txt-green' : net < 0 ? 'txt-red' : ''}>
                        {net > 0 ? '+' : ''}{fmtAmt(toDisplay(net), currency)}
                      </td>
                    </tr>
                  )
                })}
                <tr className="bp-total-row">
                  <td><strong>{t(lang, 'budget.totalExpense').replace('총 ', '연간 ')}</strong></td>
                  <td className="txt-green"><strong>{fmtAmt(toDisplay(data.total_income || 0), currency)}</strong></td>
                  <td><strong>{fmtAmt(toDisplay(data.total_expense || 0), currency)}</strong></td>
                  <td className={(data.net || 0) >= 0 ? 'txt-green' : 'txt-red'}>
                    <strong>{(data.net || 0) > 0 ? '+' : ''}{fmtAmt(toDisplay(data.net || 0), currency)}</strong>
                  </td>
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
                    <tr key={i} onClick={() => openYearlyDrillModal(c)} style={{ cursor: 'pointer' }} className="bp-row-drillable" title={t(lang, 'budget.clickForDetail')}>
                      <td><span className="bp-cat-icon">{c.category_icon}</span>{c.category_name}<span style={{ marginLeft: '0.35rem', fontSize: '0.7rem', color: 'var(--ink3)', verticalAlign: 'middle' }}>▶</span></td>
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

      {/* ── 연간 소분류 드릴다운 모달 ── */}
      {yearlyDrillModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1100,
          background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
        }}
          onClick={e => { if (e.target === e.currentTarget) closeYearlyDrillModal() }}
        >
          <div style={{
            background: 'var(--card, #fffef9)', borderRadius: '1.25rem',
            border: '1px solid var(--border)',
            width: '100%', maxWidth: '680px', maxHeight: '88vh',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            {/* 헤더 */}
            <div style={{
              padding: '1rem 1.25rem 0.75rem',
              borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
            }}>
              <span style={{ fontWeight: 700, fontSize: '1.05rem' }}>
                {yearlyDrillModal.category_icon && <span style={{ marginRight: '0.4rem' }}>{yearlyDrillModal.category_icon}</span>}
                {yearlyDrillModal.category_name} — {year}년 전체
              </span>
              <button onClick={closeYearlyDrillModal}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.4rem', color: 'var(--ink3)', lineHeight: 1 }}>×</button>
            </div>

            {/* 바디 */}
            <div style={{ overflowY: 'auto', padding: '1rem 1.25rem', flex: 1 }}>
              {yearlyDrillLoading ? (
                <p style={{ color: 'var(--ink3)', textAlign: 'center', padding: '2rem 0' }}>Loading…</p>
              ) : yearlyDrillData ? (
                <>
                  {/* 소분류별 집계 */}
                  {yearlyDrillData.by_subcategory?.length > 0 && (
                    <div style={{ marginBottom: '1.25rem' }}>
                      <h4 style={{ color: 'var(--blue)', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {t(lang, 'budget.drilldownTitle')}
                      </h4>
                      <div className="bp-table-wrap" style={{ margin: 0 }}>
                        <table className="bp-table">
                          <thead>
                            <tr>
                              <th>{t(lang, 'budget.subcategory')}</th>
                              <th style={{ textAlign: 'right' }}>{t(lang, 'budget.actual')}</th>
                              <th style={{ textAlign: 'right' }}>%</th>
                              <th style={{ textAlign: 'right' }}>{lang === 'ko' ? '건수' : 'Count'}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {yearlyDrillData.by_subcategory.map((s, i) => {
                              const pct = yearlyDrillData.total_usd > 0 ? (s.total_usd / yearlyDrillData.total_usd * 100).toFixed(1) : '0.0'
                              return (
                                <tr key={i}>
                                  <td>
                                    {s.subcategory_icon && <span className="bp-cat-icon">{s.subcategory_icon}</span>}
                                    {s.subcategory_name || t(lang, 'budget.noSubcategory')}
                                  </td>
                                  <td style={{ textAlign: 'right' }}>{fmtAmt(toDisplay(s.total_usd), currency)}</td>
                                  <td style={{ textAlign: 'right', color: 'var(--ink3)' }}>{pct}%</td>
                                  <td style={{ textAlign: 'right', color: 'var(--ink3)' }}>{s.count}{lang === 'ko' ? t(lang, 'budget.drilldownCount') : ''}</td>
                                </tr>
                              )
                            })}
                            <tr className="bp-total-row">
                              <td><strong>{t(lang, 'budget.totalExpense')}</strong></td>
                              <td style={{ textAlign: 'right' }}><strong>{fmtAmt(toDisplay(yearlyDrillData.total_usd), currency)}</strong></td>
                              <td style={{ textAlign: 'right' }}>100%</td>
                              <td style={{ textAlign: 'right' }}>{yearlyDrillData.items?.length ?? 0}{lang === 'ko' ? t(lang, 'budget.drilldownCount') : ''}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* 개별 내역 */}
                  {yearlyDrillData.items?.length > 0 && (
                    <div>
                      <h4 style={{ color: 'var(--blue)', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {t(lang, 'budget.drilldownItems')}
                      </h4>
                      <div className="bp-table-wrap" style={{ margin: 0 }}>
                        <table className="bp-table">
                          <thead>
                            <tr>
                              <th>{t(lang, 'budget.date')}</th>
                              <th style={{ whiteSpace: 'nowrap', width: '110px' }}>{t(lang, 'budget.subcategory')}</th>
                              <th style={{ width: '55%' }}>{t(lang, 'budget.description')}</th>
                              <th style={{ textAlign: 'right' }}>{t(lang, 'budget.actual')}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {yearlyDrillData.items.map((it, i) => (
                              <tr key={i}>
                                <td style={{ whiteSpace: 'nowrap', color: 'var(--ink3)' }}>{it.date}</td>
                                <td style={{ whiteSpace: 'nowrap' }}>
                                  {it.subcategory_icon && <span className="bp-cat-icon">{it.subcategory_icon}</span>}
                                  {it.subcategory_name || <span style={{ color: 'var(--ink3)' }}>–</span>}
                                </td>
                                <td style={{ color: 'var(--ink2)' }}>{(it.description || '').replace(/\[R#\d+\]\s*/g, '').trim() || <span style={{ color: 'var(--ink3)' }}>–</span>}</td>
                                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtAmt(toDisplay(it.total_usd), currency)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {!yearlyDrillData.by_subcategory?.length && !yearlyDrillData.items?.length && (
                    <p style={{ color: 'var(--ink3)', textAlign: 'center', padding: '2rem 0' }}>{t(lang, 'budget.noExpense')}</p>
                  )}
                </>
              ) : (
                <p style={{ color: 'var(--ink3)', textAlign: 'center', padding: '2rem 0' }}>{t(lang, 'budget.noExpense')}</p>
              )}
            </div>
          </div>
        </div>
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
    // 최근 12개월 목록 (연도 경계 포함)
    const months = []
    for (let i = 0; i < 12; i++) {
      let m = month - i, y = year
      while (m <= 0) { m += 12; y-- }
      months.push({ y, m })
    }
    const years = [...new Set(months.map(({ y }) => y))]
    Promise.all([
      apiGet(`/api/expense/stats?year=${year}&month=${month}&lang=${lang}`),
      ...years.map(y =>
        apiGet(`/api/expense/summary/yearly?year=${y}&lang=${lang}`)
          .catch(() => ({ monthly: [] }))
      ),
    ]).then(([s, ...yearlyResults]) => {
      // yearly 응답을 { "YYYY-M": row } 맵으로 변환
      const rowMap = {}
      yearlyResults.forEach((res, idx) => {
        const y = years[idx]
        ;(res.monthly || []).forEach(row => { rowMap[`${y}-${row.month}`] = row })
      })
      setStats(s)
      setHistory(months.map(({ y, m }) => {
        const row = rowMap[`${y}-${m}`] || {}
        return { y, m, total_income: row.total_income ?? 0, total_expense: row.total_expense ?? 0, net: row.net ?? 0 }
      }))
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
// EmojiPicker — 이모지 선택 팝업 (외부 라이브러리 없음)
// ══════════════════════════════════════════════════════════════════════════════
function EmojiPicker({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const [activeTab, setActiveTab] = useState(0)
  const wrapRef = useRef(null)

  // 팝업 외부 클릭 시 닫힘
  useEffect(() => {
    if (!open) return
    function onOutsideClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onOutsideClick)
    return () => document.removeEventListener('mousedown', onOutsideClick)
  }, [open])

  return (
    <div className="ep-wrap" ref={wrapRef}>
      {/* 트리거 버튼 — 현재 이모지 표시 */}
      <button
        type="button"
        className="ep-trigger"
        onClick={() => setOpen(o => !o)}
        title="이모지 선택"
      >
        {value || '🏷️'}
      </button>

      {open && (
        <div className="ep-popup">
          {/* 카테고리 탭 */}
          <div className="ep-tabs" role="tablist">
            {EMOJI_TABS.map((tab, i) => (
              <button
                key={i}
                type="button"
                role="tab"
                className={`ep-tab${activeTab === i ? ' active' : ''}`}
                onClick={() => setActiveTab(i)}
                title={tab.name}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* 탭 이름 */}
          <div className="ep-tab-name">{EMOJI_TABS[activeTab].name}</div>

          {/* 이모지 그리드 */}
          <div className="ep-grid">
            {EMOJI_TABS[activeTab].emojis.map((em, i) => (
              <button
                key={i}
                type="button"
                className={`ep-emoji${value === em ? ' selected' : ''}`}
                onClick={() => { onChange(em); setOpen(false) }}
                title={em}
              >
                {em}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
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
  const [newSub, setNewSub]     = useState({ parent_id: '', name_ko: '', name_en: '', icon: '' })
  const { toast, showToast } = useToast()

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

  async function delBudget(e, id) {
    if (e && e.preventDefault) e.preventDefault()
    if (!window.confirm(t(lang, 'budgetConfirmDel'))) return
    setBudgets(prev => prev.filter(b => b.id !== id))
    await apiReq('DELETE', `/api/expense/budget/${id}`).catch(() => { loadBudgets() })
    showToast(t(lang, 'common.deleteSuccess'), 'ok')
  }

  async function addParentCat() {
    const ko   = newParent.name_ko.trim()
    const en   = newParent.name_en.trim()
    const icon = newParent.icon.trim() || null   // 빈 문자열·공백 → null
    if (!ko && !en) return
    await apiReq('POST', '/api/expense/categories', {
      name_ko: ko || en, name_en: en || ko, icon, parent_id: null,
    }).catch(() => {})
    setNewParent({ name_ko: '', name_en: '', icon: '' })
    loadCats()
  }

  async function addSubCat() {
    if (!newSub.parent_id) return
    const ko   = newSub.name_ko.trim()
    const en   = newSub.name_en.trim()
    const icon = newSub.icon.trim() || null      // state에서 읽도록 수정 (기존: 하드코딩 null)
    if (!ko && !en) return
    await apiReq('POST', '/api/expense/categories', {
      name_ko: ko || en, name_en: en || ko, icon, parent_id: Number(newSub.parent_id),
    }).catch(() => {})
    setNewSub(f => ({ ...f, name_ko: '', name_en: '', icon: '' }))
    loadCats()
  }

  async function delCat(e, id) {
    if (e && e.preventDefault) e.preventDefault()
    if (!window.confirm(t(lang, 'budgetConfirmDel'))) return
    setCats(prev => prev.filter(c => c.id !== id).map(c => ({
      ...c,
      subs: c.subs ? c.subs.filter(s => s.id !== id) : c.subs,
    })))
    await apiReq('DELETE', `/api/expense/categories/${id}`).catch(() => { loadCats() })
    showToast(t(lang, 'common.deleteSuccess'), 'ok')
  }

  const defaultCats = cats.filter(c => c.is_default)
  const customCats  = cats.filter(c => !c.is_default)
  const mLabels = ML[lang] || ML.en

  return (
    <section className="bp-sec">
      <Toast toast={toast} />
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
                            <button type="button" className="bp-icon-btn del" onClick={(ev) => delBudget(ev, b.id)}>🗑️</button>
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
            <EmojiPicker value={newParent.icon} onChange={em => setNewParent(f => ({ ...f, icon: em }))} />
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
            <EmojiPicker value={newSub.icon} onChange={em => setNewSub(f => ({ ...f, icon: em }))} />
            <button className="bp-btn-primary" onClick={addSubCat}>{t(lang, 'common.add')}</button>
          </div>

          {/* 사용자 카테고리 목록 */}
          {(() => {
            const [editId2, setEditId2] = React.useState(null)
            const [editName2, setEditName2] = React.useState('')
            async function saveEdit2(id) {
              await apiReq('PUT', `/api/expense/categories/${id}`, { name_ko: editName2, name_en: editName2 }).catch(() => {})
              setEditId2(null); loadCats()
            }
            const userSubCatIds = new Set(cats.flatMap(c => (c.subs||[]).filter(s=>!s.is_default).map(()=>c.id)))
            const visibleCats = [...customCats, ...cats.filter(c=>c.is_default && userSubCatIds.has(c.id))]
            if (visibleCats.length === 0)
              return <p className="bp-info bp-empty">{t(lang, 'budgetNoCustomCats')}</p>
            return (
              <div className="bp-cat-grid">
                {visibleCats.map(cat => {
                  const subsToShow = cat.is_default ? (cat.subs||[]).filter(s=>!s.is_default) : (cat.subs||[])
                  return (
                    <div key={cat.id} className="bp-cat-card">
                      <div className="bp-cat-head">
                        {cat.icon}{' '}
                        {editId2 === `c${cat.id}` && !cat.is_default
                          ? <input autoFocus style={{width:100,fontWeight:'bold',border:'none',outline:'none',background:'transparent'}}
                              value={editName2} onChange={e=>setEditName2(e.target.value)}
                              onBlur={()=>saveEdit2(cat.id)} onKeyDown={e=>e.key==='Enter'&&saveEdit2(cat.id)}/>
                          : <strong style={{cursor:cat.is_default?'default':'pointer'}}
                              onClick={()=>{if(!cat.is_default){setEditId2(`c${cat.id}`);setEditName2(cat.name)}}}>{cat.name}</strong>
                        }
                        {!cat.is_default && <button type="button" className="bp-icon-btn del" style={{marginLeft:'auto'}} onClick={(ev)=>delCat(ev,cat.id)}>🗑️</button>}
                      </div>
                      <div className="bp-cat-subs">
                        {subsToShow.map(s=>(
                          <span key={s.id} className="bp-sub-chip editable">
                            {editId2===`s${s.id}`
                              ? <input autoFocus style={{width:80,fontSize:'0.8rem',border:'none',outline:'none',background:'transparent'}}
                                  value={editName2} onChange={e=>setEditName2(e.target.value)}
                                  onBlur={()=>saveEdit2(s.id)} onKeyDown={e=>e.key==='Enter'&&saveEdit2(s.id)}/>
                              : <span style={{cursor:'pointer'}} onClick={()=>{setEditId2(`s${s.id}`);setEditName2(s.name)}}>{s.name}</span>
                            }
                            <button type="button" className="bp-sub-del" onClick={(ev)=>delCat(ev,s.id)}>×</button>
                          </span>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })()}
        </>
      )}
    </section>
  )
}
