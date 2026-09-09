const i18n = require("../../services/i18n")

Page({
  data: {
    i18n: i18n.getDict()
  },
  onLoad(options) {
    this._diverted = false
    const opts = options || {}
    const paramKeys = Object.keys(opts)
    try {
      const app = getApp()
      const hideNews = Boolean(app && app.globalData && app.globalData.tweakAEffective)
      const tab = hideNews ? "archive" : "news"
      const query = paramKeys.length
        ? "?" + paramKeys.map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(opts[k])}`).join("&") + `&tab=${encodeURIComponent(tab)}&src=news`
        : `?tab=${encodeURIComponent(tab)}&src=news`
      wx.reLaunch({
        url: `/pages/tabs-host/index${query}`,
        fail(err) {
          console.warn("[NEWS-SHELL] reLaunch tabs-host failed", err && err.errMsg)
        }
      })
      this._diverted = true
    } catch (e) {}
  },
  onShow() {
    if (this._diverted) return
    try {
      const app = getApp()
      const hideNews = Boolean(app && app.globalData && app.globalData.tweakAEffective)
      const tab = hideNews ? "archive" : "news"
      wx.reLaunch({
        url: `/pages/tabs-host/index?tab=${encodeURIComponent(tab)}&src=news_show`,
        fail() {}
      })
      this._diverted = true
    } catch (e) {}
  },
  applyI18n() {
    this.setData({ i18n: i18n.getDict() })
  }
})
