<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  bindUserDevice,
  fetchAdminDeviceDetail,
  fetchAdminDevices,
  fetchAdminUserDetail,
  fetchAdminUsers,
  fetchDashboardSummary,
  fetchF1LiveTiming,
  fetchLiveStandings,
  fetchMpNewsDetail,
  fetchMpNewsList,
  getStoredSettings,
  resetStoredSettings,
  saveMpNews,
  saveStoredSettings,
  type AdminDeviceItem,
  type AdminF1LiveTimingSnapshot,
  type AdminMotorsportLiveStandingsResponse,
  type AdminUserItem,
  type DashboardSummary,
  type MpNewsItem,
  type MpNewsRichTextNode,
  type ThemeMode,
  unbindUserDevice,
} from '@/api'
import { formatDateTime, formatShort, renderNewsContent } from '@/lib/utils'

type ViewKey = 'dashboard' | 'news' | 'devices' | 'users' | 'live' | 'settings'
type LiveTab = 'f1' | 'standings'

const route = useRoute()
const router = useRouter()

const branchName = 'feature/admin-v2'
const standingsDefaultUrl =
  'https://www.motorsport.com/f1/live-text/f1-barcelona-gp-live-commentary-and-updates-qualifying/1127045/'

const navItems: Array<{
  key: ViewKey
  title: string
  description: string
  badge: string
  icon: string
  routeName: string
}> = [
  { key: 'dashboard', title: '总览', description: '旧版能力盘点 + V2 当前状态', badge: 'V2', icon: '◎', routeName: 'dashboard' },
  { key: 'news', title: '新闻中台', description: '筛选、预览、设置 Hero / Banner', badge: '内容', icon: '✦', routeName: 'news-list' },
  { key: 'devices', title: '设备中心', description: '设备详情与用户绑定维护', badge: '硬件', icon: '◌', routeName: 'devices-list' },
  { key: 'users', title: '用户中心', description: '用户资料与绑定设备联查', badge: '小程序', icon: '◍', routeName: 'users-list' },
  { key: 'live', title: '赛事实验室', description: 'F1 Live Timing 与榜单调试', badge: 'Live', icon: '◈', routeName: 'f1-live-timing-demo' },
  { key: 'settings', title: '设置', description: 'API、Token、主题与时区', badge: '连接', icon: '⚙', routeName: 'settings' },
]

const pageMeta: Record<ViewKey, { title: string; subtitle: string }> = {
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
}

const currentView = ref<ViewKey>('dashboard')
const currentLiveTab = ref<LiveTab>('f1')
const settings = reactive(getStoredSettings())
const flash = reactive<{ text: string; tone: 'danger' | 'success' }>({
  text: '',
  tone: 'success',
})

const dashboardLoading = ref(false)
const dashboardError = ref('')
const dashboardSummary = ref<DashboardSummary | null>(null)

const newsLoading = ref(false)
const newsSaving = ref(false)
const newsError = ref('')
const newsItems = ref<MpNewsItem[]>([])
const newsTotal = ref(0)
const newsPage = ref(1)
const newsPageSize = ref(20)
const newsSelectedId = ref('')
const selectedNews = ref<MpNewsItem | null>(null)
const newsFilters = reactive({
  q: '',
  tag: '',
  typeCode: '',
  layoutCode: '',
  pinned: '',
  since: '',
})
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
})

const devicesLoading = ref(false)
const devicesSaving = ref(false)
const devicesError = ref('')
const deviceItems = ref<AdminDeviceItem[]>([])
const devicesTotal = ref(0)
const deviceSelectedId = ref('')
const selectedDevice = ref<AdminDeviceItem | null>(null)
const devicesSearch = ref('')
const deviceBindUserId = ref('')

const usersLoading = ref(false)
const usersSaving = ref(false)
const usersError = ref('')
const userItems = ref<AdminUserItem[]>([])
const usersTotal = ref(0)
const userSelectedId = ref<number | null>(null)
const selectedUser = ref<AdminUserItem | null>(null)
const usersSearch = ref('')
const userBindDeviceId = ref('')

const liveLoading = ref(false)
const liveError = ref('')
const f1Snapshot = ref<AdminF1LiveTimingSnapshot | null>(null)
const liveStandings = ref<AdminMotorsportLiveStandingsResponse | null>(null)
const standingsSourceUrl = ref(standingsDefaultUrl)
const liveAutoRefresh = ref(false)
let liveTimer: number | undefined

const loadedFlags = reactive<Record<ViewKey, boolean>>({
  dashboard: false,
  news: false,
  devices: false,
  users: false,
  live: false,
  settings: true,
})

const currentMeta = computed(() => pageMeta[currentView.value])
const activeNav = computed(() => navItems.find((item) => item.key === currentView.value) || navItems[0])
const effectiveApiBase = computed(() => settings.apiBase.trim() || '同域')
const themeLabel = computed(() => (settings.theme === 'dark' ? '深色' : '浅色'))
const newsPreviewHtml = computed(() => renderNewsContent(selectedNews.value))
const latestMessages = computed(() => (f1Snapshot.value?.race_control_messages || []).slice(0, 5))
const topTimingRows = computed(() => (f1Snapshot.value?.rows || []).slice(0, 10))

function setFlash(text: string, tone: 'danger' | 'success' = 'success') {
  flash.text = text
  flash.tone = tone
  window.clearTimeout((setFlash as typeof setFlash & { timer?: number }).timer)
  ;(setFlash as typeof setFlash & { timer?: number }).timer = window.setTimeout(() => {
    flash.text = ''
  }, 3000)
}

