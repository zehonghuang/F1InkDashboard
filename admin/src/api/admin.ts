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

