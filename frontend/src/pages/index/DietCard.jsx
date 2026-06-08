import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { t, T } from './i18n'
import { useToast } from '../../components/Toast'
import Toast from '../../components/Toast'
import { Link } from 'react-router-dom'

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
  const [profileComplete, setProfileComplete] = useState(true)  // 신체정보 완성 여부
  // AI 분석 상태
  const [showAnalysis,   setShowAnalysis]   = useState(false)
  const [isAnalyzing,    setIsAnalyzing]    = useState(false)
  const [analysisResult, setAnalysisResult] = useState(null)
  const [isSavedResult,  setIsSavedResult]  = useState(false)   // 저장된 분석 결과인지 여부
  const [isSaving,       setIsSaving]       = useState(false)
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

  useEffect(() => {
    loadMeal(date)
    loadSavedAnalysis(date)
  }, [date]) // eslint-disable-line

  // 저장된 분석 자동 로드
  async function loadSavedAnalysis(d = date) {
    try {
      const res = await fetch('/api/diets/analysis?date=' + d, { headers: authHeader() })
      if (!res.ok) { setAnalysisResult(null); setIsSavedResult(false); setShowAnalysis(false); return }
      const data = await res.json()
      if (data && data.id) {
        setAnalysisResult({
          nutrition: data.nutrition_analysis || '',
          recommendations: (() => { try { return JSON.parse(data.recommendations || '[]') } catch { return [data.recommendations || ''] } })(),
          caution: data.warnings || '',
        })
        setIsSavedResult(true)
        setShowAnalysis(true)
      } else {
        setAnalysisResult(null)
        setIsSavedResult(false)
        setShowAnalysis(false)
      }
    } catch {
      setAnalysisResult(null); setIsSavedResult(false); setShowAnalysis(false)
    }
  }

  // 신체정보 미입력 여부 체크 (마운트 시 1회)
  useEffect(() => {
    fetch('/api/auth/me', { headers: authHeader() })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) return
        const complete = !!(d.birth_year && d.gender && d.height_cm && d.weight_kg)
        setProfileComplete(complete)
      })
      .catch(() => {})
  }, []) // eslint-disable-line

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

  // AI 식단 분석 (API 연동 전 더미 데이터 2초 딜레이)
  async function runAnalysis() {
    if (showAnalysis && analysisResult && !isSavedResult) { setShowAnalysis(false); return }
    setShowAnalysis(true)
    setIsAnalyzing(true)
    setAnalysisResult(null)
    setIsSavedResult(false)
    await new Promise(r => setTimeout(r, 2000))
    setAnalysisResult({
      nutrition: lang === 'en'
        ? 'Based on today\'s meals, your protein intake looks good.'
        : '오늘 식단을 분석한 결과, 단백질 섭취가 양호합니다.',
      recommendations: lang === 'en'
        ? ['Consider adding a handful of nuts as a snack', 'Try to increase vegetable intake at dinner']
        : ['견과류 간식 추가 권장', '저녁에 채소 섭취 늘리기'],
      caution: lang === 'en'
        ? 'Sodium intake is slightly high. Try to reduce soup and broth dishes.'
        : '나트륨 섭취가 다소 높습니다. 국물 음식을 줄여보세요.',
    })
    setIsAnalyzing(false)
  }

  // 분석 결과 저장
  async function saveAnalysis() {
    if (!analysisResult || isSaving) return
    setIsSaving(true)
    try {
      const body = {
        date,
        nutrition_analysis: analysisResult.nutrition,
        recommendations: JSON.stringify(Array.isArray(analysisResult.recommendations) ? analysisResult.recommendations : [analysisResult.recommendations]),
        warnings: analysisResult.caution,
        raw_meals: JSON.stringify(dietList),
      }
      const res = await fetch('/api/diets/analysis', {
        method: 'POST',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        setIsSavedResult(true)
        showToast(t(lang, 'diet.saveSuccess'), 'ok')
      }
    } catch { /* silent */ }
    setIsSaving(false)
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
        <Link
          to="/diet-stats"
          style={{
            fontSize: isMobile ? '0.6rem' : '0.65rem',
            color: 'var(--ink3)',
            marginLeft: isMobile ? '0.25rem' : '0.3rem',
            textDecoration: 'none',
          }}
        >
          {isMobile ? '↗' : t(lang, 'diet.statsLink')}
        </Link>
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

        {/* ── AI 분석 버튼 (식단 1개 이상일 때만 표시) ─────────── */}
        {hasMeals && (
          <div style={{ marginTop: '0.7rem' }}>
            <button
              type="button"
              onClick={runAnalysis}
              disabled={isAnalyzing}
              style={{
                width: '100%', padding: '0.55rem 1rem',
                fontSize: isMobile ? '0.85rem' : '0.82rem', fontWeight: 600,
                background: isAnalyzing ? '#7c3aed99' : '#7c3aed',
                color: '#fff', border: 'none', borderRadius: 9,
                cursor: isAnalyzing ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit', transition: 'background 0.15s',
                letterSpacing: '0.01em',
              }}
              onMouseEnter={e => { if (!isAnalyzing) e.currentTarget.style.background = '#6d28d9' }}
              onMouseLeave={e => { if (!isAnalyzing) e.currentTarget.style.background = '#7c3aed' }}
            >
              {isAnalyzing ? t(lang, 'diet.analyzing') : t(lang, 'diet.analyzeBtn')}
            </button>

            {/* ── 분석 결과 카드 ─────────────────────────────────── */}
            {showAnalysis && (
              <div style={{
                marginTop: '0.65rem', padding: '1rem',
                background: 'rgba(124,58,237,0.06)',
                border: '1px solid rgba(124,58,237,0.22)',
                borderRadius: 12,
              }}>
                {isAnalyzing ? (
                  /* 로딩 스피너 */
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', justifyContent: 'center', padding: '0.5rem 0' }}>
                    <span style={{
                      display: 'inline-block', width: 18, height: 18,
                      border: '2.5px solid rgba(124,58,237,0.25)',
                      borderTop: '2.5px solid #7c3aed',
                      borderRadius: '50%',
                      animation: 'diet-spin 0.7s linear infinite',
                    }} />
                    <span style={{ fontSize: '0.82rem', color: '#6d28d9', fontWeight: 500 }}>
                      {t(lang, 'diet.analyzing')}
                    </span>
                  </div>
                ) : analysisResult && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

                    {/* 저장된 결과 배지 */}
                    {isSavedResult && (
                      <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                        fontSize: '0.72rem', fontWeight: 600,
                        color: '#5b21b6', background: 'rgba(124,58,237,0.1)',
                        border: '1px solid rgba(124,58,237,0.25)',
                        borderRadius: 20, padding: '0.2rem 0.6rem', alignSelf: 'flex-start',
                      }}>
                        📋 {t(lang, 'diet.savedAnalysis')}
                      </div>
                    )}

                    {/* ① 영양 균형 분석 */}
                    <div>
                      <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#5b21b6', marginBottom: '0.35rem' }}>
                        📊 {t(lang, 'diet.nutritionAnalysis')}
                      </div>
                      <p style={{ fontSize: '0.8rem', color: 'var(--ink2)', margin: 0, lineHeight: 1.6 }}>
                        {analysisResult.nutrition}
                      </p>
                    </div>

                    {/* ② 메뉴 추천 */}
                    <div>
                      <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#5b21b6', marginBottom: '0.35rem' }}>
                        🍽️ {t(lang, 'diet.menuRecommendation')}
                      </div>
                      <ul style={{ margin: 0, paddingLeft: '1.1rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                        {(Array.isArray(analysisResult.recommendations) ? analysisResult.recommendations : [analysisResult.recommendations]).map((rec, i) => (
                          <li key={i} style={{ fontSize: '0.8rem', color: 'var(--ink2)', lineHeight: 1.5 }}>{rec}</li>
                        ))}
                      </ul>
                    </div>

                    {/* ③ 주의사항 */}
                    <div style={{
                      padding: '0.55rem 0.75rem',
                      background: 'rgba(234,179,8,0.08)',
                      border: '1px solid rgba(234,179,8,0.35)',
                      borderRadius: 8,
                    }}>
                      <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#92400e', marginBottom: '0.25rem' }}>
                        ⚠️ {t(lang, 'diet.warning')}
                      </div>
                      <p style={{ fontSize: '0.8rem', color: '#78350f', margin: 0, lineHeight: 1.5 }}>
                        {analysisResult.caution}
                      </p>
                    </div>

                    {/* ④ 분석 저장 버튼 (미저장 상태일 때만) */}
                    {!isSavedResult && (
                      <button
                        type="button"
                        onClick={saveAnalysis}
                        disabled={isSaving}
                        style={{
                          alignSelf: 'flex-end',
                          padding: '0.4rem 0.9rem',
                          fontSize: '0.78rem', fontWeight: 600,
                          background: isSaving ? '#16a34a99' : '#16a34a',
                          color: '#fff', border: 'none', borderRadius: 8,
                          cursor: isSaving ? 'not-allowed' : 'pointer',
                          fontFamily: 'inherit', transition: 'background 0.15s',
                        }}
                        onMouseEnter={e => { if (!isSaving) e.currentTarget.style.background = '#15803d' }}
                        onMouseLeave={e => { if (!isSaving) e.currentTarget.style.background = '#16a34a' }}
                      >
                        {isSaving ? t(lang, 'common.processing') : `✅ ${t(lang, 'diet.saveAnalysis')}`}
                      </button>
                    )}

                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── 입력 폼 ──────────────────────────────────────────────── */}
        {formSection}

        {/* ── 신체정보 미입력 안내 배너 ───────────────────────────── */}
        {!profileComplete && (
          <div
            onClick={() => navigate('/profile')}
            style={{
              marginTop: '0.85rem', padding: '0.65rem 0.9rem',
              background: 'rgba(59,130,246,0.07)',
              border: '1px solid rgba(59,130,246,0.25)',
              borderRadius: 9, cursor: 'pointer',
              fontSize: isMobile ? '0.78rem' : '0.74rem',
              color: '#2563eb', lineHeight: 1.5,
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(59,130,246,0.13)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(59,130,246,0.07)'}
          >
            {t(lang, 'profile.dietAIPrompt')}
          </div>
        )}

      </div>
    </div>
  )
}
