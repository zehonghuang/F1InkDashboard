import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { bindUserDevice, fetchAdminDeviceDetail, fetchAdminDevices, fetchAdminUserDetail, fetchAdminUsers, fetchDashboardSummary, fetchF1LiveTiming, fetchLiveStandings, fetchMpNewsDetail, fetchMpNewsList, getStoredSettings, resetStoredSettings, saveMpNews, saveStoredSettings, unbindUserDevice, } from '@/api';
import { formatDateTime, formatShort, renderNewsContent } from '@/lib/utils';
const route = useRoute();
const router = useRouter();
const branchName = 'feature/admin-v2';
const standingsDefaultUrl = 'https://www.motorsport.com/f1/live-text/f1-barcelona-gp-live-commentary-and-updates-qualifying/1127045/';
const navItems = [
    { key: 'dashboard', title: '总览', description: '旧版能力盘点 + V2 当前状态', badge: 'V2', icon: '◎', routeName: 'dashboard' },
    { key: 'news', title: '新闻中台', description: '筛选、预览、设置 Hero / Banner', badge: '内容', icon: '✦', routeName: 'news-list' },
    { key: 'devices', title: '设备中心', description: '设备详情与用户绑定维护', badge: '硬件', icon: '◌', routeName: 'devices-list' },
    { key: 'users', title: '用户中心', description: '用户资料与绑定设备联查', badge: '小程序', icon: '◍', routeName: 'users-list' },
    { key: 'live', title: '赛事实验室', description: 'F1 Live Timing 与榜单调试', badge: 'Live', icon: '◈', routeName: 'f1-live-timing-demo' },
    { key: 'settings', title: '设置', description: 'API、Token、主题与时区', badge: '连接', icon: '⚙', routeName: 'settings' },
];
const pageMeta = {
    dashboard: {
        title: 'Admin V2 总览',
        subtitle: '先梳理旧版 admin 的真实页面功能，再按业务工作流重组为统一后台。',
    },
    news: {
        title: '新闻中台',
        subtitle: '将旧版的新闻列表、详情、编辑三页合并为一体化工作台，减少来回跳转。',
    },
    devices: {
        title: '设备中心',
        subtitle: '保留设备列表、设备详情、手动绑定与解绑能力，并强化状态可读性。',
    },
    users: {
        title: '用户中心',
        subtitle: '把用户列表、用户详情和设备关联整合到同一条排障路径里。',
    },
    live: {
        title: '赛事实验室',
        subtitle: '收纳旧版 F1 Live Timing Demo 与 Live Standings Demo，用于调试赛事数据链路。',
    },
    settings: {
        title: '连接设置',
        subtitle: '延续旧版 API Base / Token / 时区设定，同时加入主题切换与运行提示。',
    },
};
const currentView = ref('dashboard');
const currentLiveTab = ref('f1');
const settings = reactive(getStoredSettings());
const flash = reactive({
    text: '',
    tone: 'success',
});
const dashboardLoading = ref(false);
const dashboardError = ref('');
const dashboardSummary = ref(null);
const newsLoading = ref(false);
const newsSaving = ref(false);
const newsError = ref('');
const newsItems = ref([]);
const newsTotal = ref(0);
const newsPage = ref(1);
const newsPageSize = ref(20);
const newsSelectedId = ref('');
const selectedNews = ref(null);
const newsFilters = reactive({
    q: '',
    tag: '',
    typeCode: '',
    layoutCode: '',
    pinned: '',
    since: '',
});
const newsEditor = reactive({
    title: '',
    summary: '',
    tag_text: '',
    type_code: '',
    layout_code: '',
    hero_display_code: '',
    pinned: false,
    weight: 0,
    published_at: '',
    cover_url: '',
    source_name: '',
    source_url: '',
});
const devicesLoading = ref(false);
const devicesSaving = ref(false);
const devicesError = ref('');
const deviceItems = ref([]);
const devicesTotal = ref(0);
const deviceSelectedId = ref('');
const selectedDevice = ref(null);
const devicesSearch = ref('');
const deviceBindUserId = ref('');
const usersLoading = ref(false);
const usersSaving = ref(false);
const usersError = ref('');
const userItems = ref([]);
const usersTotal = ref(0);
const userSelectedId = ref(null);
const selectedUser = ref(null);
const usersSearch = ref('');
const userBindDeviceId = ref('');
const liveLoading = ref(false);
const liveError = ref('');
const f1Snapshot = ref(null);
const liveStandings = ref(null);
const standingsSourceUrl = ref(standingsDefaultUrl);
const liveAutoRefresh = ref(false);
let liveTimer;
const loadedFlags = reactive({
    dashboard: false,
    news: false,
    devices: false,
    users: false,
    live: false,
    settings: true,
});
const currentMeta = computed(() => pageMeta[currentView.value]);
const activeNav = computed(() => navItems.find((item) => item.key === currentView.value) || navItems[0]);
const effectiveApiBase = computed(() => settings.apiBase.trim() || '同域');
const themeLabel = computed(() => (settings.theme === 'dark' ? '深色' : '浅色'));
const newsPreviewHtml = computed(() => renderNewsContent(selectedNews.value));
const latestMessages = computed(() => (f1Snapshot.value?.race_control_messages || []).slice(0, 5));
const topTimingRows = computed(() => (f1Snapshot.value?.rows || []).slice(0, 10));
function setFlash(text, tone = 'success') {
    flash.text = text;
    flash.tone = tone;
    window.clearTimeout(setFlash.timer);
    setFlash.timer = window.setTimeout(() => {
        flash.text = '';
    }, 3000);
}
function applyTheme(theme) {
    document.documentElement.classList.remove('dark');
    if (theme === 'dark') {
        document.documentElement.classList.add('dark');
    }
}
function escapeHtml(value) {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}
function renderRichNode(node) {
    const tag = String(node.name || node.type || 'p').toLowerCase();
    const children = Array.isArray(node.children)
        ? node.children.map(renderRichNode).join('')
        : typeof node.children === 'string'
            ? escapeHtml(node.children)
            : node.children && typeof node.children === 'object'
                ? renderRichNode(node.children)
                : escapeHtml(node.text || '');
    if (tag === 'text')
        return escapeHtml(node.text || '');
    if (tag === 'bullet_list' || tag === 'ul')
        return `<ul>${children}</ul>`;
    if (tag === 'ordered_list' || tag === 'ol')
        return `<ol>${children}</ol>`;
    if (tag === 'list_item' || tag === 'li')
        return `<li>${children}</li>`;
    if (tag === 'heading' || tag === 'h2' || tag === 'h3')
        return `<h3>${children}</h3>`;
    if (tag === 'blockquote')
        return `<blockquote>${children}</blockquote>`;
    if (tag === 'paragraph' || tag === 'p')
        return `<p>${children}</p>`;
    return `<p>${children}</p>`;
}
function syncNewsEditor(item) {
    newsEditor.title = item.title || '';
    newsEditor.summary = item.summary || '';
    newsEditor.tag_text = item.tag_text || '';
    newsEditor.type_code = item.type_code || '';
    newsEditor.layout_code = item.layout_code || '';
    newsEditor.hero_display_code = item.hero_display_code || '';
    newsEditor.pinned = Boolean(item.pinned);
    newsEditor.weight = Number(item.weight || 0);
    newsEditor.published_at = item.published_at || '';
    newsEditor.cover_url = item.cover_url || '';
    newsEditor.source_name = item.source?.name || '';
    newsEditor.source_url = item.source?.url || '';
}
function buildNewsPayload(patch = {}) {
    if (!selectedNews.value) {
        throw new Error('请先选择一篇新闻');
    }
    const payload = {
        ...selectedNews.value,
        ...patch,
        title: newsEditor.title.trim(),
        summary: newsEditor.summary.trim(),
        tag_text: newsEditor.tag_text.trim(),
        type_code: newsEditor.type_code.trim(),
        layout_code: newsEditor.layout_code.trim(),
        hero_display_code: newsEditor.hero_display_code.trim(),
        pinned: Boolean(newsEditor.pinned),
        weight: Number(newsEditor.weight || 0),
        published_at: newsEditor.published_at.trim(),
        cover_url: newsEditor.cover_url.trim(),
        time_text: selectedNews.value.time_text || '',
    };
    const sourceName = newsEditor.source_name.trim();
    const sourceUrl = newsEditor.source_url.trim();
    if (sourceName || sourceUrl) {
        payload.source = { name: sourceName, url: sourceUrl || undefined };
    }
    else {
        delete payload.source;
    }
    if (!payload.hero_display_code) {
        delete payload.hero_display_code;
    }
    return payload;
}
async function loadDashboard(force = false) {
    if (dashboardLoading.value || (loadedFlags.dashboard && !force))
        return;
    dashboardLoading.value = true;
    dashboardError.value = '';
    try {
        dashboardSummary.value = await fetchDashboardSummary(settings.timezone);
        loadedFlags.dashboard = true;
    }
    catch (error) {
        dashboardError.value = error instanceof Error ? error.message : '总览加载失败';
    }
    finally {
        dashboardLoading.value = false;
    }
}
async function loadNews(force = false) {
    if (newsLoading.value || (loadedFlags.news && !force && newsItems.value.length > 0))
        return;
    newsLoading.value = true;
    newsError.value = '';
    try {
        const res = await fetchMpNewsList({
            page: newsPage.value,
            pageSize: newsPageSize.value,
            q: newsFilters.q.trim() || undefined,
            tag: newsFilters.tag.trim() || undefined,
            typeCode: newsFilters.typeCode.trim() || undefined,
            layoutCode: newsFilters.layoutCode.trim() || undefined,
            pinned: newsFilters.pinned || undefined,
            since: newsFilters.since.trim() || undefined,
            tz: settings.timezone,
        });
        newsItems.value = res.items || [];
        newsTotal.value = res.total || 0;
        loadedFlags.news = true;
        const routeId = String(route.params.id || '');
        const initialId = routeId || newsSelectedId.value || newsItems.value[0]?.id || '';
        if (initialId) {
            await openNews(initialId);
        }
    }
    catch (error) {
        newsError.value = error instanceof Error ? error.message : '新闻列表加载失败';
    }
    finally {
        newsLoading.value = false;
    }
}
async function openNews(id) {
    if (!id)
        return;
    newsSelectedId.value = id;
    newsError.value = '';
    try {
        const res = await fetchMpNewsDetail({ id, tz: settings.timezone });
        selectedNews.value = res.item;
        syncNewsEditor(res.item);
    }
    catch (error) {
        newsError.value = error instanceof Error ? error.message : '新闻详情加载失败';
    }
}
async function persistSelectedNews(patch = {}) {
    if (!selectedNews.value)
        return;
    newsSaving.value = true;
    newsError.value = '';
    try {
        const payload = buildNewsPayload(patch);
        await saveMpNews(payload);
        setFlash('新闻已更新');
        await Promise.all([openNews(payload.id), loadNews(true), loadDashboard(true)]);
    }
    catch (error) {
        newsError.value = error instanceof Error ? error.message : '新闻保存失败';
        setFlash(newsError.value, 'danger');
    }
    finally {
        newsSaving.value = false;
    }
}
async function loadDevices(force = false) {
    if (devicesLoading.value || (loadedFlags.devices && !force && deviceItems.value.length > 0))
        return;
    devicesLoading.value = true;
    devicesError.value = '';
    try {
        const res = await fetchAdminDevices({ page: 1, pageSize: 24, q: devicesSearch.value.trim() || undefined });
        deviceItems.value = res.items || [];
        devicesTotal.value = res.total || 0;
        loadedFlags.devices = true;
        const routeDeviceId = String(route.params.device_id || '');
        const initialId = routeDeviceId || deviceSelectedId.value || deviceItems.value[0]?.device_id || '';
        if (initialId) {
            await openDevice(initialId);
        }
    }
    catch (error) {
        devicesError.value = error instanceof Error ? error.message : '设备列表加载失败';
    }
    finally {
        devicesLoading.value = false;
    }
}
async function openDevice(deviceId) {
    if (!deviceId)
        return;
    deviceSelectedId.value = deviceId;
    devicesError.value = '';
    try {
        const res = await fetchAdminDeviceDetail(deviceId);
        selectedDevice.value = res.item;
        deviceBindUserId.value = res.item.bound_user?.id ? String(res.item.bound_user.id) : '';
    }
    catch (error) {
        devicesError.value = error instanceof Error ? error.message : '设备详情加载失败';
    }
}
async function bindDeviceToUser() {
    if (!selectedDevice.value || !deviceBindUserId.value.trim())
        return;
    devicesSaving.value = true;
    devicesError.value = '';
    try {
        await bindUserDevice({ device_id: selectedDevice.value.device_id, user_id: Number(deviceBindUserId.value) });
        setFlash('设备绑定已更新');
        await Promise.all([openDevice(selectedDevice.value.device_id), loadDevices(true), loadUsers(true), loadDashboard(true)]);
    }
    catch (error) {
        devicesError.value = error instanceof Error ? error.message : '设备绑定失败';
        setFlash(devicesError.value, 'danger');
    }
    finally {
        devicesSaving.value = false;
    }
}
async function unbindDevice() {
    if (!selectedDevice.value)
        return;
    devicesSaving.value = true;
    devicesError.value = '';
    try {
        await unbindUserDevice({ device_id: selectedDevice.value.device_id });
        setFlash('设备已解绑');
        await Promise.all([openDevice(selectedDevice.value.device_id), loadDevices(true), loadUsers(true), loadDashboard(true)]);
    }
    catch (error) {
        devicesError.value = error instanceof Error ? error.message : '设备解绑失败';
        setFlash(devicesError.value, 'danger');
    }
    finally {
        devicesSaving.value = false;
    }
}
async function loadUsers(force = false) {
    if (usersLoading.value || (loadedFlags.users && !force && userItems.value.length > 0))
        return;
    usersLoading.value = true;
    usersError.value = '';
    try {
        const res = await fetchAdminUsers({ page: 1, pageSize: 24, q: usersSearch.value.trim() || undefined });
        userItems.value = res.items || [];
        usersTotal.value = res.total || 0;
        loadedFlags.users = true;
        const routeUserId = route.params.user_id ? Number(route.params.user_id) : null;
        const initialId = routeUserId ?? userSelectedId.value ?? userItems.value[0]?.id ?? null;
        if (initialId !== null) {
            await openUser(initialId);
        }
    }
    catch (error) {
        usersError.value = error instanceof Error ? error.message : '用户列表加载失败';
    }
    finally {
        usersLoading.value = false;
    }
}
async function openUser(userId) {
    if (!userId)
        return;
    userSelectedId.value = userId;
    usersError.value = '';
    try {
        const res = await fetchAdminUserDetail(userId);
        selectedUser.value = res.item;
        userBindDeviceId.value = res.item.device?.device_id || '';
    }
    catch (error) {
        usersError.value = error instanceof Error ? error.message : '用户详情加载失败';
    }
}
async function bindUserToDevice() {
    if (!selectedUser.value || !userBindDeviceId.value.trim())
        return;
    usersSaving.value = true;
    usersError.value = '';
    try {
        await bindUserDevice({ user_id: selectedUser.value.id, device_id: userBindDeviceId.value.trim() });
        setFlash('用户绑定已更新');
        await Promise.all([openUser(selectedUser.value.id), loadUsers(true), loadDevices(true), loadDashboard(true)]);
    }
    catch (error) {
        usersError.value = error instanceof Error ? error.message : '用户绑定失败';
        setFlash(usersError.value, 'danger');
    }
    finally {
        usersSaving.value = false;
    }
}
async function unbindUser() {
    if (!selectedUser.value)
        return;
    usersSaving.value = true;
    usersError.value = '';
    try {
        await unbindUserDevice({ user_id: selectedUser.value.id });
        setFlash('用户已解绑');
        await Promise.all([openUser(selectedUser.value.id), loadUsers(true), loadDevices(true), loadDashboard(true)]);
    }
    catch (error) {
        usersError.value = error instanceof Error ? error.message : '用户解绑失败';
        setFlash(usersError.value, 'danger');
    }
    finally {
        usersSaving.value = false;
    }
}
function clearLiveTimer() {
    if (liveTimer !== undefined) {
        window.clearInterval(liveTimer);
        liveTimer = undefined;
    }
}
async function loadLiveF1(force = false) {
    if (liveLoading.value || (loadedFlags.live && currentLiveTab.value === 'f1' && f1Snapshot.value && !force))
        return;
    liveLoading.value = true;
    liveError.value = '';
    try {
        const res = await fetchF1LiveTiming();
        f1Snapshot.value = res.status;
        loadedFlags.live = true;
    }
    catch (error) {
        liveError.value = error instanceof Error ? error.message : 'F1 Live Timing 加载失败';
    }
    finally {
        liveLoading.value = false;
    }
}
async function loadStandings(force = false) {
    if (liveLoading.value || (liveStandings.value && !force))
        return;
    liveLoading.value = true;
    liveError.value = '';
    try {
        liveStandings.value = await fetchLiveStandings({ sourceUrl: standingsSourceUrl.value.trim() || undefined });
        loadedFlags.live = true;
    }
    catch (error) {
        liveError.value = error instanceof Error ? error.message : '榜单抓取失败';
    }
    finally {
        liveLoading.value = false;
    }
}
function saveSettings() {
    saveStoredSettings({
        apiBase: settings.apiBase,
        token: settings.token,
        timezone: settings.timezone,
        theme: settings.theme,
    });
    applyTheme(settings.theme);
    setFlash('设置已保存，后续请求将使用新配置');
}
function restoreDefaultSettings() {
    resetStoredSettings();
    const next = getStoredSettings();
    settings.apiBase = next.apiBase;
    settings.token = next.token;
    settings.timezone = next.timezone;
    settings.theme = next.theme;
    applyTheme(settings.theme);
    setFlash('已恢复默认配置');
}
function switchView(view) {
    const item = navItems.find((n) => n.key === view);
    if (!item)
        return;
    void router.push({ name: item.routeName });
}
function toggleTheme() {
    settings.theme = settings.theme === 'dark' ? 'light' : 'dark';
}
function refreshCurrentView() {
    if (currentView.value === 'dashboard')
        void loadDashboard(true);
    if (currentView.value === 'news')
        void loadNews(true);
    if (currentView.value === 'devices')
        void loadDevices(true);
    if (currentView.value === 'users')
        void loadUsers(true);
    if (currentView.value === 'live') {
        if (currentLiveTab.value === 'f1')
            void loadLiveF1(true);
        else
            void loadStandings(true);
    }
}
function jumpToUser(userId) {
    if (!userId)
        return;
    void router.push({ name: 'users-detail', params: { user_id: userId } });
}
function jumpToDevice(deviceId) {
    if (!deviceId)
        return;
    void router.push({ name: 'devices-detail', params: { device_id: deviceId } });
}
watch(() => settings.theme, (theme) => applyTheme(theme), { immediate: true });
watch(() => [route.name, route.meta, route.params], () => {
    const viewKey = route.meta?.viewKey || 'dashboard';
    const liveTab = route.meta?.liveTab || 'f1';
    currentView.value = viewKey;
    currentLiveTab.value = liveTab;
    if (viewKey === 'news') {
        const id = String(route.params.id || '');
        if (id)
            void openNews(id);
    }
    else if (viewKey === 'devices') {
        const deviceId = String(route.params.device_id || '');
        if (deviceId)
            void openDevice(deviceId);
    }
    else if (viewKey === 'users') {
        const uid = route.params.user_id ? Number(route.params.user_id) : null;
        if (uid)
            void openUser(uid);
    }
}, { immediate: true, deep: true });
watch([() => currentView.value, () => currentLiveTab.value, () => route.name], ([view, tab, name]) => {
    if (view === 'dashboard')
        void loadDashboard();
    if (view === 'news')
        void loadNews();
    if (view === 'devices')
        void loadDevices();
    if (view === 'users')
        void loadUsers();
    if (view === 'live') {
        if (tab === 'f1')
            void loadLiveF1();
        else
            void loadStandings();
    }
}, { immediate: true });
watch([() => currentView.value, () => currentLiveTab.value, () => liveAutoRefresh.value], ([view, tab, auto]) => {
    clearLiveTimer();
    if (view === 'live' && tab === 'f1' && auto) {
        liveTimer = window.setInterval(() => {
            void loadLiveF1(true);
        }, 10000);
    }
}, { immediate: true });
onMounted(() => {
    void loadDashboard();
});
onBeforeUnmount(() => {
    clearLiveTimer();
});
function _formatDateTime(v) {
    return formatDateTime(v, settings.timezone);
}
function _formatShort(v) {
    return formatShort(v, settings.timezone);
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "app-shell" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "app-frame" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.aside, __VLS_intrinsicElements.aside)({
    ...{ class: "sidebar" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "brand-card" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "brand-top" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "brand-badge" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "eyebrow" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "brand-title" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "brand-subtitle" },
});
(__VLS_ctx.branchName);
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "brand-subtitle" },
    ...{ style: {} },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "nav-group" },
});
for (const [item] of __VLS_getVForSourceType((__VLS_ctx.navItems))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.switchView(item.key);
            } },
        key: (item.key),
        ...{ class: "nav-button" },
        ...{ class: ({ 'is-active': __VLS_ctx.currentView === item.key }) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "nav-icon" },
    });
    (item.icon);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "nav-copy" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (item.title);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (item.description);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "nav-badge" },
    });
    (item.badge);
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "sidebar-footer" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.refreshCurrentView) },
    ...{ class: "primary-button" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.toggleTheme) },
    ...{ class: "ghost-button" },
});
(__VLS_ctx.settings.theme === 'dark' ? '浅色' : '深色');
__VLS_asFunctionalElement(__VLS_intrinsicElements.main, __VLS_intrinsicElements.main)({
    ...{ class: "content" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
    ...{ class: "topbar" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "eyebrow" },
});
(__VLS_ctx.activeNav.badge);
(__VLS_ctx.themeLabel);
__VLS_asFunctionalElement(__VLS_intrinsicElements.h1, __VLS_intrinsicElements.h1)({
    ...{ class: "page-title" },
});
(__VLS_ctx.currentMeta.title);
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "page-subtitle" },
});
(__VLS_ctx.currentMeta.subtitle);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "topbar-actions" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "theme-chip" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
(__VLS_ctx.effectiveApiBase);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "theme-chip" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
(__VLS_ctx.settings.timezone);
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.refreshCurrentView) },
    ...{ class: "secondary-button" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "page-body" },
});
if (__VLS_ctx.flash.text) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "alert" },
        ...{ style: (__VLS_ctx.flash.tone === 'success' ? 'color:var(--success);border-color:color-mix(in srgb,var(--success) 18%, transparent);background:color-mix(in srgb,var(--success) 10%, var(--surface));' : '') },
    });
    (__VLS_ctx.flash.text);
}
if (__VLS_ctx.currentView === 'dashboard') {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "hero-card" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "hero-grid" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "eyebrow" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({
        ...{ class: "hero-title" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "hero-text" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "hero-points" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "hero-point" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "field-hint" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "hero-point" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "field-hint" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "hero-point" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "field-hint" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "hero-point" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "field-hint" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "surface-card" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "card-title-row" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "eyebrow" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({
        ...{ class: "card-title" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "settings-list" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "setting-row" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "field-hint" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "badge" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "setting-row" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "field-hint" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "badge" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "setting-row" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "field-hint" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "badge" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "setting-row" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "field-hint" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "badge" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "metric-grid" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "stat-card" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "eyebrow" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "stat-value" },
    });
    (__VLS_ctx.dashboardSummary?.newsTotal ?? '--');
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "stat-note" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "stat-card" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "eyebrow" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "stat-value" },
    });
    (__VLS_ctx.dashboardSummary?.deviceTotal ?? '--');
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "stat-note" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "stat-card" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "eyebrow" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "stat-value" },
    });
    (__VLS_ctx.dashboardSummary?.userTotal ?? '--');
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "stat-note" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "stat-card" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "eyebrow" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "stat-value" },
    });
    (__VLS_ctx.dashboardSummary?.liveRows ?? '--');
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "stat-note" },
    });
    (__VLS_ctx.dashboardSummary?.liveConnected ? '当前已连接实时通道' : '当前未连接实时通道');
    if (__VLS_ctx.dashboardError) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "alert" },
        });
        (__VLS_ctx.dashboardError);
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "summary-grid" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "surface-card" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "card-title-row" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "eyebrow" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({
        ...{ class: "card-title" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.currentView === 'dashboard'))
                    return;
                __VLS_ctx.switchView('news');
            } },
        ...{ class: "tiny-button" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "mini-feed" },
    });
    for (const [item] of __VLS_getVForSourceType((__VLS_ctx.dashboardSummary?.latestNews || []))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            key: (item.id),
            ...{ class: "feed-item" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (item.title);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "feed-meta" },
        });
        (item.tag_text || '未分类');
        (__VLS_ctx._formatShort(item.published_at));
    }
    if (!(__VLS_ctx.dashboardSummary?.latestNews || []).length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "empty-state" },
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "surface-card" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "card-title-row" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "eyebrow" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({
        ...{ class: "card-title" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "mini-feed" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "feed-item" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "feed-meta" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "feed-item" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "feed-meta" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "feed-item" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "feed-meta" },
    });
}
else if (__VLS_ctx.currentView === 'news') {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "toolbar-card" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "card-title-row" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "eyebrow" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({
        ...{ class: "card-title" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "filters" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "field" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        ...{ class: "text-input" },
        placeholder: "标题 / 摘要 / 标签",
    });
    (__VLS_ctx.newsFilters.q);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "field" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        ...{ class: "text-input" },
        placeholder: "精确或模糊匹配",
    });
    (__VLS_ctx.newsFilters.tag);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "field" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        ...{ class: "text-input" },
        placeholder: "例如 PADDOCK",
    });
    (__VLS_ctx.newsFilters.typeCode);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "field" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        ...{ class: "text-input" },
        placeholder: "例如 HERO / FEATURE",
    });
    (__VLS_ctx.newsFilters.layoutCode);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "field" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.select, __VLS_intrinsicElements.select)({
        value: (__VLS_ctx.newsFilters.pinned),
        ...{ class: "select-input" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
        value: "",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
        value: "1",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
        value: "0",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "field" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        ...{ class: "text-input" },
        placeholder: "RFC3339 时间",
    });
    (__VLS_ctx.newsFilters.since);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "toolbar-actions" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!!(__VLS_ctx.currentView === 'dashboard'))
                    return;
                if (!(__VLS_ctx.currentView === 'news'))
                    return;
                __VLS_ctx.loadNews(true);
            } },
        ...{ class: "primary-button" },
        disabled: (__VLS_ctx.newsLoading),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!!(__VLS_ctx.currentView === 'dashboard'))
                    return;
                if (!(__VLS_ctx.currentView === 'news'))
                    return;
                __VLS_ctx.switchView('dashboard');
            } },
        ...{ class: "secondary-button" },
    });
    if (__VLS_ctx.newsError) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "alert" },
        });
        (__VLS_ctx.newsError);
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "split-view" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "surface-card news-table" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "card-title-row" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "eyebrow" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({
        ...{ class: "card-title" },
    });
    (__VLS_ctx.newsTotal);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "badge" },
    });
    (__VLS_ctx.newsLoading ? '加载中' : `每页 ${__VLS_ctx.newsPageSize}`);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "table-shell" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "table-header" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    for (const [item] of __VLS_getVForSourceType((__VLS_ctx.newsItems))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.currentView === 'dashboard'))
                        return;
                    if (!(__VLS_ctx.currentView === 'news'))
                        return;
                    __VLS_ctx.openNews(item.id);
                } },
            key: (item.id),
            ...{ class: "table-row" },
            ...{ class: ({ 'is-selected': __VLS_ctx.newsSelectedId === item.id }) },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "badge" },
        });
        (item.tag_text || '未分类');
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "table-title" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (item.title);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (item.summary || '暂无摘要');
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        (item.layout_code || '--');
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        (item.type_code || '--');
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "status-pill" },
            ...{ class: (item.pinned ? 'is-primary' : '') },
        });
        (item.pinned ? '置顶' : '普通');
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        (__VLS_ctx._formatShort(item.published_at));
    }
    if (__VLS_ctx.selectedNews) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
            ...{ class: "detail-card" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "card-title-row" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "eyebrow" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({
            ...{ class: "card-title" },
        });
        (__VLS_ctx.selectedNews.title);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "status-pill" },
            ...{ class: (__VLS_ctx.selectedNews.layout_code === 'HERO' ? 'is-primary' : '') },
        });
        (__VLS_ctx.selectedNews.layout_code || '--');
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "action-row" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.currentView === 'dashboard'))
                        return;
                    if (!(__VLS_ctx.currentView === 'news'))
                        return;
                    if (!(__VLS_ctx.selectedNews))
                        return;
                    __VLS_ctx.persistSelectedNews({ layout_code: 'HERO', hero_display_code: '' });
                } },
            ...{ class: "primary-button" },
            disabled: (__VLS_ctx.newsSaving),
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.currentView === 'dashboard'))
                        return;
                    if (!(__VLS_ctx.currentView === 'news'))
                        return;
                    if (!(__VLS_ctx.selectedNews))
                        return;
                    __VLS_ctx.persistSelectedNews({ layout_code: 'HERO', hero_display_code: 'BANNER' });
                } },
            ...{ class: "secondary-button" },
            disabled: (__VLS_ctx.newsSaving),
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.currentView === 'dashboard'))
                        return;
                    if (!(__VLS_ctx.currentView === 'news'))
                        return;
                    if (!(__VLS_ctx.selectedNews))
                        return;
                    __VLS_ctx.persistSelectedNews({ layout_code: 'FEATURE', hero_display_code: '' });
                } },
            ...{ class: "ghost-button" },
            disabled: (__VLS_ctx.newsSaving),
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "detail-grid" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "detail-item" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "eyebrow" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (__VLS_ctx._formatDateTime(__VLS_ctx.selectedNews.published_at));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "detail-item" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "eyebrow" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (__VLS_ctx.selectedNews.source?.name || '未设置来源');
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "detail-item" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "eyebrow" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (__VLS_ctx.selectedNews.tag_text || '未设置');
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "detail-item" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "eyebrow" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (__VLS_ctx.selectedNews.weight || 0);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "preview-card" },
        });
        if (__VLS_ctx.selectedNews.cover_url) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.img)({
                src: (__VLS_ctx.selectedNews.cover_url),
                alt: "",
                ...{ class: "preview-cover" },
            });
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "eyebrow" },
            ...{ style: {} },
        });
        (__VLS_ctx.selectedNews.tag_text || '内容预览');
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({
            ...{ class: "preview-title" },
        });
        (__VLS_ctx.selectedNews.title);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "feed-meta" },
        });
        (__VLS_ctx.selectedNews.source?.name || '未设置来源');
        (__VLS_ctx._formatDateTime(__VLS_ctx.selectedNews.published_at));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div)({
            ...{ class: "preview-html" },
            ...{ style: {} },
        });
        __VLS_asFunctionalDirective(__VLS_directives.vHtml)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.newsPreviewHtml) }, null, null);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
            ...{ class: "panel" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "card-title-row" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "eyebrow" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({
            ...{ class: "card-title" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.currentView === 'dashboard'))
                        return;
                    if (!(__VLS_ctx.currentView === 'news'))
                        return;
                    if (!(__VLS_ctx.selectedNews))
                        return;
                    __VLS_ctx.persistSelectedNews();
                } },
            ...{ class: "primary-button" },
            disabled: (__VLS_ctx.newsSaving),
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "field-inline" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "field" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
            ...{ class: "text-input" },
        });
        (__VLS_ctx.newsEditor.title);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "field" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
            ...{ class: "text-input" },
        });
        (__VLS_ctx.newsEditor.tag_text);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "field" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.textarea)({
            value: (__VLS_ctx.newsEditor.summary),
            ...{ class: "textarea-input" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "field-inline" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "field" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
            ...{ class: "text-input" },
        });
        (__VLS_ctx.newsEditor.type_code);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "field" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
            ...{ class: "text-input" },
        });
        (__VLS_ctx.newsEditor.layout_code);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "field-inline" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "field" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
            ...{ class: "text-input" },
            placeholder: "BANNER 或留空",
        });
        (__VLS_ctx.newsEditor.hero_display_code);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "field" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
            ...{ class: "text-input" },
        });
        (__VLS_ctx.newsEditor.published_at);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "field-inline" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "field" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
            ...{ class: "text-input" },
        });
        (__VLS_ctx.newsEditor.cover_url);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "field" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
            type: "number",
            ...{ class: "text-input" },
        });
        (__VLS_ctx.newsEditor.weight);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "field-inline" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "field" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
            ...{ class: "text-input" },
        });
        (__VLS_ctx.newsEditor.source_name);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "field" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
            ...{ class: "text-input" },
        });
        (__VLS_ctx.newsEditor.source_url);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
            ...{ class: "theme-chip" },
            ...{ style: {} },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
            type: "checkbox",
        });
        (__VLS_ctx.newsEditor.pinned);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
            ...{ class: "empty-state" },
        });
    }
}
else if (__VLS_ctx.currentView === 'devices') {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "toolbar-card" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "card-title-row" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "eyebrow" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({
        ...{ class: "card-title" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "filters" },
        ...{ style: {} },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "field" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        ...{ class: "text-input" },
        placeholder: "输入关键词后查询",
    });
    (__VLS_ctx.devicesSearch);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "toolbar-actions" },
        ...{ style: {} },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!!(__VLS_ctx.currentView === 'dashboard'))
                    return;
                if (!!(__VLS_ctx.currentView === 'news'))
                    return;
                if (!(__VLS_ctx.currentView === 'devices'))
                    return;
                __VLS_ctx.loadDevices(true);
            } },
        ...{ class: "primary-button" },
        disabled: (__VLS_ctx.devicesLoading),
    });
    if (__VLS_ctx.devicesError) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "alert" },
        });
        (__VLS_ctx.devicesError);
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "split-view" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "surface-card devices-table" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "card-title-row" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "eyebrow" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({
        ...{ class: "card-title" },
    });
    (__VLS_ctx.devicesTotal);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "badge" },
    });
    (__VLS_ctx.devicesLoading ? '加载中' : '已就绪');
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "table-shell" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "table-header" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    for (const [item] of __VLS_getVForSourceType((__VLS_ctx.deviceItems))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.currentView === 'dashboard'))
                        return;
                    if (!!(__VLS_ctx.currentView === 'news'))
                        return;
                    if (!(__VLS_ctx.currentView === 'devices'))
                        return;
                    __VLS_ctx.openDevice(item.device_id);
                } },
            key: (item.device_id),
            ...{ class: "table-row" },
            ...{ class: ({ 'is-selected': __VLS_ctx.deviceSelectedId === item.device_id }) },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "table-title" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (item.device_id);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (item.device_uuid || item.mac || '暂无附加标识');
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        (item.board_type || '--');
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        (item.fw_user_agent || '--');
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        (__VLS_ctx._formatShort(item.last_seen_at));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        (item.bound_user?.nick_name || item.bound_user?.openid || '未绑定');
    }
    if (__VLS_ctx.selectedDevice) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
            ...{ class: "detail-card" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "card-title-row" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "eyebrow" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({
            ...{ class: "card-title" },
        });
        (__VLS_ctx.selectedDevice.device_id);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "status-pill" },
            ...{ class: (__VLS_ctx.selectedDevice.bound_user ? 'is-primary' : '') },
        });
        (__VLS_ctx.selectedDevice.bound_user ? '已绑定' : '未绑定');
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "detail-grid" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "detail-item" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "eyebrow" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (__VLS_ctx.selectedDevice.board_type || '--');
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "detail-item" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "eyebrow" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (__VLS_ctx.selectedDevice.fw_user_agent || '--');
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "detail-item" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "eyebrow" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (__VLS_ctx._formatDateTime(__VLS_ctx.selectedDevice.first_seen_at));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "detail-item" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "eyebrow" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (__VLS_ctx._formatDateTime(__VLS_ctx.selectedDevice.last_seen_at));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
            ...{ class: "panel" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "card-title-row" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "eyebrow" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({
            ...{ class: "card-title" },
        });
        if (__VLS_ctx.selectedDevice.bound_user?.id) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!!(__VLS_ctx.currentView === 'dashboard'))
                            return;
                        if (!!(__VLS_ctx.currentView === 'news'))
                            return;
                        if (!(__VLS_ctx.currentView === 'devices'))
                            return;
                        if (!(__VLS_ctx.selectedDevice))
                            return;
                        if (!(__VLS_ctx.selectedDevice.bound_user?.id))
                            return;
                        __VLS_ctx.jumpToUser(__VLS_ctx.selectedDevice.bound_user?.id);
                    } },
                ...{ class: "tiny-button" },
            });
        }
        if (__VLS_ctx.selectedDevice.bound_user) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "feed-item" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
            (__VLS_ctx.selectedDevice.bound_user.nick_name || '未命名用户');
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "feed-meta" },
            });
            (__VLS_ctx.selectedDevice.bound_user.id);
            (__VLS_ctx.selectedDevice.bound_user.openid || '无 openid');
        }
        else {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "empty-state" },
                ...{ style: {} },
            });
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "field" },
            ...{ style: {} },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
            ...{ class: "text-input" },
            placeholder: "例如 123",
        });
        (__VLS_ctx.deviceBindUserId);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "action-row" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (__VLS_ctx.bindDeviceToUser) },
            ...{ class: "primary-button" },
            disabled: (__VLS_ctx.devicesSaving),
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (__VLS_ctx.unbindDevice) },
            ...{ class: "danger-button" },
            disabled: (__VLS_ctx.devicesSaving),
        });
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
            ...{ class: "empty-state" },
        });
    }
}
else if (__VLS_ctx.currentView === 'users') {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "toolbar-card" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "card-title-row" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "eyebrow" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({
        ...{ class: "card-title" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "filters" },
        ...{ style: {} },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "field" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        ...{ class: "text-input" },
        placeholder: "输入关键词后查询",
    });
    (__VLS_ctx.usersSearch);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "toolbar-actions" },
        ...{ style: {} },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!!(__VLS_ctx.currentView === 'dashboard'))
                    return;
                if (!!(__VLS_ctx.currentView === 'news'))
                    return;
                if (!!(__VLS_ctx.currentView === 'devices'))
                    return;
                if (!(__VLS_ctx.currentView === 'users'))
                    return;
                __VLS_ctx.loadUsers(true);
            } },
        ...{ class: "primary-button" },
        disabled: (__VLS_ctx.usersLoading),
    });
    if (__VLS_ctx.usersError) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "alert" },
        });
        (__VLS_ctx.usersError);
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "split-view" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "surface-card users-table" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "card-title-row" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "eyebrow" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({
        ...{ class: "card-title" },
    });
    (__VLS_ctx.usersTotal);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "badge" },
    });
    (__VLS_ctx.usersLoading ? '加载中' : '已就绪');
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "table-shell" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "table-header" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    for (const [item] of __VLS_getVForSourceType((__VLS_ctx.userItems))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.currentView === 'dashboard'))
                        return;
                    if (!!(__VLS_ctx.currentView === 'news'))
                        return;
                    if (!!(__VLS_ctx.currentView === 'devices'))
                        return;
                    if (!(__VLS_ctx.currentView === 'users'))
                        return;
                    __VLS_ctx.openUser(item.id);
                } },
            key: (item.id),
            ...{ class: "table-row" },
            ...{ class: ({ 'is-selected': __VLS_ctx.userSelectedId === item.id }) },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "badge" },
        });
        (item.id);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "table-title" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (item.openid);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (item.unionid || '无 unionid');
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        (item.nick_name || '--');
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        (item.device?.device_id || '未绑定');
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        (__VLS_ctx._formatShort(item.updated_at || item.created_at));
    }
    if (__VLS_ctx.selectedUser) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
            ...{ class: "detail-card" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "card-title-row" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "eyebrow" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({
            ...{ class: "card-title" },
        });
        (__VLS_ctx.selectedUser.nick_name || __VLS_ctx.selectedUser.openid);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "status-pill" },
            ...{ class: (__VLS_ctx.selectedUser.device ? 'is-primary' : '') },
        });
        (__VLS_ctx.selectedUser.device ? '已绑设备' : '未绑设备');
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "detail-grid" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "detail-item" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "eyebrow" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (__VLS_ctx.selectedUser.openid);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "detail-item" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "eyebrow" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (__VLS_ctx.selectedUser.unionid || '--');
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "detail-item" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "eyebrow" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (__VLS_ctx._formatDateTime(__VLS_ctx.selectedUser.created_at));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "detail-item" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "eyebrow" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (__VLS_ctx._formatDateTime(__VLS_ctx.selectedUser.updated_at));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
            ...{ class: "panel" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "card-title-row" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "eyebrow" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({
            ...{ class: "card-title" },
        });
        if (__VLS_ctx.selectedUser.device?.device_id) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!!(__VLS_ctx.currentView === 'dashboard'))
                            return;
                        if (!!(__VLS_ctx.currentView === 'news'))
                            return;
                        if (!!(__VLS_ctx.currentView === 'devices'))
                            return;
                        if (!(__VLS_ctx.currentView === 'users'))
                            return;
                        if (!(__VLS_ctx.selectedUser))
                            return;
                        if (!(__VLS_ctx.selectedUser.device?.device_id))
                            return;
                        __VLS_ctx.jumpToDevice(__VLS_ctx.selectedUser.device?.device_id);
                    } },
                ...{ class: "tiny-button" },
            });
        }
        if (__VLS_ctx.selectedUser.device) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "feed-item" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
            (__VLS_ctx.selectedUser.device.device_id);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "feed-meta" },
            });
            (__VLS_ctx.selectedUser.device.board_type || '--');
            (__VLS_ctx.selectedUser.device.fw_user_agent || '--');
        }
        else {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "empty-state" },
                ...{ style: {} },
            });
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "field" },
            ...{ style: {} },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
            ...{ class: "text-input" },
            placeholder: "输入 device_id 进行绑定",
        });
        (__VLS_ctx.userBindDeviceId);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "action-row" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (__VLS_ctx.bindUserToDevice) },
            ...{ class: "primary-button" },
            disabled: (__VLS_ctx.usersSaving),
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (__VLS_ctx.unbindUser) },
            ...{ class: "danger-button" },
            disabled: (__VLS_ctx.usersSaving),
        });
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
            ...{ class: "empty-state" },
        });
    }
}
else if (__VLS_ctx.currentView === 'live') {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "toolbar-card" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "card-title-row" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "eyebrow" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({
        ...{ class: "card-title" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "tab-row" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!!(__VLS_ctx.currentView === 'dashboard'))
                    return;
                if (!!(__VLS_ctx.currentView === 'news'))
                    return;
                if (!!(__VLS_ctx.currentView === 'devices'))
                    return;
                if (!!(__VLS_ctx.currentView === 'users'))
                    return;
                if (!(__VLS_ctx.currentView === 'live'))
                    return;
                __VLS_ctx.currentLiveTab = 'f1';
            } },
        ...{ class: "tab-button" },
        ...{ class: ({ 'is-active': __VLS_ctx.currentLiveTab === 'f1' }) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!!(__VLS_ctx.currentView === 'dashboard'))
                    return;
                if (!!(__VLS_ctx.currentView === 'news'))
                    return;
                if (!!(__VLS_ctx.currentView === 'devices'))
                    return;
                if (!!(__VLS_ctx.currentView === 'users'))
                    return;
                if (!(__VLS_ctx.currentView === 'live'))
                    return;
                __VLS_ctx.currentLiveTab = 'standings';
            } },
        ...{ class: "tab-button" },
        ...{ class: ({ 'is-active': __VLS_ctx.currentLiveTab === 'standings' }) },
    });
    if (__VLS_ctx.currentLiveTab === 'f1') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
            ...{ class: "theme-chip" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
            type: "checkbox",
        });
        (__VLS_ctx.liveAutoRefresh);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    }
    if (__VLS_ctx.liveError) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "alert" },
        });
        (__VLS_ctx.liveError);
    }
    if (__VLS_ctx.currentLiveTab === 'f1') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "timing-summary" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "mini-card" },
            ...{ style: {} },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "eyebrow" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "stat-value" },
            ...{ style: {} },
        });
        (__VLS_ctx.f1Snapshot?.session?.session_name || '--');
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "stat-note" },
        });
        (__VLS_ctx.f1Snapshot?.session?.meeting_name || __VLS_ctx.f1Snapshot?.session?.location || '暂无会话信息');
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "mini-card" },
            ...{ style: {} },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "eyebrow" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "stat-value" },
            ...{ style: {} },
        });
        (__VLS_ctx.f1Snapshot?.connected ? 'Connected' : 'Offline');
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "stat-note" },
        });
        (__VLS_ctx.f1Snapshot?.endpoint || '未返回 endpoint');
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "mini-card" },
            ...{ style: {} },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "eyebrow" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "stat-value" },
            ...{ style: {} },
        });
        (__VLS_ctx.f1Snapshot?.rows?.length || 0);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "stat-note" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "mini-card" },
            ...{ style: {} },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "eyebrow" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "stat-value" },
            ...{ style: {} },
        });
        (__VLS_ctx._formatShort(__VLS_ctx.f1Snapshot?.last_updated_at_utc));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "stat-note" },
        });
        (__VLS_ctx.f1Snapshot?.track_status?.message || '暂无赛道状态');
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "lab-grid" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
            ...{ class: "surface-card timing-table" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "card-title-row" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "eyebrow" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({
            ...{ class: "card-title" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.currentView === 'dashboard'))
                        return;
                    if (!!(__VLS_ctx.currentView === 'news'))
                        return;
                    if (!!(__VLS_ctx.currentView === 'devices'))
                        return;
                    if (!!(__VLS_ctx.currentView === 'users'))
                        return;
                    if (!(__VLS_ctx.currentView === 'live'))
                        return;
                    if (!(__VLS_ctx.currentLiveTab === 'f1'))
                        return;
                    __VLS_ctx.loadLiveF1(true);
                } },
            ...{ class: "tiny-button" },
            disabled: (__VLS_ctx.liveLoading),
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "table-shell" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "table-header" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        for (const [row] of __VLS_getVForSourceType((__VLS_ctx.topTimingRows))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                key: (`${row.position}-${row.driver}`),
                ...{ class: "table-row" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "badge" },
            });
            (row.position);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "table-title" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
            (row.driver);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            (row.tla || row.racing_number || '--');
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
            (row.team || '--');
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
            (row.interval || row.gap || (row.position === 1 ? 'Leader' : '--'));
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
            (row.best_lap || '--');
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
            (row.tyre || '--');
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
            ...{ class: "surface-card" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "card-title-row" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "eyebrow" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({
            ...{ class: "card-title" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "mini-feed" },
        });
        for (const [item] of __VLS_getVForSourceType((__VLS_ctx.latestMessages))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                key: (`${item.utc}-${item.title}`),
                ...{ class: "feed-item" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
            (item.title || item.category || '消息');
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "feed-meta" },
            });
            (item.message || '无附加说明');
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "feed-meta" },
            });
            (__VLS_ctx._formatShort(item.utc));
        }
        if (!__VLS_ctx.latestMessages.length) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "empty-state" },
                ...{ style: {} },
            });
        }
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
            ...{ class: "toolbar-card" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "field" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
            ...{ class: "text-input" },
            placeholder: "https://www.motorsport.com/f1/live-text/...",
        });
        (__VLS_ctx.standingsSourceUrl);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "toolbar-actions" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.currentView === 'dashboard'))
                        return;
                    if (!!(__VLS_ctx.currentView === 'news'))
                        return;
                    if (!!(__VLS_ctx.currentView === 'devices'))
                        return;
                    if (!!(__VLS_ctx.currentView === 'users'))
                        return;
                    if (!(__VLS_ctx.currentView === 'live'))
                        return;
                    if (!!(__VLS_ctx.currentLiveTab === 'f1'))
                        return;
                    __VLS_ctx.loadStandings(true);
                } },
            ...{ class: "primary-button" },
            disabled: (__VLS_ctx.liveLoading),
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.currentView === 'dashboard'))
                        return;
                    if (!!(__VLS_ctx.currentView === 'news'))
                        return;
                    if (!!(__VLS_ctx.currentView === 'devices'))
                        return;
                    if (!!(__VLS_ctx.currentView === 'users'))
                        return;
                    if (!(__VLS_ctx.currentView === 'live'))
                        return;
                    if (!!(__VLS_ctx.currentLiveTab === 'f1'))
                        return;
                    __VLS_ctx.standingsSourceUrl = __VLS_ctx.standingsDefaultUrl;
                } },
            ...{ class: "secondary-button" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "lab-grid" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
            ...{ class: "surface-card" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "card-title-row" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "eyebrow" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({
            ...{ class: "card-title" },
        });
        (__VLS_ctx.liveStandings?.session_title || '等待抓取');
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "status-pill" },
            ...{ class: (__VLS_ctx.liveStandings?.status?.toLowerCase() === 'live' ? 'is-success' : '') },
        });
        (__VLS_ctx.liveStandings?.status || '--');
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "detail-grid" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "detail-item" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "eyebrow" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (__VLS_ctx.liveStandings?.rows?.length || 0);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "detail-item" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "eyebrow" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (__VLS_ctx._formatDateTime(__VLS_ctx.liveStandings?.fetched_at_utc));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "footer-note" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
            ...{ class: "surface-card standings-table" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "card-title-row" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "eyebrow" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({
            ...{ class: "card-title" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "table-shell" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "table-header" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        for (const [row] of __VLS_getVForSourceType((__VLS_ctx.liveStandings?.rows || []))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                key: (`${row.position}-${row.driver}`),
                ...{ class: "table-row" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "badge" },
            });
            (row.position);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "table-title" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
            (row.driver);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            (row.team);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
            (row.gap || '--');
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
            (row.time || '--');
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
            (row.tyre || '--');
        }
        if (!(__VLS_ctx.liveStandings?.rows || []).length) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "empty-state" },
                ...{ style: {} },
            });
        }
    }
}
else if (__VLS_ctx.currentView === 'settings') {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "settings-grid" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "surface-card" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "card-title-row" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "eyebrow" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({
        ...{ class: "card-title" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "card-description" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "field" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        ...{ class: "text-input" },
        placeholder: "留空表示同域，例如 http://localhost:8080",
    });
    (__VLS_ctx.settings.apiBase);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "field" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        ...{ class: "text-input" },
        placeholder: "如果后端要求 token，则在这里填入",
    });
    (__VLS_ctx.settings.token);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "field-inline" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "field" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        ...{ class: "text-input" },
        placeholder: "Asia/Shanghai",
    });
    (__VLS_ctx.settings.timezone);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "field" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.select, __VLS_intrinsicElements.select)({
        value: (__VLS_ctx.settings.theme),
        ...{ class: "select-input" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
        value: "light",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
        value: "dark",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "action-row" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.saveSettings) },
        ...{ class: "primary-button" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.restoreDefaultSettings) },
        ...{ class: "secondary-button" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "surface-card" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "card-title-row" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "eyebrow" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({
        ...{ class: "card-title" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "settings-list" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "setting-row" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "field-hint" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "status-pill is-success" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "setting-row" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "field-hint" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "status-pill is-success" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "setting-row" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "field-hint" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "status-pill is-primary" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "setting-row" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "field-hint" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "status-pill is-warning" },
    });
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "footer-note" },
});
/** @type {__VLS_StyleScopedClasses['app-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['app-frame']} */ ;
/** @type {__VLS_StyleScopedClasses['sidebar']} */ ;
/** @type {__VLS_StyleScopedClasses['brand-card']} */ ;
/** @type {__VLS_StyleScopedClasses['brand-top']} */ ;
/** @type {__VLS_StyleScopedClasses['brand-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['brand-title']} */ ;
/** @type {__VLS_StyleScopedClasses['brand-subtitle']} */ ;
/** @type {__VLS_StyleScopedClasses['brand-subtitle']} */ ;
/** @type {__VLS_StyleScopedClasses['nav-group']} */ ;
/** @type {__VLS_StyleScopedClasses['nav-button']} */ ;
/** @type {__VLS_StyleScopedClasses['nav-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['nav-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['nav-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['sidebar-footer']} */ ;
/** @type {__VLS_StyleScopedClasses['primary-button']} */ ;
/** @type {__VLS_StyleScopedClasses['ghost-button']} */ ;
/** @type {__VLS_StyleScopedClasses['content']} */ ;
/** @type {__VLS_StyleScopedClasses['topbar']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['page-title']} */ ;
/** @type {__VLS_StyleScopedClasses['page-subtitle']} */ ;
/** @type {__VLS_StyleScopedClasses['topbar-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['theme-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['theme-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['secondary-button']} */ ;
/** @type {__VLS_StyleScopedClasses['page-body']} */ ;
/** @type {__VLS_StyleScopedClasses['alert']} */ ;
/** @type {__VLS_StyleScopedClasses['hero-card']} */ ;
/** @type {__VLS_StyleScopedClasses['hero-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['hero-title']} */ ;
/** @type {__VLS_StyleScopedClasses['hero-text']} */ ;
/** @type {__VLS_StyleScopedClasses['hero-points']} */ ;
/** @type {__VLS_StyleScopedClasses['hero-point']} */ ;
/** @type {__VLS_StyleScopedClasses['field-hint']} */ ;
/** @type {__VLS_StyleScopedClasses['hero-point']} */ ;
/** @type {__VLS_StyleScopedClasses['field-hint']} */ ;
/** @type {__VLS_StyleScopedClasses['hero-point']} */ ;
/** @type {__VLS_StyleScopedClasses['field-hint']} */ ;
/** @type {__VLS_StyleScopedClasses['hero-point']} */ ;
/** @type {__VLS_StyleScopedClasses['field-hint']} */ ;
/** @type {__VLS_StyleScopedClasses['surface-card']} */ ;
/** @type {__VLS_StyleScopedClasses['card-title-row']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['card-title']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-list']} */ ;
/** @type {__VLS_StyleScopedClasses['setting-row']} */ ;
/** @type {__VLS_StyleScopedClasses['field-hint']} */ ;
/** @type {__VLS_StyleScopedClasses['badge']} */ ;
/** @type {__VLS_StyleScopedClasses['setting-row']} */ ;
/** @type {__VLS_StyleScopedClasses['field-hint']} */ ;
/** @type {__VLS_StyleScopedClasses['badge']} */ ;
/** @type {__VLS_StyleScopedClasses['setting-row']} */ ;
/** @type {__VLS_StyleScopedClasses['field-hint']} */ ;
/** @type {__VLS_StyleScopedClasses['badge']} */ ;
/** @type {__VLS_StyleScopedClasses['setting-row']} */ ;
/** @type {__VLS_StyleScopedClasses['field-hint']} */ ;
/** @type {__VLS_StyleScopedClasses['badge']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-card']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-value']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-note']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-card']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-value']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-note']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-card']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-value']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-note']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-card']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-value']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-note']} */ ;
/** @type {__VLS_StyleScopedClasses['alert']} */ ;
/** @type {__VLS_StyleScopedClasses['summary-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['surface-card']} */ ;
/** @type {__VLS_StyleScopedClasses['card-title-row']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['card-title']} */ ;
/** @type {__VLS_StyleScopedClasses['tiny-button']} */ ;
/** @type {__VLS_StyleScopedClasses['mini-feed']} */ ;
/** @type {__VLS_StyleScopedClasses['feed-item']} */ ;
/** @type {__VLS_StyleScopedClasses['feed-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-state']} */ ;
/** @type {__VLS_StyleScopedClasses['surface-card']} */ ;
/** @type {__VLS_StyleScopedClasses['card-title-row']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['card-title']} */ ;
/** @type {__VLS_StyleScopedClasses['mini-feed']} */ ;
/** @type {__VLS_StyleScopedClasses['feed-item']} */ ;
/** @type {__VLS_StyleScopedClasses['feed-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['feed-item']} */ ;
/** @type {__VLS_StyleScopedClasses['feed-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['feed-item']} */ ;
/** @type {__VLS_StyleScopedClasses['feed-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['toolbar-card']} */ ;
/** @type {__VLS_StyleScopedClasses['card-title-row']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['card-title']} */ ;
/** @type {__VLS_StyleScopedClasses['filters']} */ ;
/** @type {__VLS_StyleScopedClasses['field']} */ ;
/** @type {__VLS_StyleScopedClasses['text-input']} */ ;
/** @type {__VLS_StyleScopedClasses['field']} */ ;
/** @type {__VLS_StyleScopedClasses['text-input']} */ ;
/** @type {__VLS_StyleScopedClasses['field']} */ ;
/** @type {__VLS_StyleScopedClasses['text-input']} */ ;
/** @type {__VLS_StyleScopedClasses['field']} */ ;
/** @type {__VLS_StyleScopedClasses['text-input']} */ ;
/** @type {__VLS_StyleScopedClasses['field']} */ ;
/** @type {__VLS_StyleScopedClasses['select-input']} */ ;
/** @type {__VLS_StyleScopedClasses['field']} */ ;
/** @type {__VLS_StyleScopedClasses['text-input']} */ ;
/** @type {__VLS_StyleScopedClasses['toolbar-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['primary-button']} */ ;
/** @type {__VLS_StyleScopedClasses['secondary-button']} */ ;
/** @type {__VLS_StyleScopedClasses['alert']} */ ;
/** @type {__VLS_StyleScopedClasses['split-view']} */ ;
/** @type {__VLS_StyleScopedClasses['surface-card']} */ ;
/** @type {__VLS_StyleScopedClasses['news-table']} */ ;
/** @type {__VLS_StyleScopedClasses['card-title-row']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['card-title']} */ ;
/** @type {__VLS_StyleScopedClasses['badge']} */ ;
/** @type {__VLS_StyleScopedClasses['table-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['table-header']} */ ;
/** @type {__VLS_StyleScopedClasses['table-row']} */ ;
/** @type {__VLS_StyleScopedClasses['badge']} */ ;
/** @type {__VLS_StyleScopedClasses['table-title']} */ ;
/** @type {__VLS_StyleScopedClasses['status-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-card']} */ ;
/** @type {__VLS_StyleScopedClasses['card-title-row']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['card-title']} */ ;
/** @type {__VLS_StyleScopedClasses['status-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['action-row']} */ ;
/** @type {__VLS_StyleScopedClasses['primary-button']} */ ;
/** @type {__VLS_StyleScopedClasses['secondary-button']} */ ;
/** @type {__VLS_StyleScopedClasses['ghost-button']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-item']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-item']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-item']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-item']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-card']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-cover']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-title']} */ ;
/** @type {__VLS_StyleScopedClasses['feed-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-html']} */ ;
/** @type {__VLS_StyleScopedClasses['panel']} */ ;
/** @type {__VLS_StyleScopedClasses['card-title-row']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['card-title']} */ ;
/** @type {__VLS_StyleScopedClasses['primary-button']} */ ;
/** @type {__VLS_StyleScopedClasses['field-inline']} */ ;
/** @type {__VLS_StyleScopedClasses['field']} */ ;
/** @type {__VLS_StyleScopedClasses['text-input']} */ ;
/** @type {__VLS_StyleScopedClasses['field']} */ ;
/** @type {__VLS_StyleScopedClasses['text-input']} */ ;
/** @type {__VLS_StyleScopedClasses['field']} */ ;
/** @type {__VLS_StyleScopedClasses['textarea-input']} */ ;
/** @type {__VLS_StyleScopedClasses['field-inline']} */ ;
/** @type {__VLS_StyleScopedClasses['field']} */ ;
/** @type {__VLS_StyleScopedClasses['text-input']} */ ;
/** @type {__VLS_StyleScopedClasses['field']} */ ;
/** @type {__VLS_StyleScopedClasses['text-input']} */ ;
/** @type {__VLS_StyleScopedClasses['field-inline']} */ ;
/** @type {__VLS_StyleScopedClasses['field']} */ ;
/** @type {__VLS_StyleScopedClasses['text-input']} */ ;
/** @type {__VLS_StyleScopedClasses['field']} */ ;
/** @type {__VLS_StyleScopedClasses['text-input']} */ ;
/** @type {__VLS_StyleScopedClasses['field-inline']} */ ;
/** @type {__VLS_StyleScopedClasses['field']} */ ;
/** @type {__VLS_StyleScopedClasses['text-input']} */ ;
/** @type {__VLS_StyleScopedClasses['field']} */ ;
/** @type {__VLS_StyleScopedClasses['text-input']} */ ;
/** @type {__VLS_StyleScopedClasses['field-inline']} */ ;
/** @type {__VLS_StyleScopedClasses['field']} */ ;
/** @type {__VLS_StyleScopedClasses['text-input']} */ ;
/** @type {__VLS_StyleScopedClasses['field']} */ ;
/** @type {__VLS_StyleScopedClasses['text-input']} */ ;
/** @type {__VLS_StyleScopedClasses['theme-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-state']} */ ;
/** @type {__VLS_StyleScopedClasses['toolbar-card']} */ ;
/** @type {__VLS_StyleScopedClasses['card-title-row']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['card-title']} */ ;
/** @type {__VLS_StyleScopedClasses['filters']} */ ;
/** @type {__VLS_StyleScopedClasses['field']} */ ;
/** @type {__VLS_StyleScopedClasses['text-input']} */ ;
/** @type {__VLS_StyleScopedClasses['toolbar-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['primary-button']} */ ;
/** @type {__VLS_StyleScopedClasses['alert']} */ ;
/** @type {__VLS_StyleScopedClasses['split-view']} */ ;
/** @type {__VLS_StyleScopedClasses['surface-card']} */ ;
/** @type {__VLS_StyleScopedClasses['devices-table']} */ ;
/** @type {__VLS_StyleScopedClasses['card-title-row']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['card-title']} */ ;
/** @type {__VLS_StyleScopedClasses['badge']} */ ;
/** @type {__VLS_StyleScopedClasses['table-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['table-header']} */ ;
/** @type {__VLS_StyleScopedClasses['table-row']} */ ;
/** @type {__VLS_StyleScopedClasses['table-title']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-card']} */ ;
/** @type {__VLS_StyleScopedClasses['card-title-row']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['card-title']} */ ;
/** @type {__VLS_StyleScopedClasses['status-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-item']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-item']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-item']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-item']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['panel']} */ ;
/** @type {__VLS_StyleScopedClasses['card-title-row']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['card-title']} */ ;
/** @type {__VLS_StyleScopedClasses['tiny-button']} */ ;
/** @type {__VLS_StyleScopedClasses['feed-item']} */ ;
/** @type {__VLS_StyleScopedClasses['feed-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-state']} */ ;
/** @type {__VLS_StyleScopedClasses['field']} */ ;
/** @type {__VLS_StyleScopedClasses['text-input']} */ ;
/** @type {__VLS_StyleScopedClasses['action-row']} */ ;
/** @type {__VLS_StyleScopedClasses['primary-button']} */ ;
/** @type {__VLS_StyleScopedClasses['danger-button']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-state']} */ ;
/** @type {__VLS_StyleScopedClasses['toolbar-card']} */ ;
/** @type {__VLS_StyleScopedClasses['card-title-row']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['card-title']} */ ;
/** @type {__VLS_StyleScopedClasses['filters']} */ ;
/** @type {__VLS_StyleScopedClasses['field']} */ ;
/** @type {__VLS_StyleScopedClasses['text-input']} */ ;
/** @type {__VLS_StyleScopedClasses['toolbar-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['primary-button']} */ ;
/** @type {__VLS_StyleScopedClasses['alert']} */ ;
/** @type {__VLS_StyleScopedClasses['split-view']} */ ;
/** @type {__VLS_StyleScopedClasses['surface-card']} */ ;
/** @type {__VLS_StyleScopedClasses['users-table']} */ ;
/** @type {__VLS_StyleScopedClasses['card-title-row']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['card-title']} */ ;
/** @type {__VLS_StyleScopedClasses['badge']} */ ;
/** @type {__VLS_StyleScopedClasses['table-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['table-header']} */ ;
/** @type {__VLS_StyleScopedClasses['table-row']} */ ;
/** @type {__VLS_StyleScopedClasses['badge']} */ ;
/** @type {__VLS_StyleScopedClasses['table-title']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-card']} */ ;
/** @type {__VLS_StyleScopedClasses['card-title-row']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['card-title']} */ ;
/** @type {__VLS_StyleScopedClasses['status-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-item']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-item']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-item']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-item']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['panel']} */ ;
/** @type {__VLS_StyleScopedClasses['card-title-row']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['card-title']} */ ;
/** @type {__VLS_StyleScopedClasses['tiny-button']} */ ;
/** @type {__VLS_StyleScopedClasses['feed-item']} */ ;
/** @type {__VLS_StyleScopedClasses['feed-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-state']} */ ;
/** @type {__VLS_StyleScopedClasses['field']} */ ;
/** @type {__VLS_StyleScopedClasses['text-input']} */ ;
/** @type {__VLS_StyleScopedClasses['action-row']} */ ;
/** @type {__VLS_StyleScopedClasses['primary-button']} */ ;
/** @type {__VLS_StyleScopedClasses['danger-button']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-state']} */ ;
/** @type {__VLS_StyleScopedClasses['toolbar-card']} */ ;
/** @type {__VLS_StyleScopedClasses['card-title-row']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['card-title']} */ ;
/** @type {__VLS_StyleScopedClasses['tab-row']} */ ;
/** @type {__VLS_StyleScopedClasses['tab-button']} */ ;
/** @type {__VLS_StyleScopedClasses['tab-button']} */ ;
/** @type {__VLS_StyleScopedClasses['theme-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['alert']} */ ;
/** @type {__VLS_StyleScopedClasses['timing-summary']} */ ;
/** @type {__VLS_StyleScopedClasses['mini-card']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-value']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-note']} */ ;
/** @type {__VLS_StyleScopedClasses['mini-card']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-value']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-note']} */ ;
/** @type {__VLS_StyleScopedClasses['mini-card']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-value']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-note']} */ ;
/** @type {__VLS_StyleScopedClasses['mini-card']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-value']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-note']} */ ;
/** @type {__VLS_StyleScopedClasses['lab-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['surface-card']} */ ;
/** @type {__VLS_StyleScopedClasses['timing-table']} */ ;
/** @type {__VLS_StyleScopedClasses['card-title-row']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['card-title']} */ ;
/** @type {__VLS_StyleScopedClasses['tiny-button']} */ ;
/** @type {__VLS_StyleScopedClasses['table-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['table-header']} */ ;
/** @type {__VLS_StyleScopedClasses['table-row']} */ ;
/** @type {__VLS_StyleScopedClasses['badge']} */ ;
/** @type {__VLS_StyleScopedClasses['table-title']} */ ;
/** @type {__VLS_StyleScopedClasses['surface-card']} */ ;
/** @type {__VLS_StyleScopedClasses['card-title-row']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['card-title']} */ ;
/** @type {__VLS_StyleScopedClasses['mini-feed']} */ ;
/** @type {__VLS_StyleScopedClasses['feed-item']} */ ;
/** @type {__VLS_StyleScopedClasses['feed-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['feed-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-state']} */ ;
/** @type {__VLS_StyleScopedClasses['toolbar-card']} */ ;
/** @type {__VLS_StyleScopedClasses['field']} */ ;
/** @type {__VLS_StyleScopedClasses['text-input']} */ ;
/** @type {__VLS_StyleScopedClasses['toolbar-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['primary-button']} */ ;
/** @type {__VLS_StyleScopedClasses['secondary-button']} */ ;
/** @type {__VLS_StyleScopedClasses['lab-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['surface-card']} */ ;
/** @type {__VLS_StyleScopedClasses['card-title-row']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['card-title']} */ ;
/** @type {__VLS_StyleScopedClasses['status-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-item']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-item']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['footer-note']} */ ;
/** @type {__VLS_StyleScopedClasses['surface-card']} */ ;
/** @type {__VLS_StyleScopedClasses['standings-table']} */ ;
/** @type {__VLS_StyleScopedClasses['card-title-row']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['card-title']} */ ;
/** @type {__VLS_StyleScopedClasses['table-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['table-header']} */ ;
/** @type {__VLS_StyleScopedClasses['table-row']} */ ;
/** @type {__VLS_StyleScopedClasses['badge']} */ ;
/** @type {__VLS_StyleScopedClasses['table-title']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-state']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['surface-card']} */ ;
/** @type {__VLS_StyleScopedClasses['card-title-row']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['card-title']} */ ;
/** @type {__VLS_StyleScopedClasses['card-description']} */ ;
/** @type {__VLS_StyleScopedClasses['field']} */ ;
/** @type {__VLS_StyleScopedClasses['text-input']} */ ;
/** @type {__VLS_StyleScopedClasses['field']} */ ;
/** @type {__VLS_StyleScopedClasses['text-input']} */ ;
/** @type {__VLS_StyleScopedClasses['field-inline']} */ ;
/** @type {__VLS_StyleScopedClasses['field']} */ ;
/** @type {__VLS_StyleScopedClasses['text-input']} */ ;
/** @type {__VLS_StyleScopedClasses['field']} */ ;
/** @type {__VLS_StyleScopedClasses['select-input']} */ ;
/** @type {__VLS_StyleScopedClasses['action-row']} */ ;
/** @type {__VLS_StyleScopedClasses['primary-button']} */ ;
/** @type {__VLS_StyleScopedClasses['secondary-button']} */ ;
/** @type {__VLS_StyleScopedClasses['surface-card']} */ ;
/** @type {__VLS_StyleScopedClasses['card-title-row']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['card-title']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-list']} */ ;
/** @type {__VLS_StyleScopedClasses['setting-row']} */ ;
/** @type {__VLS_StyleScopedClasses['field-hint']} */ ;
/** @type {__VLS_StyleScopedClasses['status-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['is-success']} */ ;
/** @type {__VLS_StyleScopedClasses['setting-row']} */ ;
/** @type {__VLS_StyleScopedClasses['field-hint']} */ ;
/** @type {__VLS_StyleScopedClasses['status-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['is-success']} */ ;
/** @type {__VLS_StyleScopedClasses['setting-row']} */ ;
/** @type {__VLS_StyleScopedClasses['field-hint']} */ ;
/** @type {__VLS_StyleScopedClasses['status-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['is-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['setting-row']} */ ;
/** @type {__VLS_StyleScopedClasses['field-hint']} */ ;
/** @type {__VLS_StyleScopedClasses['status-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['is-warning']} */ ;
/** @type {__VLS_StyleScopedClasses['footer-note']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            branchName: branchName,
            standingsDefaultUrl: standingsDefaultUrl,
            navItems: navItems,
            currentView: currentView,
            currentLiveTab: currentLiveTab,
            settings: settings,
            flash: flash,
            dashboardError: dashboardError,
            dashboardSummary: dashboardSummary,
            newsLoading: newsLoading,
            newsSaving: newsSaving,
            newsError: newsError,
            newsItems: newsItems,
            newsTotal: newsTotal,
            newsPageSize: newsPageSize,
            newsSelectedId: newsSelectedId,
            selectedNews: selectedNews,
            newsFilters: newsFilters,
            newsEditor: newsEditor,
            devicesLoading: devicesLoading,
            devicesSaving: devicesSaving,
            devicesError: devicesError,
            deviceItems: deviceItems,
            devicesTotal: devicesTotal,
            deviceSelectedId: deviceSelectedId,
            selectedDevice: selectedDevice,
            devicesSearch: devicesSearch,
            deviceBindUserId: deviceBindUserId,
            usersLoading: usersLoading,
            usersSaving: usersSaving,
            usersError: usersError,
            userItems: userItems,
            usersTotal: usersTotal,
            userSelectedId: userSelectedId,
            selectedUser: selectedUser,
            usersSearch: usersSearch,
            userBindDeviceId: userBindDeviceId,
            liveLoading: liveLoading,
            liveError: liveError,
            f1Snapshot: f1Snapshot,
            liveStandings: liveStandings,
            standingsSourceUrl: standingsSourceUrl,
            liveAutoRefresh: liveAutoRefresh,
            currentMeta: currentMeta,
            activeNav: activeNav,
            effectiveApiBase: effectiveApiBase,
            themeLabel: themeLabel,
            newsPreviewHtml: newsPreviewHtml,
            latestMessages: latestMessages,
            topTimingRows: topTimingRows,
            loadNews: loadNews,
            openNews: openNews,
            persistSelectedNews: persistSelectedNews,
            loadDevices: loadDevices,
            openDevice: openDevice,
            bindDeviceToUser: bindDeviceToUser,
            unbindDevice: unbindDevice,
            loadUsers: loadUsers,
            openUser: openUser,
            bindUserToDevice: bindUserToDevice,
            unbindUser: unbindUser,
            loadLiveF1: loadLiveF1,
            loadStandings: loadStandings,
            saveSettings: saveSettings,
            restoreDefaultSettings: restoreDefaultSettings,
            switchView: switchView,
            toggleTheme: toggleTheme,
            refreshCurrentView: refreshCurrentView,
            jumpToUser: jumpToUser,
            jumpToDevice: jumpToDevice,
            _formatDateTime: _formatDateTime,
            _formatShort: _formatShort,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
