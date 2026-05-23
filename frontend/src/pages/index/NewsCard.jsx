import { useState, useEffect } from 'react'

const NEWS = {
  kr: [
    { t: '네이버 뉴스', u: 'https://news.naver.com', s: '네이버' },
    { t: '다음 뉴스', u: 'https://news.daum.net', s: '다음' },
    { t: '연합뉴스', u: 'https://www.yna.co.kr', s: '연합뉴스' },
    { t: 'MBC 뉴스', u: 'https://imnews.imbc.com', s: 'MBC' },
    { t: '조선일보', u: 'https://www.chosun.com', s: '조선일보' },
    { t: '한겨레', u: 'https://www.hani.co.kr', s: '한겨레' },
  ],
  us: [
    { t: 'BBC News', u: 'https://www.bbc.com/news', s: 'BBC' },
    { t: 'Reuters', u: 'https://www.reuters.com', s: 'Reuters' },
    { t: 'CNN', u: 'https://www.cnn.com', s: 'CNN' },
    { t: 'New York Times', u: 'https://www.nytimes.com', s: 'NYT' },
    { t: 'AP News', u: 'https://apnews.com', s: 'AP' },
    { t: 'Bloomberg', u: 'https://www.bloomberg.com', s: 'Bloomberg' },
  ],
}

export default function NewsCard({ isMobile = false, defaultTab = 'kr' }) {
  const [tab, setTab] = useState(defaultTab)

  useEffect(() => { setTab(defaultTab) }, [defaultTab])

  const hdr = isMobile ? 'm-card-header' : 'card-header'
  const title = isMobile ? 'm-card-title' : 'card-title'
  const body = isMobile ? 'm-card-body' : 'card-body'
  const wrapper = isMobile ? 'm-card' : 'card card-news'

  return (
    <div className={wrapper}>
      <div className={hdr}>
        <span className="card-icon">📰</span>
        <span className={title}>오늘의 뉴스</span>
      </div>
      <div className={body}>
        <div className={isMobile ? 'm-news-tabs' : 'news-tabs'}>
          {['kr', 'us'].map(k => (
            <button
              key={k}
              className={`${isMobile ? 'm-news-tab' : 'news-tab'}${tab === k ? ' active' : ''}`}
              onClick={() => setTab(k)}
            >
              {k === 'kr' ? '🇰🇷 한국' : '🇺🇸 미국'}
            </button>
          ))}
        </div>
        <ul className={isMobile ? 'm-news-list' : 'news-list'}>
          {NEWS[tab].map((n, i) => (
            <li key={i} className={isMobile ? 'm-news-item' : 'news-item'}>
              <a href={n.u} target="_blank" rel="noreferrer">
                {n.t}
                <span className={isMobile ? 'm-news-source' : 'news-source'}>{n.s}</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
