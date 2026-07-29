import { useState, useEffect, useCallback } from 'react'
import { t } from './i18n'
import { todayStr } from '../../utils/date'
import TodoList from './TodoList'

export default function ScheduleCard({ isMobile = false, lang = 'ko', date }) {
  const [connected, setConnected] = useState(false)
  const [googleEmail, setGoogleEmail] = useState(null)
  const [events, setEvents] = useState([])
  const [statusLoading, setStatusLoading] = useState(true)
  const [eventsLoading, setEventsLoading] = useState(false)
  const [eventsError, setEventsError] = useState(false)

  const selectedDate = date || todayStr()

  const loadEvents = useCallback(() => {
    setEventsLoading(true)
    setEventsError(false)
    fetch('/api/calendar/today', { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(data => setEvents(data.events || []))
      .catch(() => setEventsError(true))
      .finally(() => setEventsLoading(false))
  }, [])

  const checkStatus = useCallback(() => {
    fetch('/api/calendar/status', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.connected) {
          setConnected(true)
          setGoogleEmail(data.google_email || null)
          loadEvents()
        } else {
          setConnected(false)
        }
      })
      .catch(() => setConnected(false))
      .finally(() => setStatusLoading(false))
  }, [loadEvents])

  useEffect(() => {
    checkStatus()
  }, [checkStatus])

  // 팝업에서 연동 완료 신호 수신
  useEffect(() => {
    const handler = (e) => {
      if (e.data === 'gcal_connected') {
        setStatusLoading(true)
        checkStatus()
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [checkStatus])

  function connectGCal() {
    const popup = window.open(
      '/api/calendar/connect',
      'gcal_connect',
      'width=520,height=640,scrollbars=yes,resizable=yes'
    )
    if (!popup) {
      alert(t(lang, 'scheduleGcalPopupBlocked'))
    }
  }

  function disconnectGCal() {
    fetch('/api/calendar/disconnect', { method: 'DELETE', credentials: 'include' })
      .then(() => {
        setConnected(false)
        setGoogleEmail(null)
        setEvents([])
      })
      .catch(() => {})
  }

  const hdr     = isMobile ? 'm-card-header' : 'card-header'
  const title   = isMobile ? 'm-card-title'  : 'card-title'
  const body    = isMobile ? 'm-card-body'   : 'card-body'
  const wrapper = isMobile ? 'm-card'        : 'card card-schedule'

  const gcalPane = (
    <div style={{ flex: 1, minWidth: 0 }}>
      {statusLoading ? (
        <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', padding: '0.5rem 0' }}>
          {t(lang, 'scheduleEventsLoading')}
        </div>
      ) : !connected ? (
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
          <div style={{
            fontSize: '0.75rem',
            color: 'var(--text-secondary)',
            marginBottom: '0.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.5rem',
          }}>
            <span>{t(lang, 'scheduleGcalConnectedLabel')}{googleEmail ? `: ${googleEmail}` : ''}</span>
            <button
              onClick={disconnectGCal}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                fontSize: '0.72rem',
                padding: '0 0.2rem',
                textDecoration: 'underline',
                flexShrink: 0,
              }}
            >
              {t(lang, 'scheduleGcalDisconnect')}
            </button>
          </div>

          {eventsLoading ? (
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              {t(lang, 'scheduleEventsLoading')}
            </div>
          ) : eventsError ? (
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              {t(lang, 'scheduleGcalError')}{' '}
              <button
                onClick={loadEvents}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--accent)', fontSize: '0.85rem', textDecoration: 'underline',
                }}
              >
                {t(lang, 'scheduleRetry')}
              </button>
            </div>
          ) : events.length === 0 ? (
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', padding: '0.25rem 0' }}>
              {t(lang, 'scheduleNoEvents')}
            </div>
          ) : (
            <ul className={isMobile ? 'm-sched-list' : 'sched-list'}>
              {events.map((e) => (
                <li key={e.id} className={isMobile ? 'm-sched-item' : 'sched-item'}>
                  {!isMobile && <span className="sched-dot" />}
                  <span className={isMobile ? 'm-sched-time' : 'sched-time'}>
                    {e.is_all_day ? t(lang, 'scheduleAllDay') : e.time}
                  </span>
                  <span className={isMobile ? 'm-sched-text' : 'sched-text'}>{e.summary}</span>
                </li>
              ))}
            </ul>
          )}

          {!isMobile && (
            <button className="sched-refresh" onClick={loadEvents} disabled={eventsLoading}>
              {t(lang, 'scheduleRefresh')}
            </button>
          )}
        </>
      )}
    </div>
  )

  const todoPane = (
    <div style={{ flex: 1, minWidth: 0 }}>
      <TodoList date={selectedDate} lang={lang} isMobile={isMobile} />
    </div>
  )

  if (isMobile) {
    return (
      <div className={wrapper}>
        <div className={hdr}>
          <span className="card-icon">📅</span>
          <span className={title}>{t(lang, 'scheduleTitle')}</span>
        </div>
        <div className={body} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {gcalPane}
          <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: 0 }} />
          {todoPane}
        </div>
      </div>
    )
  }

  return (
    <div className={wrapper}>
      <div className={hdr}>
        <span className="card-icon">📅</span>
        <span className={title}>{t(lang, 'scheduleTitle')}</span>
      </div>
      <div className={body} style={{ display: 'flex', gap: 0, minHeight: 0 }}>
        {gcalPane}
        <div style={{ width: 1, background: 'var(--border)', margin: '0 1rem', flexShrink: 0 }} />
        {todoPane}
      </div>
    </div>
  )
}
