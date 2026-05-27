import { useState, useEffect } from 'react'
import { t } from './i18n'

const W_EMOJI = {
  0: '☀️', 1: '🌤', 2: '⛅', 3: '☁️',
  45: '🌫', 48: '🌫', 51: '🌦', 53: '🌦', 55: '🌧',
  61: '🌧', 63: '🌧', 65: '🌧', 71: '🌨', 73: '🌨', 75: '❄️',
  80: '🌦', 81: '🌧', 82: '⛈', 95: '⛈', 99: '⛈',
}

const W_DESC = {
  ko: {
    0: '맑음', 1: '거의 맑음', 2: '부분 흐림', 3: '흐림',
    45: '안개', 48: '안개', 51: '이슬비', 53: '이슬비', 55: '이슬비',
    61: '비', 63: '비', 65: '폭우', 71: '눈', 73: '눈', 75: '폭설',
    80: '소나기', 81: '소나기', 82: '폭우', 95: '뇌우', 99: '뇌우',
  },
  en: {
    0: 'Clear', 1: 'Mostly Clear', 2: 'Partly Cloudy', 3: 'Overcast',
    45: 'Foggy', 48: 'Foggy', 51: 'Drizzle', 53: 'Drizzle', 55: 'Drizzle',
    61: 'Rain', 63: 'Rain', 65: 'Heavy Rain', 71: 'Snow', 73: 'Snow', 75: 'Heavy Snow',
    80: 'Showers', 81: 'Showers', 82: 'Heavy Rain', 95: 'Thunderstorm', 99: 'Thunderstorm',
  },
}

const DAYS = ['일', '월', '화', '수', '목', '금', '토']
const MON = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월']
const DAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MON_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

const DEFAULT_ZONES_KO = [
  { region: '내 위치', tz: Intl.DateTimeFormat().resolvedOptions().timeZone, label: '' },
  { region: '뉴욕', tz: 'America/New_York', label: 'EST/EDT' },
  { region: '런던', tz: 'Europe/London', label: 'GMT/BST' },
]
const DEFAULT_ZONES_EN = [
  { region: 'My Location', tz: Intl.DateTimeFormat().resolvedOptions().timeZone, label: '' },
  { region: 'New York', tz: 'America/New_York', label: 'EST/EDT' },
  { region: 'London', tz: 'Europe/London', label: 'GMT/BST' },
]

function formatTZ(tz, locale = 'ko-KR', now = new Date()) {
  try {
    const opt = { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }
    const dopt = { timeZone: tz, month: 'long', day: 'numeric', weekday: 'short' }
    return {
      time: new Intl.DateTimeFormat(locale, opt).format(now),
      date: new Intl.DateTimeFormat(locale, dopt).format(now),
    }
  } catch { return { time: '--:--', date: '' } }
}

/* ── 아날로그 시계 SVG ── */
function AnalogClock({ tz, size, now }) {
  let h = 0, m = 0, s = 0
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: false
    }).formatToParts(now)
    h = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0') % 12
    m = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0')
    s = parseInt(parts.find(p => p.type === 'second')?.value ?? '0')
  } catch {}

  const R  = size / 2 - 4
  const cx = size / 2
  const cy = size / 2
  const pt = (deg, r) => [
    cx + r * Math.sin(deg * Math.PI / 180),
    cy - r * Math.cos(deg * Math.PI / 180),
  ]

  const [sx, sy] = pt(s * 6,            R * 0.82)
  const [mx, my] = pt(m * 6 + s * 0.1,  R * 0.72)
  const [hx, hy] = pt(h * 30 + m * 0.5, R * 0.52)

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* 시계 테두리 */}
      <circle cx={cx} cy={cy} r={R} fill="none" stroke="var(--border)" strokeWidth="1.5" />
      {/* 눈금 */}
      {Array.from({ length: 12 }, (_, i) => {
        const isQ = i % 3 === 0
        const [ox, oy] = pt(i * 30, R - 1)
        const [ix, iy] = pt(i * 30, R - 1 - (isQ ? R * 0.18 : R * 0.1))
        return (
          <line key={i} x1={ix} y1={iy} x2={ox} y2={oy}
                stroke={isQ ? 'var(--ink2)' : 'var(--border)'}
                strokeWidth={isQ ? 2.5 : 1} strokeLinecap="round" />
        )
      })}
      {/* 시침 */}
      <line x1={cx} y1={cy} x2={hx} y2={hy}
            stroke="var(--ink)" strokeWidth="3.5" strokeLinecap="round" />
      {/* 분침 */}
      <line x1={cx} y1={cy} x2={mx} y2={my}
            stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" />
      {/* 초침 */}
      <line x1={cx} y1={cy} x2={sx} y2={sy}
            stroke="#e05c3a" strokeWidth="1.2" strokeLinecap="round" />
      {/* 중심 */}
      <circle cx={cx} cy={cy} r="4" fill="var(--ink)" />
      <circle cx={cx} cy={cy} r="1.8" fill="#e05c3a" />
    </svg>
  )
}

