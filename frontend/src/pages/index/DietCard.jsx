import { useState, useEffect } from 'react'

const todayKey = () => new Date().toISOString().slice(0, 10)
const MORD = ['아침', '점심', '저녁', '간식']

export default function DietCard({ isMobile = false }) {
  const [dietList, setDietList] = useState([])
  const [mtime, setMtime] = useState('아침')
  const [mtext, setMtext] = useState('')

  async function loadMeal() {
    const list = await fetch('/api/diets?date=' + todayKey())
      .then(r => r.ok ? r.json() : [])
      .catch(() => [])
    setDietList(list)
  }

  useEffect(() => { loadMeal() }, [])

  async function addMeal() {
    if (!mtext.trim()) return
    await fetch('/api/diets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: todayKey(), meal_type: mtime, content: mtext.trim() }),
    })
    setMtext('')
    await loadMeal()
  }

  async function delMeal(mealType) {
    const toDelete = dietList.filter(d => d.meal_type === mealType)
    await Promise.all(toDelete.map(d => fetch('/api/diets/' + d.id, { method: 'DELETE' })))
    await loadMeal()
  }

  const meals = {}
  dietList.forEach(d => {
    if (!meals[d.meal_type]) meals[d.meal_type] = []
    meals[d.meal_type].push(d.content || '')
  })
  const hasMeals = MORD.some(m => meals[m]?.length)

  const hdr = isMobile ? 'm-card-header' : 'card-header'
  const titleCls = isMobile ? 'm-card-title' : 'card-title'
  const body = isMobile ? 'm-card-body' : 'card-body'
  const wrapper = isMobile ? 'm-card' : 'card card-diet'

  return (
    <div className={wrapper}>
      <div className={hdr}>
        <span className="card-icon">🥗</span>
        <span className={titleCls}>오늘의 식단</span>
      </div>
      <div className={body}>
        <div style={isMobile ? { marginBottom: '0.8rem' } : {}}>
          {!hasMeals ? (
            <div className="empty-msg">식단을 입력해보세요</div>
          ) : (
            MORD.filter(m => meals[m]?.length).map(m => (
              <div key={m} className={isMobile ? 'm-meal-row' : 'meal-row'}>
                <span className={isMobile ? 'm-meal-label' : 'meal-label'}>{m}</span>
                <div className={isMobile ? 'm-meal-content' : 'meal-content'}>{meals[m].join(', ')}</div>
                <button className="btn-del" onClick={() => delMeal(m)}>✕</button>
              </div>
            ))
          )}
        </div>

        {isMobile ? (
          <>
            <div className="m-row">
              <select className="m-select" value={mtime} onChange={e => setMtime(e.target.value)}>
                {MORD.map(m => <option key={m}>{m}</option>)}
              </select>
              <input
                className="m-input"
                type="text"
                value={mtext}
                onChange={e => setMtext(e.target.value)}
                placeholder="예: 현미밥, 된장국"
                style={{ flex: 1 }}
                onKeyDown={e => e.key === 'Enter' && addMeal()}
              />
            </div>
            <button className="m-btn" onClick={addMeal} style={{ width: '100%' }}>식단 추가</button>
          </>
        ) : (
          <div className="meal-form">
            <div className="meal-form-row">
              <select value={mtime} onChange={e => setMtime(e.target.value)}>
                {MORD.map(m => <option key={m}>{m}</option>)}
              </select>
              <input
                type="text"
                value={mtext}
                onChange={e => setMtext(e.target.value)}
                placeholder="예: 현미밥, 된장국"
                onKeyDown={e => e.key === 'Enter' && addMeal()}
              />
            </div>
            <button className="btn-sm" onClick={addMeal}>추가</button>
          </div>
        )}
      </div>
    </div>
  )
}
