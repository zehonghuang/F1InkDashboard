export const API_BASE_KEY = 'f1ink_admin_api_base';
export const TOKEN_KEY = 'f1ink_admin_token';
export const TIMEZONE_KEY = 'f1ink_admin_timezone';
export const THEME_KEY = 'f1ink_admin_v2_theme';
export function getStoredSettings() {
    const theme = localStorage.getItem(THEME_KEY) || 'light';
    return {
        apiBase: (localStorage.getItem(API_BASE_KEY) || '').trim(),
        token: (localStorage.getItem(TOKEN_KEY) || '').trim(),
        timezone: (localStorage.getItem(TIMEZONE_KEY) || 'Asia/Shanghai').trim() || 'Asia/Shanghai',
        theme: theme === 'dark' ? 'dark' : 'light',
    };
}
export function saveStoredSettings(settings) {
    localStorage.setItem(API_BASE_KEY, settings.apiBase.trim());
    localStorage.setItem(TOKEN_KEY, settings.token.trim());
    localStorage.setItem(TIMEZONE_KEY, settings.timezone.trim());
    localStorage.setItem(THEME_KEY, settings.theme);
}
export function resetStoredSettings() {
    localStorage.removeItem(API_BASE_KEY);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TIMEZONE_KEY);
    localStorage.removeItem(THEME_KEY);
}
export function getApiBase() {
    const fromStorage = localStorage.getItem(API_BASE_KEY) || '';
    const fromEnv = import.meta.env?.VITE_API_BASE || '';
    return (fromStorage || fromEnv || '').trim().replace(/\/+$/, '');
}
export function getToken() {
    return (localStorage.getItem(TOKEN_KEY) || '').trim();
}
export function withToken(url) {
    const token = getToken();
    if (!token)
        return url;
    return `${url}${url.includes('?') ? '&' : '?'}${new URLSearchParams({ token }).toString()}`;
}
async function fetchJSON(path, init) {
    const url = getApiBase() + path;
    const response = await fetch(url, init);
    if (!response.ok)
        throw new Error(`HTTP ${response.status}`);
    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    if (!contentType.includes('application/json')) {
        const text = await response.text();
        throw new Error(`响应不是 JSON，请确认 API Base 指向后端：${text.slice(0, 100).replace(/\s+/g, ' ')}`);
    }
    return (await response.json());
}
export async function fetchMpNewsList(params) {
    const qs = new URLSearchParams();
    qs.set('page', String(params.page || 1));
    qs.set('page_size', String(params.pageSize || 20));
    if (params.q)
        qs.set('q', params.q);
    if (params.tag)
        qs.set('tag', params.tag);
    if (params.typeCode)
        qs.set('type_code', params.typeCode);
    if (params.layoutCode)
        qs.set('layout_code', params.layoutCode);
    if (params.pinned)
        qs.set('pinned', params.pinned);
    if (params.since)
        qs.set('since', params.since);
    if (params.tz)
        qs.set('tz', params.tz);
    const res = await fetchJSON(`/api/v1/mp/news?${qs.toString()}`);
    if (!res.ok)
        throw new Error(res.error || '新闻列表加载失败');
    return res;
}
export async function fetchMpNewsDetail(id, tz = 'Asia/Shanghai') {
    const qs = new URLSearchParams();
    if (tz)
        qs.set('tz', tz);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    const res = await fetchJSON(`/api/v1/mp/news/${encodeURIComponent(id)}${suffix}`);
    if (!res.ok)
        throw new Error(res.error || '新闻详情加载失败');
    return res;
}
export async function saveMpNews(item) {
    const res = await fetchJSON(withToken('/api/v1/mp/news/ingest'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item),
    });
    if (!res.ok)
        throw new Error(res.error || '保存新闻失败');
    return res;
}
export async function fetchAdminDevices(params) {
    const qs = new URLSearchParams();
    qs.set('page', String(params.page || 1));
    qs.set('page_size', String(params.pageSize || 20));
    if (params.q)
        qs.set('q', params.q);
    const res = await fetchJSON(withToken(`/api/v1/admin/devices?${qs.toString()}`));
    if (!res.ok)
        throw new Error(res.error || '设备列表加载失败');
    return res;
}
export async function fetchAdminDeviceDetail(deviceId) {
    const res = await fetchJSON(withToken(`/api/v1/admin/devices/${encodeURIComponent(deviceId)}`));
    if (!res.ok)
        throw new Error(res.error || '设备详情加载失败');
    return res;
}
export async function fetchAdminUsers(params) {
    const qs = new URLSearchParams();
    qs.set('page', String(params.page || 1));
    qs.set('page_size', String(params.pageSize || 20));
    if (params.q)
        qs.set('q', params.q);
    const res = await fetchJSON(withToken(`/api/v1/admin/mp/users?${qs.toString()}`));
    if (!res.ok)
        throw new Error(res.error || '用户列表加载失败');
    return res;
}
export async function fetchAdminUserDetail(userId) {
    const res = await fetchJSON(withToken(`/api/v1/admin/mp/users/${encodeURIComponent(String(userId))}`));
    if (!res.ok)
        throw new Error(res.error || '用户详情加载失败');
    return res;
}
export async function bindUserDevice(params) {
    const res = await fetchJSON(withToken('/api/v1/admin/bind'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
    });
    if (!res.ok)
        throw new Error(res.error || '绑定失败');
    return res;
}
export async function unbindUserDevice(params) {
    const res = await fetchJSON(withToken('/api/v1/admin/unbind'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
    });
    if (!res.ok)
        throw new Error(res.error || '解绑失败');
    return res;
}
export async function fetchLiveStandings(sourceUrl) {
    const qs = new URLSearchParams();
    if (sourceUrl)
        qs.set('source_url', sourceUrl);
    const suffix = qs.toString();
    const res = await fetchJSON(withToken(`/api/v1/admin/motorsport/live-standings${suffix ? `?${suffix}` : ''}`));
    if (!res.ok)
        throw new Error(res.error || '榜单加载失败');
    return res;
}
export async function fetchF1LiveTiming() {
    const res = await fetchJSON(withToken('/api/v1/admin/f1/live-timing'));
    if (!res.ok)
        throw new Error(res.error || 'Live timing 加载失败');
    return res;
}
export async function fetchDashboardSummary(timezone) {
    const [news, devices, users, live] = await Promise.all([
        fetchMpNewsList({ page: 1, pageSize: 5, tz: timezone }),
        fetchAdminDevices({ page: 1, pageSize: 5 }),
        fetchAdminUsers({ page: 1, pageSize: 5 }),
        fetchF1LiveTiming(),
    ]);
    return {
        newsTotal: news.total || 0,
        deviceTotal: devices.total || 0,
        userTotal: users.total || 0,
        liveConnected: Boolean(live.status?.connected),
        liveRows: live.status?.rows?.length || 0,
        latestNews: news.items || [],
        latestDevices: devices.items || [],
        latestUsers: users.items || [],
    };
}
