import { fetchJSON, withToken } from '@/api/http'

export type MpPosterStatus = 'draft' | 'published' | 'offline'

export type MpPosterItem = {
  id: number
  title: string
  poster_url: string
  poster_width: number
  poster_height: number
  poster_ratio: number
  status: MpPosterStatus
  weight: number
  content_format: string
  content_text?: string
  content_nodes?: any[]
  published_at?: string
  created_at: string
  updated_at: string
}

export type MpPosterListResponse = {
  ok: boolean
  error?: string
  page: number
  page_size: number
  total: number
  items: MpPosterItem[]
}

export type MpPosterDetailResponse = {
  ok: boolean
  error?: string
  item: MpPosterItem
}

export type MpPosterUploadImageResponse = {
  ok: boolean
  error?: string
  url: string
  mime: string
  bytes: number
  width: number
  height: number
}

export async function fetchPosterList(params: { page?: number; pageSize?: number; status?: string }) {
  const qs = new URLSearchParams()
  qs.set('page', String(params.page || 1))
  qs.set('page_size', String(params.pageSize || 20))
  if (params.status) qs.set('status', params.status)
  const url = withToken(`/api/v1/admin/mp/posters?${qs.toString()}`)
  const res = await fetchJSON<MpPosterListResponse>(url)
  if (!res.ok) throw new Error(res.error || 'backend_error')
  return res
}

export async function fetchPosterDetail(id: number) {
  const url = withToken(`/api/v1/admin/mp/posters/${encodeURIComponent(String(id))}`)
  const res = await fetchJSON<MpPosterDetailResponse>(url)
  if (!res.ok) throw new Error(res.error || 'backend_error')
  return res
}

export async function createPoster(params: {
  title: string
  poster_url?: string
  poster_width?: number
  poster_height?: number
  poster_ratio?: number
  status?: MpPosterStatus
  weight?: number
  content_format?: string
  content_text?: string
  content_nodes?: any
  published_at?: string | null
}) {
  const url = withToken('/api/v1/admin/mp/posters')
  const res = await fetchJSON<MpPosterDetailResponse>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  if (!res.ok) throw new Error(res.error || 'backend_error')
  return res
}

export async function updatePoster(
  id: number,
  params: Partial<{
    title: string
    poster_url: string
    poster_width: number
    poster_height: number
    poster_ratio: number
    status: MpPosterStatus
    weight: number
    content_format: string
    content_text: string
    content_nodes: any
    published_at: string | null
  }>,
) {
  const url = withToken(`/api/v1/admin/mp/posters/${encodeURIComponent(String(id))}`)
  const res = await fetchJSON<MpPosterDetailResponse>(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  if (!res.ok) throw new Error(res.error || 'backend_error')
  return res
}

export async function deletePoster(id: number) {
  const url = withToken(`/api/v1/admin/mp/posters/${encodeURIComponent(String(id))}`)
  const res = await fetchJSON<{ ok: boolean; error?: string }>(url, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error(res.error || 'backend_error')
  return res
}

export async function uploadPosterImage(file: File) {
  const url = withToken('/api/v1/admin/mp/poster/image')
  const token = (localStorage.getItem('f1ink_admin_token') || '').trim()
  const formData = new FormData()
  formData.append('image', file)
  if (token) formData.append('token', token)
  const extraHeaders: Record<string, string> = {}
  if (token) extraHeaders['Authorization'] = `Bearer ${token}`
  const res = await fetchJSON<MpPosterUploadImageResponse>(url, {
    method: 'POST',
    headers: extraHeaders,
    body: formData,
  })
  if (!res.ok) throw new Error(res.error || 'backend_error')
  return res
}
