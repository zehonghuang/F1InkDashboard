const i18n = require("../../services/i18n")

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
    try {
      const app = getApp()
      const hideNews = Boolean(app && app.globalData && app.globalData.tweakAEffective)
      wx.switchTab({ url: hideNews ? "/pages/archive/index" : "/pages/news/index" })
    } catch (e) {}
  },
  applyI18n() {
    const dict = i18n.getDict()
    this.setData({ i18n: dict })
  }
})
