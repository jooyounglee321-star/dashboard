import { useState, useEffect } from 'react'
import { t } from './i18n'
import SitesSettingsModal from './SitesSettingsModal'

function getFavicon(url) {
  try {
    return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=64`
  } catch {
    return null
  }
}

export default function SitesCard({ isMobile = false, lang = 'ko' }) {
  const [sites, setSites]         = useState([])
  const [settingsOpen, setSettingsOpen] = useState(false)

  async function load() {
    const data = await fetch('/api/bookmarks', { headers: { Authorization: 'Bearer ' + localStorage.getItem('token') } })
      .then(r => r.ok ? r.json() : []).catch(() => [])
    setSites(data)
  }

  useEffect(() => { load() }, [])

  const hdr     = isMobile ? 'm-card-header' : 'card-header'
  const titleCls = isMobile ? 'm-card-title' : 'card-title'
  const body    = isMobile ? 'm-card-body' : 'card-body'
  const wrapper = isMobile ? 'm-card' : 'card card-sites'

  const btnStyle = {
    fontSize: '0.72rem', padding: '0.2rem 0.55rem', borderRadius: 6,
    border: '1px solid var(--border)', background: 'transparent',
    color: 'var(--ink3)', cursor: 'pointer', fontFamily: 'inherit',
  }

  return (
    <>
      <div className={wrapper}>
        <div className={hdr}>
          <span className="card-icon">🌐</span>
          <span className={titleCls}>{t(lang, 'sitesTitle')}</span>
          <button style={btnStyle} onClick={() => setSettingsOpen(true)}>사이트 설정</button>
        </div>
        <div className={body}>
          {!sites.length ? (
            <span className="empty-msg">{t(lang, 'sitesEmpty')}</span>
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

      <SitesSettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onChanged={load}
        lang={lang}
      />
    </>
  )
}