function applyTheme(theme: ThemeMode) {
  document.documentElement.classList.remove('dark')
  if (theme === 'dark') {
    document.documentElement.classList.add('dark')
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function renderRichNode(node: MpNewsRichTextNode): string {
  const tag = String(node.name || node.type || 'p').toLowerCase()
  const children = Array.isArray(node.children)
    ? node.children.map(renderRichNode).join('')
    : typeof node.children === 'string'
      ? escapeHtml(node.children)
      : node.children && typeof node.children === 'object'
        ? renderRichNode(node.children)
        : escapeHtml(node.text || '')

  if (tag === 'text') return escapeHtml(node.text || '')
  if (tag === 'bullet_list' || tag === 'ul') return `<ul>${children}</ul>`
  if (tag === 'ordered_list' || tag === 'ol') return `<ol>${children}</ol>`
  if (tag === 'list_item' || tag === 'li') return `<li>${children}</li>`
  if (tag === 'heading' || tag === 'h2' || tag === 'h3') return `<h3>${children}</h3>`
  if (tag === 'blockquote') return `<blockquote>${children}</blockquote>`
  if (tag === 'paragraph' || tag === 'p') return `<p>${children}</p>`
  return `<p>${children}</p>`
}

function syncNewsEditor(item: MpNewsItem) {
  newsEditor.title = item.title || ''
  newsEditor.summary = item.summary || ''
  newsEditor.tag_text = item.tag_text || ''
  newsEditor.type_code = item.type_code || ''
  newsEditor.layout_code = item.layout_code || ''
  newsEditor.hero_display_code = item.hero_display_code || ''
  newsEditor.pinned = Boolean(item.pinned)
  newsEditor.weight = Number(item.weight || 0)
  newsEditor.published_at = item.published_at || ''
  newsEditor.cover_url = item.cover_url || ''
  newsEditor.source_name = item.source?.name || ''
  newsEditor.source_url = item.source?.url || ''
}

function buildNewsPayload(patch: Partial<MpNewsItem> = {}): MpNewsItem {
  if (!selectedNews.value) {
    throw new Error('请先选择一篇新闻')
  }
  const payload: MpNewsItem = {
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
  }

  const sourceName = newsEditor.source_name.trim()
  const sourceUrl = newsEditor.source_url.trim()
  if (sourceName || sourceUrl) {
    payload.source = { name: sourceName, url: sourceUrl || undefined }
  } else {
    delete payload.source
  }
  if (!payload.hero_display_code) {
    delete payload.hero_display_code
  }
  return payload
}

async function loadDashboard(force = false) {
  if (dashboardLoading.value || (loadedFlags.dashboard && !force)) return
  dashboardLoading.value = true
  dashboardError.value = ''
  try {
    dashboardSummary.value = await fetchDashboardSummary(settings.timezone)
    loadedFlags.dashboard = true
  } catch (error) {
    dashboardError.value = error instanceof Error ? error.message : '总览加载失败'
  } finally {
    dashboardLoading.value = false
  }
}

async function loadNews(force = false) {
  if (newsLoading.value || (loadedFlags.news && !force && newsItems.value.length > 0)) return
  newsLoading.value = true
  newsError.value = ''
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
    })
    newsItems.value = res.items || []
    newsTotal.value = res.total || 0
    loadedFlags.news = true
    const routeId = String(route.params.id || '')
    const initialId = routeId || newsSelectedId.value || newsItems.value[0]?.id || ''
    if (initialId) {
      await openNews(initialId)
    }
  } catch (error) {
    newsError.value = error instanceof Error ? error.message : '新闻列表加载失败'
  } finally {
    newsLoading.value = false
  }
}

async function openNews(id: string) {
  if (!id) return
  newsSelectedId.value = id
  newsError.value = ''
  try {
    const res = await fetchMpNewsDetail({ id, tz: settings.timezone })
    selectedNews.value = res.item
    syncNewsEditor(res.item)
  } catch (error) {
    newsError.value = error instanceof Error ? error.message : '新闻详情加载失败'
  }
}

async function persistSelectedNews(patch: Partial<MpNewsItem> = {}) {
  if (!selectedNews.value) return
  newsSaving.value = true
  newsError.value = ''
  try {
    const payload = buildNewsPayload(patch)
    await saveMpNews(payload)
    setFlash('新闻已更新')
    await Promise.all([openNews(payload.id), loadNews(true), loadDashboard(true)])
  } catch (error) {
    newsError.value = error instanceof Error ? error.message : '新闻保存失败'
    setFlash(newsError.value, 'danger')
  } finally {
    newsSaving.value = false
  }
}

async function loadDevices(force = false) {
  if (devicesLoading.value || (loadedFlags.devices && !force && deviceItems.value.length > 0)) return
  devicesLoading.value = true
  devicesError.value = ''
  try {
    const res = await fetchAdminDevices({ page: 1, pageSize: 24, q: devicesSearch.value.trim() || undefined })
    deviceItems.value = res.items || []
    devicesTotal.value = res.total || 0
    loadedFlags.devices = true
    const routeDeviceId = String(route.params.device_id || '')
    const initialId = routeDeviceId || deviceSelectedId.value || deviceItems.value[0]?.device_id || ''
    if (initialId) {
      await openDevice(initialId)
    }
  } catch (error) {
    devicesError.value = error instanceof Error ? error.message : '设备列表加载失败'
  } finally {
    devicesLoading.value = false
  }
}

async function openDevice(deviceId: string) {
  if (!deviceId) return
  deviceSelectedId.value = deviceId
  devicesError.value = ''
  try {
    const res = await fetchAdminDeviceDetail(deviceId)
    selectedDevice.value = res.item
    deviceBindUserId.value = res.item.bound_user?.id ? String(res.item.bound_user.id) : ''
  } catch (error) {
    devicesError.value = error instanceof Error ? error.message : '设备详情加载失败'
  }
}

async function bindDeviceToUser() {
  if (!selectedDevice.value || !deviceBindUserId.value.trim()) return
  devicesSaving.value = true
  devicesError.value = ''
  try {
    await bindUserDevice({ device_id: selectedDevice.value.device_id, user_id: Number(deviceBindUserId.value) })
    setFlash('设备绑定已更新')
    await Promise.all([openDevice(selectedDevice.value.device_id), loadDevices(true), loadUsers(true), loadDashboard(true)])
  } catch (error) {
    devicesError.value = error instanceof Error ? error.message : '设备绑定失败'
    setFlash(devicesError.value, 'danger')
  } finally {
    devicesSaving.value = false
  }
}

async function unbindDevice() {
  if (!selectedDevice.value) return
  devicesSaving.value = true
  devicesError.value = ''
  try {
    await unbindUserDevice({ device_id: selectedDevice.value.device_id })
    setFlash('设备已解绑')
    await Promise.all([openDevice(selectedDevice.value.device_id), loadDevices(true), loadUsers(true), loadDashboard(true)])
  } catch (error) {
    devicesError.value = error instanceof Error ? error.message : '设备解绑失败'
    setFlash(devicesError.value, 'danger')
  } finally {
    devicesSaving.value = false
  }
}

async function loadUsers(force = false) {
  if (usersLoading.value || (loadedFlags.users && !force && userItems.value.length > 0)) return
  usersLoading.value = true
  usersError.value = ''
  try {
    const res = await fetchAdminUsers({ page: 1, pageSize: 24, q: usersSearch.value.trim() || undefined })
    userItems.value = res.items || []
    usersTotal.value = res.total || 0
    loadedFlags.users = true
    const routeUserId = route.params.user_id ? Number(route.params.user_id) : null
    const initialId = routeUserId ?? userSelectedId.value ?? userItems.value[0]?.id ?? null
    if (initialId !== null) {
      await openUser(initialId)
    }
  } catch (error) {
    usersError.value = error instanceof Error ? error.message : '用户列表加载失败'
  } finally {
    usersLoading.value = false
  }
}

async function openUser(userId: number) {
  if (!userId) return
  userSelectedId.value = userId
  usersError.value = ''
  try {
    const res = await fetchAdminUserDetail(userId)
    selectedUser.value = res.item
    userBindDeviceId.value = res.item.device?.device_id || ''
  } catch (error) {
    usersError.value = error instanceof Error ? error.message : '用户详情加载失败'
  }
}

