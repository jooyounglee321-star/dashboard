// ── 공통 API fetch 유틸 ──────────────────────────────────────────────────────
// VITE_DEBUG_MODE=true 시 요청/응답 상세 로그 출력, 평소엔 완전 무음

const DEBUG = import.meta.env.VITE_DEBUG_MODE === 'true'

// 최근 호출 목록 (DebugPanel에서 읽음)
export const apiLog = []
const MAX_LOG = 50

/**
 * apiFetch(url, options?)
 * - credentials: 'include' 로 HttpOnly Cookie 자동 전송
 * - DEBUG 모드 시 console.group으로 요청/응답 출력
 * - 비-2xx 응답은 { status, message } 포함한 Error로 throw
 */
export async function apiFetch(url, options = {}) {
  // FormData 전송 시 Content-Type 지정 금지 (browser가 multipart boundary 자동 설정)
  const isFormData = options.body instanceof FormData
  const headers = {
    ...(options.body !== undefined && !isFormData ? { 'Content-Type': 'application/json' } : {}),
    ...options.headers,
  }

  const init = { ...options, headers, credentials: 'include' }
  const t0 = performance.now()

  if (DEBUG) {
    console.group(`[API] ${options.method || 'GET'} ${url}`)
    if (options.body) {
      try { console.log('req body:', JSON.parse(options.body)) } catch { console.log('req body:', options.body) }
    }
  }

  let res
  try {
    res = await fetch(url, init)
  } catch (err) {
    const entry = { url, method: options.method || 'GET', status: 0, ms: Math.round(performance.now() - t0), error: err.message }
    apiLog.unshift(entry); if (apiLog.length > MAX_LOG) apiLog.pop()
    if (DEBUG) { console.error('network error:', err); console.groupEnd() }
    const e = new Error(err.message); e.status = 0; throw e
  }

  const ms = Math.round(performance.now() - t0)
  let data
  const ct = res.headers.get('content-type') || ''
  try { data = ct.includes('application/json') ? await res.json() : await res.text() } catch { data = null }

  const entry = { url, method: options.method || 'GET', status: res.status, ms, responseBody: data }
  apiLog.unshift(entry); if (apiLog.length > MAX_LOG) apiLog.pop()

  if (DEBUG) {
    console.log(`status: ${res.status} | ${ms}ms`)
    console.log('response:', data)
    console.groupEnd()
  }

  if (!res.ok) {
    const msg = (data && (data.detail || data.message)) || `HTTP ${res.status}`
    const e = new Error(msg); e.status = res.status; e.data = data; throw e
  }

  return data
}
