import { useState } from 'react'
import { t } from './i18n'

export default function ScheduleCard({ isMobile = false, lang = 'ko' }) {
  const [connected] = useState(() => {
    try { return JSON.parse(localStorage.getItem('gcal_connected')) } catch { return false }
  })

  function connectGCal() {
    alert('⚙️ Google Calendar 연동은 Spring Boot 백엔드 구성 후 사용 가능합니다.\n\n관리자 페이지에서 Google OAuth 설정을 완료해 주세요.')
  }

  const sampleEvents = [
    { time: '09:00', text: '팀 미팅' },
    { time: '12:30', text: '점심 약속' },
    { time: '15:00', text: '병원 예약' },
  ]

  const hdr = isMobile ? 'm-card-header' : 'card-header'
  const title = isMobile ? 'm-card-title' : 'card-title'
  const body = isMobile ? 'm-card-body' : 'card-body'
  const wrapper = isMobile ? 'm-card' : 'card card-schedule'

  return (
    <div className={wrapper}>
      <div className={hdr}>
        <span className="card-icon">📅</span>
        <span className={title}>{t(lang, 'scheduleTitle')}</span>
      </div>
      <div className={body}>
        {!connected ? (
          <div className="gcal-connect">
            <div className="gcal-icon" style={isMobile ? { fontSize: '1.5rem' } : {}}>📆</div>
            <div className="gcal-desc" style={isMobile ? { fontSize: '0.82rem' } : {}}>
              {t(lang, 'scheduleGcalLine1')}<br />{t(lang, 'scheduleGcalLine2')}
            </div>
            <button
              className="gcal-btn"
              onClick={connectGCal}
              style={isMobile ? { fontSize: '0.82rem', padding: '0.4rem 1rem' } : {}}
            >
              {t(lang, 'scheduleGcalBtn')}
            </button>
          </div>
        ) : (
          <>
            <ul className={isMobile ? 'm-sched-list' : 'sched-list'}>
              {sampleEvents.map((e, i) => (
                <li key={i} className={isMobile ? 'm-sched-item' : 'sched-item'}>
                  {!isMobile && <span className="sched-dot" />}
                  <span className={isMobile ? 'm-sched-time' : 'sched-time'}>{e.time}</span>
                  <span className={isMobile ? 'm-sched-text' : 'sched-text'}>{e.text}</span>
                </li>
              ))}
            </ul>
            {!isMobile && (
              <button className="sched-refresh">{t(lang, 'scheduleRefresh')}</button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