async function bindUserToDevice() {
  if (!selectedUser.value || !userBindDeviceId.value.trim()) return
  usersSaving.value = true
  usersError.value = ''
  try {
    await bindUserDevice({ user_id: selectedUser.value.id, device_id: userBindDeviceId.value.trim() })
    setFlash('用户绑定已更新')
    await Promise.all([openUser(selectedUser.value.id), loadUsers(true), loadDevices(true), loadDashboard(true)])
  } catch (error) {
    usersError.value = error instanceof Error ? error.message : '用户绑定失败'
    setFlash(usersError.value, 'danger')
  } finally {
    usersSaving.value = false
  }
}

async function unbindUser() {
  if (!selectedUser.value) return
  usersSaving.value = true
  usersError.value = ''
  try {
    await unbindUserDevice({ user_id: selectedUser.value.id })
    setFlash('用户已解绑')
    await Promise.all([openUser(selectedUser.value.id), loadUsers(true), loadDevices(true), loadDashboard(true)])
  } catch (error) {
    usersError.value = error instanceof Error ? error.message : '用户解绑失败'
    setFlash(usersError.value, 'danger')
  } finally {
    usersSaving.value = false
  }
}

function clearLiveTimer() {
  if (liveTimer !== undefined) {
    window.clearInterval(liveTimer)
    liveTimer = undefined
  }
}

async function loadLiveF1(force = false) {
  if (liveLoading.value || (loadedFlags.live && currentLiveTab.value === 'f1' && f1Snapshot.value && !force)) return
  liveLoading.value = true
  liveError.value = ''
  try {
    const res = await fetchF1LiveTiming()
    f1Snapshot.value = res.status
    loadedFlags.live = true
  } catch (error) {
    liveError.value = error instanceof Error ? error.message : 'F1 Live Timing 加载失败'
  } finally {
    liveLoading.value = false
  }
}

async function loadStandings(force = false) {
  if (liveLoading.value || (liveStandings.value && !force)) return
  liveLoading.value = true
  liveError.value = ''
  try {
    liveStandings.value = await fetchLiveStandings({ sourceUrl: standingsSourceUrl.value.trim() || undefined })
    loadedFlags.live = true
  } catch (error) {
    liveError.value = error instanceof Error ? error.message : '榜单抓取失败'
  } finally {
    liveLoading.value = false
  }
}

function saveSettings() {
  saveStoredSettings({
    apiBase: settings.apiBase,
    token: settings.token,
    timezone: settings.timezone,
    theme: settings.theme,
  })
  applyTheme(settings.theme)
  setFlash('设置已保存，后续请求将使用新配置')
}

function restoreDefaultSettings() {
  resetStoredSettings()
  const next = getStoredSettings()
  settings.apiBase = next.apiBase
  settings.token = next.token
  settings.timezone = next.timezone
  settings.theme = next.theme
  applyTheme(settings.theme)
  setFlash('已恢复默认配置')
}

function switchView(view: ViewKey) {
  const item = navItems.find((n) => n.key === view)
  if (!item) return
  void router.push({ name: item.routeName })
}

function toggleTheme() {
  settings.theme = settings.theme === 'dark' ? 'light' : 'dark'
}

function refreshCurrentView() {
  if (currentView.value === 'dashboard') void loadDashboard(true)
  if (currentView.value === 'news') void loadNews(true)
  if (currentView.value === 'devices') void loadDevices(true)
  if (currentView.value === 'users') void loadUsers(true)
  if (currentView.value === 'live') {
    if (currentLiveTab.value === 'f1') void loadLiveF1(true)
    else void loadStandings(true)
  }
}

function jumpToUser(userId?: number) {
  if (!userId) return
  void router.push({ name: 'users-detail', params: { user_id: userId } })
}

function jumpToDevice(deviceId?: string) {
  if (!deviceId) return
  void router.push({ name: 'devices-detail', params: { device_id: deviceId } })
}

watch(
  () => settings.theme,
  (theme) => applyTheme(theme),
  { immediate: true },
)

watch(
  () => [route.name, route.meta, route.params],
  () => {
    const viewKey = (route.meta?.viewKey as ViewKey) || 'dashboard'
    const liveTab = (route.meta?.liveTab as LiveTab) || 'f1'
    currentView.value = viewKey
    currentLiveTab.value = liveTab

    if (viewKey === 'news') {
      const id = String(route.params.id || '')
      if (id) void openNews(id)
    } else if (viewKey === 'devices') {
      const deviceId = String(route.params.device_id || '')
      if (deviceId) void openDevice(deviceId)
    } else if (viewKey === 'users') {
      const uid = route.params.user_id ? Number(route.params.user_id) : null
      if (uid) void openUser(uid)
    }
  },
  { immediate: true, deep: true },
)

watch(
  [() => currentView.value, () => currentLiveTab.value, () => route.name],
  ([view, tab, name]) => {
    if (view === 'dashboard') void loadDashboard()
    if (view === 'news') void loadNews()
    if (view === 'devices') void loadDevices()
    if (view === 'users') void loadUsers()
    if (view === 'live') {
      if (tab === 'f1') void loadLiveF1()
      else void loadStandings()
    }
  },
  { immediate: true },
)

watch(
  [() => currentView.value, () => currentLiveTab.value, () => liveAutoRefresh.value],
  ([view, tab, auto]) => {
    clearLiveTimer()
    if (view === 'live' && tab === 'f1' && auto) {
      liveTimer = window.setInterval(() => {
        void loadLiveF1(true)
      }, 10000)
    }
  },
  { immediate: true },
)

onMounted(() => {
  void loadDashboard()
})

onBeforeUnmount(() => {
  clearLiveTimer()
})

function _formatDateTime(v?: string) {
  return formatDateTime(v, settings.timezone)
}
function _formatShort(v?: string) {
  return formatShort(v, settings.timezone)
}
</script>

