import { fetchJSON, withToken } from '@/api/http'

export type MpNewsRichTextNode = {
  name?: string
  type?: string
  text?: string
  attrs?: Record<string, any>
  children?: MpNewsRichTextNode[] | string | MpNewsRichTextNode
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
  tz: string
  base_url: string
  page: number
  page_size: number
  total: number
  items: MpNewsItem[]
}

export type MpNewsDetailResponse = {
  ok: boolean
  error?: string
  tz: string
  base_url: string
  item: MpNewsItem
}

export type MpNewsIngestResponse = {
  ok: boolean
  error?: string
  id: string
}

export async function fetchMpNewsList(params: {
  tz?: string
  page?: number
  pageSize?: number
  ids?: string
  pinned?: string
  typeCode?: string
  layoutCode?: string
  tag?: string
  q?: string
  since?: string
  sort?: string
}) {
  const qs = new URLSearchParams()
  if (params.tz) qs.set('tz', params.tz)
  qs.set('page', String(params.page || 1))
  qs.set('page_size', String(params.pageSize || 20))
  if (params.ids) qs.set('ids', params.ids)
  if (params.pinned) qs.set('pinned', params.pinned)
  if (params.typeCode) qs.set('type_code', params.typeCode)
  if (params.layoutCode) qs.set('layout_code', params.layoutCode)
  if (params.tag) qs.set('tag', params.tag)
  if (params.q) qs.set('q', params.q)
  if (params.since) qs.set('since', params.since)
  if (params.sort) qs.set('sort', params.sort)
  const res = await fetchJSON<MpNewsListResponse>(`/api/v1/mp/news?${qs.toString()}`)
  if (!res.ok) throw new Error(res.error || 'backend_error')
  return res
}

export async function fetchMpNewsDetail(params: { id: string; tz?: string }) {
  const qs = new URLSearchParams()
  if (params.tz) qs.set('tz', params.tz)
  const suffix = qs.toString() ? `?${qs.toString()}` : ''
  const res = await fetchJSON<MpNewsDetailResponse>(`/api/v1/mp/news/${encodeURIComponent(params.id)}${suffix}`)
  if (!res.ok) throw new Error(res.error || 'backend_error')
  return res
}

export async function ingestMpNews(item: MpNewsItem) {
  const url = withToken('/api/v1/mp/news/ingest')
  const res = await fetchJSON<MpNewsIngestResponse>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(item),
  })
  if (!res.ok) throw new Error(res.error || 'backend_error')
  return res
}
