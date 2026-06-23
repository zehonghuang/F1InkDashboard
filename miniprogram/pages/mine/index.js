const { getAuthState, loginWithWeChat, logout, fetchMe, bindDevice, uploadAvatar, updateNickName, setProfile } = require("../../services/authService")
const { fetchPrefs, updatePrefs } = require("../../services/prefsService")
const i18n = require("../../services/i18n")

const STORAGE_KEYS = {
  season: "pref_season",
  followDrivers: "pref_follow_drivers",
  followTeams: "pref_follow_teams",
  followDriversDict: "pref_follow_drivers_dict",
  followTeamsDict: "pref_follow_teams_dict",
  prefsInited: "pref_prefs_inited",
  heroCoverUrl: "mine_hero_cover_url"
}

const HERO_PULL_TRIGGER = 84
const HERO_PULL_MAX = 126

Page({
  data: {
    i18n: i18n.getDict(),
    locale: i18n.getLocale(),
    isLoggedIn: false,
    profile: null,
    displayName: i18n.t("mine.guestName"),
    avatarText: "G",
    loadingLogin: false,
    syncingProfile: false,
    bindingDevice: false,
    deviceId: "",
    hasAvatar: false,
    hasNick: false,
    canEditProfile: false,
    nicknameDraft: "",
    profileGuideVisible: false,
    profileGuideDoneCount: 0,
    profileGuideTotal: 2,
    profileGuideTitle: "",
    statusBarHeight: 0,
    prefSeason: 2026,
    followDrivers: [],
    followDriversText: i18n.t("mine.notSet"),
    followDriverThumbs: [],
    followDriverMoreCount: 0,
    followTeams: [],
    followTeamsText: i18n.t("mine.notSet"),
    followTeamThumbs: [],
    followTeamMoreCount: 0,
    heroCoverUrl: "",
    heroCoverStyle: "",
    heroFrameWidth: 0,
    heroFrameHeight: 0,
    pageScrollTop: 0,
    heroPullDistance: 0,
    heroPullReady: false,
    heroPullAnimating: false,
    showPicker: false,
    pickerMode: "",
    pickerTitle: "",
    pickedMap: {},
    pickedSnapshot: {},
    driverOptions: [],
    teamOptions: [],
    syncingPrefs: false
  },
  onLoad() {
    this._offLocale = i18n.onLocaleChange(() => this.applyI18n())
    try {
      const sys = wx.getSystemInfoSync()
      const h = Number(sys && sys.statusBarHeight) || 0
      this.setData({ statusBarHeight: h })
    } catch (e) {}
    this.applyI18n()
    this.loadHeroCover()
    this.loadPreferences()
    this.refreshAuth()
  },
  onUnload() {
    if (this._offLocale) this._offLocale()
  },
  onReady() {
    this.measureHeroRect()
  },
  onShow() {
    this.applyI18n()
    this.refreshAuth()
    this.loadPreferences()
    this.measureHeroRect()
    try {
      const s = getAuthState()
      if (s && s.isLoggedIn) {
        fetchMe()
          .then(() => this.refreshAuth())
          .then(() => this.ensurePrefsCached({ silent: true }))
          .catch(() => {})
      }
    } catch (e) {}
    if (typeof this.getTabBar === 'function') {
      const tb = this.getTabBar()
      if (tb && typeof tb.setSelectedByRoute === 'function') {
        tb.setSelectedByRoute(this.route)
      }
    }
  },
  onPageScroll(e) {
    const top = e && Number.isFinite(e.scrollTop) ? e.scrollTop : Number((e && e.scrollTop) || 0)
    this.setData({ pageScrollTop: top > 0 ? top : 0 })
  },
  async syncPrefsFromBackend(opts) {
    if (this.data.syncingPrefs) return
    const s = getAuthState()
    if (!s || !s.isLoggedIn) return
    this.setData({ syncingPrefs: true })
    try {
      const r = await fetchPrefs()
      const teamKeys = (r && r.teamKeys) || []
      const driverNumbers = (r && r.driverNumbers) || []
      const teams = (r && r.teams) || {}
      const drivers = (r && r.drivers) || {}
      try {
        wx.setStorageSync(STORAGE_KEYS.followTeams, teamKeys)
      } catch (e) {}
      try {
        wx.setStorageSync(STORAGE_KEYS.followDrivers, driverNumbers)
      } catch (e) {}
      try {
        wx.setStorageSync(STORAGE_KEYS.followTeamsDict, teams)
      } catch (e) {}
      try {
        wx.setStorageSync(STORAGE_KEYS.followDriversDict, drivers)
      } catch (e) {}
      try {
        wx.setStorageSync(STORAGE_KEYS.prefsInited, "1")
      } catch (e) {}
      this.loadPreferences()
    } catch (e) {
      if (!(opts && opts.silent)) {
        wx.showToast({ title: i18n.t("common.prefsSyncFailed"), icon: "none" })
      }
    } finally {
      this.setData({ syncingPrefs: false })
    }
  },
  ensurePrefsCached(opts) {
    const s = getAuthState()
    if (!s || !s.isLoggedIn) return
    try {
      const inited = wx.getStorageSync(STORAGE_KEYS.prefsInited) === "1"
      if (inited) return
    } catch (e) {}
    try {
      const info = wx.getStorageInfoSync()
      const keys = (info && info.keys) || []
      if (keys.includes(STORAGE_KEYS.followDrivers) || keys.includes(STORAGE_KEYS.followTeams)) {
        try {
          wx.setStorageSync(STORAGE_KEYS.prefsInited, "1")
        } catch (e) {}
        return
      }
    } catch (e) {}
    Promise.resolve(this.syncPrefsFromBackend(opts)).catch(() => {})
  },
  loadPreferences() {
    let prefSeason = 2026
    let followDrivers = []
    let followTeams = []
    let followTeamsDict = {}
    let followDriversDict = {}
    try {
      const s = wx.getStorageSync(STORAGE_KEYS.season)
      const n = Number(s)
      if (n > 0) prefSeason = n
    } catch (e) {}
    try {
      const xs = wx.getStorageSync(STORAGE_KEYS.followDrivers)
      if (Array.isArray(xs)) followDrivers = xs.map((x) => Number(x)).filter((x) => x > 0)
    } catch (e) {}
    try {
      const xs = wx.getStorageSync(STORAGE_KEYS.followTeams)
      if (Array.isArray(xs)) followTeams = xs.map((x) => String(x || "").trim()).filter(Boolean)
    } catch (e) {}
    try {
      const m = wx.getStorageSync(STORAGE_KEYS.followTeamsDict)
      if (m && typeof m === "object") followTeamsDict = m
    } catch (e) {}
    try {
      const m = wx.getStorageSync(STORAGE_KEYS.followDriversDict)
      if (m && typeof m === "object") followDriversDict = m
    } catch (e) {}

    const dict = i18n.getDict()
    const followDriversText = followDrivers.length ? `${followDrivers.length}${dict.mine.peopleUnit}` : dict.mine.notSet
    const followTeamsText = followTeams.length ? `${followTeams.length}${dict.mine.teamsUnit}` : dict.mine.notSet
    this.setData({ prefSeason, followDrivers, followDriversText, followTeams, followTeamsText }, () => {
      this.refreshFollowTextsFromOptions()
      if ((this.data.followDrivers || []).length || (this.data.followTeams || []).length) {
        this.ensurePickOptions({ silent: true })
      }
    })
    try {
      const app = getApp()
      if (app && app.globalData) {
        app.globalData.prefs = { season: prefSeason, followDrivers, followTeams, followTeamsDict, followDriversDict }
      }
    } catch (e) {}
  },
  loadHeroCover() {
    let heroCoverUrl = ""
    try {
      heroCoverUrl = String(wx.getStorageSync(STORAGE_KEYS.heroCoverUrl) || "").trim()
    } catch (e) {}
    this.setData({
      heroCoverUrl,
      heroCoverStyle: this.buildHeroCoverStyle(heroCoverUrl)
    })
  },
  saveHeroCoverState(patch) {
    if (!patch || typeof patch !== "object") return
    if (Object.prototype.hasOwnProperty.call(patch, "heroCoverUrl")) {
      const url = String(patch.heroCoverUrl || "").trim()
      try {
        if (url) wx.setStorageSync(STORAGE_KEYS.heroCoverUrl, url)
        else wx.removeStorageSync(STORAGE_KEYS.heroCoverUrl)
      } catch (e) {}
    }
  },
  saveLocalFile(tempFilePath) {
    const fp = String(tempFilePath || "").trim()
    if (!fp) return Promise.reject(new Error("cover_file_required"))
    return new Promise((resolve) => {
      wx.saveFile({
        tempFilePath: fp,
        success: (res) => resolve(String((res && res.savedFilePath) || fp).trim() || fp),
        fail: () => resolve(fp)
      })
    })
  },
  buildHeroCoverStyle(url) {
    const v = String(url || "").trim()
    if (!v) return ""
    const safe = v.replace(/'/g, "%27")
    return `background-image:url('${safe}');`
  },
  measureHeroRect() {
    return new Promise((resolve) => {
      const query = this.createSelectorQuery ? this.createSelectorQuery() : wx.createSelectorQuery()
      query.select(".hero-cover-frame").boundingClientRect((rect) => {
        if (rect && Number(rect.width) > 0 && Number(rect.height) > 0) {
          const out = {
            width: Math.round(Number(rect.width)),
            height: Math.round(Number(rect.height))
          }
          this.setData({
            heroFrameWidth: out.width,
            heroFrameHeight: out.height
          })
          resolve(out)
          return
        }
        const sys = wx.getSystemInfoSync()
        const windowWidth = Number(sys && sys.windowWidth) || 375
        const fallbackWidth = Math.round(windowWidth - (windowWidth * 48) / 750)
        const fallbackHeight = Math.round(fallbackWidth / 1.45)
        const out = { width: fallbackWidth, height: fallbackHeight }
        this.setData({
          heroFrameWidth: out.width,
          heroFrameHeight: out.height
        })
        resolve(out)
      }).exec()
    })
  },
  onHeroPullStart(e) {
    const touch = e && e.touches && e.touches[0]
    if (!touch) return
    this._heroPullTouch = {
      startX: Number(touch.clientX) || 0,
      startY: Number(touch.clientY) || 0,
      active: false
    }
    if (this.data.heroPullAnimating) {
      this.setData({ heroPullAnimating: false })
    }
  },
  onHeroPullMove(e) {
    const touch = e && e.touches && e.touches[0]
    const state = this._heroPullTouch
    if (!touch || !state) return
    if ((this.data.pageScrollTop || 0) > 2) return
    const deltaX = (Number(touch.clientX) || 0) - state.startX
    const deltaY = (Number(touch.clientY) || 0) - state.startY
    if (!state.active) {
      if (deltaY <= 0) return
      if (Math.abs(deltaY) <= Math.abs(deltaX)) return
      state.active = true
    }
    const resisted = Math.round(Math.min(HERO_PULL_MAX, deltaY * 0.48))
    this.setData({
      heroPullAnimating: false,
      heroPullDistance: resisted,
      heroPullReady: resisted >= HERO_PULL_TRIGGER
    })
  },
  onHeroPullEnd() {
    const shouldOpen = Boolean(this.data.heroPullReady)
    this._heroPullTouch = null
    if (!this.data.heroPullDistance && !this.data.heroPullReady) return
    this.setData({
      heroPullDistance: 0,
      heroPullReady: false,
      heroPullAnimating: true
    })
    setTimeout(() => {
      this.setData({ heroPullAnimating: false })
    }, 180)
    if (shouldOpen) {
      setTimeout(() => this.openHeroCoverActions(), 120)
    }
  },
  getHeroRect() {
    if ((this.data.heroFrameWidth || 0) > 0 && (this.data.heroFrameHeight || 0) > 0) {
      return Promise.resolve({
        width: this.data.heroFrameWidth,
        height: this.data.heroFrameHeight
      })
    }
    return this.measureHeroRect()
  },
  refreshAuth() {
    const s = getAuthState()
    const profile = s.profile
    const name = profile && (profile.nickName || profile.nickname) ? profile.nickName || profile.nickname : i18n.t("mine.guestName")
    const avatarUrl = profile && profile.avatarUrl ? String(profile.avatarUrl || "").trim() : ""
    const hasAvatar = Boolean(avatarUrl)
    const hasNick = Boolean(String(name || "").trim() && name !== i18n.t("mine.guestName"))
    const canEditProfile = Boolean(s.isLoggedIn && !(hasAvatar && hasNick))
    const profileGuideDoneCount = (hasAvatar ? 1 : 0) + (hasNick ? 1 : 0)
    const profileGuideTotal = 2
    const avatarText = name ? String(name).slice(0, 1).toUpperCase() : "G"
    this.setData({
      isLoggedIn: s.isLoggedIn,
      profile: profile || null,
      displayName: name,
      avatarText,
      deviceId: s.deviceId || "",
      hasAvatar,
      hasNick,
      canEditProfile,
      nicknameDraft: hasNick ? String(name || "").trim() : "",
      profileGuideVisible: Boolean(s.isLoggedIn && canEditProfile),
      profileGuideDoneCount,
      profileGuideTotal,
      profileGuideTitle: i18n.t("mine.profileGuideTitle", { done: profileGuideDoneCount, total: profileGuideTotal })
    })
  },
  onTapItem(e) {
    const action = e && e.currentTarget && e.currentTarget.dataset ? e.currentTarget.dataset.action : ""
    if (action === "standings") {
      const season = Number(this.data.prefSeason || 0) || 2026
      wx.navigateTo({ url: `/pages/standings/index?season=${season}` })
      return
    }
    if (action === "tyreIntro") {
      wx.navigateTo({ url: "/pages/tyre-intro/index" })
      return
    }
    if (action === "shop") {
      wx.navigateTo({ url: "/pages/shop/index" })
      return
    }
    if (String(action || "").startsWith("soon")) {
      wx.showToast({ title: i18n.t("common.comingSoon"), icon: "none" })
      return
    }
    if (action === "followDrivers") {
      this.openPicker("drivers")
      return
    }
    if (action === "followTeams") {
      this.openPicker("teams")
      return
    }
    wx.showToast({ title: i18n.t("common.featurePending"), icon: "none" })
  },
  async onChooseHeroCover() {
    try {
      const heroRect = await this.getHeroRect()
      const res = await new Promise((resolve, reject) => {
        wx.chooseMedia({
          count: 1,
          mediaType: ["image"],
          sizeType: ["compressed"],
          success: resolve,
          fail: reject
        })
      })
      const file =
        (res && Array.isArray(res.tempFiles) && res.tempFiles[0] && res.tempFiles[0].tempFilePath) ||
        ""
      if (!file) throw new Error("cover_file_missing")
      wx.navigateTo({
        url: `/pages/image-crop/index?file=${encodeURIComponent(file)}&scene=mine-hero&targetWidth=${encodeURIComponent(heroRect.width)}&targetHeight=${encodeURIComponent(heroRect.height)}`,
        events: {
          done: async (payload) => {
            const croppedPath = payload && payload.filePath ? String(payload.filePath || "").trim() : ""
            if (!croppedPath) return
            const savedFilePath = await this.saveLocalFile(croppedPath)
            if (!savedFilePath) return
            this.setData({
              heroCoverUrl: savedFilePath,
              heroCoverStyle: this.buildHeroCoverStyle(savedFilePath)
            })
            this.saveHeroCoverState({ heroCoverUrl: savedFilePath })
            wx.showToast({ title: i18n.t("mine.coverUpdated"), icon: "none" })
          }
        }
      })
    } catch (e) {
      const msg = String((e && (e.errMsg || e.message)) || "")
      if (msg && /cancel/i.test(msg)) return
      wx.showToast({ title: i18n.t("mine.coverUploadFailed"), icon: "none" })
    }
  },
  openHeroCoverActions() {
    this.onChooseHeroCover()
  },
  onRemoveHeroCover() {
    this.setData({
      heroCoverUrl: "",
      heroCoverStyle: ""
    })
    this.saveHeroCoverState({ heroCoverUrl: "" })
    wx.showToast({ title: i18n.t("mine.coverRemoved"), icon: "none" })
  },
  openPicker(mode) {
    const m = mode === "teams" ? "teams" : "drivers"
    const dict = i18n.getDict()
    const title = m === "teams" ? dict.mine.followTeams : dict.mine.followDrivers
    const pickedMap = {}
    if (m === "drivers") {
      for (const dn of this.data.followDrivers || []) {
        const n = Number(dn)
        if (n > 0) pickedMap[n] = true
      }
    } else {
      for (const k of this.data.followTeams || []) {
        const s = String(k || "").trim()
        if (s) pickedMap[s] = true
      }
    }
    this.setData(
      {
        showPicker: true,
        pickerMode: m,
        pickerTitle: title,
        pickedMap,
        pickedSnapshot: Object.assign({}, pickedMap)
      },
      () => {
        this.ensurePickOptions()
      }
    )
  },
  onClosePicker() {
    this.onPickerCancel()
  },
  onPickerCancel() {
    this.setData({ showPicker: false, pickerMode: "", pickerTitle: "", pickedMap: {}, pickedSnapshot: {} })
  },
  onPickerConfirm() {
    const mode = this.data.pickerMode
    if (mode === "drivers") {
      const out = Object.keys(this.data.pickedMap || {})
        .map((k) => Number(k))
        .filter((x) => x > 0)
        .sort((a, b) => a - b)
      try {
        wx.setStorageSync(STORAGE_KEYS.followDrivers, out)
      } catch (e) {}
      try {
        wx.setStorageSync(STORAGE_KEYS.prefsInited, "1")
      } catch (e) {}
      if (this.data.isLoggedIn) {
        updatePrefs({ teamKeys: this.data.followTeams || [], driverNumbers: out }).catch(() => {
          wx.showToast({ title: i18n.t("common.prefsSaveFailed"), icon: "none" })
        })
      }
    } else if (mode === "teams") {
      const out = Object.keys(this.data.pickedMap || {})
        .map((k) => String(k || "").trim())
        .filter(Boolean)
        .sort()
      try {
        wx.setStorageSync(STORAGE_KEYS.followTeams, out)
      } catch (e) {}
      try {
        wx.setStorageSync(STORAGE_KEYS.prefsInited, "1")
      } catch (e) {}
      if (this.data.isLoggedIn) {
        updatePrefs({ teamKeys: out, driverNumbers: this.data.followDrivers || [] }).catch(() => {
          wx.showToast({ title: i18n.t("common.prefsSaveFailed"), icon: "none" })
        })
      }
    }
    this.setData({ showPicker: false, pickerMode: "", pickerTitle: "", pickedSnapshot: {} }, () => {
      this.loadPreferences()
    })
  },
  onTogglePickDriver(e) {
    const dn = Number((e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.driverNumber) || 0)
    if (!dn) return
    const m = Object.assign({}, this.data.pickedMap || {})
    if (m[dn]) {
      delete m[dn]
    } else {
      m[dn] = true
    }
    this.setData({ pickedMap: m })
  },
  onTogglePickTeam(e) {
    const k = String((e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.teamKey) || "").trim()
    if (!k) return
    const m = Object.assign({}, this.data.pickedMap || {})
    if (m[k]) {
      delete m[k]
    } else {
      m[k] = true
    }
    this.setData({ pickedMap: m })
  },
  ensurePickOptions(opts) {
    if (this.data.driverOptions && this.data.driverOptions.length && this.data.teamOptions && this.data.teamOptions.length) {
      return
    }
    const app = getApp()
    const apiBase = (app && app.globalData && app.globalData.apiBase) || ""
    if (!apiBase) {
      if (!(opts && opts.silent)) {
        wx.showToast({ title: i18n.t("common.backendNotConfigured"), icon: "none" })
      }
      return
    }
    const season = Number(this.data.prefSeason || 2026)
    const base = apiBase.replace(/\/+$/, "")
    const archiveUrl = `${base}/api/v1/mp/archive?season=${season}&tz=Asia/Shanghai`
    wx.request({
      url: archiveUrl,
      method: "GET",
      header: { "Accept-Language": i18n.getLocale() },
      success: (res) => {
        const data = (res && res.data) || {}
        const races = Array.isArray(data.races) ? data.races : []
        const latest = races.find((x) => x && Number(x.openf1_race_session_key) > 0) || races[0]
        const sk = latest ? Number(latest.openf1_race_session_key || 0) : 0
        if (!sk) {
          if (!(opts && opts.silent)) {
            wx.showToast({ title: i18n.t("common.noSeasonData"), icon: "none" })
          }
          return
        }
        this.loadDriverOptionsBySessionKey(sk)
      },
      fail: (err) => {
        try {
          console.log({ url: archiveUrl, err })
        } catch (e) {}
        if (!(opts && opts.silent)) {
          wx.showToast({ title: i18n.t("common.fetchSeasonFailed"), icon: "none" })
        }
      }
    })
  },
  loadDriverOptionsBySessionKey(sessionKey) {
    const app = getApp()
    const apiBase = (app && app.globalData && app.globalData.apiBase) || ""
    if (!apiBase || !sessionKey) return
    const base = apiBase.replace(/\/+$/, "")
    const url = `${base}/api/v1/mp/session-results?session_key=${sessionKey}`
    wx.request({
      url,
      method: "GET",
      header: { "Accept-Language": i18n.getLocale() },
      success: (res) => {
        const data = (res && res.data) || {}
        const items = Array.isArray(data.items) ? data.items : []
        const driverOptions = items.map((it) => {
          const c = (it && it.team_color) || ""
          const cardStyle = c ? `border-left: 10rpx solid ${c}; padding-left: 16rpx;` : ""
          return Object.assign({}, it, { cardStyle })
        })
        const teamOptions = this.buildTeamOptions(driverOptions)
        this.setData({ driverOptions, teamOptions }, () => this.refreshFollowTextsFromOptions())
      },
      fail: (err) => {
        try {
          console.log({ url, err })
        } catch (e) {}
        wx.showToast({ title: i18n.t("common.fetchDriverListFailed"), icon: "none" })
      }
    })
  },
  buildTeamOptions(driverOptions) {
    const byTeam = {}
    for (const it of driverOptions || []) {
      const name = String((it && it.team_name) || "").trim()
      if (!name) continue
      if (!byTeam[name]) {
        byTeam[name] = {
          team_key: name,
          team_name: name,
          team_color: (it && it.team_color) || "",
          team_logo_url: (it && it.team_logo_url) || ""
        }
      }
    }
    const teams = Object.values(byTeam)
    teams.sort((a, b) => String(a.team_name).localeCompare(String(b.team_name)))
    return teams.map((t) => {
      const c = t.team_color || ""
      const cardStyle = c ? `border-left: 10rpx solid ${c}; padding-left: 16rpx;` : ""
      return Object.assign({}, t, { cardStyle })
    })
  },
  refreshFollowTextsFromOptions() {
    const drivers = this.data.followDrivers || []
    const teams = this.data.followTeams || []
    const driverOptions = this.data.driverOptions || []
    const teamOptions = this.data.teamOptions || []
    const byDriver = {}
    for (const it of driverOptions) {
      const dn = Number(it && it.driver_number)
      if (!dn) continue
      byDriver[dn] = it
    }
    const driverLabels = drivers.map((dn) => {
      const n = Number(dn)
      if (!n) return ""
      const it = byDriver[n]
      if (!it) return `#${n}`
      return String(it.name_acronym || it.full_name || it.driver_name || it.driver_number || "").trim() || `#${n}`
    }).filter(Boolean)
    const dict = i18n.getDict()
    const followDriversText = drivers.length ? (driverLabels.length ? driverLabels.join(" / ") : dict.mine.notSet) : dict.mine.notSet

    const followTeamsText = teams.length ? teams.join(" / ") : dict.mine.notSet
    const byTeam = {}
    for (const it of teamOptions || []) {
      const k = String((it && it.team_key) || "").trim()
      if (!k) continue
      byTeam[k] = it
    }

    const maxThumbs = 6
    const driverThumbsAll = drivers
      .map((dn) => {
        const n = Number(dn)
        if (!n) return null
        const it = byDriver[n] || null
        const url = it && it.headshot_url ? String(it.headshot_url || "").trim() : ""
        const text =
          it && (it.name_acronym || it.full_name || it.driver_name)
            ? String(it.name_acronym || it.full_name || it.driver_name).trim().slice(0, 3)
            : `#${n}`
        const color = it && it.team_color ? String(it.team_color || "").trim() : ""
        return { key: String(n), url, text, color }
      })
      .filter(Boolean)
    const followDriverThumbs = driverThumbsAll.slice(0, maxThumbs)
    const followDriverMoreCount = Math.max(0, driverThumbsAll.length - maxThumbs)

    const teamThumbsAll = teams
      .map((k0) => {
        const k = String(k0 || "").trim()
        if (!k) return null
        const it = byTeam[k] || null
        const url = it && it.team_logo_url ? String(it.team_logo_url || "").trim() : ""
        const text = String((it && (it.team_name || it.team_key)) || k).trim().slice(0, 1)
        const color = it && it.team_color ? String(it.team_color || "").trim() : ""
        return { key: k, url, text, color }
      })
      .filter(Boolean)
    const followTeamThumbs = teamThumbsAll.slice(0, maxThumbs)
    const followTeamMoreCount = Math.max(0, teamThumbsAll.length - maxThumbs)

    this.setData({
      followDriversText,
      followTeamsText,
      followDriverThumbs,
      followDriverMoreCount,
      followTeamThumbs,
      followTeamMoreCount
    })
  },
  async onAvatarTap() {
    if (!this.data.isLoggedIn) {
      this.onLogin()
      return
    }
    return
  },
  async onChooseAvatar(e) {
    if (!this.data.isLoggedIn) {
      wx.showToast({ title: i18n.t("common.loginFirst"), icon: "none" })
      return
    }
    const temp = e && e.detail && e.detail.avatarUrl ? String(e.detail.avatarUrl || "").trim() : ""
    if (!temp) return

    const s = getAuthState()
    const prev = s && s.profile ? s.profile : null
    setProfile(Object.assign({}, prev || {}, { avatarUrl: temp }))
    this.refreshAuth()

    if (this.data.syncingProfile) return
    this.setData({ syncingProfile: true })
    try {
      await uploadAvatar(temp)
      await fetchMe()
      this.refreshAuth()
      wx.showToast({ title: i18n.t("common.avatarUpdated"), icon: "none" })
    } catch (e2) {
      try {
        console.log("[mine] upload avatar failed", e2)
      } catch (err) {}
      const msg = String((e2 && (e2.errMsg || e2.message)) || "unknown").slice(0, 40)
      wx.showToast({ title: i18n.t("common.avatarUploadFailed", { msg }), icon: "none" })
    } finally {
      this.setData({ syncingProfile: false })
    }
  },
  async onNicknameBlur(e) {
    if (!this.data.isLoggedIn) return
    const v = e && e.detail && e.detail.value ? String(e.detail.value || "").trim() : ""
    if (!v) return
    if (this.data.syncingProfile) return
    this.setData({ syncingProfile: true })
    try {
      await updateNickName(v)
      await fetchMe()
      this.refreshAuth()
      wx.showToast({ title: i18n.t("common.nicknameUpdated"), icon: "none" })
    } catch (e2) {
      try {
        console.log("[mine] update nickname failed", e2)
      } catch (err) {}
      wx.showToast({ title: i18n.t("common.nicknameSyncFailed"), icon: "none" })
    } finally {
      this.setData({ syncingProfile: false })
    }
  },
  async onLogin() {
    if (this.data.loadingLogin) return
    this.setData({ loadingLogin: true })
    try {
      await loginWithWeChat()
      this.refreshAuth()
      try {
        await fetchMe()
        this.refreshAuth()
        await this.syncPrefsFromBackend({ silent: true })
      } catch (e) {}
      wx.showToast({ title: i18n.t("common.loginSuccess"), icon: "none" })
    } catch (e) {
      try {
        console.log("[mine] login failed", e)
      } catch (err) {}
      wx.showToast({ title: i18n.t("common.loginFailed", { msg: String((e && e.message) || "unknown") }), icon: "none" })
    } finally {
      this.setData({ loadingLogin: false })
    }
  },
  async onBindDevice() {
    if (!this.data.isLoggedIn) {
      wx.showToast({ title: i18n.t("common.loginFirst"), icon: "none" })
      return
    }
    if (this.data.bindingDevice) return

    this.setData({ bindingDevice: true })
    try {
      const deviceId = await new Promise((resolve, reject) => {
        wx.showModal({
          title: i18n.t("common.bindDeviceTitle"),
          editable: true,
          placeholderText: i18n.t("common.bindDevicePlaceholder"),
          success: (res) => {
            if (!res || !res.confirm) {
              reject(new Error("cancel"))
              return
            }
            resolve(String(res.content || "").trim())
          },
          fail: reject
        })
      })
      await bindDevice(deviceId)
      this.refreshAuth()
      wx.showToast({ title: i18n.t("common.bound"), icon: "none" })
    } catch (e) {
      if (String(e && e.message || "") !== "cancel") {
        wx.showToast({ title: i18n.t("common.bindFailed"), icon: "none" })
      }
    } finally {
      this.setData({ bindingDevice: false })
    }
  },
  async onLogout() {
    await logout()
    this.refreshAuth()
    wx.showToast({ title: i18n.t("common.logoutSuccess"), icon: "none" })
  },
  onChangeLanguage() {
    const dict = i18n.getDict()
    wx.showActionSheet({
      itemList: [dict.locale.zhName, dict.locale.enName],
      success: (res) => {
        const idx = Number(res && res.tapIndex)
        const next = idx === 1 ? "en-US" : "zh-CN"
        i18n.setLocale(next)
        wx.showToast({ title: i18n.t("locale.switched"), icon: "none" })
      }
    })
  },
  applyI18n() {
    const dict = i18n.getDict()
    this.setData({ i18n: dict, locale: i18n.getLocale() })
    this.refreshAuth()
    this.refreshFollowTextsFromOptions()
    wx.setNavigationBarTitle({ title: dict.nav.mine })
  }
})
