export const API_BASE_KEY = 'f1ink_admin_api_base'
export const TOKEN_KEY = 'f1ink_admin_token'
export const TIMEZONE_KEY = 'f1ink_admin_timezone'
export const THEME_KEY = 'f1ink_admin_v2_theme'

export type ThemeMode = 'light' | 'dark'

export type AppSettings = {
  apiBase: string
  token: string
  timezone: string
  theme: ThemeMode
}

export type MpNewsRichTextNode = {
  type?: string
  name?: string
  text?: string
  attrs?: Record<string, unknown>
  children?: MpNewsRichTextNode[] | MpNewsRichTextNode | string
}

export type MpNewsItem = {
  id: string
  layout_code: string
  hero_display_code?: string
  type_code: string
  pinned: boolean
  weight: number
  tag_text: string
  tags?: string[]
  title: string
  summary: string
  cover_url: string
  published_at: string
  time_text?: string
  source?: { name: string; url?: string }
  content?: { format_code: string; text?: string; nodes?: MpNewsRichTextNode[] }
}

export type MpNewsListResponse = {
  ok: boolean
  error?: string
  page: number
  page_size: number
  total: number
  items: MpNewsItem[]
}

export type MpNewsDetailResponse = {
  ok: boolean
  error?: string
  item: MpNewsItem
}

export type AdminUserBrief = {
  id: number
  openid?: string
  nick_name?: string
  avatar_url?: string
}

export type AdminDeviceBrief = {
  device_id: string
  board_type?: string
  fw_user_agent?: string
  last_seen_at?: string
}

export type AdminDeviceItem = {
  device_id: string
  device_uuid?: string
  device_key?: string
  mac?: string
  board_type?: string
  fw_user_agent?: string
  first_seen_at?: string
  last_seen_at?: string
  bound_user?: AdminUserBrief
}

export type AdminUserItem = {
  id: number
  openid: string
  unionid?: string
  nick_name?: string
  avatar_url?: string
  created_at?: string
  updated_at?: string
  device?: AdminDeviceBrief
}

export type AdminDevicesListResponse = {
  ok: boolean
  error?: string
  page: number
  page_size: number
  total: number
  items: AdminDeviceItem[]
}

export type AdminUsersListResponse = {
  ok: boolean
  error?: string
  page: number
  page_size: number
  total: number
  items: AdminUserItem[]
}

export type AdminDeviceDetailResponse = {
  ok: boolean
  error?: string
  item: AdminDeviceItem
}

export type AdminUserDetailResponse = {
  ok: boolean
  error?: string
  item: AdminUserItem
}

export type AdminMotorsportStandingRow = {
  position: number
  driver: string
  team: string
  gap?: string
  time?: string
  tyre?: string
  laps?: number
  pit_count?: number
  team_color?: string
}

export type AdminMotorsportLiveStandingsResponse = {
  ok: boolean
  error?: string
  source_url?: string
  live_timing_url?: string
  status?: string
  session_title?: string
  fetched_at_utc?: string
  rows: AdminMotorsportStandingRow[]
}

export type AdminF1LiveTimingRaceControlMessage = {
  utc?: string
  category?: string
  title?: string
  message?: string
  flag?: string
  status?: string
}

export type AdminF1LiveTimingRow = {
  position: number
  line?: number
  racing_number?: string
  tla?: string
  driver: string
  team?: string
  team_color?: string
  interval?: string
  gap?: string
  best_lap?: string
  last_lap?: string
  tyre?: string
  tyre_age_laps?: number
  is_new_tyre?: boolean
  laps?: number
  pit_count?: number
  in_pit?: boolean
  pit_out?: boolean
  stopped?: boolean
  retired?: boolean
  taken_chequered?: boolean
  sectors?: string[]
  sector_colors?: string[]
}

