const { fetchUserProfile, getAuthState, loginWithWeChat, logout } = require("../../services/authService")

Page({
  data: {
    isLoggedIn: false,
    profile: null,
    displayName: "游客",
    avatarText: "G",
    loadingLogin: false,
    loadingProfile: false
  },
  onLoad() {
    this.refreshAuth()
  },
  onShow() {
    this.refreshAuth()
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
    const avatarText = name ? String(name).slice(0, 1).toUpperCase() : "G"
    this.setData({ isLoggedIn: s.isLoggedIn, profile: profile || null, displayName: name, avatarText })
  },
  onTapItem() {
    wx.showToast({ title: "功能待接入", icon: "none" })
  },
  async onLogin() {
    if (this.data.loadingLogin) return
    this.setData({ loadingLogin: true })
    try {
      await loginWithWeChat()
      this.refreshAuth()
      wx.showToast({ title: "登录成功", icon: "none" })
    } catch (e) {
      wx.showToast({ title: "登录失败", icon: "none" })
    } finally {
      this.setData({ loadingLogin: false })
    }
  },
  async onGetProfile() {
    if (this.data.loadingProfile) return
    this.setData({ loadingProfile: true })
    try {
      await fetchUserProfile()
      this.refreshAuth()
      wx.showToast({ title: "已更新资料", icon: "none" })
    } catch (e) {
      wx.showToast({ title: "未授权", icon: "none" })
    } finally {
      this.setData({ loadingProfile: false })
    }
  },
  onLogout() {
    logout()
    this.refreshAuth()
    wx.showToast({ title: "已退出", icon: "none" })
  }
})