<template>
  <div class="app-shell">
    <div class="app-frame">
      <aside class="sidebar">
        <section class="brand-card">
          <div class="brand-top">
            <div class="brand-badge">F1</div>
            <div>
              <div class="eyebrow">Branch</div>
              <div class="brand-title">Admin V2</div>
              <p class="brand-subtitle">{{ branchName }}</p>
            </div>
          </div>
          <p class="brand-subtitle" style="margin-top: 16px">
            旧版后台能力已经收敛成统一的信息架构：内容管理、设备联查、用户关联、赛事数据实验室、连接设置。
          </p>
        </section>

        <section class="nav-group">
          <button
            v-for="item in navItems"
            :key="item.key"
            class="nav-button"
            :class="{ 'is-active': currentView === item.key }"
            @click="switchView(item.key)"
          >
            <span class="nav-icon">{{ item.icon }}</span>
            <span class="nav-copy">
              <strong>{{ item.title }}</strong>
              <span>{{ item.description }}</span>
            </span>
            <span class="nav-badge">{{ item.badge }}</span>
          </button>
        </section>

        <section class="sidebar-footer">
          <button class="primary-button" @click="refreshCurrentView">刷新当前视图</button>
          <button class="ghost-button" @click="toggleTheme">切换到{{ settings.theme === 'dark' ? '浅色' : '深色' }}主题</button>
        </section>
      </aside>

      <main class="content">
        <header class="topbar">
          <div>
            <div class="eyebrow">{{ activeNav.badge }} · {{ themeLabel }}主题</div>
            <h1 class="page-title">{{ currentMeta.title }}</h1>
            <p class="page-subtitle">{{ currentMeta.subtitle }}</p>
          </div>
          <div class="topbar-actions">
            <div class="theme-chip">
              <span>API</span>
              <strong>{{ effectiveApiBase }}</strong>
            </div>
            <div class="theme-chip">
              <span>时区</span>
              <strong>{{ settings.timezone }}</strong>
            </div>
            <button class="secondary-button" @click="refreshCurrentView">立即刷新</button>
          </div>
        </header>

        <section class="page-body">
          <div v-if="flash.text" class="alert" :style="flash.tone === 'success' ? 'color:var(--success);border-color:color-mix(in srgb,var(--success) 18%, transparent);background:color-mix(in srgb,var(--success) 10%, var(--surface));' : ''">
            {{ flash.text }}
          </div>

          <template v-if="currentView === 'dashboard'">
            <section class="hero-card">
              <div class="hero-grid">
                <div>
                  <div class="eyebrow">V1 能力盘点</div>
                  <h2 class="hero-title">旧版 `./admin` 的核心页面已经抽出并重构成六个更明确的工作域。</h2>
                  <p class="hero-text">
                    原项目包含概览、新闻、设备、用户、设置、F1 Live Timing Demo、Live Standings Demo，以及一个样式 Demo。V2
                    不再把“列表页 / 详情页 / 编辑页”拆散，而是优先让筛选、预览、编辑、联查在同一屏完成。
                  </p>
                  <div class="hero-points">
                    <div class="hero-point">
                      <strong>新闻中台</strong>
                      <span class="field-hint">保留列表筛选、详情预览、Hero/Banner 设置与基础编辑。</span>
                    </div>
                    <div class="hero-point">
                      <strong>设备中心</strong>
                      <span class="field-hint">保留设备列表、设备详情、用户绑定与解绑。</span>
                    </div>
                    <div class="hero-point">
                      <strong>用户中心</strong>
                      <span class="field-hint">保留用户联查、绑定设备查看与反向维护。</span>
                    </div>
                    <div class="hero-point">
                      <strong>赛事实验室</strong>
                      <span class="field-hint">收纳旧版两个 Demo 页面，方便实时接口调试。</span>
                    </div>
                  </div>
                </div>

                <div class="surface-card">
                  <div class="card-title-row">
                    <div>
                      <div class="eyebrow">V2 结构</div>
                      <h3 class="card-title">重构原则</h3>
                    </div>
                  </div>
                  <div class="settings-list">
                    <div class="setting-row">
                      <div>
                        <strong>更少跳转</strong>
                        <div class="field-hint">列表 + 详情 + 操作整合到同一工作区。</div>
                      </div>
                      <span class="badge">01</span>
                    </div>
                    <div class="setting-row">
                      <div>
                        <strong>更强联查</strong>
                        <div class="field-hint">设备与用户之间支持直接互跳排障。</div>
                      </div>
                      <span class="badge">02</span>
                    </div>
                    <div class="setting-row">
                      <div>
                        <strong>更统一视觉</strong>
                        <div class="field-hint">整体改为柔和粉系 dashboard，降低旧版页面割裂感。</div>
                      </div>
                      <span class="badge">03</span>
                    </div>
                    <div class="setting-row">
                      <div>
                        <strong>延续原接口</strong>
                        <div class="field-hint">新闻、设备、用户和 live 数据接口全部沿用旧版约定。</div>
                      </div>
                      <span class="badge">04</span>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <div class="metric-grid">
              <div class="stat-card">
                <div class="eyebrow">News</div>
                <div class="stat-value">{{ dashboardSummary?.newsTotal ?? '--' }}</div>
                <div class="stat-note">对应旧版 `/news` 列表与详情预览</div>
              </div>
              <div class="stat-card">
                <div class="eyebrow">Devices</div>
                <div class="stat-value">{{ dashboardSummary?.deviceTotal ?? '--' }}</div>
                <div class="stat-note">对应旧版 `/devices` 与设备详情</div>
              </div>
              <div class="stat-card">
                <div class="eyebrow">Users</div>
                <div class="stat-value">{{ dashboardSummary?.userTotal ?? '--' }}</div>
                <div class="stat-note">对应旧版 `/users` 与用户详情</div>
              </div>
              <div class="stat-card">
                <div class="eyebrow">Live Timing</div>
                <div class="stat-value">{{ dashboardSummary?.liveRows ?? '--' }}</div>
                <div class="stat-note">
                  {{ dashboardSummary?.liveConnected ? '当前已连接实时通道' : '当前未连接实时通道' }}
                </div>
              </div>
            </div>

            <div v-if="dashboardError" class="alert">{{ dashboardError }}</div>

            <div class="summary-grid">
              <section class="surface-card">
                <div class="card-title-row">
                  <div>
                    <div class="eyebrow">最近入库</div>
                    <h3 class="card-title">新闻与内容流</h3>
                  </div>
                  <button class="tiny-button" @click="switchView('news')">进入新闻中台</button>
                </div>
                <div class="mini-feed">
                  <div v-for="item in dashboardSummary?.latestNews || []" :key="item.id" class="feed-item">
                    <strong>{{ item.title }}</strong>
                    <div class="feed-meta">{{ item.tag_text || '未分类' }} · {{ _formatShort(item.published_at) }}</div>
                  </div>
                  <div v-if="!(dashboardSummary?.latestNews || []).length" class="empty-state">当前没有可展示的新闻数据。</div>
                </div>
              </section>

              <section class="surface-card">
                <div class="card-title-row">
                  <div>
                    <div class="eyebrow">旧版能力映射</div>
                    <h3 class="card-title">设备与用户联动</h3>
                  </div>
                </div>
                <div class="mini-feed">
                  <div class="feed-item">
                    <strong>设备列表 + 设备详情</strong>
                    <div class="feed-meta">V2 收敛到“设备中心”，同时保留绑定用户入口。</div>
                  </div>
                  <div class="feed-item">
                    <strong>用户列表 + 用户详情</strong>
                    <div class="feed-meta">V2 收敛到“用户中心”，同时支持反向绑定设备。</div>
                  </div>
                  <div class="feed-item">
                    <strong>F1 Demo + Standings Demo</strong>
                    <div class="feed-meta">V2 收敛到“赛事实验室”，避免 Demo 入口散落。</div>
                  </div>
                </div>
              </section>
            </div>
          </template>

          <template v-else-if="currentView === 'news'">
            <section class="toolbar-card">
              <div class="card-title-row">
                <div>
                  <div class="eyebrow">筛选与定位</div>
                  <h3 class="card-title">旧版 `/news` + `/news/:id` + `/news/:id/edit` 的合并入口</h3>
                </div>
              </div>
              <div class="filters">
                <div class="field">
                  <label>关键词</label>
                  <input v-model="newsFilters.q" class="text-input" placeholder="标题 / 摘要 / 标签" />
                </div>
                <div class="field">
                  <label>Tag</label>
                  <input v-model="newsFilters.tag" class="text-input" placeholder="精确或模糊匹配" />
                </div>
                <div class="field">
                  <label>Type</label>
                  <input v-model="newsFilters.typeCode" class="text-input" placeholder="例如 PADDOCK" />
                </div>
                <div class="field">
                  <label>Layout</label>
                  <input v-model="newsFilters.layoutCode" class="text-input" placeholder="例如 HERO / FEATURE" />
                </div>
                <div class="field">
                  <label>置顶</label>
                  <select v-model="newsFilters.pinned" class="select-input">
                    <option value="">全部</option>
                    <option value="1">仅置顶</option>
                    <option value="0">仅未置顶</option>
                  </select>
                </div>
                <div class="field">
                  <label>Since</label>
                  <input v-model="newsFilters.since" class="text-input" placeholder="RFC3339 时间" />
                </div>
              </div>
              <div class="toolbar-actions">
                <button class="primary-button" :disabled="newsLoading" @click="loadNews(true)">查询新闻</button>
                <button class="secondary-button" @click="switchView('dashboard')">返回总览</button>
              </div>
            </section>

            <div v-if="newsError" class="alert">{{ newsError }}</div>

            <div class="split-view">
              <section class="surface-card news-table">
                <div class="card-title-row">
                  <div>
                    <div class="eyebrow">新闻列表</div>
                    <h3 class="card-title">共 {{ newsTotal }} 条</h3>
                  </div>
                  <span class="badge">{{ newsLoading ? '加载中' : `每页 ${newsPageSize}` }}</span>
                </div>
                <div class="table-shell">
                  <div class="table-header">
                    <div>标签</div>
                    <div>标题</div>
                    <div>布局</div>
                    <div>类型</div>
                    <div>置顶</div>
                    <div>时间</div>
                  </div>
                  <div
                    v-for="item in newsItems"
                    :key="item.id"
                    class="table-row"
                    :class="{ 'is-selected': newsSelectedId === item.id }"
                    @click="openNews(item.id)"
                  >
                    <div><span class="badge">{{ item.tag_text || '未分类' }}</span></div>
                    <div class="table-title">
                      <strong>{{ item.title }}</strong>
                      <span>{{ item.summary || '暂无摘要' }}</span>
                    </div>
                    <div>{{ item.layout_code || '--' }}</div>
                    <div>{{ item.type_code || '--' }}</div>
                    <div>
                      <span class="status-pill" :class="item.pinned ? 'is-primary' : ''">{{ item.pinned ? '置顶' : '普通' }}</span>
                    </div>
                    <div>{{ _formatShort(item.published_at) }}</div>
                  </div>
                </div>
              </section>

              <section v-if="selectedNews" class="detail-card">
                <div class="card-title-row">
                  <div>
                    <div class="eyebrow">当前文章</div>
                    <h3 class="card-title">{{ selectedNews.title }}</h3>
                  </div>
                  <span class="status-pill" :class="selectedNews.layout_code === 'HERO' ? 'is-primary' : ''">
                    {{ selectedNews.layout_code || '--' }}
                  </span>
                </div>

                <div class="action-row">
                  <button class="primary-button" :disabled="newsSaving" @click="persistSelectedNews({ layout_code: 'HERO', hero_display_code: '' })">
                    设为 Hero
                  </button>
                  <button class="secondary-button" :disabled="newsSaving" @click="persistSelectedNews({ layout_code: 'HERO', hero_display_code: 'BANNER' })">
                    Hero + Banner
                  </button>
                  <button class="ghost-button" :disabled="newsSaving" @click="persistSelectedNews({ layout_code: 'FEATURE', hero_display_code: '' })">
                    取消 Hero
                  </button>
                </div>

                <div class="detail-grid">
                  <div class="detail-item">
                    <div class="eyebrow">发布时间</div>
                    <strong>{{ _formatDateTime(selectedNews.published_at) }}</strong>
                  </div>
                  <div class="detail-item">
                    <div class="eyebrow">来源</div>
                    <strong>{{ selectedNews.source?.name || '未设置来源' }}</strong>
                  </div>
                  <div class="detail-item">
                    <div class="eyebrow">标签</div>
                    <strong>{{ selectedNews.tag_text || '未设置' }}</strong>
                  </div>
                  <div class="detail-item">
                    <div class="eyebrow">权重</div>
                    <strong>{{ selectedNews.weight || 0 }}</strong>
                  </div>
                </div>

                <div class="preview-card">
                  <img v-if="selectedNews.cover_url" :src="selectedNews.cover_url" alt="" class="preview-cover" />
                  <div class="eyebrow" style="margin-top: 14px">{{ selectedNews.tag_text || '内容预览' }}</div>
                  <h3 class="preview-title">{{ selectedNews.title }}</h3>
                  <div class="feed-meta">{{ selectedNews.source?.name || '未设置来源' }} · {{ _formatDateTime(selectedNews.published_at) }}</div>
                  <div class="preview-html" style="margin-top: 16px" v-html="newsPreviewHtml" />
                </div>

                <section class="panel">
                  <div class="card-title-row">
                    <div>
                      <div class="eyebrow">快速编辑</div>
                      <h3 class="card-title">元信息调整</h3>
                    </div>
                    <button class="primary-button" :disabled="newsSaving" @click="persistSelectedNews()">保存修改</button>
                  </div>
                  <div class="field-inline">
                    <div class="field">
                      <label>标题</label>
                      <input v-model="newsEditor.title" class="text-input" />
                    </div>
                    <div class="field">
                      <label>Tag</label>
                      <input v-model="newsEditor.tag_text" class="text-input" />
                    </div>
                  </div>
                  <div class="field">
                    <label>摘要</label>
                    <textarea v-model="newsEditor.summary" class="textarea-input" />
                  </div>
                  <div class="field-inline">
                    <div class="field">
                      <label>Type</label>
                      <input v-model="newsEditor.type_code" class="text-input" />
                    </div>
                    <div class="field">
                      <label>Layout</label>
                      <input v-model="newsEditor.layout_code" class="text-input" />
                    </div>
                  </div>
                  <div class="field-inline">
                    <div class="field">
                      <label>Hero Display</label>
                      <input v-model="newsEditor.hero_display_code" class="text-input" placeholder="BANNER 或留空" />
                    </div>
                    <div class="field">
                      <label>发布时间</label>
                      <input v-model="newsEditor.published_at" class="text-input" />
                    </div>
                  </div>
                  <div class="field-inline">
                    <div class="field">
                      <label>封面 URL</label>
                      <input v-model="newsEditor.cover_url" class="text-input" />
                    </div>
                    <div class="field">
                      <label>权重</label>
                      <input v-model="newsEditor.weight" type="number" class="text-input" />
                    </div>
                  </div>
                  <div class="field-inline">
                    <div class="field">
                      <label>来源名称</label>
                      <input v-model="newsEditor.source_name" class="text-input" />
                    </div>
                    <div class="field">
                      <label>来源链接</label>
                      <input v-model="newsEditor.source_url" class="text-input" />
                    </div>
                  </div>
                  <label class="theme-chip" style="width: fit-content">
                    <input v-model="newsEditor.pinned" type="checkbox" />
                    <span>置顶显示</span>
                  </label>
                </section>
              </section>

              <section v-else class="empty-state">请选择一篇新闻查看详情与预览。</section>
            </div>
          </template>

          <template v-else-if="currentView === 'devices'">
            <section class="toolbar-card">
              <div class="card-title-row">
                <div>
                  <div class="eyebrow">设备检索</div>
                  <h3 class="card-title">延续旧版设备管理，但将详情与绑定合入右侧工作区</h3>
                </div>
              </div>
              <div class="filters" style="grid-template-columns: 1.2fr auto">
                <div class="field">
                  <label>搜索 device_id / board / fw_user_agent</label>
                  <input v-model="devicesSearch" class="text-input" placeholder="输入关键词后查询" />
                </div>
                <div class="toolbar-actions" style="align-items: end">
                  <button class="primary-button" :disabled="devicesLoading" @click="loadDevices(true)">查询设备</button>
                </div>
              </div>
            </section>

            <div v-if="devicesError" class="alert">{{ devicesError }}</div>

            <div class="split-view">
              <section class="surface-card devices-table">
                <div class="card-title-row">
                  <div>
                    <div class="eyebrow">设备列表</div>
                    <h3 class="card-title">共 {{ devicesTotal }} 台设备</h3>
                  </div>
                  <span class="badge">{{ devicesLoading ? '加载中' : '已就绪' }}</span>
                </div>
                <div class="table-shell">
                  <div class="table-header">
                    <div>设备</div>
                    <div>板型</div>
                    <div>固件</div>
                    <div>最近活跃</div>
                    <div>绑定用户</div>
                  </div>
                  <div
                    v-for="item in deviceItems"
                    :key="item.device_id"
                    class="table-row"
                    :class="{ 'is-selected': deviceSelectedId === item.device_id }"
                    @click="openDevice(item.device_id)"
                  >
                    <div class="table-title">
                      <strong>{{ item.device_id }}</strong>
                      <span>{{ item.device_uuid || item.mac || '暂无附加标识' }}</span>
                    </div>
                    <div>{{ item.board_type || '--' }}</div>
                    <div>{{ item.fw_user_agent || '--' }}</div>
                    <div>{{ _formatShort(item.last_seen_at) }}</div>
                    <div>{{ item.bound_user?.nick_name || item.bound_user?.openid || '未绑定' }}</div>
                  </div>
                </div>
              </section>

              <section v-if="selectedDevice" class="detail-card">
                <div class="card-title-row">
                  <div>
                    <div class="eyebrow">设备详情</div>
                    <h3 class="card-title">{{ selectedDevice.device_id }}</h3>
                  </div>
                  <span class="status-pill" :class="selectedDevice.bound_user ? 'is-primary' : ''">
                    {{ selectedDevice.bound_user ? '已绑定' : '未绑定' }}
                  </span>
                </div>

                <div class="detail-grid">
                  <div class="detail-item">
                    <div class="eyebrow">Board</div>
                    <strong>{{ selectedDevice.board_type || '--' }}</strong>
                  </div>
                  <div class="detail-item">
                    <div class="eyebrow">FW</div>
                    <strong>{{ selectedDevice.fw_user_agent || '--' }}</strong>
                  </div>
                  <div class="detail-item">
                    <div class="eyebrow">首次上报</div>
                    <strong>{{ _formatDateTime(selectedDevice.first_seen_at) }}</strong>
                  </div>
                  <div class="detail-item">
                    <div class="eyebrow">最近活跃</div>
                    <strong>{{ _formatDateTime(selectedDevice.last_seen_at) }}</strong>
                  </div>
                </div>

                <section class="panel">
                  <div class="card-title-row">
                    <div>
                      <div class="eyebrow">绑定关系</div>
                      <h3 class="card-title">当前关联用户</h3>
                    </div>
                    <button
                      v-if="selectedDevice.bound_user?.id"
                      class="tiny-button"
                      @click="jumpToUser(selectedDevice.bound_user?.id)"
                    >
                      打开用户详情
                    </button>
                  </div>
                  <div v-if="selectedDevice.bound_user" class="feed-item">
                    <strong>{{ selectedDevice.bound_user.nick_name || '未命名用户' }}</strong>
                    <div class="feed-meta">ID {{ selectedDevice.bound_user.id }} · {{ selectedDevice.bound_user.openid || '无 openid' }}</div>
                  </div>
                  <div v-else class="empty-state" style="min-height: 120px">该设备当前未绑定用户。</div>
                  <div class="field" style="margin-top: 16px">
                    <label>绑定到用户 ID</label>
                    <input v-model="deviceBindUserId" class="text-input" placeholder="例如 123" />
                  </div>
                  <div class="action-row">
                    <button class="primary-button" :disabled="devicesSaving" @click="bindDeviceToUser">提交绑定</button>
                    <button class="danger-button" :disabled="devicesSaving" @click="unbindDevice">解除绑定</button>
                  </div>
                </section>
              </section>

              <section v-else class="empty-state">请选择一台设备查看详情。</section>
            </div>
          </template>

          <template v-else-if="currentView === 'users'">
            <section class="toolbar-card">
              <div class="card-title-row">
                <div>
                  <div class="eyebrow">用户检索</div>
                  <h3 class="card-title">保留旧版用户联查能力，并支持直接反向维护绑定设备</h3>
                </div>
              </div>
              <div class="filters" style="grid-template-columns: 1.2fr auto">
                <div class="field">
                  <label>搜索 id / openid / nick_name</label>
                  <input v-model="usersSearch" class="text-input" placeholder="输入关键词后查询" />
                </div>
                <div class="toolbar-actions" style="align-items: end">
                  <button class="primary-button" :disabled="usersLoading" @click="loadUsers(true)">查询用户</button>
                </div>
              </div>
            </section>

            <div v-if="usersError" class="alert">{{ usersError }}</div>

            <div class="split-view">
              <section class="surface-card users-table">
                <div class="card-title-row">
                  <div>
                    <div class="eyebrow">用户列表</div>
                    <h3 class="card-title">共 {{ usersTotal }} 位用户</h3>
                  </div>
                  <span class="badge">{{ usersLoading ? '加载中' : '已就绪' }}</span>
                </div>
                <div class="table-shell">
                  <div class="table-header">
                    <div>ID</div>
                    <div>用户</div>
                    <div>昵称</div>
                    <div>绑定设备</div>
                    <div>更新时间</div>
                  </div>
                  <div
                    v-for="item in userItems"
                    :key="item.id"
                    class="table-row"
                    :class="{ 'is-selected': userSelectedId === item.id }"
                    @click="openUser(item.id)"
                  >
                    <div><span class="badge">#{{ item.id }}</span></div>
                    <div class="table-title">
                      <strong>{{ item.openid }}</strong>
                      <span>{{ item.unionid || '无 unionid' }}</span>
                    </div>
                    <div>{{ item.nick_name || '--' }}</div>
                    <div>{{ item.device?.device_id || '未绑定' }}</div>
                    <div>{{ _formatShort(item.updated_at || item.created_at) }}</div>
                  </div>
                </div>
              </section>

              <section v-if="selectedUser" class="detail-card">
                <div class="card-title-row">
                  <div>
                    <div class="eyebrow">用户详情</div>
                    <h3 class="card-title">{{ selectedUser.nick_name || selectedUser.openid }}</h3>
                  </div>
                  <span class="status-pill" :class="selectedUser.device ? 'is-primary' : ''">
                    {{ selectedUser.device ? '已绑设备' : '未绑设备' }}
                  </span>
                </div>

                <div class="detail-grid">
                  <div class="detail-item">
                    <div class="eyebrow">OpenID</div>
                    <strong>{{ selectedUser.openid }}</strong>
                  </div>
                  <div class="detail-item">
                    <div class="eyebrow">UnionID</div>
                    <strong>{{ selectedUser.unionid || '--' }}</strong>
                  </div>
                  <div class="detail-item">
                    <div class="eyebrow">创建时间</div>
                    <strong>{{ _formatDateTime(selectedUser.created_at) }}</strong>
                  </div>
                  <div class="detail-item">
                    <div class="eyebrow">更新时间</div>
                    <strong>{{ _formatDateTime(selectedUser.updated_at) }}</strong>
                  </div>
                </div>

                <section class="panel">
                  <div class="card-title-row">
                    <div>
                      <div class="eyebrow">绑定设备</div>
                      <h3 class="card-title">设备关联维护</h3>
                    </div>
                    <button
                      v-if="selectedUser.device?.device_id"
                      class="tiny-button"
                      @click="jumpToDevice(selectedUser.device?.device_id)"
                    >
                      打开设备详情
                    </button>
                  </div>
                  <div v-if="selectedUser.device" class="feed-item">
                    <strong>{{ selectedUser.device.device_id }}</strong>
                    <div class="feed-meta">{{ selectedUser.device.board_type || '--' }} · {{ selectedUser.device.fw_user_agent || '--' }}</div>
                  </div>
                  <div v-else class="empty-state" style="min-height: 120px">该用户当前未绑定设备。</div>
                  <div class="field" style="margin-top: 16px">
                    <label>设备 ID</label>
                    <input v-model="userBindDeviceId" class="text-input" placeholder="输入 device_id 进行绑定" />
                  </div>
                  <div class="action-row">
                    <button class="primary-button" :disabled="usersSaving" @click="bindUserToDevice">提交绑定</button>
                    <button class="danger-button" :disabled="usersSaving" @click="unbindUser">解除绑定</button>
                  </div>
                </section>
              </section>

              <section v-else class="empty-state">请选择一位用户查看详情。</section>
            </div>
          </template>

          <template v-else-if="currentView === 'live'">
            <section class="toolbar-card">
              <div class="card-title-row">
                <div>
                  <div class="eyebrow">实验室</div>
                  <h3 class="card-title">旧版赛事 Demo 聚合入口</h3>
                </div>
              </div>
              <div class="tab-row">
                <button class="tab-button" :class="{ 'is-active': currentLiveTab === 'f1' }" @click="currentLiveTab = 'f1'">F1 Live Timing</button>
                <button class="tab-button" :class="{ 'is-active': currentLiveTab === 'standings' }" @click="currentLiveTab = 'standings'">Live Standings</button>
                <label v-if="currentLiveTab === 'f1'" class="theme-chip">
                  <input v-model="liveAutoRefresh" type="checkbox" />
                  <span>每 10 秒自动刷新</span>
                </label>
              </div>
            </section>

            <div v-if="liveError" class="alert">{{ liveError }}</div>

            <template v-if="currentLiveTab === 'f1'">
              <div class="timing-summary">
                <div class="mini-card" style="padding: 18px">
                  <div class="eyebrow">Session</div>
                  <div class="stat-value" style="font-size: 22px">{{ f1Snapshot?.session?.session_name || '--' }}</div>
                  <div class="stat-note">{{ f1Snapshot?.session?.meeting_name || f1Snapshot?.session?.location || '暂无会话信息' }}</div>
                </div>
                <div class="mini-card" style="padding: 18px">
                  <div class="eyebrow">连接状态</div>
                  <div class="stat-value" style="font-size: 22px">{{ f1Snapshot?.connected ? 'Connected' : 'Offline' }}</div>
                  <div class="stat-note">{{ f1Snapshot?.endpoint || '未返回 endpoint' }}</div>
                </div>
                <div class="mini-card" style="padding: 18px">
                  <div class="eyebrow">榜单行数</div>
                  <div class="stat-value" style="font-size: 22px">{{ f1Snapshot?.rows?.length || 0 }}</div>
                  <div class="stat-note">可用于校验轮询与组装结果</div>
                </div>
                <div class="mini-card" style="padding: 18px">
                  <div class="eyebrow">最后更新时间</div>
                  <div class="stat-value" style="font-size: 22px">{{ _formatShort(f1Snapshot?.last_updated_at_utc) }}</div>
                  <div class="stat-note">{{ f1Snapshot?.track_status?.message || '暂无赛道状态' }}</div>
                </div>
              </div>

              <div class="lab-grid">
                <section class="surface-card timing-table">
                  <div class="card-title-row">
                    <div>
                      <div class="eyebrow">Tower</div>
                      <h3 class="card-title">前 10 位实时榜单</h3>
                    </div>
                    <button class="tiny-button" :disabled="liveLoading" @click="loadLiveF1(true)">刷新数据</button>
                  </div>
                  <div class="table-shell">
                    <div class="table-header">
                      <div>Pos</div>
                      <div>Driver</div>
                      <div>Team</div>
                      <div>Interval</div>
                      <div>Best</div>
                      <div>Tyre</div>
                    </div>
                    <div v-for="row in topTimingRows" :key="`${row.position}-${row.driver}`" class="table-row">
                      <div><span class="badge">P{{ row.position }}</span></div>
                      <div class="table-title">
                        <strong>{{ row.driver }}</strong>
                        <span>{{ row.tla || row.racing_number || '--' }}</span>
                      </div>
                      <div>{{ row.team || '--' }}</div>
                      <div>{{ row.interval || row.gap || (row.position === 1 ? 'Leader' : '--') }}</div>
                      <div>{{ row.best_lap || '--' }}</div>
                      <div>{{ row.tyre || '--' }}</div>
                    </div>
                  </div>
                </section>

                <section class="surface-card">
                  <div class="card-title-row">
                    <div>
                      <div class="eyebrow">Race Control</div>
                      <h3 class="card-title">最近消息</h3>
                    </div>
                  </div>
                  <div class="mini-feed">
                    <div v-for="item in latestMessages" :key="`${item.utc}-${item.title}`" class="feed-item">
                      <strong>{{ item.title || item.category || '消息' }}</strong>
                      <div class="feed-meta">{{ item.message || '无附加说明' }}</div>
                      <div class="feed-meta">{{ _formatShort(item.utc) }}</div>
                    </div>
                    <div v-if="!latestMessages.length" class="empty-state" style="min-height: 180px">当前没有 race control 消息。</div>
                  </div>
                </section>
              </div>
            </template>

            <template v-else>
              <section class="toolbar-card">
                <div class="field">
                  <label>Motorsport Live Text URL</label>
                  <input v-model="standingsSourceUrl" class="text-input" placeholder="https://www.motorsport.com/f1/live-text/..." />
                </div>
                <div class="toolbar-actions">
                  <button class="primary-button" :disabled="liveLoading" @click="loadStandings(true)">抓取线上榜单</button>
                  <button class="secondary-button" @click="standingsSourceUrl = standingsDefaultUrl">恢复默认链接</button>
                </div>
              </section>

              <div class="lab-grid">
                <section class="surface-card">
                  <div class="card-title-row">
                    <div>
                      <div class="eyebrow">抓取状态</div>
                      <h3 class="card-title">{{ liveStandings?.session_title || '等待抓取' }}</h3>
                    </div>
                    <span class="status-pill" :class="liveStandings?.status?.toLowerCase() === 'live' ? 'is-success' : ''">
                      {{ liveStandings?.status || '--' }}
                    </span>
                  </div>
                  <div class="detail-grid">
                    <div class="detail-item">
                      <div class="eyebrow">Rows</div>
                      <strong>{{ liveStandings?.rows?.length || 0 }}</strong>
                    </div>
                    <div class="detail-item">
                      <div class="eyebrow">Fetched</div>
                      <strong>{{ _formatDateTime(liveStandings?.fetched_at_utc) }}</strong>
                    </div>
                  </div>
                  <div class="footer-note">用于替代旧版独立的 Live Standings Demo 页面，保留线上链接调试能力。</div>
                </section>

                <section class="surface-card standings-table">
                  <div class="card-title-row">
                    <div>
                      <div class="eyebrow">Standings</div>
                      <h3 class="card-title">实时榜单预览</h3>
                    </div>
                  </div>
                  <div class="table-shell">
                    <div class="table-header">
                      <div>Pos</div>
                      <div>Driver</div>
                      <div>Gap</div>
                      <div>Time</div>
                      <div>Tyre</div>
                    </div>
                    <div v-for="row in liveStandings?.rows || []" :key="`${row.position}-${row.driver}`" class="table-row">
                      <div><span class="badge">P{{ row.position }}</span></div>
                      <div class="table-title">
                        <strong>{{ row.driver }}</strong>
                        <span>{{ row.team }}</span>
                      </div>
                      <div>{{ row.gap || '--' }}</div>
                      <div>{{ row.time || '--' }}</div>
                      <div>{{ row.tyre || '--' }}</div>
                    </div>
                    <div v-if="!(liveStandings?.rows || []).length" class="empty-state" style="min-height: 180px">抓取后会在这里展示榜单。</div>
                  </div>
                </section>
              </div>
            </template>
          </template>

          <template v-else-if="currentView === 'settings'">
            <div class="settings-grid">
              <section class="surface-card">
                <div class="card-title-row">
                  <div>
                    <div class="eyebrow">连接配置</div>
                    <h3 class="card-title">兼容旧版设置页</h3>
                    <p class="card-description">
                      继续使用旧版 `API Base` 与 `Token` 约定。保存后，新闻写回、设备绑定、用户解绑、赛事调试都会立即使用新配置。
                    </p>
                  </div>
                </div>

                <div class="field">
                  <label>API Base</label>
                  <input v-model="settings.apiBase" class="text-input" placeholder="留空表示同域，例如 http://localhost:8080" />
                </div>
                <div class="field">
                  <label>Token</label>
                  <input v-model="settings.token" class="text-input" placeholder="如果后端要求 token，则在这里填入" />
                </div>
                <div class="field-inline">
                  <div class="field">
                    <label>显示时区</label>
                    <input v-model="settings.timezone" class="text-input" placeholder="Asia/Shanghai" />
                  </div>
                  <div class="field">
                    <label>主题</label>
                    <select v-model="settings.theme" class="select-input">
                      <option value="light">浅色</option>
                      <option value="dark">深色</option>
                    </select>
                  </div>
                </div>

                <div class="action-row">
                  <button class="primary-button" @click="saveSettings">保存设置</button>
                  <button class="secondary-button" @click="restoreDefaultSettings">恢复默认</button>
                </div>
              </section>

              <section class="surface-card">
                <div class="card-title-row">
                  <div>
                    <div class="eyebrow">V2 说明</div>
                    <h3 class="card-title">这次重写保留了什么</h3>
                  </div>
                </div>
                <div class="settings-list">
                  <div class="setting-row">
                    <div>
                      <strong>新闻回写能力</strong>
                      <div class="field-hint">继续走 `/api/v1/mp/news/ingest`，兼容 Hero / Banner 设置。</div>
                    </div>
                    <span class="status-pill is-success">保留</span>
                  </div>
                  <div class="setting-row">
                    <div>
                      <strong>设备与用户绑定维护</strong>
                      <div class="field-hint">继续使用 `/api/v1/admin/bind` 和 `/api/v1/admin/unbind`。</div>
                    </div>
                    <span class="status-pill is-success">保留</span>
                  </div>
                  <div class="setting-row">
                    <div>
                      <strong>赛事调试页</strong>
                      <div class="field-hint">旧版两个 Demo 被整合进一个实验室页面。</div>
                    </div>
                    <span class="status-pill is-primary">重组</span>
                  </div>
                  <div class="setting-row">
                    <div>
                      <strong>视觉风格</strong>
                      <div class="field-hint">从旧版深色工业感切换到更柔和统一的粉系运营后台。</div>
                    </div>
                    <span class="status-pill is-warning">升级</span>
                  </div>
                </div>
              </section>
            </div>
          </template>

          <div class="footer-note">
            当前实现为独立的 `admin-v2` 前端骨架，复用了旧版后台的接口能力与工作流映射，方便后续继续细化模块。
          </div>
        </section>
      </main>
    </div>
  </div>
</template>
