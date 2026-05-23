import { useState, useEffect } from 'react'

export default function YoutubeCard({ isMobile = false, maxCount = 10 }) {
  const [channels, setChannels] = useState([])
  const [ytAccount, setYtAccount] = useState('')

  useEffect(() => {
    fetch('/api/youtube-channels', { headers: { Authorization: 'Bearer ' + localStorage.getItem('token') } })
      .then(r => r.ok ? r.json() : [])
      .catch(() => [])
      .then(setChannels)
    try {
      const acc = JSON.parse(localStorage.getItem('yt_account') || '{}')
      setYtAccount(acc.email || '')
    } catch {}
  }, [])

  const hdr = isMobile ? 'm-card-header' : 'card-header'
  const title = isMobile ? 'm-card-title' : 'card-title'
  const body = isMobile ? 'm-card-body' : 'card-body'
  const wrapper = isMobile ? 'm-card' : 'card card-yt'

  return (
    <div className={wrapper}>
      <div className={hdr}>
        <span className="card-icon">▶</span>
        <span className={title}>즐겨 듣는 유튜브</span>
      </div>
      <div className={body}>
        {!isMobile && (
          <div className="yt-account-bar">
            <span className="yt-account-label">계정</span>
            <span className="yt-account-val">{ytAccount || '관리자에서 계정을 설정하세요'}</span>
          </div>
        )}
        {!channels.length ? (
          <ul className={isMobile ? 'm-yt-list' : 'yt-list'}>
            <li className="empty-msg">관리자에서 채널을 추가하세요</li>
          </ul>
        ) : (
          <ul className={isMobile ? 'm-yt-list' : 'yt-list'}>
            {channels.slice(0, maxCount).map(c => (
              <li key={c.id} className={isMobile ? 'm-yt-item' : 'yt-item'}>
                <a href={c.channel_url || '#'} target="_blank" rel="noreferrer">
                  <div className={isMobile ? 'm-yt-ico' : 'yt-ico'}>▶</div>
                  <div>
                    <div className={isMobile ? 'm-yt-name' : 'yt-name'}>{c.channel_name}</div>
                    {!isMobile && (
                      <div className="yt-url">{c.channel_url || ''}</div>
                    )}
                  </div>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
