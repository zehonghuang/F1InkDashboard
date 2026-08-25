const i18n = require("../../../../services/i18n")

Page({
  data: {
    i18n: i18n.getDict()
  },
  onLoad() {
    this._offLocale = i18n.onLocaleChange(() => this.applyI18n())
    this.applyI18n()
  },
  onUnload() {
    if (this._offLocale) this._offLocale()
  },
  onShow() {
    if (typeof this.getTabBar === 'function') {
      const tb = this.getTabBar()
      if (tb && typeof tb.setSelectedByRoute === 'function') {
        tb.setSelectedByRoute(this.route)
      }
    }
    this.applyI18n()
  },
  onPickMode() {
    wx.showToast({ title: i18n.t("compare.toastComingSoon"), icon: "none" })
  },
  applyI18n() {
    const dict = i18n.getDict()
    this.setData({ i18n: dict })
    wx.setNavigationBarTitle({ title: dict.nav.compare })
  }
})
