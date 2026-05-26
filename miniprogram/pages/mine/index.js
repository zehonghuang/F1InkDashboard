const { getAuthState, loginWithWeChat, logout, fetchMe, bindDevice, uploadAvatar, updateNickName, setProfile } = require("../../services/authService")

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
    statusBarHeight: 0
  },
  onLoad() {
    try {
      const sys = wx.getSystemInfoSync()
      const h = Number(sys && sys.statusBarHeight) || 0
      this.setData({ statusBarHeight: h })
    } catch (e) {}
    this.refreshAuth()
  },
  onShow() {
    this.refreshAuth()
    try {
      const s = getAuthState()
      if (s && s.isLoggedIn) {
        fetchMe()
          .then(() => this.refreshAuth())
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
  onTapItem() {
    wx.showToast({ title: "功能待接入", icon: "none" })
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
