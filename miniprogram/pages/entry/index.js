const i18n = require("../../services/i18n")

Page({
  data: {
    i18n: i18n.getDict()
  },
  onLoad() {
    this._offLocale = i18n.onLocaleChange(() => this.applyI18n())
    this.applyI18n()
    this._diverted = false
  },
  onUnload() {
    if (this._offLocale) this._offLocale()
  },
  onShow() {
    if (this._diverted) return
    this._diverted = true
    try {
      const app = getApp()
      const hideNews = Boolean(app && app.globalData && app.globalData.tweakAEffective)
      const initialTab = hideNews ? "archive" : "news"
      wx.redirectTo({
        url: `/pages/tabs-host/index?tab=${encodeURIComponent(initialTab)}&src=entry`,
        fail(err) {
          console.warn("[ENTRY] redirectTo tabs-host failed, fallback reLaunch", err && err.errMsg)
          try { wx.reLaunch({ url: `/pages/tabs-host/index?tab=${encodeURIComponent(initialTab)}&src=entry_fb` }) } catch (e) {}
        }
      })
    } catch (e) {}
  },
  applyI18n() {
    const dict = i18n.getDict()
    this.setData({ i18n: dict })
  }
})
