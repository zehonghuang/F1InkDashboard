import { fetchJSON, withToken } from '@/api/http';
export async function fetchMpNewsList(params) {
    const qs = new URLSearchParams();
    if (params.tz)
        qs.set('tz', params.tz);
    qs.set('page', String(params.page || 1));
    qs.set('page_size', String(params.pageSize || 20));
    if (params.ids)
        qs.set('ids', params.ids);
    if (params.pinned)
        qs.set('pinned', params.pinned);
    if (params.typeCode)
        qs.set('type_code', params.typeCode);
    if (params.layoutCode)
        qs.set('layout_code', params.layoutCode);
    if (params.tag)
        qs.set('tag', params.tag);
    if (params.q)
        qs.set('q', params.q);
    if (params.since)
        qs.set('since', params.since);
    if (params.sort)
        qs.set('sort', params.sort);
    const res = await fetchJSON(`/api/v1/mp/news?${qs.toString()}`);
    if (!res.ok)
        throw new Error(res.error || 'backend_error');
    return res;
}
export async function fetchMpNewsDetail(params) {
    const qs = new URLSearchParams();
    if (params.tz)
        qs.set('tz', params.tz);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    const res = await fetchJSON(`/api/v1/mp/news/${encodeURIComponent(params.id)}${suffix}`);
    if (!res.ok)
        throw new Error(res.error || 'backend_error');
    return res;
}
export async function ingestMpNews(item) {
    const url = withToken('/api/v1/mp/news/ingest');
    const res = await fetchJSON(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item),
    });
    if (!res.ok)
        throw new Error(res.error || 'backend_error');
    return res;
}