export default function HeroSection({ zones: propZones, isMobile = false, clockCount = 3, tempUnit = 'C', lang = 'ko' }) {
  const defaultZones = lang === 'en' ? DEFAULT_ZONES_EN : DEFAULT_ZONES_KO
  const zones = (propZones?.length === 3) ? propZones : defaultZones

  const [now, setNow]     = useState(new Date())
  const [weather, setWeather] = useState({ emoji: '🌤', temp: '--', code: null, status: 'init', loc: '' })

  /* 1초마다 갱신 — 아날로그·디지털 동기화 */
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  async function loadWeather() {
    setWeather(w => ({ ...w, status: 'loading', temp: '--', loc: '' }))
    try {
      const pos = await new Promise((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, { timeout: 6000 })
      )
      const { latitude: lat, longitude: lon } = pos.coords
      const [meteoRes, geoRes] = await Promise.all([
        fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weathercode&timezone=auto`),
        fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`),
      ])
      const meteo = await meteoRes.json()
      const geo   = await geoRes.json()
      const code  = meteo.current.weathercode
      const emoji = W_EMOJI[code] || '🌡'
      const loc   = geo.address.city || geo.address.town || geo.address.village || ''
      setWeather({ emoji, temp: Math.round(meteo.current.temperature_2m), code, status: 'loaded', loc })
    } catch {
      setWeather({ emoji: '🌤', temp: '--', code: null, status: 'error', loc: '' })
    }
  }

  useEffect(() => { loadWeather() }, [])

  const weatherDesc = (() => {
    if (weather.status === 'loading') return t(lang, 'weatherFetching')
    if (weather.status === 'error')   return t(lang, 'weatherNoPermission')
    if (weather.status === 'loaded' && weather.code != null) {
      return (W_DESC[lang] ?? W_DESC.ko)[weather.code] ?? ''
    }
    return t(lang, 'weatherLoading')
  })()

  const locale   = lang === 'en' ? 'en-US' : 'ko-KR'
  const z0       = formatTZ(zones[0].tz, locale, now)
  const z1       = formatTZ(zones[1].tz, locale, now)
  const z2       = formatTZ(zones[2].tz, locale, now)
  const dateStr  = lang === 'en'
    ? `${MON_EN[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()} (${DAYS_EN[now.getDay()]})`
    : `${MON[now.getMonth()]} ${now.getDate()}일 (${DAYS[now.getDay()]})`
  const dispTemp = weather.temp === '--' ? '--' : (tempUnit === 'F' ? Math.round(weather.temp * 9 / 5 + 32) : weather.temp)
  const tempLabel = `${dispTemp}°${tempUnit}`

  /* clockCount별 아날로그 시계 크기 */
  const clockSize = clockCount === 1 ? 118 : clockCount === 2 ? 90 : 74

  const mobileZones = []
  if (clockCount >= 2) mobileZones.push({ z: z1, zone: zones[1] })
  if (clockCount >= 3) mobileZones.push({ z: z2, zone: zones[2] })

  /* ── 모바일 ── */
  if (isMobile) {
    return (
      <div className="m-hero">
        <div className="m-hero-top">
          <div>
            <div className="m-big-time">{z0.time}</div>
            <div className="m-big-date">{dateStr}</div>
          </div>
          <div className="m-weather-block">
            <div className="m-w-emoji">{weather.emoji}</div>
            <div className="m-w-temp">{tempLabel}</div>
            <div className="m-w-desc">{weatherDesc}</div>
          </div>
        </div>
        {mobileZones.length > 0 && (
          <div className="m-hero-zones">
            {mobileZones.map(({ z, zone }, i) => (
              <div key={i} className="m-zone">
                <div className="m-zone-region">{zone.region}</div>
                <div className="m-zone-time">{z.time}</div>
                <div className="m-zone-name">{zone.label || ''}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  /* ── 데스크톱 ── */
  return (
    <div className="card card-hero">
      <div className={`hero-inner hero-inner--${clockCount}`}>

        {/* 지역 1 (기준) */}
        <div className="time-zone tz-primary">
          <div className="tz-region">{zones[0].region}</div>
          <div className="tz-analog">
            <AnalogClock tz={zones[0].tz} size={clockSize} now={now} />
          </div>
          <div className="tz-time">{z0.time}</div>
          <div className="tz-date">{z0.date}</div>
          <div className="tz-name">{zones[0].label || ''}</div>
        </div>

        {/* 지역 2 */}
        {clockCount >= 2 && (
          <div className="time-zone">
            <div className="tz-region">{zones[1].region}</div>
            <div className="tz-analog">
              <AnalogClock tz={zones[1].tz} size={clockSize} now={now} />
            </div>
            <div className="tz-time">{z1.time}</div>
            <div className="tz-date">{z1.date}</div>
            <div className="tz-name">{zones[1].label || ''}</div>
          </div>
        )}

        {/* 지역 3 */}
        {clockCount >= 3 && (
          <div className="time-zone">
            <div className="tz-region">{zones[2].region}</div>
            <div className="tz-analog">
              <AnalogClock tz={zones[2].tz} size={clockSize} now={now} />
            </div>
            <div className="tz-time">{z2.time}</div>
            <div className="tz-date">{z2.date}</div>
            <div className="tz-name">{zones[2].label || ''}</div>
          </div>
        )}

        {/* 날씨 */}
        <div className="hero-weather">
          <div className="w-emoji">{weather.emoji}</div>
          <div className="w-temp">{tempLabel}</div>
          <div className="w-desc">{weatherDesc}</div>
          <div className="w-loc">{weather.loc}</div>
          <button className="w-btn" onClick={loadWeather}>{t(lang, 'weatherRefresh')}</button>
        </div>

      </div>
    </div>
  )
}
