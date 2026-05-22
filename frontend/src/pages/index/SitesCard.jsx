import { useState, useEffect } from 'react'

function getFavicon(url) {
  try {
    return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=64`
  } catch {
    return null
  }
}

export default function SitesCard({ isMobile = false }) {
  const [sites, setSites] = useState([])

  useEffect(() => {
    fetch('/api/bookmarks', { headers: { Authorization: 'Bearer ' + localStorage.getItem('token') } })
      .then(r => r.ok ? r.json() : [])
      .catch(() => [])
      .then(setSites)
  }, [])

  const hdr = isMobile ? 'm-card-header' : 'card-header'
  const title = isMobile ? 'm-card-title' : 'card-title'
  const body = isMobile ? 'm-card-body' : 'card-body'
  const wrapper = isMobile ? 'm-card' : 'card card-sites'

  return (
    <div className={wrapper}>
      <div className={hdr}>
        <span className="card-icon">🌐</span>
        <span className={title}>단골 사이트</span>
      </div>
      <div className={body}>
        {!sites.length ? (
          <span className="empty-msg">관리자에서 사이트를 추가하세요</span>
        ) : (
          <div className={isMobile ? 'm-sites-grid' : 'sites-grid'}>
            {sites.map(s => {
              const fav = getFavicon(s.url)
              return (
                <a
                  key={s.id}
                  className={isMobile ? 'm-site-item' : 'site-item'}
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {fav && (
                    <img
                      src={fav}
                      width={22}
                      height={22}
                      style={{ borderRadius: 4 }}
                      onError={e => { e.target.style.display = 'none' }}
                      alt=""
                    />
                  )}
                  <span>{s.title}</span>
                </a>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
