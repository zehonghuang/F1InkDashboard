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
    const hasQuery = url.includes('?');
    return url + (hasQuery ? '&' : '?') + new URLSearchParams({ token }).toString();
}
export async function fetchJSON(path, init) {
    const url = getApiBase() + path;
    const r = await fetch(url, init);
    if (!r.ok)
        throw new Error(`HTTP ${r.status}`);
    const ct = (r.headers.get('content-type') || '').toLowerCase();
    if (!ct.includes('application/json')) {
        const text = await r.text();
        const head = text.slice(0, 120).replace(/\s+/g, ' ').trim();
        throw new Error(`响应不是 JSON（content-type=${ct || 'unknown'}），可能 API_BASE 未设置或未代理到后端：${head}`);
    }
    return (await r.json());
}
