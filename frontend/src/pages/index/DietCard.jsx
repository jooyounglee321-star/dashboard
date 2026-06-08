import { useState, useEffect } from 'react'
import { t, T } from './i18n'
import { useToast } from '../../components/Toast'
import Toast from '../../components/Toast'

const todayKey = () => new Date().toISOString().slice(0, 10)
const MORD = ['아침', '점심', '저녁', '간식']

export default function DietCard({ isMobile = false, mealConfig = null, lang = 'ko' }) {
  const visibleMeals = mealConfig ? MORD.filter(m => mealConfig[m] !== false) : MORD
  const mealLabel = key => (T[lang]?.dietMeals ?? T.ko.dietMeals)[key] ?? key

  const [dietList, setDietList] = useState([])
  const [mtime, setMtime] = useState('아침')
  const [mtext, setMtext] = useState('')
  const { toast, showToast } = useToast()

  useEffect(() => {
    if (visibleMeals.length > 0 && !visibleMeals.includes(mtime)) {
      setMtime(visibleMeals[0])
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mealConfig])

  const authHeader = () => ({ Authorization: 'Bearer ' + localStorage.getItem('token') })

  async function loadMeal() {
    const list = await fetch('/api/diets?date=' + todayKey(), { headers: authHeader() })
      .then(r => r.ok ? r.json() : [])
      .catch(() => [])
    setDietList(list)
  }

  useEffect(() => { loadMeal() }, [])

  async function addMeal() {
    if (!mtext.trim()) return
    await fetch('/api/diets', {
      method: 'POST',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: todayKey(), meal_type: mtime, content: mtext.trim() }),
    })
    setMtext('')
    await loadMeal()
  }

  async function delMeal(e, mealType) {
    if (e && e.preventDefault) e.preventDefault()
    const toDelete = dietList.filter(d => d.meal_type === mealType)
    // 즉시 클라이언트 상태에서 제거 (optimistic update)
    setDietList(prev => prev.filter(d => d.meal_type !== mealType))
    try {
      await Promise.all(toDelete.map(d => fetch('/api/diets/' + d.id, { method: 'DELETE', headers: authHeader() })))
      showToast(t(lang, 'common.deleteSuccess'), 'ok')
    } catch {
      await loadMeal()
    }
  }

  const meals = {}
  dietList.forEach(d => {
    if (!meals[d.meal_type]) meals[d.meal_type] = []
    meals[d.meal_type].push(d.content || '')
  })
  const hasMeals = visibleMeals.some(m => meals[m]?.length)

  const hdr = isMobile ? 'm-card-header' : 'card-header'
  const titleCls = isMobile ? 'm-card-title' : 'card-title'
  const body = isMobile ? 'm-card-body' : 'card-body'
  const wrapper = isMobile ? 'm-card' : 'card card-diet'

  return (
    <div className={wrapper}>
      <Toast toast={toast} />
      <div className={hdr}>
        <span className="card-icon">🥗</span>
        <span className={titleCls}>{t(lang, 'dietTitle')}</span>
      </div>
      <div className={body}>
        <div style={isMobile ? { marginBottom: '0.8rem' } : {}}>
          {!hasMeals ? (
            <div className="empty-msg">{t(lang, 'dietEmpty')}</div>
          ) : (
            visibleMeals.filter(m => meals[m]?.length).map(m => (
              <div key={m} className={isMobile ? 'm-meal-row' : 'meal-row'}>
                <span className={isMobile ? 'm-meal-label' : 'meal-label'}>{mealLabel(m)}</span>
                <div className={isMobile ? 'm-meal-content' : 'meal-content'}>{meals[m].join(', ')}</div>
                <button type="button" className="btn-del" onClick={(ev) => delMeal(ev, m)}>✕</button>
              </div>
            ))
          )}
        </div>

        {isMobile ? (
          <>
            <div className="m-row">
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
            <button className="m-btn" onClick={addMeal} style={{ width: '100%' }}>{t(lang, 'dietAddMobile')}</button>
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
            </div>
            <button className="btn-sm" onClick={addMeal}>{t(lang, 'dietAdd')}</button>
          </div>
        )}
      </div>
    </div>
  )
}
