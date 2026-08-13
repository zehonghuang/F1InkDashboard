import { fetchJSON, withToken } from '@/api/http';
export async function fetchAdminDevices(params) {
    const qs = new URLSearchParams();
    qs.set('page', String(params.page || 1));
    qs.set('page_size', String(params.pageSize || 20));
    if (params.q)
        qs.set('q', params.q);
    const url = withToken(`/api/v1/admin/devices?${qs.toString()}`);
    const res = await fetchJSON(url);
    if (!res.ok)
        throw new Error(res.error || 'backend_error');
    return res;
}
export async function fetchAdminDeviceDetail(deviceId) {
    const url = withToken(`/api/v1/admin/devices/${encodeURIComponent(deviceId)}`);
    const res = await fetchJSON(url);
    if (!res.ok)
        throw new Error(res.error || 'backend_error');
    return res;
}
export async function fetchAdminUsers(params) {
    const qs = new URLSearchParams();
    qs.set('page', String(params.page || 1));
    qs.set('page_size', String(params.pageSize || 20));
    if (params.q)
        qs.set('q', params.q);
    const url = withToken(`/api/v1/admin/mp/users?${qs.toString()}`);
    const res = await fetchJSON(url);
    if (!res.ok)
        throw new Error(res.error || 'backend_error');
    return res;
}
export async function fetchAdminUserDetail(userId) {
    const url = withToken(`/api/v1/admin/mp/users/${encodeURIComponent(String(userId))}`);
    const res = await fetchJSON(url);
    if (!res.ok)
        throw new Error(res.error || 'backend_error');
    return res;
}
export async function fetchAdminMotorsportLiveStandings(params) {
    const qs = new URLSearchParams();
    if (params?.sourceUrl)
        qs.set('source_url', params.sourceUrl);
    const suffix = qs.toString();
    const url = withToken(`/api/v1/admin/motorsport/live-standings${suffix ? `?${suffix}` : ''}`);
    const res = await fetchJSON(url);
    if (!res.ok)
        throw new Error(res.error || 'backend_error');
    return res;
}
export async function fetchAdminF1LiveTiming() {
    const url = withToken('/api/v1/admin/f1/live-timing');
    const res = await fetchJSON(url);
    if (!res.ok)
        throw new Error(res.error || 'backend_error');
    return res;
}
export async function adminBind(params) {
    const url = withToken('/api/v1/admin/bind');
    const res = await fetchJSON(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
    });
    if (!res.ok)
        throw new Error(res.error || 'backend_error');
    return res;
}
export async function adminUnbind(params) {
    const url = withToken('/api/v1/admin/unbind');
    const res = await fetchJSON(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
    });
    if (!res.ok)
        throw new Error(res.error || 'backend_error');
    return res;
}
