const { getAuthState, loginWithWeChat, logout, fetchMe, bindDevice, uploadAvatar, updateNickName, setProfile } = require("../../services/authService")
const { fetchPrefs, updatePrefs } = require("../../services/prefsService")

const STORAGE_KEYS = {
  season: "pref_season",
  followDrivers: "pref_follow_drivers",
  followTeams: "pref_follow_teams"
}

Page({
  data: {
    isLoggedIn: false,
    profile: null,
    displayName: "游客",
    avatarText: "G",
    loadingLogin: false,
    syncingProfile: false,
    bindingDevice: false,
    deviceId: "",
    hasAvatar: false,
    hasNick: false,
    canEditProfile: false,
    nicknameDraft: "",
    statusBarHeight: 0,
    prefSeason: 2026,
    followDrivers: [],
    followDriversText: "未设置",
    followTeams: [],
    followTeamsText: "未设置",
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
    try {
      const sys = wx.getSystemInfoSync()
      const h = Number(sys && sys.statusBarHeight) || 0
      this.setData({ statusBarHeight: h })
    } catch (e) {}
    this.loadPreferences()
    this.refreshAuth()
  },
  onShow() {
    this.refreshAuth()
    this.loadPreferences()
    try {
      const s = getAuthState()
      if (s && s.isLoggedIn) {
        fetchMe()
          .then(() => this.refreshAuth())
          .then(() => this.syncPrefsFromBackend({ silent: true }))
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
  async syncPrefsFromBackend(opts) {
    if (this.data.syncingPrefs) return
    const s = getAuthState()
    if (!s || !s.isLoggedIn) return
    this.setData({ syncingPrefs: true })
    try {
      const r = await fetchPrefs()
      const teamKeys = (r && r.teamKeys) || []
      const driverNumbers = (r && r.driverNumbers) || []
      try {
        wx.setStorageSync(STORAGE_KEYS.followTeams, teamKeys)
      } catch (e) {}
      try {
        wx.setStorageSync(STORAGE_KEYS.followDrivers, driverNumbers)
      } catch (e) {}
      this.loadPreferences()
    } catch (e) {
      if (!(opts && opts.silent)) {
        wx.showToast({ title: "偏好同步失败", icon: "none" })
      }
    } finally {
      this.setData({ syncingPrefs: false })
    }
  },
  loadPreferences() {
    let prefSeason = 2026
    let followDrivers = []
    let followTeams = []
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

    const followDriversText = followDrivers.length ? `${followDrivers.length} 人` : "未设置"
    const followTeamsText = followTeams.length ? `${followTeams.length} 支` : "未设置"
    this.setData({ prefSeason, followDrivers, followDriversText, followTeams, followTeamsText }, () => {
      this.refreshFollowTextsFromOptions()
    })
  },
  refreshAuth() {
    const s = getAuthState()
    const profile = s.profile
    const name = profile && (profile.nickName || profile.nickname) ? profile.nickName || profile.nickname : "游客"
    const avatarUrl = profile && profile.avatarUrl ? String(profile.avatarUrl || "").trim() : ""
    const hasAvatar = Boolean(avatarUrl)
    const hasNick = Boolean(String(name || "").trim() && name !== "游客")
    const canEditProfile = Boolean(s.isLoggedIn && !(hasAvatar && hasNick))
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
      nicknameDraft: hasNick ? String(name || "").trim() : ""
    })
  },
  onTapItem(e) {
    const action = e && e.currentTarget && e.currentTarget.dataset ? e.currentTarget.dataset.action : ""
    if (action === "followDrivers") {
      this.openPicker("drivers")
      return
    }
    if (action === "followTeams") {
      this.openPicker("teams")
      return
    }
    wx.showToast({ title: "功能待接入", icon: "none" })
  },
  openPicker(mode) {
    const m = mode === "teams" ? "teams" : "drivers"
    const title = m === "teams" ? "关注车队" : "关注车手"
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
      if (this.data.isLoggedIn) {
        updatePrefs({ teamKeys: this.data.followTeams || [], driverNumbers: out }).catch(() => {
          wx.showToast({ title: "偏好保存失败", icon: "none" })
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
      if (this.data.isLoggedIn) {
        updatePrefs({ teamKeys: out, driverNumbers: this.data.followDrivers || [] }).catch(() => {
          wx.showToast({ title: "偏好保存失败", icon: "none" })
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
  ensurePickOptions() {
    if (this.data.driverOptions && this.data.driverOptions.length && this.data.teamOptions && this.data.teamOptions.length) {
      return
    }
    const app = getApp()
    const apiBase = (app && app.globalData && app.globalData.apiBase) || ""
    if (!apiBase) {
      wx.showToast({ title: "未配置后端地址", icon: "none" })
      return
    }
    const season = Number(this.data.prefSeason || 2026)
    const base = apiBase.replace(/\/+$/, "")
    const archiveUrl = `${base}/api/v1/mp/archive?season=${season}&tz=Asia/Shanghai`
    wx.request({
      url: archiveUrl,
      method: "GET",
      success: (res) => {
        const data = (res && res.data) || {}
        const races = Array.isArray(data.races) ? data.races : []
        const latest = races.find((x) => x && Number(x.openf1_race_session_key) > 0) || races[0]
        const sk = latest ? Number(latest.openf1_race_session_key || 0) : 0
        if (!sk) {
          wx.showToast({ title: "暂无可用赛季数据", icon: "none" })
          return
        }
        this.loadDriverOptionsBySessionKey(sk)
      },
      fail: (err) => {
        try {
          console.log({ url: archiveUrl, err })
        } catch (e) {}
        wx.showToast({ title: "获取赛季信息失败", icon: "none" })
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
        wx.showToast({ title: "获取车手列表失败", icon: "none" })
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
    const byDriver = {}
    for (const it of driverOptions) {
      const dn = Number(it && it.driver_number)
      if (!dn) continue
      byDriver[dn] = it
    }
    const driverLabels = drivers
      .map((dn) => {
        const it = byDriver[Number(dn)]
        if (!it) return ""
        return String(it.name_acronym || it.full_name || it.driver_name || it.driver_number || "").trim()
      })
      .filter(Boolean)
    const followDriversText = drivers.length ? (driverLabels.length ? driverLabels.join(" / ") : `${drivers.length} 人`) : "未设置"

    const followTeamsText = teams.length ? teams.join(" / ") : "未设置"
    this.setData({ followDriversText, followTeamsText })
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
      wx.showToast({ title: "请先登录", icon: "none" })
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
      wx.showToast({ title: "头像已更新", icon: "none" })
    } catch (e2) {
      try {
        console.log("[mine] upload avatar failed", e2)
      } catch (err) {}
      const msg = String((e2 && (e2.errMsg || e2.message)) || "unknown").slice(0, 40)
      wx.showToast({ title: `头像上传失败:${msg}`, icon: "none" })
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
      wx.showToast({ title: "昵称已更新", icon: "none" })
    } catch (e2) {
      try {
        console.log("[mine] update nickname failed", e2)
      } catch (err) {}
      wx.showToast({ title: "昵称同步失败", icon: "none" })
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
      wx.showToast({ title: "登录成功", icon: "none" })
    } catch (e) {
      try {
        console.log("[mine] login failed", e)
      } catch (err) {}
      wx.showToast({ title: `登录失败:${String(e && e.message || "unknown")}`, icon: "none" })
    } finally {
      this.setData({ loadingLogin: false })
    }
  },
  async onBindDevice() {
    if (!this.data.isLoggedIn) {
      wx.showToast({ title: "请先登录", icon: "none" })
      return
    }
    if (this.data.bindingDevice) return

    this.setData({ bindingDevice: true })
    try {
      const deviceId = await new Promise((resolve, reject) => {
        wx.showModal({
          title: "绑定设备",
          editable: true,
          placeholderText: "输入设备ID（12位）",
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
      wx.showToast({ title: "已绑定", icon: "none" })
    } catch (e) {
      if (String(e && e.message || "") !== "cancel") {
        wx.showToast({ title: "绑定失败", icon: "none" })
      }
    } finally {
      this.setData({ bindingDevice: false })
    }
  },
  async onLogout() {
    await logout()
    this.refreshAuth()
    wx.showToast({ title: "已退出", icon: "none" })
  }
})
