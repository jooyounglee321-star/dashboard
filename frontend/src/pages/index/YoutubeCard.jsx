import { useState, useEffect, useCallback } from 'react'
import { t } from './i18n'

export default function YoutubeCard({ isMobile = false, maxCount = 20, lang = 'ko' }) {
  const [connected, setConnected] = useState(false)
  const [googleEmail, setGoogleEmail] = useState(null)
  const [statusLoading, setStatusLoading] = useState(true)
  const [tab, setTab] = useState('subscriptions') // 'subscriptions' | 'playlists'
  const [data, setData] = useState([])
  const [dataLoading, setDataLoading] = useState(false)
  const [dataError, setDataError] = useState(false)

  const loadData = useCallback((activeTab) => {
    const endpoint = activeTab === 'playlists'
      ? '/api/youtube/playlists'
      : '/api/youtube/subscriptions'
    setDataLoading(true)
    setDataError(false)
    fetch(endpoint, { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(res => setData(activeTab === 'playlists' ? (res.playlists || []) : (res.channels || [])))
      .catch(() => setDataError(true))
      .finally(() => setDataLoading(false))
  }, [])

  const checkStatus = useCallback(() => {
    fetch('/api/youtube/status', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(res => {
        if (res?.connected) {
          setConnected(true)
          setGoogleEmail(res.google_email || null)
          loadData('subscriptions')
        } else {
          setConnected(false)
        }
      })
      .catch(() => setConnected(false))
      .finally(() => setStatusLoading(false))
  }, [loadData])

  useEffect(() => { checkStatus() }, [checkStatus])

  // 팝업에서 YouTube 연동 완료 신호 수신
  useEffect(() => {
    const handler = (e) => {
      if (e.data === 'youtube_connected') {
        setStatusLoading(true)
        setTab('subscriptions')
        checkStatus()
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [checkStatus])

  function handleTabChange(newTab) {
    setTab(newTab)
    loadData(newTab)
  }

  function connectYouTube() {
    const popup = window.open(
      '/api/youtube/connect',
      'yt_connect',
      'width=520,height=640,scrollbars=yes,resizable=yes'
    )
    if (!popup) alert(t(lang, 'youtubePopupBlocked'))
  }

  function disconnectYouTube() {
    fetch('/api/youtube/disconnect', { method: 'DELETE', credentials: 'include' })
      .then(() => { setConnected(false); setGoogleEmail(null); setData([]) })
      .catch(() => {})
  }

  const hdr     = isMobile ? 'm-card-header' : 'card-header'
  const title   = isMobile ? 'm-card-title'  : 'card-title'
  const body    = isMobile ? 'm-card-body'   : 'card-body'
  const wrapper = isMobile ? 'm-card'        : 'card card-yt'

  const renderContent = () => {
    if (statusLoading) {
      return <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{t(lang, 'youtubeDataLoading')}</div>
    }

    if (!connected) {
      return (
        <div className="gcal-connect">
          <div className="gcal-icon" style={isMobile ? { fontSize: '1.5rem' } : {}}>▶</div>
          <div className="gcal-desc" style={isMobile ? { fontSize: '0.82rem' } : {}}>
            {t(lang, 'youtubeConnectDesc1')}<br />{t(lang, 'youtubeConnectDesc2')}
          </div>
          <button
            className="gcal-btn"
            onClick={connectYouTube}
            style={isMobile ? { fontSize: '0.82rem', padding: '0.4rem 1rem' } : {}}
          >
            {t(lang, 'youtubeConnectBtn')}
          </button>
        </div>
      )
    }

    return (
      <>
        {/* 연동 계정 + 해제 버튼 */}
        {googleEmail && (
          <div style={{
            fontSize: '0.75rem',
            color: 'var(--text-secondary)',
            marginBottom: '0.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.5rem',
          }}>
            <span>{t(lang, 'youtubeConnectedLabel')}: {googleEmail}</span>
            <button
              onClick={disconnectYouTube}
              style={{
                background: 'none', border: 'none', color: 'var(--text-secondary)',
                cursor: 'pointer', fontSize: '0.72rem', padding: '0 0.2rem',
                textDecoration: 'underline', flexShrink: 0,
              }}
            >
              {t(lang, 'youtubeDisconnect')}
            </button>
          </div>
        )}

        {/* 탭 — 구독채널 / 재생목록 */}
        {!isMobile && (
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.6rem' }}>
            {['subscriptions', 'playlists'].map(tabKey => (
              <button
                key={tabKey}
                onClick={() => handleTabChange(tabKey)}
                style={{
                  fontSize: '0.78rem',
                  padding: '0.2rem 0.7rem',
                  borderRadius: '999px',
                  border: '1px solid var(--border)',
                  background: tab === tabKey ? 'var(--accent)' : 'transparent',
                  color: tab === tabKey ? '#fff' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontWeight: tab === tabKey ? 600 : 400,
                }}
              >
                {t(lang, tabKey === 'playlists' ? 'youtubePlaylists' : 'youtubeSubscriptions')}
              </button>
            ))}
            <button
              onClick={() => loadData(tab)}
              disabled={dataLoading}
              style={{
                marginLeft: 'auto', fontSize: '0.78rem', background: 'none',
                border: 'none', color: 'var(--text-secondary)', cursor: 'pointer',
              }}
            >
              {t(lang, 'youtubeRefreshBtn')}
            </button>
          </div>
        )}

        {/* 데이터 목록 */}
        {dataLoading ? (
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            {t(lang, 'youtubeDataLoading')}
          </div>
        ) : dataError ? (
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            {t(lang, 'youtubeDataError')}{' '}
            <button
              onClick={() => loadData(tab)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: '0.85rem', textDecoration: 'underline' }}
            >
              {t(lang, 'youtubeRetry')}
            </button>
          </div>
        ) : data.length === 0 ? (
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            {t(lang, tab === 'playlists' ? 'youtubeNoPlaylists' : 'youtubeNoSubscriptions')}
          </div>
        ) : (
          <ul className={isMobile ? 'm-yt-list' : 'yt-list'}>
            {data.slice(0, maxCount).map(item => {
              const href = item.url || '#'
              const name = item.title || ''
              const thumb = item.thumbnail || ''
              const sub = tab === 'playlists' ? `${item.item_count ?? ''}곡` : ''
              return (
                <li key={item.channel_id || item.playlist_id} className={isMobile ? 'm-yt-item' : 'yt-item'}>
                  <a href={href} target="_blank" rel="noreferrer">
                    {thumb ? (
                      <img
                        src={thumb}
                        alt={name}
                        style={{ width: isMobile ? 28 : 32, height: isMobile ? 28 : 32, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                      />
                    ) : (
                      <div className={isMobile ? 'm-yt-ico' : 'yt-ico'}>▶</div>
                    )}
                    <div>
                      <div className={isMobile ? 'm-yt-name' : 'yt-name'}>{name}</div>
                      {!isMobile && sub && (
                        <div className="yt-url">{sub}</div>
                      )}
                    </div>
                  </a>
                </li>
              )
            })}
          </ul>
        )}
      </>
    )
  }

  return (
    <div className={wrapper}>
      <div className={hdr}>
        <span className="card-icon">▶</span>
        <span className={title}>{t(lang, 'youtubeTitle')}</span>
      </div>
      <div className={body}>
        {renderContent()}
      </div>
    </div>
  )
}