export type AdminF1LiveTimingSnapshot = {
  enabled: boolean
  running: boolean
  connected: boolean
  endpoint: string
  poll_interval_ms: number
  request_timeout_ms: number
  seq: number
  last_polled_at_utc?: string
  last_updated_at_utc?: string
  last_error?: string
  query_latency_ms?: number
  session?: {
    meeting_name?: string
    location?: string
    session_name?: string
    session_type?: string
    status?: string
  }
  track_status?: {
    code?: string
    message?: string
  }
  weather?: {
    air_temp?: string
    track_temp?: string
    humidity?: string
    pressure?: string
    rainfall?: string
    wind_speed?: string
  }
  race_control_messages?: AdminF1LiveTimingRaceControlMessage[]
  rows: AdminF1LiveTimingRow[]
}

export type AdminF1LiveTimingResponse = {
  ok: boolean
  error?: string
  generated_at_utc?: string
  status: AdminF1LiveTimingSnapshot
}

export type DashboardSummary = {
  newsTotal: number
  deviceTotal: number
  userTotal: number
  liveConnected: boolean
  liveRows: number
  latestNews: MpNewsItem[]
  latestDevices: AdminDeviceItem[]
  latestUsers: AdminUserItem[]
}

export function getStoredSettings(): AppSettings {
  const theme = (localStorage.getItem(THEME_KEY) as ThemeMode | null) || 'light'
  return {
    apiBase: (localStorage.getItem(API_BASE_KEY) || '').trim(),
    token: (localStorage.getItem(TOKEN_KEY) || '').trim(),
    timezone: (localStorage.getItem(TIMEZONE_KEY) || 'Asia/Shanghai').trim() || 'Asia/Shanghai',
    theme: theme === 'dark' ? 'dark' : 'light',
  }
}

export function saveStoredSettings(settings: AppSettings) {
  localStorage.setItem(API_BASE_KEY, settings.apiBase.trim())
  localStorage.setItem(TOKEN_KEY, settings.token.trim())
  localStorage.setItem(TIMEZONE_KEY, settings.timezone.trim())
  localStorage.setItem(THEME_KEY, settings.theme)
}

export function resetStoredSettings() {
  localStorage.removeItem(API_BASE_KEY)
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(TIMEZONE_KEY)
  localStorage.removeItem(THEME_KEY)
}

export function getApiBase() {
  const fromStorage = localStorage.getItem(API_BASE_KEY) || ''
  const fromEnv = (import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_API_BASE || ''
  return (fromStorage || fromEnv || '').trim().replace(/\/+$/, '')
}

export function getToken() {
  return (localStorage.getItem(TOKEN_KEY) || '').trim()
}

export function withToken(url: string) {
  const token = getToken()
  if (!token) return url
  return `${url}${url.includes('?') ? '&' : '?'}${new URLSearchParams({ token }).toString()}`
}

async function fetchJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const url = getApiBase() + path
  const response = await fetch(url, init)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const contentType = (response.headers.get('content-type') || '').toLowerCase()
  if (!contentType.includes('application/json')) {
    const text = await response.text()
    throw new Error(`响应不是 JSON，请确认 API Base 指向后端：${text.slice(0, 100).replace(/\s+/g, ' ')}`)
  }
  return (await response.json()) as T
}

export async function fetchMpNewsList(params: {
  page?: number
  pageSize?: number
  q?: string
  tag?: string
  typeCode?: string
  layoutCode?: string
  pinned?: string
  since?: string
  tz?: string
}) {
  const qs = new URLSearchParams()
  qs.set('page', String(params.page || 1))
  qs.set('page_size', String(params.pageSize || 20))
  if (params.q) qs.set('q', params.q)
  if (params.tag) qs.set('tag', params.tag)
  if (params.typeCode) qs.set('type_code', params.typeCode)
  if (params.layoutCode) qs.set('layout_code', params.layoutCode)
  if (params.pinned) qs.set('pinned', params.pinned)
  if (params.since) qs.set('since', params.since)
  if (params.tz) qs.set('tz', params.tz)
  const res = await fetchJSON<MpNewsListResponse>(`/api/v1/mp/news?${qs.toString()}`)
  if (!res.ok) throw new Error(res.error || '新闻列表加载失败')
  return res
}

export async function fetchMpNewsDetail(id: string, tz = 'Asia/Shanghai') {
  const qs = new URLSearchParams()
  if (tz) qs.set('tz', tz)
  const suffix = qs.toString() ? `?${qs.toString()}` : ''
  const res = await fetchJSON<MpNewsDetailResponse>(`/api/v1/mp/news/${encodeURIComponent(id)}${suffix}`)
  if (!res.ok) throw new Error(res.error || '新闻详情加载失败')
  return res
}

