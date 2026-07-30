import { useGoogleOAuth } from '../../hooks/useGoogleOAuth'
import { t } from './i18n'

const parseChannels = (res) => res.channels || []

export default function YoutubeCard({ isMobile = false, maxCount = 20, lang = 'ko' }) {
  const {
    connected,
    googleEmail,
    statusLoading,
    data,
    dataLoading,
    dataError,
    connect,
    disconnect,
    reload,
  } = useGoogleOAuth({
    connectUrl:    '/api/youtube/connect',
    statusUrl:     '/api/youtube/status',
    disconnectUrl: '/api/youtube/disconnect',
    dataUrl:       '/api/youtube/subscriptions',
    parseData:     parseChannels,
    messageKey:    'youtube_connected',
    popupName:     'yt_connect',
  })

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
            onClick={() => connect(() => alert(t(lang, 'youtubePopupBlocked')))}
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
        <div style={{
          fontSize: '0.75rem',
          color: 'var(--text-secondary)',
          marginBottom: '0.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.5rem',
        }}>
          <span>{googleEmail || t(lang, 'youtubeConnectedLabel')}</span>
          <button
            onClick={disconnect}
            style={{
              background: 'none', border: 'none', color: 'var(--text-secondary)',
              cursor: 'pointer', fontSize: '0.72rem', padding: '0 0.2rem',
              textDecoration: 'underline', flexShrink: 0,
            }}
          >
            {t(lang, 'youtubeDisconnect')}
          </button>
        </div>

        {/* 새로고침 버튼 */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.4rem' }}>
          <button
            onClick={reload}
            disabled={dataLoading}
            style={{
              fontSize: isMobile ? '0.73rem' : '0.78rem', background: 'none',
              border: 'none', color: 'var(--text-secondary)', cursor: 'pointer',
            }}
          >
            {t(lang, 'youtubeRefreshBtn')}
          </button>
        </div>

        {/* 데이터 목록 */}
        {dataLoading ? (
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            {t(lang, 'youtubeDataLoading')}
          </div>
        ) : dataError ? (
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            {t(lang, 'youtubeDataError')}{' '}
            <button
              onClick={reload}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: '0.85rem', textDecoration: 'underline' }}
            >
              {t(lang, 'youtubeRetry')}
            </button>
          </div>
        ) : data.length === 0 ? (
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            <div>{t(lang, 'youtubeNoSubscriptions')}</div>
            <div style={{ fontSize: '0.75rem', marginTop: '0.4rem', lineHeight: 1.5 }}>
              {t(lang, 'youtubePrivateNote')}
            </div>
          </div>
        ) : (
          <ul className={isMobile ? 'm-yt-list' : 'yt-list'}>
            {data.slice(0, maxCount).map(item => (
              <li key={item.channel_id} className={isMobile ? 'm-yt-item' : 'yt-item'}>
                <a href={item.url || '#'} target="_blank" rel="noreferrer">
                  {item.thumbnail ? (
                    <img
                      src={item.thumbnail}
                      alt={item.title}
                      style={{ width: isMobile ? 28 : 32, height: isMobile ? 28 : 32, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                    />
                  ) : (
                    <div className={isMobile ? 'm-yt-ico' : 'yt-ico'}>▶</div>
                  )}
                  <div>
                    <div className={isMobile ? 'm-yt-name' : 'yt-name'}>{item.title || ''}</div>
                  </div>
                </a>
              </li>
            ))}
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
