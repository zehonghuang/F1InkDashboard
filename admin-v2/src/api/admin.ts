import { fetchJSON, withToken } from '@/api/http'

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

export type AdminDevicesListResponse = {
  ok: boolean
  error?: string
  page: number
  page_size: number
  total: number
  items: AdminDeviceItem[]
}

export type AdminDeviceDetailResponse = {
  ok: boolean
  error?: string
  item: AdminDeviceItem
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

export type AdminUsersListResponse = {
  ok: boolean
  error?: string
  page: number
  page_size: number
  total: number
  items: AdminUserItem[]
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

export type AdminF1LiveTimingClock = {
  paused: boolean
  system_time?: string
  track_time?: string
  live_timing_start_time?: string
}

export type AdminF1LiveTimingSession = {
  meeting_key?: number
  meeting_name?: string
  official_name?: string
  location?: string
  country_code?: string
  country_name?: string
  circuit?: string
  session_key?: number
  session_type?: string
  session_number?: number
  session_name?: string
  status?: string
  start_date?: string
  end_date?: string
  gmt_offset?: string
}

export type AdminF1LiveTimingTrackStatus = {
  code?: string
  message?: string
}

export type AdminF1LiveTimingWeather = {
  air_temp?: string
  track_temp?: string
  humidity?: string
  pressure?: string
  rainfall?: string
  wind_direction?: string
  wind_speed?: string
}

export type AdminF1LiveTimingRaceControlMessage = {
  utc?: string
  category?: string
  title?: string
  message?: string
  flag?: string
  status?: string
  mode?: string
  scope?: string
  sector?: number
  racing_number?: string
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
  knocked_out?: boolean
  taken_chequered?: boolean
  show_position?: boolean
  status_code?: number
  sectors?: string[]
  sector_colors?: string[]
  sector_segment_colors?: string[][]
  current_lap_fastest?: boolean
  personal_best_lap?: boolean
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
  clock?: AdminF1LiveTimingClock
  session?: AdminF1LiveTimingSession
  track_status?: AdminF1LiveTimingTrackStatus
  weather?: AdminF1LiveTimingWeather
  race_control_messages?: AdminF1LiveTimingRaceControlMessage[]
  rows: AdminF1LiveTimingRow[]
}

export type AdminF1LiveTimingResponse = {
  ok: boolean
  error?: string
  generated_at_utc?: string
  status: AdminF1LiveTimingSnapshot
}

export async function fetchAdminDevices(params: { page?: number; pageSize?: number; q?: string }) {
  const qs = new URLSearchParams()
  qs.set('page', String(params.page || 1))
  qs.set('page_size', String(params.pageSize || 20))
  if (params.q) qs.set('q', params.q)
  const url = withToken(`/api/v1/admin/devices?${qs.toString()}`)
  const res = await fetchJSON<AdminDevicesListResponse>(url)
  if (!res.ok) throw new Error(res.error || 'backend_error')
  return res
}

export async function fetchAdminDeviceDetail(deviceId: string) {
  const url = withToken(`/api/v1/admin/devices/${encodeURIComponent(deviceId)}`)
  const res = await fetchJSON<AdminDeviceDetailResponse>(url)
  if (!res.ok) throw new Error(res.error || 'backend_error')
  return res
}

export async function fetchAdminUsers(params: { page?: number; pageSize?: number; q?: string }) {
  const qs = new URLSearchParams()
  qs.set('page', String(params.page || 1))
  qs.set('page_size', String(params.pageSize || 20))
  if (params.q) qs.set('q', params.q)
  const url = withToken(`/api/v1/admin/mp/users?${qs.toString()}`)
  const res = await fetchJSON<AdminUsersListResponse>(url)
  if (!res.ok) throw new Error(res.error || 'backend_error')
  return res
}

export async function fetchAdminUserDetail(userId: number) {
  const url = withToken(`/api/v1/admin/mp/users/${encodeURIComponent(String(userId))}`)
  const res = await fetchJSON<AdminUserDetailResponse>(url)
  if (!res.ok) throw new Error(res.error || 'backend_error')
  return res
}

export async function fetchAdminMotorsportLiveStandings(params?: { sourceUrl?: string }) {
  const qs = new URLSearchParams()
  if (params?.sourceUrl) qs.set('source_url', params.sourceUrl)
  const suffix = qs.toString()
  const url = withToken(`/api/v1/admin/motorsport/live-standings${suffix ? `?${suffix}` : ''}`)
  const res = await fetchJSON<AdminMotorsportLiveStandingsResponse>(url)
  if (!res.ok) throw new Error(res.error || 'backend_error')
  return res
}

export async function fetchAdminF1LiveTiming() {
  const url = withToken('/api/v1/admin/f1/live-timing')
  const res = await fetchJSON<AdminF1LiveTimingResponse>(url)
  if (!res.ok) throw new Error(res.error || 'backend_error')
  return res
}

export async function adminBind(params: { user_id: number; device_id: string }) {
  const url = withToken('/api/v1/admin/bind')
  const res = await fetchJSON<{ ok: boolean; error?: string }>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  if (!res.ok) throw new Error(res.error || 'backend_error')
  return res
}

export async function adminUnbind(params: { user_id?: number; device_id?: string }) {
  const url = withToken('/api/v1/admin/unbind')
  const res = await fetchJSON<{ ok: boolean; error?: string }>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  if (!res.ok) throw new Error(res.error || 'backend_error')
  return res
}
