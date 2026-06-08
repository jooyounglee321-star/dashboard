import { useState, useEffect } from 'react'
import { t, T } from './i18n'
import { useToast } from '../../components/Toast'
import Toast from '../../components/Toast'

// 로컬 날짜 (UTC 파싱 금지)
const localToday = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const todayKey = () => new Date().toISOString().slice(0, 10)  // 기존 호환용
const MORD = ['아침', '점심', '저녁', '간식']
const MEAL_EMOJI = { '아침': '🌅', '점심': '☀️', '저녁': '🌙', '간식': '🍎' }

export default function DietCard({ isMobile = false, mealConfig = null, lang = 'ko' }) {
  const visibleMeals = mealConfig ? MORD.filter(m => mealConfig[m] !== false) : MORD
  const mealLabel = key => (T[lang]?.dietMeals ?? T.ko.dietMeals)[key] ?? key

  const [dietList, setDietList] = useState([])
  const [mtime, setMtime] = useState('아침')
  const [mtext, setMtext] = useState('')
  const [mcal, setMcal]   = useState('')          // 칼로리 (선택)
  const [date, setDate]   = useState(localToday)  // 선택 날짜
  const { toast, showToast } = useToast()

  // mealConfig 변경 시 visible 끼니 동기화 (기존 로직 유지)
  useEffect(() => {
    if (visibleMeals.length > 0 && !visibleMeals.includes(mtime)) {
      setMtime(visibleMeals[0])
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mealConfig])

  const authHeader = () => ({ Authorization: 'Bearer ' + localStorage.getItem('token') })

  // 날짜 변경 시 자동 재조회
  async function loadMeal(d = date) {
    const list = await fetch('/api/diets?date=' + d, { headers: authHeader() })
      .then(r => r.ok ? r.json() : [])
      .catch(() => [])
    setDietList(list)
  }

  useEffect(() => { loadMeal(date) }, [date]) // eslint-disable-line

  async function addMeal() {
    if (!mtext.trim()) return
    await fetch('/api/diets', {
      method: 'POST',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date,
        meal_type: mtime,
        content:   mtext.trim(),
        calories:  mcal ? parseInt(mcal, 10) : null,
      }),
    })
    setMtext('')
    setMcal('')
    await loadMeal(date)
  }

  // 개별 항목 삭제 (by ID)
  async function delDietItem(e, id) {
    if (e && e.preventDefault) e.preventDefault()
    setDietList(prev => prev.filter(d => d.id !== id))
    try {
      await fetch('/api/diets/' + id, { method: 'DELETE', headers: authHeader() })
      showToast(t(lang, 'common.deleteSuccess'), 'ok')
    } catch {
      await loadMeal(date)
    }
  }

  // 기존 끼니 타입 전체 삭제 (하위 호환 유지)
  async function delMeal(e, mealType) {
    if (e && e.preventDefault) e.preventDefault()
    const toDelete = dietList.filter(d => d.meal_type === mealType)
    setDietList(prev => prev.filter(d => d.meal_type !== mealType))
    try {
      await Promise.all(toDelete.map(d => fetch('/api/diets/' + d.id, { method: 'DELETE', headers: authHeader() })))
      showToast(t(lang, 'common.deleteSuccess'), 'ok')
    } catch {
      await loadMeal(date)
    }
  }

  // 끼니별 그룹화
  const grouped = {}
  dietList.forEach(d => {
    if (!grouped[d.meal_type]) grouped[d.meal_type] = []
    grouped[d.meal_type].push(d)
  })
  const hasMeals = visibleMeals.some(m => grouped[m]?.length)

  const hdr     = isMobile ? 'm-card-header' : 'card-header'
  const titleCls = isMobile ? 'm-card-title'  : 'card-title'
  const body    = isMobile ? 'm-card-body'   : 'card-body'
  const wrapper = isMobile ? 'm-card'        : 'card card-diet'

  /* ── 공통 입력 폼 ─────────────────────────────────────────────────── */
  const formSection = isMobile ? (
    <>
      <div className="m-row" style={{ marginTop: '0.5rem' }}>
        <select className="m-select" value={mtime} onChange={e => setMtime(e.target.value)}>
          {visibleMeals.map(m => <option key={m} value={m}>{mealLabel(m)}</option>)}
        </select>
        <input
          className="m-input"
          type="text"
          value={mtext}
          onChange={e => setMtext(e.target.value)}
          placeholder={t(lang, 'dietPlaceholder')}
          style={{ flex: 1 }}
          onKeyDown={e => e.key === 'Enter' && addMeal()}
        />
      </div>
      <div className="m-row" style={{ marginTop: '0.35rem' }}>
        <input
          className="m-input"
          type="number"
          min="0"
          value={mcal}
          onChange={e => setMcal(e.target.value)}
          placeholder={t(lang, 'dietCaloriesPlaceholder')}
          style={{ flex: 1 }}
          onKeyDown={e => e.key === 'Enter' && addMeal()}
        />
      </div>
      <button className="m-btn" onClick={addMeal} style={{ width: '100%', marginTop: '0.4rem' }}>
        {t(lang, 'dietAddMobile')}
      </button>
    </>
  ) : (
    <div className="meal-form">
      <div className="meal-form-row">
        <select value={mtime} onChange={e => setMtime(e.target.value)}>
          {visibleMeals.map(m => <option key={m} value={m}>{mealLabel(m)}</option>)}
        </select>
        <input
          type="text"
          value={mtext}
          onChange={e => setMtext(e.target.value)}
          placeholder={t(lang, 'dietPlaceholder')}
          onKeyDown={e => e.key === 'Enter' && addMeal()}
        />
        <input
          className="diet-cal-inp"
          type="number"
          min="0"
          value={mcal}
          onChange={e => setMcal(e.target.value)}
          placeholder={t(lang, 'dietCaloriesPlaceholder')}
          onKeyDown={e => e.key === 'Enter' && addMeal()}
        />
      </div>
      <button className="btn-sm" onClick={addMeal}>{t(lang, 'dietAdd')}</button>
    </div>
  )

  return (
    <div className={wrapper}>
      <Toast toast={toast} />
      <div className={hdr}>
        <span className="card-icon">🥗</span>
        <span className={titleCls}>{t(lang, 'dietTitle')}</span>
      </div>
      <div className={body}>

        {/* ── 날짜 선택기 ─────────────────────────────────────────── */}
        <div className="diet-date-row">
          <input
            type="date"
            className="diet-date-inp"
            value={date}
            max={localToday()}
            onChange={e => setDate(e.target.value)}
          />
        </div>

        {/* ── 식단 목록 ────────────────────────────────────────────── */}
        <div className="diet-list-wrap">
          {!hasMeals ? (
            <div className="empty-msg">{t(lang, 'dietEmpty')}</div>
          ) : (
            visibleMeals.filter(m => grouped[m]?.length).map(m => (
              <div key={m} className="diet-group">
                <div className="diet-group-header">
                  <span className="diet-group-emoji">{MEAL_EMOJI[m] ?? '🍽️'}</span>
                  <span className="diet-group-label">{mealLabel(m)}</span>
                </div>
                {grouped[m].map(item => (
                  <div key={item.id} className="diet-item-card">
                    <div className="diet-item-info">
                      <span className="diet-item-content">{item.content}</span>
                      {item.calories != null && (
                        <span className="diet-item-cal">{item.calories} kcal</span>
                      )}
                    </div>
                    <button
                      type="button"
                      className="btn-del"
                      onClick={(ev) => delDietItem(ev, item.id)}
                    >✕</button>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>

        {/* ── 입력 폼 ──────────────────────────────────────────────── */}
        {formSection}
      </div>
    </div>
  )
}