export async function saveMpNews(item: MpNewsItem) {
  const res = await fetchJSON<{ ok: boolean; error?: string; id: string }>(withToken('/api/v1/mp/news/ingest'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(item),
  })
  if (!res.ok) throw new Error(res.error || '保存新闻失败')
  return res
}

export async function fetchAdminDevices(params: { page?: number; pageSize?: number; q?: string }) {
  const qs = new URLSearchParams()
  qs.set('page', String(params.page || 1))
  qs.set('page_size', String(params.pageSize || 20))
  if (params.q) qs.set('q', params.q)
  const res = await fetchJSON<AdminDevicesListResponse>(withToken(`/api/v1/admin/devices?${qs.toString()}`))
  if (!res.ok) throw new Error(res.error || '设备列表加载失败')
  return res
}

export async function fetchAdminDeviceDetail(deviceId: string) {
  const res = await fetchJSON<AdminDeviceDetailResponse>(withToken(`/api/v1/admin/devices/${encodeURIComponent(deviceId)}`))
  if (!res.ok) throw new Error(res.error || '设备详情加载失败')
  return res
}

export async function fetchAdminUsers(params: { page?: number; pageSize?: number; q?: string }) {
  const qs = new URLSearchParams()
  qs.set('page', String(params.page || 1))
  qs.set('page_size', String(params.pageSize || 20))
  if (params.q) qs.set('q', params.q)
  const res = await fetchJSON<AdminUsersListResponse>(withToken(`/api/v1/admin/mp/users?${qs.toString()}`))
  if (!res.ok) throw new Error(res.error || '用户列表加载失败')
  return res
}

export async function fetchAdminUserDetail(userId: number) {
  const res = await fetchJSON<AdminUserDetailResponse>(withToken(`/api/v1/admin/mp/users/${encodeURIComponent(String(userId))}`))
  if (!res.ok) throw new Error(res.error || '用户详情加载失败')
  return res
}

export async function bindUserDevice(params: { user_id: number; device_id: string }) {
  const res = await fetchJSON<{ ok: boolean; error?: string }>(withToken('/api/v1/admin/bind'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  if (!res.ok) throw new Error(res.error || '绑定失败')
  return res
}

export async function unbindUserDevice(params: { user_id?: number; device_id?: string }) {
  const res = await fetchJSON<{ ok: boolean; error?: string }>(withToken('/api/v1/admin/unbind'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  if (!res.ok) throw new Error(res.error || '解绑失败')
  return res
}

export async function fetchLiveStandings(sourceUrl?: string) {
  const qs = new URLSearchParams()
  if (sourceUrl) qs.set('source_url', sourceUrl)
  const suffix = qs.toString()
  const res = await fetchJSON<AdminMotorsportLiveStandingsResponse>(
    withToken(`/api/v1/admin/motorsport/live-standings${suffix ? `?${suffix}` : ''}`),
  )
  if (!res.ok) throw new Error(res.error || '榜单加载失败')
  return res
}

export async function fetchF1LiveTiming() {
  const res = await fetchJSON<AdminF1LiveTimingResponse>(withToken('/api/v1/admin/f1/live-timing'))
  if (!res.ok) throw new Error(res.error || 'Live timing 加载失败')
  return res
}

export async function fetchDashboardSummary(timezone: string): Promise<DashboardSummary> {
  const [news, devices, users, live] = await Promise.all([
    fetchMpNewsList({ page: 1, pageSize: 5, tz: timezone }),
    fetchAdminDevices({ page: 1, pageSize: 5 }),
    fetchAdminUsers({ page: 1, pageSize: 5 }),
    fetchF1LiveTiming(),
  ])

  return {
    newsTotal: news.total || 0,
    deviceTotal: devices.total || 0,
    userTotal: users.total || 0,
    liveConnected: Boolean(live.status?.connected),
    liveRows: live.status?.rows?.length || 0,
    latestNews: news.items || [],
    latestDevices: devices.items || [],
    latestUsers: users.items || [],
  }
}
