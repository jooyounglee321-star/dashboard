import { useState, useEffect, useCallback } from 'react'

/**
 * Google OAuth 서비스 연동 공통 훅.
 *
 * ScheduleCard(캘린더)와 YoutubeCard(유튜브)에서 반복되는
 * 연동 상태 확인 → 팝업 연동 → 데이터 로드 흐름을 공통화.
 *
 * @param {object} options
 * @param {string}   options.connectUrl    - OAuth 시작 URL (예: '/api/youtube/connect')
 * @param {string}   options.statusUrl     - 연동 상태 확인 URL
 * @param {string}   options.disconnectUrl - 연동 해제 URL (DELETE)
 * @param {string}   options.dataUrl       - 데이터 조회 URL (null이면 자동 로드 안 함)
 * @param {function} options.parseData     - API 응답 → 배열 변환 함수 (기본: res => res)
 * @param {string}   options.messageKey    - 팝업 완료 시 postMessage 키 (예: 'youtube_connected')
 * @param {string}   options.popupName     - window.open 팝업 이름 (중복 방지용)
 */
export function useGoogleOAuth({
  connectUrl,
  statusUrl,
  disconnectUrl,
  dataUrl = null,
  parseData = (res) => res,
  messageKey,
  popupName = 'google_oauth',
}) {
  const [connected, setConnected] = useState(false)
  const [googleEmail, setGoogleEmail] = useState(null)
  const [statusLoading, setStatusLoading] = useState(true)
  const [data, setData] = useState([])
  const [dataLoading, setDataLoading] = useState(false)
  const [dataError, setDataError] = useState(false)

  const loadData = useCallback(() => {
    if (!dataUrl) return
    setDataLoading(true)
    setDataError(false)
    fetch(dataUrl, { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(res => setData(parseData(res) || []))
      .catch(() => setDataError(true))
      .finally(() => setDataLoading(false))
  }, [dataUrl, parseData])

  const checkStatus = useCallback(() => {
    fetch(statusUrl, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(res => {
        if (res?.connected) {
          setConnected(true)
          setGoogleEmail(res.google_email || null)
          loadData()
        } else {
          setConnected(false)
        }
      })
      .catch(() => setConnected(false))
      .finally(() => setStatusLoading(false))
  }, [statusUrl, loadData])

  // 마운트 시 연동 상태 확인
  useEffect(() => { checkStatus() }, [checkStatus])

  // 팝업 완료 신호 수신
  useEffect(() => {
    const handler = (e) => {
      if (e.data === messageKey) {
        setStatusLoading(true)
        checkStatus()
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [messageKey, checkStatus])

  function connect(onPopupBlocked) {
    const popup = window.open(connectUrl, popupName, 'width=520,height=640,scrollbars=yes,resizable=yes')
    if (!popup && onPopupBlocked) onPopupBlocked()
  }

  function disconnect() {
    fetch(disconnectUrl, { method: 'DELETE', credentials: 'include' })
      .then(() => { setConnected(false); setGoogleEmail(null); setData([]) })
      .catch(() => {})
  }

  return {
    connected,
    googleEmail,
    statusLoading,
    data,
    dataLoading,
    dataError,
    connect,
    disconnect,
    reload: loadData,
  }
}
