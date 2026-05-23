import { useState, useEffect } from 'react'

const WC = {
  0: '☀️ 맑음', 1: '🌤 거의 맑음', 2: '⛅ 부분 흐림', 3: '☁️ 흐림',
  45: '🌫 안개', 48: '🌫 안개', 51: '🌦 이슬비', 53: '🌦 이슬비', 55: '🌧 이슬비',
  61: '🌧 비', 63: '🌧 비', 65: '🌧 폭우', 71: '🌨 눈', 73: '🌨 눈', 75: '❄️ 폭설',
  80: '🌦 소나기', 81: '🌧 소나기', 82: '⛈ 폭우', 95: '⛈ 뇌우', 99: '⛈ 뇌우',
}

const DAYS = ['일', '월', '화', '수', '목', '금', '토']
const MON = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월']
const DAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MON_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

const DEFAULT_ZONES = [
  { region: '내 위치', tz: Intl.DateTimeFormat().resolvedOptions().timeZone, label: '' },
  { region: '뉴욕', tz: 'America/New_York', label: 'EST/EDT' },
  { region: '런던', tz: 'Europe/London', label: 'GMT/BST' },
]

function formatTZ(tz, locale = 'ko-KR') {
  try {
    const n = new Date()
    const opt = { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }
    const dopt = { timeZone: tz, month: 'long', day: 'numeric', weekday: 'short' }
    return {
      time: new Intl.DateTimeFormat(locale, opt).format(n),
      date: new Intl.DateTimeFormat(locale, dopt).format(n),
    }
  } catch { return { time: '--:--', date: '' } }
}

export default function HeroSection({ zones: propZones, isMobile = false, clockCount = 3, tempUnit = 'C', lang = 'ko' }) {
  const zones = (propZones?.length === 3) ? propZones : DEFAULT_ZONES

  const [tick, setTick] = useState(0)
  const [weather, setWeather] = useState({ emoji: '🌤', temp: '--', desc: '날씨 확인 중', loc: '' })

  // Clock ticking (managed in parent via setInterval, but we also need a local trigger)
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 10000)
    return () => clearInterval(id)
  }, [])

  async function loadWeather() {
    setWeather({ emoji: '🌤', temp: '--', desc: '불러오는 중...', loc: '' })
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
      const geo = await geoRes.json()
      const info = WC[meteo.current.weathercode] || '🌡 알 수 없음'
      const spaceIdx = info.indexOf(' ')
      const emoji = info.slice(0, spaceIdx)
      const desc = info.slice(spaceIdx + 1)
      const loc = geo.address.city || geo.address.town || geo.address.village || '내 위치'
      setWeather({ emoji, temp: Math.round(meteo.current.temperature_2m), desc, loc })
    } catch {
      setWeather({ emoji: '🌤', temp: '--', desc: '위치 권한을 허용해 주세요', loc: '' })
    }
  }

  useEffect(() => { loadWeather() }, [])

  const locale = lang === 'en' ? 'en-US' : 'ko-KR'
  const z0 = formatTZ(zones[0].tz, locale)
  const z1 = formatTZ(zones[1].tz, locale)
  const z2 = formatTZ(zones[2].tz, locale)
  const now = new Date()
  const dateStr = lang === 'en'
    ? `${MON_EN[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()} (${DAYS_EN[now.getDay()]})`
    : `${MON[now.getMonth()]} ${now.getDate()}일 (${DAYS[now.getDay()]})`
  const dispTemp = weather.temp === '--' ? '--' : (tempUnit === 'F' ? Math.round(weather.temp * 9 / 5 + 32) : weather.temp)
  const tempLabel = `${dispTemp}°${tempUnit}`
  const mobileZones = []
  if (clockCount >= 2) mobileZones.push({ z: z1, zone: zones[1] })
  if (clockCount >= 3) mobileZones.push({ z: z2, zone: zones[2] })

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
            <div className="m-w-desc">{weather.desc}</div>
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

  return (
    <div className="card card-hero">
      <div className="hero-inner">
        <div className="time-zone tz-primary">
          <div className="tz-region">{zones[0].region}</div>
          <div className="tz-time">{z0.time}</div>
          <div className="tz-date">{z0.date}</div>
          <div className="tz-name">{zones[0].label || ''}</div>
        </div>
        {clockCount >= 2 && (
          <div className="time-zone">
            <div className="tz-region">{zones[1].region}</div>
            <div className="tz-time">{z1.time}</div>
            <div className="tz-date">{z1.date}</div>
            <div className="tz-name">{zones[1].label || ''}</div>
          </div>
        )}
        {clockCount >= 3 && (
          <div className="time-zone">
            <div className="tz-region">{zones[2].region}</div>
            <div className="tz-time">{z2.time}</div>
            <div className="tz-date">{z2.date}</div>
            <div className="tz-name">{zones[2].label || ''}</div>
          </div>
        )}
        <div className="hero-weather">
          <div className="w-emoji">{weather.emoji}</div>
          <div className="w-temp">{tempLabel}</div>
          <div className="w-desc">{weather.desc}</div>
          <div className="w-loc">{weather.loc}</div>
          <button className="w-btn" onClick={loadWeather}>새로고침</button>
        </div>
      </div>
    </div>
  )
}
