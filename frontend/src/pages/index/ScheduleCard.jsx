import { useGoogleOAuth } from '../../hooks/useGoogleOAuth'
import { t } from './i18n'
import { todayStr } from '../../utils/date'
import TodoList from './TodoList'

const parseEvents = (res) => res.events || []

export default function ScheduleCard({ isMobile = false, lang = 'ko', date }) {
  const selectedDate = date || todayStr()

  const {
    connected,
    googleEmail,
    statusLoading,
    data: events,
    dataLoading: eventsLoading,
    dataError: eventsError,
    connect: connectGCal,
    disconnect: disconnectGCal,
    reload: loadEvents,
  } = useGoogleOAuth({
    connectUrl:    '/api/calendar/connect',
    statusUrl:     '/api/calendar/status',
    disconnectUrl: '/api/calendar/disconnect',
    dataUrl:       '/api/calendar/today',
    parseData:     parseEvents,
    messageKey:    'gcal_connected',
    popupName:     'gcal_connect',
  })

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
            onClick={() => connectGCal(() => alert(t(lang, 'scheduleGcalPopupBlocked')))}
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
            <span>{googleEmail || t(lang, 'scheduleGcalConnectedLabel')}</span>
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
