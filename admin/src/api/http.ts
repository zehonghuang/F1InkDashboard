export type ApiError = {
  ok: false
  error: string
}

export function getApiBase() {
  const fromStorage = localStorage.getItem('f1ink_admin_api_base') || ''
  const fromEnv = import.meta.env.VITE_API_BASE || ''
  const base = (fromStorage || fromEnv || '').trim().replace(/\/+$/, '')
  return base
}

export function getToken() {
  return (localStorage.getItem('f1ink_admin_token') || '').trim()
}

export function withToken(url: string) {
  const token = getToken()
  if (!token) return url
  const hasQuery = url.includes('?')
  return url + (hasQuery ? '&' : '?') + new URLSearchParams({ token }).toString()
}

function buildHeaders(init?: RequestInit): Headers {
  const headers = new Headers(init?.headers || {})
  const token = getToken()
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  return headers
}

export async function fetchJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const url = getApiBase() + path
  const headers = buildHeaders(init)
  const nextInit: RequestInit = { ...(init || {}), headers }
  const r = await fetch(url, nextInit)
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  const ct = (r.headers.get('content-type') || '').toLowerCase()
  if (!ct.includes('application/json')) {
    const text = await r.text()
    const head = text.slice(0, 120).replace(/\s+/g, ' ').trim()
    throw new Error(`响应不是 JSON（content-type=${ct || 'unknown'}），可能 API_BASE 未设置或未代理到后端：${head}`)
  }
  return (await r.json()) as T
}
